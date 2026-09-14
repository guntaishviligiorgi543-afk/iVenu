import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OTP_LENGTH = 8;
const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const logStep = (step: string, details: Record<string, unknown> = {}) => {
  console.log(JSON.stringify({ scope: "EMAIL_CHANGE", step, ...details }));
};

class DiagnosticError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 500,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "DiagnosticError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type Body = {
  action?: "request" | "verify" | "resend";
  currentPassword?: string;
  newEmail?: string;
  requestId?: string;
  otp?: string;
  requireAdmin?: boolean;
};

const json = (body: unknown, status = 200) => {
  const payload =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : { data: body };
  const responseBody = payload.error
    ? {
        success: false,
        code: payload.code || "EMAIL_CHANGE_ERROR",
        error: payload.error,
      }
    : { success: true, ...payload };
  return new Response(JSON.stringify(responseBody), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

const diagnostic = (
  code: string,
  error: string,
  status = 500,
  details: Record<string, unknown> = {},
) => {
  const { providerBody: _providerBody, ...logDetails } = details;
  logStep("Diagnostic error", { code, status, error, ...logDetails });
  return json({ error, code, details }, status);
};

const normalizeEmail = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function hashOtp(otp: string, pepper: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${pepper}:${otp}`),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function createOtp() {
  const max = 10 ** OTP_LENGTH;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % max).padStart(OTP_LENGTH, "0");
}

async function sendEmail(
  to: string,
  otp: string,
  resendApiKey: string,
  from: string,
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Confirm your new iVenue email address",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717"><h2>Confirm your new email address</h2><p>You requested to change the email address associated with your iVenue account.</p><p>Your verification code is:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</p><p>This code expires in 10 minutes.</p><p>If you did not request this change, please ignore this email.</p><p>iVenue Team</p></div>`,
    }),
  });
  const responseText = await response.text();
  let responseBody: unknown = null;
  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseBody = responseText.slice(0, 1000);
  }
  logStep("Email provider response", {
    ok: response.ok,
    status: response.status,
    hasBody: responseBody !== null,
  });
  if (!response.ok) {
    throw new DiagnosticError(
      "RESEND_ERROR",
      "Resend rejected the email request.",
      502,
      { providerStatus: response.status, providerBody: responseBody },
    );
  }
}

