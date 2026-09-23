(() => {
  const client = window.supabaseClient;
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  async function getRows() {
    const session = await window.authApi?.getSession();
    if (!session?.user || !client) return [];
    const { data: cartRows, error: cartError } = await client
      .from("cart_items")
      .select("id, ticket_type_id, quantity")
      .eq("user_id", session.user.id)
      .is("event_seat_id", null)
      .order("updated_at", { ascending: false });
    if (cartError) throw cartError;
    const ticketIds = [
      ...new Set((cartRows || []).map((row) => row.ticket_type_id)),
    ];
    if (!ticketIds.length) return [];
    const { data: tickets, error: ticketError } = await client
      .from("ticket_types")
      .select("id, event_id")
      .in("id", ticketIds);
    if (ticketError) throw ticketError;
    const eventIds = [
      ...new Set((tickets || []).map((ticket) => ticket.event_id)),
    ];
    const { data: events, error: eventError } = await client
      .from("events")
      .select("id, title, image_url, event_date, bands(image_url)")
      .in("id", eventIds);
    if (eventError) throw eventError;
    const eventMap = new Map(
      (events || []).map((event) => [String(event.id), event]),
    );
    const ticketMap = new Map(
      (tickets || []).map((ticket) => [String(ticket.id), ticket]),
    );
    const seen = new Set();
    return (cartRows || [])
      .filter((row) => {
        const eventId = ticketMap.get(String(row.ticket_type_id))?.event_id;
        if (!eventId || seen.has(String(eventId))) return false;
        seen.add(String(eventId));
        return true;
      })
      .map((row) => ({
        rowId: row.id,
        ticketTypeId: row.ticket_type_id,
        event: eventMap.get(
          String(ticketMap.get(String(row.ticket_type_id))?.event_id),
        ),
      }))
      .filter((item) => item.event);
  }

  async function renderList(container, rows) {
    if (!container) return;
    container.innerHTML = rows.length
      ? rows
          .map((item) => {
            const event = item.event;
            const image = event.image_url || event.bands?.image_url || "";
            return `<article class="event-cart-row"><img src="${escapeHtml(image)}" alt="${escapeHtml(event.title)}" /><div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.event_date)}</span></div><a class="event-cart-tickets" href="getTickets.html?id=${encodeURIComponent(event.id)}">Get Tickets</a><button class="event-cart-remove" type="button" data-event-id="${escapeHtml(event.id)}">Remove from Cart</button></article>`;
          })
          .join("")
      : '<p class="event-cart-empty">Your event cart is empty.</p>';
  }

  async function render() {
    const rows = await getRows();
    document
      .querySelectorAll("#eventCartList, #dashboardEventCartList")
      .forEach((container) => renderList(container, rows));
    document
      .querySelectorAll("#eventCartCount, #eventCartCountText")
      .forEach((element) => {
        element.textContent = String(rows.length);
      });
    window.dispatchEvent(
      new CustomEvent("eventCartChanged", {
        detail: { eventIds: rows.map((item) => String(item.event.id)) },
      }),
    );
    return rows;
  }

  async function addEvent(eventId) {
    const session = await window.authApi.getSession();
    if (!session?.user)
      throw new Error("Please sign in before adding an event to your cart.");
    const tickets = await window.supabaseData.getTicketTypes(eventId);
    if (!tickets[0])
      throw new Error("No tickets are available for this event.");
    await window.cartSync.syncTicket(tickets[0].id, 1);
    await render();
    return true;
  }

  async function hasEvent(eventId) {
    const rows = await getRows();
    return rows.some((item) => String(item.event.id) === String(eventId));
  }

  async function remove(eventId) {
    const session = await window.authApi.getSession();
    if (!session?.user) return;
    const { data: tickets, error: ticketError } = await client
      .from("ticket_types")
      .select("id")
      .eq("event_id", eventId);
    if (ticketError) throw ticketError;
    const ticketIds = (tickets || []).map((ticket) => ticket.id);
    if (!ticketIds.length) return;
    const query = client
      .from("cart_items")
      .delete()
      .eq("user_id", session.user.id)
      .is("event_seat_id", null)
      .in("ticket_type_id", ticketIds);
    const { error } = await query;
    if (error) throw error;
    await render();
  }

  async function removeEvent(eventId) {
    const session = await window.authApi.getSession();
    if (!session?.user) throw new Error("Please sign in to manage your cart.");
    const { data: tickets, error: ticketError } = await client
      .from("ticket_types")
      .select("id")
      .eq("event_id", eventId);
    if (ticketError) throw ticketError;
    const ticketIds = (tickets || []).map((ticket) => ticket.id);
    if (ticketIds.length) {
      const { error } = await client
        .from("cart_items")
        .delete()
        .eq("user_id", session.user.id)
        .is("event_seat_id", null)
        .in("ticket_type_id", ticketIds);
      if (error) throw error;
    }
    await render();
    return true;
  }

  function createUi() {
    if (document.querySelector("#eventCartToggle")) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<button class="event-cart-toggle" id="eventCartToggle" type="button" aria-label="Open cart" title="Open cart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a2 2 0 1 1 0 4a2 2 0 0 1 0-4zm10 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4zM6.2 6h14.25l-1.3 7.25H8.02L6.2 6zM5.48 4L4.1 4.5A1 1 0 0 0 3.2 5.5L4.7 9h13.9a1 1 0 0 1 .97 1.24l-1.6 8.1A2 2 0 0 1 15.97 19H8.02a2 2 0 0 1-1.95-1.52L4.82 7.5H3.5a1 1 0 0 1-.9-1.43L4.1 3.5z" /></svg><span id="eventCartCount">0</span></button><aside class="event-cart-panel" id="eventCartPanel" aria-label="Event cart" aria-hidden="true"><div class="event-cart-panel-head"><h2>Cart</h2><button id="eventCartClose" type="button" aria-label="Close cart">×</button></div><p class="event-cart-summary"><span id="eventCartCountText">0</span> events</p><div class="event-cart-list" id="eventCartList"></div><a class="event-cart-go" href="profile.html#cart">Go to Cart</a></aside>`,
    );
    const toggle = document.querySelector("#eventCartToggle");
    const panel = document.querySelector("#eventCartPanel");
    toggle.addEventListener("click", () => {
      const open = !panel.classList.contains("is-open");
      panel.classList.toggle("is-open", open);
      panel.setAttribute("aria-hidden", String(!open));
    });
    document.querySelector("#eventCartClose").addEventListener("click", () => {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
    });
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest(".event-cart-remove");
    if (!button || button.disabled) return;
    button.disabled = true;
    button.classList.add("cart-action-pending");
    button.setAttribute("aria-busy", "true");
    try {
      await remove(button.dataset.eventId);
    } catch (error) {
      console.error(error);
    } finally {
      button.disabled = false;
      button.classList.remove("cart-action-pending");
      button.setAttribute("aria-busy", "false");
    }
  });

  window.eventCart = { addEvent, hasEvent, removeEvent, render, createUi };
  createUi();
  render().catch((error) => console.error(error));
  window.addEventListener("focus", () =>
    render().catch((error) => console.error(error)),
  );
})();
