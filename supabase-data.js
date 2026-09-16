(() => {
  const client = window.supabaseClient;

  if (!client) {
    throw new Error("Supabase client is not configured.");
  }

  function getErrorMessage(error) {
    return error?.message || "Unable to load data from Supabase.";
  }

  function getEventLocation(event) {
    const venue =
      event?.venues && !Array.isArray(event.venues) ? event.venues : null;
    const cityArea = venue?.city_area ?? event?.city ?? "";
    const region = venue?.region ?? "";
    const country = venue?.country ?? event?.country ?? "";
    const details = [...new Set([cityArea, region, country].filter(Boolean))];

    return {
      venue: venue?.name ?? event?.venue ?? "",
      cityArea,
      region,
      country,
      address: venue?.address ?? "",
      latitude: venue?.latitude ?? null,
      longitude: venue?.longitude ?? null,
      details: details.join(", "),
      text: [venue?.name ?? event?.venue ?? "", details.join(", ")]
        .filter(Boolean)
        .join(", "),
    };
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
        "id, performer, band_id, category_id, title, description, event_date, event_time, doors_open, venue_id, venue, city, country, image_url, status, created_at, venues:venues!events_venue_id_fkey(id, name, city_area, region, country, address, latitude, longitude, image_url), categories(id, name), bands(id, name, description, genre, country, image_url)",
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
        "id, performer, band_id, category_id, title, description, event_date, event_time, doors_open, venue_id, venue, city, country, image_url, status, created_at, venues:venues!events_venue_id_fkey(id, name, city_area, region, country, address, latitude, longitude, image_url), categories(id, name), bands(id, name, description, genre, country, image_url)",
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

  async function recordEventView(eventId) {
    const { error } = await client.rpc("record_event_view", {
      p_event_id: eventId,
    });
    if (error) throw new Error(getErrorMessage(error));
  }

  async function toggleFavorite(eventId) {
    const { data, error } = await client.rpc("toggle_favorite", {
      p_event_id: eventId,
    });
    if (error) throw new Error(getErrorMessage(error));
    return Boolean(data);
  }

  async function isEventFavorited(eventId) {
    const { data, error } = await client.rpc("is_event_favorited", {
      p_event_id: eventId,
    });
    if (error) throw new Error(getErrorMessage(error));
    return Boolean(data);
  }

  window.supabaseData = {
    getBands,
    getEvents,
    getEvent,
    getEventLocation,
    getTicketTypes,
    recordEventView,
    toggleFavorite,
    isEventFavorited,
  };
})();