Deno.serve(async (request) => {
  try {
    logStep("Function started", { method: request.method });
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM");
    const otpPepper = Deno.env.get("OTP_HASH_SECRET");
    const authorization = request.headers.get("Authorization");
    logStep("Configuration checked", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasAnonKey: Boolean(anonKey),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasEmailProviderKey: Boolean(resendApiKey),
      hasEmailFrom: Boolean(emailFrom),
      hasOtpSecret: Boolean(otpPepper),
    });
    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey ||
      !resendApiKey ||
      !emailFrom ||
      !otpPepper
    ) {
      const missing = [
        !supabaseUrl && "SUPABASE_URL",
        !anonKey && "SUPABASE_ANON_KEY",
        !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
        !resendApiKey && "RESEND_API_KEY",
        !emailFrom && "EMAIL_FROM",
        !otpPepper && "OTP_HASH_SECRET",
      ].filter(Boolean);
      return diagnostic(
        "CONFIG_ERROR",
        "Email change service is not configured.",
        500,
        { missing },
      );
    }
    if (!authorization) {
      logStep("Authentication failed", {
        reason: "Missing Authorization header",
      });
      return diagnostic("AUTH_ERROR", "Authentication required.", 401, {
        operation: "Authorization header check",
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } =
      await userClient.auth.getUser();
    const user = authData?.user;
    if (authError || !user) {
      logStep("Authentication failed", { reason: "getUser failed" });
      return diagnostic("AUTH_ERROR", "Authentication required.", 401, {
        operation: "supabase.auth.getUser",
        authCode: authError?.code,
        authMessage: authError?.message,
      });
    }
    logStep("Authentication verified");

    let body: Body;
    try {
      body = await request.json();
    } catch (error) {
      return json({ error: "Invalid request." }, 400);
    }
    const action = body.action;
    logStep("Request parsed", {
      action,
      requireAdmin: Boolean(body.requireAdmin),
    });
    if (!action || !["request", "verify", "resend"].includes(action))
      return json({ error: "Invalid request." }, 400);

    const { data: adminRow, error: adminError } = await adminClient
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (adminError)
      return diagnostic(
        "DATABASE_ERROR",
        "Unable to verify account permissions.",
        500,
        {
          operation: "admin_users lookup",
          dbCode: adminError.code,
          dbMessage: adminError.message,
        },
      );
    const isAdmin = Boolean(adminRow);
    logStep("Account authorization checked", { isAdmin });
    if (Boolean(body.requireAdmin) !== isAdmin)
      return diagnostic("AUTH_ERROR", "Account type is not authorized.", 403, {
        operation: "admin_users authorization check",
      });

    const verifyPassword = async () => {
      logStep("Current password verification started");
      try {
        const isolated = createClient(supabaseUrl, anonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        const { error } = await isolated.auth.signInWithPassword({
          email: user.email,
          password: String(body.currentPassword || ""),
        });
        await isolated.auth.signOut({ scope: "local" });
        logStep("Current password verification result", { valid: !error });
        return !error;
      } catch (error) {
        throw new DiagnosticError(
          "AUTH_ERROR",
          "Current password verification failed.",
          500,
          {
            operation: "auth.signInWithPassword",
            authCode: error instanceof Error ? error.name : undefined,
            authMessage: error instanceof Error ? error.message : undefined,
          },
        );
      }
    };

    const findExistingUser = async (email: string) => {
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await adminClient.auth.admin.listUsers({
          page,
          perPage: 1000,
        });
        if (error) {
          throw new DiagnosticError(
            "AUTH_ERROR",
            "Unable to check whether the email is already registered.",
            error.status || 500,
            {
              operation: "auth.admin.listUsers",
              authCode: error.code,
              authMessage: error.message,
            },
          );
        }
        const match = data.users.find(
          (candidate) => candidate.email?.toLowerCase() === email,
        );
        if (match) return match;
        if (data.users.length < 1000) break;
      }
      return null;
    };

    const issueOtp = async (newEmail: string, oldRequestId?: string) => {
      logStep("OTP issuance started", { resend: Boolean(oldRequestId) });
      const now = new Date();
      const { data: activeRequest, error: activeRequestError } =
        await adminClient
          .from("email_change_verifications")
          .select("id, last_sent_at, consumed_at")
          .eq("user_id", user.id)
          .is("consumed_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      if (activeRequestError) {
        throw new DiagnosticError(
          "DATABASE_ERROR",
          "Unable to inspect the active email-change request.",
          500,
          {
            operation: "active email-change lookup",
            dbCode: activeRequestError.code,
            dbMessage: activeRequestError.message,
          },
        );
      }
      if (
        activeRequest &&
        Date.now() - new Date(activeRequest.last_sent_at).getTime() <
          RESEND_COOLDOWN_SECONDS * 1000
      ) {
        throw new Error("Please wait before requesting another code.");
      }
      if (oldRequestId) {
        const { data: oldRequest, error: oldError } = await adminClient
          .from("email_change_verifications")
          .select("id, user_id, new_email, last_sent_at, consumed_at")
          .eq("id", oldRequestId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (oldError) {
          throw new DiagnosticError(
            "DATABASE_ERROR",
            "Unable to inspect the previous email-change request.",
            500,
            {
              operation: "resend request lookup",
              dbCode: oldError.code,
              dbMessage: oldError.message,
            },
          );
        }
        if (!oldRequest || oldRequest.consumed_at)
          throw new Error("Email change request is no longer valid.");
        if (
          Date.now() - new Date(oldRequest.last_sent_at).getTime() <
          RESEND_COOLDOWN_SECONDS * 1000
        )
          throw new Error("Please wait before requesting another code.");
      }
      if (await findExistingUser(newEmail)) {
        throw new Error("That email is already registered.");
      }
      const { error: invalidateError } = await adminClient
        .from("email_change_verifications")
        .update({ consumed_at: now.toISOString() })
        .eq("user_id", user.id)
        .is("consumed_at", null);
      if (invalidateError) {
        throw new DiagnosticError(
          "DATABASE_ERROR",
          "Unable to invalidate the previous verification code.",
          500,
          {
            operation: "invalidate previous OTP",
            dbCode: invalidateError.code,
            dbMessage: invalidateError.message,
          },
        );
      }
      const otp = createOtp();
      const { data: record, error } = await adminClient
        .from("email_change_verifications")
        .insert({
          user_id: user.id,
          new_email: newEmail,
          otp_hash: await hashOtp(otp, otpPepper),
          expires_at: new Date(
            now.getTime() + OTP_TTL_MINUTES * 60 * 1000,
          ).toISOString(),
          max_attempts: MAX_ATTEMPTS,
          last_sent_at: now.toISOString(),
        })
        .select("id")
        .single();
      if (error || !record) {
        throw new DiagnosticError(
          "DATABASE_ERROR",
          "Could not create verification request.",
          500,
          {
            operation: "create OTP request",
            dbCode: error?.code,
            dbMessage: error?.message,
          },
        );
      }
      logStep("OTP database record created");
      try {
        logStep("Email sending started");
        await sendEmail(newEmail, otp, resendApiKey, emailFrom);
        logStep("Email sending succeeded");
      } catch (error) {
        logStep("Email sending failed");
        await adminClient
          .from("email_change_verifications")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", record.id);
        if (error instanceof DiagnosticError) throw error;
        throw new Error("Unable to send the verification email.");
      }
      return record.id;
    };

    if (action === "request") {
      logStep("New email validation started");
      const newEmail = normalizeEmail(body.newEmail);
      if (!String(body.currentPassword || ""))
        return json({ error: "Current password is required." }, 400);
      if (!validEmail(newEmail))
        return json({ error: "Enter a valid new email address." }, 400);
      if (newEmail === user.email?.toLowerCase())
        return json(
          { error: "New email must be different from your current email." },
          400,
        );
      if (!(await verifyPassword())) {
        logStep("Request rejected", { reason: "Incorrect current password" });
        return diagnostic("AUTH_ERROR", "Incorrect current password.", 401, {
          operation: "auth.signInWithPassword",
        });
      }
      if (await findExistingUser(newEmail))
        return json({ error: "That email is already registered." }, 409);
      try {
        return json({ requestId: await issueOtp(newEmail) });
      } catch (error) {
        if (error instanceof DiagnosticError)
          return diagnostic(
            error.code,
            error.message,
            error.status,
            error.details,
          );
        return diagnostic(
          "UNEXPECTED_ERROR",
          "Unable to start email change.",
          500,
          { operation: "email-change request" },
        );
      }
    }

    if (!body.requestId)
      return json({ error: "Verification request is required." }, 400);
    const { data: pending, error: pendingError } = await adminClient
      .from("email_change_verifications")
      .select("*")
      .eq("id", body.requestId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (pendingError)
      return diagnostic(
        "DATABASE_ERROR",
        "Unable to load the verification request.",
        500,
        {
          operation: "load OTP request",
          dbCode: pendingError.code,
          dbMessage: pendingError.message,
        },
      );
    if (!pending || pending.consumed_at)
      return json(
        { error: "Verification request is invalid or expired." },
        400,
      );

    if (action === "resend") {
      logStep("Resend requested");
      try {
        return json({
          requestId: await issueOtp(pending.new_email, pending.id),
        });
      } catch (error) {
        if (error instanceof DiagnosticError)
          return diagnostic(
            error.code,
            error.message,
            error.status,
            error.details,
          );
        return json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Unable to resend the verification code.",
          },
          429,
        );
      }
    }

    if (new Date(pending.expires_at).getTime() <= Date.now())
      return json(
        { error: "Verification code expired. Request a new code." },
        410,
      );
    if (pending.attempts >= pending.max_attempts)
      return json(
        { error: "Too many incorrect attempts. Request a new code." },
        429,
      );
    const suppliedHash = await hashOtp(String(body.otp || ""), otpPepper);
    logStep("OTP verification started");
    if (suppliedHash !== pending.otp_hash) {
      const nextAttempts = pending.attempts + 1;
      const { error: attemptError } = await adminClient
        .from("email_change_verifications")
        .update({
          attempts: nextAttempts,
          consumed_at:
            nextAttempts >= pending.max_attempts
              ? new Date().toISOString()
              : null,
        })
        .eq("id", pending.id)
        .eq("attempts", pending.attempts);
      if (attemptError)
        return diagnostic(
          "DATABASE_ERROR",
          "Unable to record the verification attempt.",
          500,
          {
            operation: "record OTP attempt",
            dbCode: attemptError.code,
            dbMessage: attemptError.message,
          },
        );
      return json(
        {
          error:
            nextAttempts >= pending.max_attempts
              ? "Too many incorrect attempts. Request a new code."
              : "Incorrect verification code.",
        },
        401,
      );
    }

    const existing = await findExistingUser(pending.new_email);
    if (existing && existing.id !== user.id)
      return json({ error: "That email is already registered." }, 409);
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { email: pending.new_email, email_confirm: true },
    );
    if (updateError)
      return diagnostic(
        "AUTH_ERROR",
        "Unable to update the authenticated email.",
        updateError.status || 500,
        {
          operation: "auth.admin.updateUserById",
          authCode: updateError.code,
          authMessage: updateError.message,
        },
      );
    logStep("Auth email updated");
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        email: pending.new_email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    const { error: consumeError } = await adminClient
      .from("email_change_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", pending.id);
    if (profileError)
      return diagnostic(
        "DATABASE_ERROR",
        "Email changed, but profile synchronization failed.",
        500,
        {
          operation: "profile email update",
          dbCode: profileError.code,
          dbMessage: profileError.message,
        },
      );
    if (consumeError)
      return diagnostic(
        "DATABASE_ERROR",
        "Email changed, but verification cleanup failed.",
        500,
        {
          operation: "consume OTP request",
          dbCode: consumeError.code,
          dbMessage: consumeError.message,
        },
      );
    return json({ changed: true, email: pending.new_email });
  } catch (error) {
    if (error instanceof DiagnosticError)
      return diagnostic(error.code, error.message, error.status, error.details);
    logStep("Unexpected exception", {
      error: error instanceof Error ? error.message : "Unknown exception",
    });
    return diagnostic(
      "UNEXPECTED_ERROR",
      "Unexpected email-change service failure.",
      500,
    );
  }
});
