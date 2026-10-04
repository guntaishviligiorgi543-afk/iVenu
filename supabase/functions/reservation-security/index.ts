import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireLoginSecurityProof } from "../_shared/login-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://ivenue.site",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  action?: "reserve" | "release" | "checkout";
  p_event_seat_id?: string;
  loginSecurityProof?: string;
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ success: true });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey)
    return json({ error: "Reservation security is not configured." }, 500);
  if (!authorization) return json({ error: "Authentication required." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData.user;
  if (authError || !user?.id) return json({ error: "Authentication required." }, 401);

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!["reserve", "release", "checkout"].includes(body.action || ""))
    return json({ error: "Invalid reservation operation." }, 400);

  const proof = await requireLoginSecurityProof(
    adminClient,
    user.id,
    body.loginSecurityProof,
  );
  if (!proof.ok) return json({
    error: "Login security verification is required.",
    code: proof.code,
  }, 403);

  const rpcName = body.action === "reserve"
    ? "login_security_reserve_event_seat"
    : body.action === "release"
      ? "login_security_release_event_seat"
      : "login_security_checkout_reserved_event_seats";
  const rpcArgs = body.action === "checkout"
    ? { p_user_id: user.id }
    : { p_user_id: user.id, p_event_seat_id: body.p_event_seat_id };
  const { data, error } = await adminClient.rpc(rpcName, rpcArgs);
  if (error) return json({ error: error.message, code: error.code }, 400);
  return json({ success: true, data });
});
