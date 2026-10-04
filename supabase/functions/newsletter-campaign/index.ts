import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://ivenue.site",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const textFromHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const logoUrl = "https://ivenue.site/assets/ivenue-logo.png";
const websiteUrl = "https://ivenue.site";
const eventsUrl = "https://ivenue.site/shows.html";
const safeHref = (value: string) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
const sanitize = (html: string) => html.replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (tag, name) => {
  const tagName = String(name).toLowerCase();
  const safe = ["p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "ul", "ol", "li", "a"];
  if (!safe.includes(tagName)) return "";
  if (tag.includes("</")) return `</${tagName}>`;
  if (tagName !== "a") return `<${tagName}>`;
  const href = tag.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const url = href ? safeHref(href[1] || href[2] || href[3] || "") : null;
  return url
    ? `<a href="${escapeHtml(url)}" style="color:#c9664c;text-decoration:underline;">`
    : "<a>";
});
const styledContent = (content: string) => sanitize(content)
  .replaceAll("<p>", '<p style="margin:0 0 16px;color:#24201e;font-size:16px;line-height:1.65;">')
  .replaceAll("<h1>", '<h1 style="margin:0 0 16px;color:#1b1918;font-size:26px;line-height:1.25;font-weight:700;">')
  .replaceAll("<h2>", '<h2 style="margin:24px 0 12px;color:#1b1918;font-size:21px;line-height:1.3;font-weight:700;">')
  .replaceAll("<h3>", '<h3 style="margin:20px 0 10px;color:#1b1918;font-size:18px;line-height:1.35;font-weight:700;">')
  .replaceAll("<ul>", '<ul style="margin:0 0 16px;padding-left:22px;color:#24201e;font-size:16px;line-height:1.65;">')
  .replaceAll("<ol>", '<ol style="margin:0 0 16px;padding-left:22px;color:#24201e;font-size:16px;line-height:1.65;">')
  .replaceAll("<li>", '<li style="margin:0 0 7px;">');
