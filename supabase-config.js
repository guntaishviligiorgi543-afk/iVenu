window.supabaseConfig = {
  url: "https://aswiwlyydesskwvehmej.supabase.co",
  publishableKey: "sb_publishable_K6GcVLBni0-usM_iMHuFmA_yD9npHH1",
};

window.supabaseClient = window.supabase.createClient(
  window.supabaseConfig.url,
  window.supabaseConfig.publishableKey,
);
