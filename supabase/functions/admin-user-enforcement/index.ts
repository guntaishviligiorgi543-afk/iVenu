import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://ivenue.site",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const durations = new Set([24, 168, 720, -1]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!url || !anonKey || !serviceKey) return json({ error: "User enforcement is not configured." }, 500);
  if (!authorization) return json({ error: "Authentication required." }, 401);
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const serviceClient = createClient(url, serviceKey);
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  const caller = authData.user;
  if (authError || !caller) return json({ error: "Authentication required." }, 401);
  const { data: admin, error: adminError } = await serviceClient.from("admin_users").select("user_id").eq("user_id", caller.id).maybeSingle();
  if (adminError) return json({ error: "Unable to verify administrator access." }, 500);
  if (!admin) return json({ error: "Administrator access is required." }, 403);

  let body: { action?: string; userId?: string; reason?: string; internalNote?: string; durationHours?: number; unbanNote?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const targetId = String(body.userId || "");
  if (!targetId) return json({ error: "A target user is required." }, 400);
  if (targetId === caller.id) return json({ error: "You cannot change enforcement for your own account." }, 403);
  const { data: targetAdmin, error: targetAdminError } = await serviceClient.from("admin_users").select("user_id").eq("user_id", targetId).maybeSingle();
  if (targetAdminError) return json({ error: "Unable to verify target permissions." }, 500);
  if (targetAdmin) return json({ error: "Administrators cannot change enforcement for another administrator." }, 403);
  const operationId = crypto.randomUUID();

  if (body.action === "ban") {
    const reason = String(body.reason || "").trim();
    const durationHours = Number(body.durationHours);
    if (!reason || reason.length > 2000 || !durations.has(durationHours)) return json({ error: "A reason and valid ban duration are required." }, 400);
    const { error: authBanError } = await serviceClient.auth.admin.updateUserById(targetId, { ban_duration: durationHours === -1 ? "876000h" : `${durationHours}h` });
    if (authBanError) return json({ error: "Unable to apply the Auth ban." }, authBanError.status || 500);
    const { data: banId, error: auditError } = await serviceClient.rpc("admin_record_user_ban", { p_actor_user_id: caller.id, p_user_id: targetId, p_reason: reason, p_internal_note: String(body.internalNote || ""), p_duration_hours: durationHours });
    if (auditError) {
      console.error(JSON.stringify({ scope: "ADMIN_USER_ENFORCEMENT", operationId, action: "ban", targetId, auditCode: auditError.code }));
      return json({ error: "The Auth ban was applied, but its audit record needs reconciliation. Do not retry blindly.", code: "RECONCILIATION_REQUIRED", operationId }, 500);
    }
    return json({ success: true, action: "ban", banId });
  }
  if (body.action === "unban") {
    const { error: authUnbanError } = await serviceClient.auth.admin.updateUserById(targetId, { ban_duration: "none" });
    if (authUnbanError) return json({ error: "Unable to remove the Auth ban." }, authUnbanError.status || 500);
    const { data: banId, error: auditError } = await serviceClient.rpc("admin_record_user_unban", { p_actor_user_id: caller.id, p_user_id: targetId, p_note: String(body.unbanNote || "") });
    if (auditError) {
      console.error(JSON.stringify({ scope: "ADMIN_USER_ENFORCEMENT", operationId, action: "unban", targetId, auditCode: auditError.code }));
      return json({ error: "The Auth ban was removed, but its audit record needs reconciliation. Do not retry blindly.", code: "RECONCILIATION_REQUIRED", operationId }, 500);
    }
    return json({ success: true, action: "unban", banId });
  }
  return json({ error: "Unsupported action." }, 400);
});
