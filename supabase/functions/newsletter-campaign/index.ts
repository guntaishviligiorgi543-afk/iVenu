import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const textFromHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const sanitize = (html: string) => html.replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (_tag, name) => {
  const safe = ["p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "ul", "ol", "li"];
  return safe.includes(String(name).toLowerCase()) ? `<${_tag.includes("</") ? "/" : ""}${String(name).toLowerCase()}>` : "";
});
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const token = () => crypto.getRandomValues(new Uint8Array(32)).reduce((text, byte) => text + byte.toString(16).padStart(2, "0"), "");

Deno.serve(async (request) => {
  const url = Deno.env.get("SUPABASE_URL")!; const anon = Deno.env.get("SUPABASE_ANON_KEY")!; const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY"); const from = Deno.env.get("NEWSLETTER_FROM") || Deno.env.get("EMAIL_FROM"); const siteUrl = Deno.env.get("SITE_URL");
  const authorization = request.headers.get("Authorization");
  if (!url || !anon || !service || !authorization) return json({ error: "Authentication required." }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } }); const admin = createClient(url, service);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Authentication required." }, 401);
  const { data: adminRow } = await admin.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return json({ error: "Administrator access is required." }, 403);
  const body = await request.json().catch(() => null); if (!body || !["test", "send"].includes(body.action)) return json({ error: "Invalid request." }, 400);
  if (!resendKey || !from || !siteUrl) return json({ error: "Newsletter delivery is not configured.", code: "CONFIG_REQUIRED" }, 503);
  const { data: campaign } = await admin.from("newsletter_campaigns").select("*").eq("id", body.campaignId).maybeSingle();
  if (!campaign) return json({ error: "Campaign not found." }, 404);
  if (body.action === "send" && campaign.status !== "draft") return json({ error: "This campaign has already started." }, 409);
  const recipients = body.action === "test" ? [{ email: user.email }] : (await admin.from("newsletter_subscribers").select("email").eq("is_active", true)).data || [];
  if (body.action === "send") { const { data: claimed } = await admin.from("newsletter_campaigns").update({ status: "sending", recipient_count: recipients.length }).eq("id", campaign.id).eq("status", "draft").select("id").maybeSingle(); if (!claimed) return json({ error: "This campaign has already started." }, 409); }
  let successful = 0; let failed = 0;
  for (const recipient of recipients) {
    const raw = token(); const tokenHash = await hash(raw); const unsubscribe = `${siteUrl.replace(/\/$/, "")}/unsubscribe.html?token=${raw}`;
    await admin.from("newsletter_unsubscribe_tokens").insert({ token_hash: tokenHash, subscriber_email: recipient.email });
    const html = `<main style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#171717"><h1>iVenue</h1>${sanitize(campaign.content)}<hr><p><a href="${escapeHtml(unsubscribe)}">Unsubscribe</a></p></main>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [recipient.email], subject: campaign.subject, html, text: `iVenue\n\n${textFromHtml(campaign.content)}\n\nUnsubscribe: ${unsubscribe}` }) });
    if (response.ok) successful += 1; else failed += 1;
    if (body.action === "send") await admin.from("newsletter_campaign_deliveries").upsert({ campaign_id: campaign.id, subscriber_email: recipient.email, status: response.ok ? "sent" : "failed", sent_at: response.ok ? new Date().toISOString() : null });
  }
  if (body.action === "send") await admin.from("newsletter_campaigns").update({ status: failed ? (successful ? "partially_failed" : "failed") : "sent", sent_at: new Date().toISOString(), successful_count: successful, failed_count: failed }).eq("id", campaign.id);
  return json({ successful, failed });
});
