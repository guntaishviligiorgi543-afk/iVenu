(() => {
  const client = window.supabaseClient;

  if (!client) {
    throw new Error("Supabase client is not configured.");
  }

  function getErrorMessage(error) {
    return error?.message || "Unable to load data from Supabase.";
  }

  async function getBands() {
    const { data, error } = await client
      .from("bands")
      .select("id, name, description, genre, country, image_url, created_at")
      .order("name");

    if (error) throw new Error(getErrorMessage(error));
    return data || [];
  }

  async function getEvents() {
    const { data, error } = await client
      .from("events")
      .select(
        "id, band_id, title, description, event_date, event_time, doors_open, venue, city, country, image_url, status, created_at, bands(id, name, description, genre, country, image_url)",
      )
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    if (error) throw new Error(getErrorMessage(error));
    return data || [];
  }

  async function getEvent(eventId) {
    const { data, error } = await client
      .from("events")
      .select(
        "id, band_id, title, description, event_date, event_time, doors_open, venue, city, country, image_url, status, created_at, bands(id, name, description, genre, country, image_url)",
      )
      .eq("id", eventId)
      .maybeSingle();

    if (error) throw new Error(getErrorMessage(error));
    return data;
  }

  async function getTicketTypes(eventId) {
    const { data, error } = await client
      .from("ticket_types")
      .select(
        "id, event_id, name, description, price, total_quantity, available_quantity, created_at",
      )
      .eq("event_id", eventId)
      .order("price", { ascending: true });

    if (error) throw new Error(getErrorMessage(error));
    return data || [];
  }

  window.supabaseData = {
    getBands,
    getEvents,
    getEvent,
    getTicketTypes,
  };
})();
