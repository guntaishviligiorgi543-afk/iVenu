import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigin = "https://ivenue.site";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isNotFound = (error: unknown) => {
  const candidate = error as { status?: number; code?: string; message?: string } | null;
  return candidate?.status === 404 || /user.*not found|not found/i.test(`${candidate?.code ?? ""} ${candidate?.message ?? ""}`);
};

type TargetState = "present" | "absent" | "unknown";

type UserLookupClient = {
  auth: {
    admin: {
      getUserById: (userId: string) => Promise<{
        data: { user: unknown } | null;
        error: unknown;
      }>;
    };
  };
};

async function inspectTarget(serviceClient: UserLookupClient, userId: string): Promise<TargetState> {
  const { data, error } = await serviceClient.auth.admin.getUserById(userId);
  if (!error) return data?.user ? "present" : "absent";
  return isNotFound(error) ? "absent" : "unknown";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Server configuration is incomplete." }, 500);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Unauthorized." }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Unauthorized." }, 401);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerAdmin, error: callerAdminError } = await serviceClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (callerAdminError) return json({ error: "Unable to authorize request." }, 500);
  if (!callerAdmin) return json({ error: "Forbidden." }, 403);

  let payload: { userId?: unknown; confirmation?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (payload.confirmation !== "DELETE") return json({ error: "Confirmation must be DELETE." }, 400);
  if (!isUuid(payload.userId)) return json({ error: "A valid user ID is required." }, 400);
  if (payload.userId === authData.user.id) return json({ error: "Administrators cannot delete their own account." }, 403);

  const initialState = await inspectTarget(serviceClient, payload.userId);
  if (initialState === "absent") return json({ error: "User not found." }, 404);
  if (initialState === "unknown") return json({ error: "Unable to resolve target user." }, 500);

  const { data: targetAdmin, error: targetAdminError } = await serviceClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", payload.userId)
    .maybeSingle();
  if (targetAdminError) return json({ error: "Unable to authorize target." }, 500);
  if (targetAdmin) return json({ error: "Administrators cannot delete another administrator." }, 403);

  const { error: deletionError } = await serviceClient.auth.admin.deleteUser(payload.userId);
  const finalState = await inspectTarget(serviceClient, payload.userId);
  if (finalState === "absent") {
    return json({ success: true, verifiedAfterUncertainResult: Boolean(deletionError) });
  }
  if (finalState === "unknown") {
    return json({ error: "Deletion outcome requires reconciliation.", code: "RECONCILIATION_REQUIRED" }, 500);
  }
  if (deletionError) return json({ error: "Unable to delete user." }, 500);
  return json({ error: "Deletion outcome requires reconciliation.", code: "RECONCILIATION_REQUIRED" }, 500);
});
