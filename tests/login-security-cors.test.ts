import { loginSecurityCorsHeaders } from "../supabase/functions/login-security/cors.ts";

const equal = (actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
};

Deno.test("Login Security preserves production CORS and requests without Origin", () => {
  for (const origin of ["https://ivenue.site", null]) {
    const headers = new Headers(loginSecurityCorsHeaders(origin));
    equal(headers.get("Access-Control-Allow-Origin"), "https://ivenue.site");
    equal(headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
    equal(
      headers.get("Access-Control-Allow-Headers"),
      "authorization, x-client-info, apikey, content-type",
    );
    equal(headers.get("Vary"), "Origin");
  }
});

Deno.test("Login Security allows only the confirmed development origin", () => {
  equal(
    loginSecurityCorsHeaders(
      "http://127.0.0.1:5500",
    )["Access-Control-Allow-Origin"],
    "http://127.0.0.1:5500",
  );
  for (
    const origin of [
      "http://localhost:5500",
      "http://127.0.0.1:5501",
      "https://127.0.0.1:5500",
      "http://127.0.0.1",
      "http://127.0.0.1:5500.attacker.test",
      "http://127.0.0.1.attacker.test:5500",
      "https://ivenue.site.attacker.test",
      "http://ivenue.site",
      "https://attacker.test",
      "null",
      "*",
      "",
    ]
  ) {
    const allowed =
      loginSecurityCorsHeaders(origin)["Access-Control-Allow-Origin"];
    equal(allowed, "https://ivenue.site");
    if (allowed === origin || allowed === "*") {
      throw new Error("Unapproved origin allowed.");
    }
  }
});

Deno.test("Login Security CORS responses do not share request-specific state", () => {
  const local = loginSecurityCorsHeaders("http://127.0.0.1:5500");
  const production = loginSecurityCorsHeaders("https://ivenue.site");
  const denied = loginSecurityCorsHeaders("https://attacker.test");
  equal(local["Access-Control-Allow-Origin"], "http://127.0.0.1:5500");
  equal(production["Access-Control-Allow-Origin"], "https://ivenue.site");
  equal(denied["Access-Control-Allow-Origin"], "https://ivenue.site");
});
