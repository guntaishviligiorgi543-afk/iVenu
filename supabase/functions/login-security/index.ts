import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loginSecurityCorsHeaders } from "./cors.ts";

const OTP_LENGTH = 8;
const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const TRUST_WINDOW_MS = 24 * 60 * 60 * 1000;

type Body = {
  action?:
    | "check"
    | "request"
    | "verify"
    | "revoke"
    | "prepare_signup"
    | "establish_signup";
  email?: string;
  deviceToken?: string;
  otp?: string;
};

const hashValue = async (value: string, secret: string) => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${secret}:${value}`),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const createOtp = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 10 ** OTP_LENGTH).padStart(OTP_LENGTH, "0");
};

const createProof = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const hashProof = async (proof: string) => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(proof),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const sendEmail = async (
  to: string,
  otp: string,
  resendApiKey: string,
  emailFrom: string,
) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [to],
      subject: "Your iVenue sign-in verification code",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717"><h2>Verify your iVenue sign-in</h2><p>A sign-in verification was requested for your iVenue account.</p><p>Your verification code is:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</p><p>This code expires in ${OTP_TTL_MINUTES} minutes.</p><p>If you did not attempt to sign in, please ignore this email and change your password.</p><p>iVenue Team</p></div>`,
    }),
  });
  if (!response.ok) throw new Error("Unable to send the verification email.");
};

