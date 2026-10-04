import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const hashLoginSecurityProof = async (proof: string) => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(proof),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

export const requireLoginSecurityProof = async (
  adminClient: SupabaseClient,
  userId: string,
  proof: unknown,
) => {
  if (typeof proof !== "string" || !/^[a-f0-9]{64}$/i.test(proof)) {
    return { ok: false, code: "LOGIN_SECURITY_REQUIRED" };
  }
  const proofHash = await hashLoginSecurityProof(proof);
  const { data, error } = await adminClient
    .from("login_security_proofs")
    .select("id, device_token_hash")
    .eq("user_id", userId)
    .eq("proof_hash", proofHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return { ok: false, code: "LOGIN_SECURITY_EXPIRED" };

  const { data: validDevice, error: deviceError } = await adminClient
    .from("login_trusted_devices")
    .select("last_verified_at")
    .eq("user_id", userId)
    .eq("device_token_hash", data.device_token_hash)
    .gt("last_verified_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .maybeSingle();
  if (deviceError || !validDevice) return { ok: false, code: "LOGIN_SECURITY_EXPIRED" };
  return { ok: true, code: null };
};