const newsletterHtml = (content: string, unsubscribe: string, isTest: boolean) => `<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f3f0ee;color:#24201e;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f3f0ee;"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;">
      <tr><td style="padding:30px 36px 26px;background-color:#171717;text-align:center;">
        <a href="${websiteUrl}" style="text-decoration:none;"><img src="${logoUrl}" width="165" alt="iVenue" style="display:block;width:165px;max-width:100%;height:auto;margin:0 auto;border:0;"></a>
        <p style="margin:18px 0 0;color:#ffb09a;font-size:12px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">Newsletter</p>
        ${isTest ? '<p style="display:inline-block;margin:14px 0 0;padding:5px 9px;border:1px solid #ffb09a;color:#ffb09a;font-size:10px;font-weight:700;letter-spacing:1px;">TEST EMAIL</p>' : ""}
      </td></tr>
      <tr><td style="padding:34px 36px 14px;">${styledContent(content)}</td></tr>
      <tr><td align="center" style="padding:16px 36px 38px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#ff9475" style="border-radius:4px;"><a href="${eventsUrl}" style="display:inline-block;padding:14px 24px;color:#171717;font-size:15px;font-weight:700;line-height:1;text-decoration:none;">Explore Events</a></td></tr></table>
      </td></tr>
      <tr><td style="padding:26px 36px 30px;border-top:1px solid #e5ded9;background-color:#fbfaf9;text-align:center;">
        <p style="margin:0 0 7px;color:#1b1918;font-size:16px;font-weight:700;">iVenue</p>
        <p style="margin:0 0 15px;color:#625b57;font-size:13px;line-height:1.55;">Discover events. Choose your seat. Be there.</p>
        <p style="margin:0 0 14px;"><a href="${websiteUrl}" style="color:#625b57;font-size:13px;text-decoration:underline;">ivenue.site</a></p>
        <p style="margin:0;"><a href="${escapeHtml(unsubscribe)}" style="color:#8c4838;font-size:13px;text-decoration:underline;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const token = () => crypto.getRandomValues(new Uint8Array(32)).reduce((text, byte) => text + byte.toString(16).padStart(2, "0"), "");
const campaignSignature = async (campaign: { subject: string; content: string; recipient_mode: string }, recipients: { email: string }[]) =>
  Array.from(new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${campaign.subject}\n${campaign.content}\n${campaign.recipient_mode}\n${recipients.map(({ email }) => email).sort().join("\n")}`),
  ))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const providerDetails = async (response: Response) => {
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    const value = text ? JSON.parse(text) : {};
    if (value && typeof value === "object") parsed = value as Record<string, unknown>;
  } catch {
    // Keep a bounded plain-text diagnostic below.
  }
  return {
    status: response.status,
    messageId: typeof parsed.id === "string" ? parsed.id : null,
    errorCode: typeof parsed.name === "string" ? parsed.name : null,
    errorMessage: String(parsed.message || parsed.error || text || "").slice(0, 500),
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let requestBody: { action?: string; campaignId?: string } | null = null;
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("NEWSLETTER_FROM") || Deno.env.get("EMAIL_FROM");
    const siteUrl = Deno.env.get("SITE_URL");
    const authorization = request.headers.get("Authorization");

    if (!url || !anon || !service || !authorization)
      return json({ error: "Authentication required." }, 401);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
    });
    const admin = createClient(url, service);
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Authentication required." }, 401);

    const { data: adminRow } = await admin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!adminRow) return json({ error: "Administrator access is required." }, 403);

    requestBody = await request.json().catch(() => null);
    const body = requestBody;
    if (!body || !body.action || !["test", "send"].includes(body.action))
      return json({ error: "Invalid request." }, 400);
    if (!resendKey || !from || !siteUrl)
      return json({ error: "Newsletter delivery is not configured.", code: "CONFIG_REQUIRED" }, 503);

    if (!body.campaignId) return json({ error: "Campaign ID is required." }, 400);
    const { data: campaign, error: campaignError } = await admin
      .from("newsletter_campaigns")
      .select("*")
      .eq("id", body.campaignId)
      .maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) return json({ error: "Campaign not found." }, 404);

    let recipients: { email: string }[];
    if (body.action === "test") {
      if (!user.email) return json({ error: "Authenticated user email is unavailable." }, 400);
      recipients = [{ email: user.email }];
    } else {
      if (campaign.status !== "draft")
        return json({ error: "This campaign has already started." }, 409);

      const { data: pendingDeliveries, error: pendingError } = await admin
        .from("newsletter_campaign_deliveries")
        .select("subscriber_email")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending");
      if (pendingError) throw pendingError;
      recipients = (pendingDeliveries || []).map((delivery) => ({ email: delivery.subscriber_email }));
      const signature = await campaignSignature(campaign, recipients);
      if (campaign.last_test_signature !== signature) {
        return json({
          error: "A successful test email is required for the current newsletter content and recipient configuration.",
          code: "TEST_REQUIRED",
          sendType: "real",
        }, 409);
      }
      const { data: claimed } = await admin
        .from("newsletter_campaigns")
        .update({ status: "sending" })
        .eq("id", campaign.id)
        .eq("status", "draft")
        .select("id")
        .maybeSingle();
      if (!claimed) return json({ error: "This campaign has already started." }, 409);
    }

    let successful = 0;
    let failed = 0;
    let skipped = 0;
    const providerMessageIds: string[] = [];
    const providerFailures: { status: number; code: string | null; message: string }[] = [];
    for (const recipient of recipients) {
      if (body.action === "send") {
        const { data: activeSubscriber, error: activeError } = await admin
          .from("newsletter_subscribers")
          .select("email")
          .eq("email", recipient.email)
          .eq("is_active", true)
          .maybeSingle();
        if (activeError) throw activeError;
        if (!activeSubscriber) {
          const { error: skipError } = await admin
            .from("newsletter_campaign_deliveries")
            .update({ status: "skipped" })
            .eq("campaign_id", campaign.id)
            .eq("subscriber_email", recipient.email)
            .eq("status", "pending");
          if (skipError) throw skipError;
          skipped += 1;
          continue;
        }
      }

      const raw = token();
      const tokenHash = await hash(raw);
      const unsubscribe = `${siteUrl.replace(/\/$/, "")}/unsubscribe.html?token=${raw}`;
      const { error: tokenError } = await admin.from("newsletter_unsubscribe_tokens").insert({
        token_hash: tokenHash,
        subscriber_email: recipient.email,
      });
      if (tokenError) throw tokenError;
      const html = newsletterHtml(campaign.content, unsubscribe, body.action === "test");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [recipient.email],
          subject: campaign.subject,
          html,
          text: `iVenue Newsletter${body.action === "test" ? " (TEST EMAIL)" : ""}\n\n${textFromHtml(sanitize(campaign.content))}\n\nExplore Events: ${eventsUrl}\niVenue: ${websiteUrl}\nUnsubscribe: ${unsubscribe}`,
        }),
      });
      const provider = await providerDetails(response);
      if (response.ok) {
        successful += 1;
        if (provider.messageId) providerMessageIds.push(provider.messageId);
        console.info("Resend newsletter request accepted", {
          action: body.action, campaignId: campaign.id, status: provider.status,
          messageId: provider.messageId, recipientCount: recipients.length,
        });
      } else {
        failed += 1;
        providerFailures.push({
          status: provider.status,
          code: provider.errorCode,
          message: provider.errorMessage,
        });
        console.error("Resend newsletter request rejected", {
          action: body.action, campaignId: campaign.id, status: provider.status,
          errorCode: provider.errorCode, errorMessage: provider.errorMessage,
          recipientCount: recipients.length,
        });
      }

      if (body.action === "send") {
        const { error: deliveryError } = await admin
          .from("newsletter_campaign_deliveries")
          .update({ status: response.ok ? "sent" : "failed", sent_at: response.ok ? new Date().toISOString() : null })
          .eq("campaign_id", campaign.id)
          .eq("subscriber_email", recipient.email)
          .eq("status", "pending");
        if (deliveryError) throw deliveryError;
      }
      if (body.action === "test") {
        if (!response.ok) {
          return json({
            error: "Email provider rejected the test email.",
            code: "EMAIL_PROVIDER_REJECTED",
            sendType: "test",
            providerStatus: provider.status,
            providerErrorCode: provider.errorCode,
            providerErrorMessage: provider.errorMessage,
          }, 502);
        }
        const signature = await campaignSignature(campaign, await (async () => {
          const { data } = await admin
            .from("newsletter_campaign_deliveries")
            .select("subscriber_email")
            .eq("campaign_id", campaign.id);
          return (data || []).map((delivery) => ({ email: delivery.subscriber_email }));
        })());
        const { error: testUpdateError } = await admin
          .from("newsletter_campaigns")
          .update({
            last_test_signature: signature,
            last_test_sent_at: new Date().toISOString(),
            last_test_provider_message_id: provider.messageId,
          })
          .eq("id", campaign.id)
          .eq("status", "draft");
        if (testUpdateError) throw testUpdateError;
        return json({
          successful: 1, failed: 0, skipped: 0, sendType: "test",
          providerStatus: provider.status, providerMessageId: provider.messageId,
        });
      }
    }

    if (body.action === "send") {
      const status = failed ? (successful ? "partially_failed" : "failed") : "sent";
      const { error: campaignError } = await admin
        .from("newsletter_campaigns")
        .update({ status, sent_at: new Date().toISOString(), successful_count: successful, failed_count: failed })
        .eq("id", campaign.id);
      if (campaignError) throw campaignError;
    }
    return json({
      successful, failed, skipped, sendType: "real", providerMessageIds,
      providerFailures,
    });
  } catch (error) {
    console.error("Newsletter campaign request failed", {
      campaignId: requestBody?.campaignId || null,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({
      error: "Unable to process newsletter campaign.",
      code: "NEWSLETTER_PROCESSING_FAILED",
    }, 500);
  }
});
