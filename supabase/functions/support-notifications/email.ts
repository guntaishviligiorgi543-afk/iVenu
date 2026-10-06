// Match the established Newsletter email's logo, table layout and brand palette.
// Support text is always plain text, escaped after shortening; no HTML renderer.
export type NotificationKind = "reply" | "resolved";
export const SUPPORT_SITE = "https://ivenue.site";
export const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function preview(value: string, limit = 240): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(
    /\s+/gu,
    " ",
  ).trim();
  const characters = Array.from(clean);
  return characters.length > limit
    ? characters.slice(0, limit - 1).join("") + "…"
    : clean;
}

export function supportRequestUrl(requestId: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  ) {
    throw new Error("Invalid request identifier");
  }
  const url = new URL("/profile.html", SUPPORT_SITE);
  url.searchParams.set("section", "support");
  url.searchParams.set("request", requestId);
  return url.href;
}

export type EmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};
export function supportEmail(input: {
  kind: NotificationKind;
  requestId: string;
  subject: string;
  reply?: string;
  from: string;
  to: string;
}): EmailPayload {
  const isReply = input.kind === "reply";
  const subject = isReply
    ? "New response from iVenue Support"
    : "Your iVenue Support request has been resolved";
  const heading = isReply
    ? "You have a new response"
    : "Your request has been resolved";
  const intro = isReply
    ? "Our Support team has replied to your request:"
    : "Thank you for using iVenue. Our Support team has marked your request as resolved.";
  const requestSubject = preview(input.subject, 200);
  const snippet = isReply ? preview(input.reply || "") : "";
  const closing = isReply
    ? "Sign in to your account to read the conversation. You can reply while the request is open."
    : "Thank you for using our service. If you need help with a different issue, you can create a new Support request from your account.";
  const cta = isReply ? "View Response" : "View Request";
  const url = supportRequestUrl(input.requestId);
  const html =
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f3f0ee;color:#24201e;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f0ee;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;">
<tr><td style="padding:30px 28px 26px;background-color:#171717;text-align:center;"><a href="${SUPPORT_SITE}" style="text-decoration:none;"><img src="${SUPPORT_SITE}/assets/ivenue-logo.png" width="165" alt="iVenue" style="display:block;width:165px;max-width:100%;height:auto;margin:0 auto;border:0;"></a><p style="margin:18px 0 0;color:#ffb09a;font-size:12px;font-weight:700;letter-spacing:1.8px;">SUPPORT</p></td></tr>
<tr><td style="padding:30px 28px 14px;"><h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;">${heading}</h1><p style="margin:0 0 20px;line-height:1.6;">${intro}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fbfaf9;border:1px solid #e5ded9;"><tr><td style="padding:18px;word-break:break-word;"><p style="margin:0;font-weight:700;line-height:1.5;">Request: ${
      escapeHtml(requestSubject)
    }</p>${
      snippet
        ? `<p style="margin:12px 0 0;line-height:1.6;">${
          escapeHtml(snippet)
        }</p>`
        : ""
    }</td></tr></table>
<p style="margin:20px 0 0;line-height:1.6;">${closing}</p></td></tr>
<tr><td align="center" style="padding:16px 28px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#ff9475" style="border-radius:4px;"><a href="${
      escapeHtml(url)
    }" style="display:inline-block;padding:14px 24px;color:#171717;font-size:15px;font-weight:700;text-decoration:none;">${cta}</a></td></tr></table></td></tr>
<tr><td style="padding:24px 28px;border-top:1px solid #e5ded9;background-color:#fbfaf9;text-align:center;"><p style="margin:0 0 10px;font-weight:700;">iVenue</p><p style="margin:0;color:#625b57;font-size:13px;line-height:1.55;">This is an automated message from iVenue Support.</p></td></tr>
</table></td></tr></table></body></html>`;
  return {
    from: input.from,
    to: [input.to],
    subject,
    html,
    text: [
      heading,
      intro,
      `Request: ${requestSubject}`,
      snippet,
      closing,
      `${cta}: ${url}`,
      "This is an automated message from iVenue Support.",
    ].filter(Boolean).join("\n\n"),
  };
}