Deno.serve(async (request) => {
  const corsHeaders = loginSecurityCorsHeaders(request.headers.get("Origin"));
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (request.method === "OPTIONS") return json({ success: true });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("EMAIL_FROM");
  const otpSecret = Deno.env.get("LOGIN_OTP_HASH_SECRET");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey || !emailFrom || !otpSecret)
    return json({ success: false, error: "Login security is not configured." }, 500);
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid request." }, 400);
  }
  if (
    ![
      "check",
      "request",
      "verify",
      "revoke",
      "prepare_signup",
      "establish_signup",
    ].includes(body.action || "")
  )
    return json({ success: false, error: "Invalid request." }, 400);
  if (!body.deviceToken || !/^[A-Za-z0-9_-]{40,}$/.test(body.deviceToken))
    return json({ success: false, error: "Invalid device identifier." }, 400);

  const deviceHash = await hashValue(body.deviceToken, otpSecret);

  if (body.action === "prepare_signup") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json({ success: false, error: "Invalid signup email." }, 400);
    const emailHash = await hashValue(email, otpSecret);
    const { error: invalidateError } = await adminClient
      .from("login_signup_trust_intents")
      .update({ consumed_at: new Date().toISOString() })
      .eq("email_hash", emailHash)
      .eq("device_token_hash", deviceHash)
      .is("consumed_at", null);
    if (invalidateError)
      return json({ success: false, error: "Unable to prepare signup security." }, 500);
    const { error: intentError } = await adminClient
      .from("login_signup_trust_intents")
      .insert({ email_hash: emailHash, device_token_hash: deviceHash });
    if (intentError)
      return json({ success: false, error: "Unable to prepare signup security." }, 500);
    return json({ success: true, status: "SIGNUP_PREPARED" });
  }

  if (!authorization) return json({ success: false, error: "Authentication required." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData.user;
  if (authError || !user?.id || !user.email)
    return json({ success: false, error: "Authentication required." }, 401);
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  const decodeJwtPayload = (token: string) => {
    try {
      const encoded = token.split(".")[1];
      return JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), (char) =>
            char.charCodeAt(0),
          ),
        ),
      ) as { session_id?: string; iat?: number };
    } catch {
      return {};
    }
  };
  const jwtPayload = decodeJwtPayload(accessToken);
  const sessionId = jwtPayload.session_id || null;
  const sessionStartedAt =
    typeof jwtPayload.iat === "number"
      ? new Date(jwtPayload.iat * 1000).toISOString()
      : null;
  const issueProof = async (lastSuccessfulSignInAt: string) => {
    const proof = createProof();
    const trustExpiresAt = new Date(
      new Date(lastSuccessfulSignInAt).getTime() + TRUST_WINDOW_MS,
    );
    const expiresAt = new Date(
      Math.min(Date.now() + 30 * 60 * 1000, trustExpiresAt.getTime()),
    ).toISOString();
    const { error: proofError } = await adminClient
      .from("login_security_proofs")
      .insert({
        user_id: user.id,
        device_token_hash: deviceHash,
        proof_hash: await hashProof(proof),
        expires_at: expiresAt,
      });
    if (proofError) throw proofError;
    return proof;
  };

  if (body.action === "establish_signup") {
    if (!user.email_confirmed_at)
      return json({ success: false, error: "Signup email verification is required." }, 403);
    const emailHash = await hashValue(user.email.toLowerCase(), otpSecret);
    const { data: intent, error: intentError } = await adminClient
      .from("login_signup_trust_intents")
      .select("id, created_at, expires_at")
      .eq("email_hash", emailHash)
      .eq("device_token_hash", deviceHash)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const createdAt = new Date(user.created_at).getTime();
    const intentCreatedAt = new Date(intent?.created_at || 0).getTime();
    if (
      intentError ||
      !intent ||
      !Number.isFinite(createdAt) ||
      createdAt < intentCreatedAt - 5000
    )
      return json({ success: false, error: "Signup trust is not available." }, 403);
    const now = new Date().toISOString();
    const { data: consumedIntent, error: consumeError } = await adminClient
      .from("login_signup_trust_intents")
      .update({ consumed_at: now, user_id: user.id })
      .eq("id", intent.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (consumeError || !consumedIntent)
      return json({ success: false, error: "Signup trust has already been used." }, 409);
    const { error: deviceError } = await adminClient
      .from("login_trusted_devices")
      .upsert(
        {
          user_id: user.id,
          device_token_hash: deviceHash,
          last_verified_at: now,
          last_successful_sign_in_at: now,
          last_successful_session_id: sessionId,
          updated_at: now,
          last_used_at: now,
        },
        { onConflict: "user_id,device_token_hash" },
      );
    if (deviceError)
      return json({ success: false, error: "Unable to save signup security." }, 500);
    try {
      const proof = await issueProof(now);
      return json({ success: true, status: "VERIFIED", proof });
    } catch {
      return json({ success: false, error: "Unable to issue login security proof." }, 500);
    }
  }

  if (body.action === "revoke") {
    const { error: revokeError } = await adminClient
      .from("login_security_proofs")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("device_token_hash", deviceHash)
      .is("revoked_at", null);
    if (revokeError) return json({ success: false, error: "Unable to revoke login security proof." }, 500);
    return json({ success: true, status: "REVOKED" });
  }

  if (body.action === "check") {
    const { data: device, error } = await adminClient
      .from("login_trusted_devices")
      .select("last_successful_sign_in_at, last_successful_session_id")
      .eq("user_id", user.id)
      .eq("device_token_hash", deviceHash)
      .maybeSingle();
    if (error) return json({ success: false, error: "Unable to check login security." }, 500);
    let lastSuccessfulSignInAt = device?.last_successful_sign_in_at;
    const verified =
      device?.last_successful_sign_in_at &&
      Date.now() - new Date(device.last_successful_sign_in_at).getTime() < TRUST_WINDOW_MS;
    if (verified) {
      if (
        sessionId &&
        sessionStartedAt &&
        device.last_successful_session_id !== sessionId
      ) {
        const { data: touched, error: touchError } = await adminClient.rpc(
          "login_security_touch_successful_sign_in",
          {
            p_user_id: user.id,
            p_device_token_hash: deviceHash,
            p_session_id: sessionId,
            p_session_started_at: sessionStartedAt,
          },
        );
        if (touchError) return json({ success: false, error: "Unable to update login security." }, 500);
        lastSuccessfulSignInAt = touched || lastSuccessfulSignInAt;
      }
      await adminClient
        .from("login_trusted_devices")
        .update({ last_used_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("device_token_hash", deviceHash);
    }
    if (!verified) return json({ success: true, status: "OTP_REQUIRED" });
    try {
      const proof = await issueProof(lastSuccessfulSignInAt);
      return json({ success: true, status: "VERIFIED", proof });
    } catch {
      return json({ success: false, error: "Unable to issue login security proof." }, 500);
    }
  }

  if (body.action === "verify") {
    if (!/^\d{8}$/.test(String(body.otp || "")))
      return json({ success: false, error: "Enter the eight-digit verification code." }, 400);
    const { data: challenge, error } = await adminClient
      .from("login_otp_challenges")
      .select("id, otp_hash, expires_at, attempts, max_attempts, consumed_at")
      .eq("user_id", user.id)
      .eq("device_token_hash", deviceHash)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !challenge)
      return json({ success: false, error: "The verification code is invalid or expired." }, 400);
    if (new Date(challenge.expires_at).getTime() <= Date.now())
      return json({ success: false, error: "The verification code has expired." }, 400);
    if (challenge.attempts >= challenge.max_attempts)
      return json({ success: false, error: "Too many attempts. Request a new code." }, 429);
    const expectedHash = await hashValue(String(body.otp), otpSecret);
    if (expectedHash !== challenge.otp_hash) {
      const { data: attempts, error: attemptError } = await adminClient.rpc(
        "login_security_record_failed_attempt",
        { p_challenge_id: challenge.id },
      );
      if (attemptError)
        return json({ success: false, error: "Unable to record verification attempt." }, 500);
      return json(
        { success: false, error: Number(attempts) >= challenge.max_attempts ? "Too many attempts. Request a new code." : "The verification code is invalid." },
        Number(attempts) >= challenge.max_attempts ? 429 : 400,
      );
    }
    const { data: consumed, error: consumeError } = await adminClient.rpc(
      "login_security_consume_challenge",
      { p_challenge_id: challenge.id, p_otp_hash: expectedHash },
    );
    if (consumeError) return json({ success: false, error: "Unable to complete verification." }, 500);
    if (consumed !== true)
      return json({ success: false, error: "The verification code is invalid or expired." }, 400);
    const now = new Date().toISOString();
    const { error: deviceError } = await adminClient
      .from("login_trusted_devices")
      .upsert(
        {
          user_id: user.id,
          device_token_hash: deviceHash,
          last_verified_at: now,
          last_successful_sign_in_at: now,
          last_successful_session_id: sessionId,
          updated_at: now,
          last_used_at: now,
        },
        { onConflict: "user_id,device_token_hash" },
      );
    if (deviceError) return json({ success: false, error: "Unable to save device verification." }, 500);
    try {
      const proof = await issueProof(now);
      return json({ success: true, status: "VERIFIED", proof });
    } catch {
      return json({ success: false, error: "Unable to issue login security proof." }, 500);
    }
  }

  const { data: allowed, error: rateLimitError } = await adminClient.rpc(
    "login_security_allow_otp_request",
    { p_user_id: user.id, p_device_token_hash: deviceHash },
  );
  if (rateLimitError)
    return json({ success: false, error: "Unable to request verification." }, 500);
  if (allowed !== true)
    return json({ success: false, error: "Please wait before requesting another code." }, 429);
  const { data: active, error: activeError } = await adminClient
    .from("login_otp_challenges")
    .select("id, last_sent_at")
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .maybeSingle();
  if (activeError) return json({ success: false, error: "Unable to request verification." }, 500);
  if (active && Date.now() - new Date(active.last_sent_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000)
    return json({ success: false, error: "Please wait before requesting another code." }, 429);
  if (active) await adminClient.from("login_otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", active.id);
  const otp = createOtp();
  const { error: insertError } = await adminClient.from("login_otp_challenges").insert({
    user_id: user.id,
    device_token_hash: deviceHash,
    otp_hash: await hashValue(otp, otpSecret),
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
    max_attempts: MAX_ATTEMPTS,
  });
  if (insertError) return json({ success: false, error: "Unable to create verification request." }, 500);
  try {
    await sendEmail(user.email, otp, resendApiKey, emailFrom);
  } catch {
    return json({ success: false, error: "Unable to send the verification email." }, 502);
  }
  return json({ success: true, status: "OTP_SENT" });
});
