import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  const url = Deno.env.get("SUPABASE_URL"); const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const body = await request.json().catch(() => null); const token = typeof body?.token === "string" ? body.token : "";
  if (!url || !service || !/^[a-f0-9]{64}$/i.test(token)) return json({ error: "Invalid unsubscribe link." }, 400);
  const admin = createClient(url, service); const tokenHash = await hash(token);
  const { data: record } = await admin.from("newsletter_unsubscribe_tokens").select("subscriber_email, used_at").eq("token_hash", tokenHash).maybeSingle();
  if (!record || record.used_at) return json({ error: "Invalid unsubscribe link." }, 400);
  const { error } = await admin.from("newsletter_subscribers").update({ is_active: false }).eq("email", record.subscriber_email);
  if (error) return json({ error: "Unable to update subscription." }, 500);
  await admin.from("newsletter_unsubscribe_tokens").update({ used_at: new Date().toISOString() }).eq("token_hash", tokenHash);
  return json({ unsubscribed: true });
});
