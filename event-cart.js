(() => {
  const client = window.supabaseClient;
  const cartChannel =
    typeof BroadcastChannel === "function"
      ? new BroadcastChannel("ivenue-event-cart")
      : null;
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const reservationCountdown = (() => {
    let expiry = 0;
    let countdownId = null;
    let onExpire = null;
    let activeEventId = null;

    const isExcludedPage = () =>
      document.body.classList.contains("account-page") ||
      /(?:^|\/)admin-dashboard\.html$/.test(location.pathname) ||
      document.body.className.includes("auth");
    const format = (seconds) =>
      `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    const clearIntervalId = () => {
      if (countdownId) clearInterval(countdownId);
      countdownId = null;
    };
    const render = () => {
      const internal = document.querySelector(".selectionCountdown");
      const internalValue = document.querySelector(".selectionCountdownValue");
      const external = document.querySelector("#reservationCountdownExternal");
      const externalValue = external?.querySelector(
        ".reservationCountdownValue",
      );
      const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
      const active = !isExcludedPage() && remaining > 0;
      const ticketPurchaseOpen = document.body.classList.contains("ticket-open");
      const time = format(remaining);

      if (internal) {
        const visible = active && ticketPurchaseOpen;
        internal.hidden = !visible;
        internal.style.display = visible ? "flex" : "none";
        internal.classList.toggle("warning", active && remaining <= 60);
      }
      if (internalValue && active) internalValue.textContent = `expires in ${time}`;

      if (external) {
        const visible = active && !ticketPurchaseOpen;
        external.hidden = !visible;
        external.classList.toggle("warning", active && remaining <= 60);
      }
      if (externalValue && active) externalValue.textContent = time;

      return remaining;
    };
    const clear = () => {
      clearIntervalId();
      expiry = 0;
      onExpire = null;
      activeEventId = null;
      render();
    };
    const start = (nextExpiry, { expire, eventId } = {}) => {
      clearIntervalId();
      expiry = Number(nextExpiry) || 0;
      onExpire = typeof expire === "function" ? expire : null;
      activeEventId = eventId ? String(eventId) : null;
      if (!expiry || expiry <= Date.now()) {
        clear();
        return;
      }
      const tick = () => {
        if (render() > 0) return;
        clearIntervalId();
        const expireHandler = onExpire;
        expiry = 0;
        onExpire = null;
        expireHandler?.();
      };
      tick();
      if (expiry) countdownId = setInterval(tick, 1000);
    };
    const restore = async () => {
      if (isExcludedPage() || document.querySelector(".selectionCountdown")) {
        if (isExcludedPage()) clear();
        return;
      }
      const session = await window.authApi?.getSession();
      if (!session?.user || !client) return clear();
      const { data, error } = await client
        .from("cart_items")
        .select(
          "event_seat_id, event_seats!cart_items_event_seat_id_fkey(event_id, status, reserved_until)",
        )
        .eq("user_id", session.user.id)
        .not("event_seat_id", "is", null);
      if (error) throw error;
      const reservations = (data || [])
        .filter((item) => item.event_seats?.status === "reserved")
        .map((item) => ({
          eventId: item.event_seats?.event_id,
          expiry: new Date(item.event_seats?.reserved_until || 0).getTime(),
        }))
        .filter((reservation) =>
          Number.isFinite(reservation.expiry) && reservation.expiry > Date.now(),
        )
        .sort((first, second) => first.expiry - second.expiry);
      if (!reservations.length) return clear();
      start(reservations[0].expiry, { eventId: reservations[0].eventId });
    };

    return { clear, getActiveEventId: () => activeEventId, render, restore, start };
  })();

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

  function broadcastChange() {
    cartChannel?.postMessage({ type: "cart-changed" });
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
    broadcastChange();
    return true;
  }

  async function hasEvent(eventId) {
    const rows = await getRows();
    return rows.some((item) => String(item.event.id) === String(eventId));
  }

  async function getEventIds() {
    const rows = await getRows();
    return rows.map((item) => String(item.event.id));
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
    broadcastChange();
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
    broadcastChange();
    return true;
  }

  function createUi() {
    if (document.querySelector("#eventCartToggle")) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="event-cart-anchor" id="eventCartAnchor"><button class="reservationCountdown" id="reservationCountdownExternal" type="button" aria-live="polite" aria-label="View reserved tickets" title="View reserved tickets" hidden><span class="reservationCountdownLabel">Reservation</span><span class="reservationCountdownValue">00:00</span></button><button class="event-cart-toggle" id="eventCartToggle" type="button" aria-label="Open cart" title="Open cart"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0h24v24H0z" fill="none" /><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"><path d="M5 7h13.79a2 2 0 0 1 1.99 2.199l-.6 6A2 2 0 0 1 18.19 17H8.64a2 2 0 0 1-1.962-1.608z" /><path stroke-linecap="round" d="m5 7l-.81-3.243A1 1 0 0 0 3.22 3H2m6 18h2m6 0h2" /></g></svg><span id="eventCartCount">0</span></button></div><aside class="event-cart-panel" id="eventCartPanel" aria-label="Event cart" aria-hidden="true"><div class="event-cart-panel-head"><h2>Cart</h2><button id="eventCartClose" type="button" aria-label="Close cart">×</button></div><p class="event-cart-summary"><span id="eventCartCountText">0</span> events</p><div class="event-cart-list" id="eventCartList"></div><a class="event-cart-go" href="profile.html#cart">Go to Cart</a></aside>`,
    );
    const toggle = document.querySelector("#eventCartToggle");
    const panel = document.querySelector("#eventCartPanel");
    document
      .querySelector("#reservationCountdownExternal")
      .addEventListener("click", () => {
        const eventId = reservationCountdown.getActiveEventId();
        if (!eventId) return;
        const url = new URL("getTickets.html", window.location.href);
        url.searchParams.set("id", eventId);
        window.location.assign(url.href);
      });
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

  window.eventCart = {
    addEvent,
    hasEvent,
    getEventIds,
    removeEvent,
    render,
    broadcastChange,
    createUi,
  };
  // This is shared with the ticket seat map, so every public page derives the
  // same display from the reservation's real `reserved_until` value.
  window.reservationCountdown = reservationCountdown;
  cartChannel?.addEventListener("message", (event) => {
    if (event.data?.type !== "cart-changed") return;
    render().catch((error) => console.error(error));
  });
  createUi();
  reservationCountdown.restore().catch((error) => {
    console.error("Unable to restore reservation countdown:", error);
  });
  render().catch((error) => console.error(error));
  window.authApi?.subscribeToAuthChanges(() => {
    reservationCountdown.restore().catch((error) => {
      console.error("Unable to restore reservation countdown:", error);
    });
  });
  window.addEventListener("focus", () => {
    render().catch((error) => console.error(error));
    reservationCountdown.restore().catch((error) => {
      console.error("Unable to restore reservation countdown:", error);
    });
  });
})();
