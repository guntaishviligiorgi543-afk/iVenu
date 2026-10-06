const PRODUCTION_ORIGIN = "https://ivenue.site";
const allowedOrigins = new Set([
  PRODUCTION_ORIGIN,
  "http://127.0.0.1:5500",
]);

export const loginSecurityCorsHeaders = (origin: string | null) => ({
  // Unlisted origins retain the production header, which browsers reject for
  // those origins. Requests without Origin keep their existing behavior.
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin)
    ? origin
    : PRODUCTION_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
