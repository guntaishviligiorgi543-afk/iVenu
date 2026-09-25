(() => {
  const client = window.supabaseClient;
  const content = document.querySelector("#checkoutContent");
  const status = document.querySelector("#checkoutStatus");
  const timer = document.querySelector("#reservationTimer");
  const placeOrder = document.querySelector("#placeOrder");
  const eventId = new URLSearchParams(window.location.search).get("event");
  let countdownId = null;
  let checkoutItems = [];
  let checkoutEvent = null;
  let reservationExpired = false;
  const EVENT_SEAT_RPC_PAGE_SIZE = 1000;

  const ticketPage = () =>
    `getTickets.html${eventId ? `?id=${encodeURIComponent(eventId)}` : ""}`;
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (value) => `₾${Number(value || 0).toFixed(2)}`;

  function redirectToTickets() {
    window.location.replace(ticketPage());
  }

  async function loadCanonicalEventSeatMap() {
    const rows = [];
    for (let from = 0; ; from += EVENT_SEAT_RPC_PAGE_SIZE) {
      const { data, error } = await client
        .rpc("get_event_seat_map", { p_event_id: eventId })
        .range(from, from + EVENT_SEAT_RPC_PAGE_SIZE - 1);
      if (error) {
        console.error("Checkout canonical seat-map RPC failed", error);
        throw error;
      }
      const page = data || [];
      rows.push(...page);
      if (page.length < EVENT_SEAT_RPC_PAGE_SIZE) return rows;
    }
  }

  // Only join the customer-readable reservation relationship here. Protected
  // venue/seat presentation data comes from get_event_seat_map below.
  async function loadCheckoutItems(userId) {
    const now = new Date().toISOString();
    const { data: cartItems, error: cartError } = await client
      .from("cart_items")
      .select("event_seat_id, event_seats!inner(event_id, status, reserved_by, reserved_until)")
      .eq("user_id", userId)
      .eq("event_seats.event_id", eventId)
      .eq("event_seats.reserved_by", userId)
      .eq("event_seats.status", "reserved")
      .gt("event_seats.reserved_until", now)
      .not("event_seat_id", "is", null);
    if (cartError) {
      console.error("Checkout cart reservation query failed", cartError);
      throw cartError;
    }

    const seatMap = await loadCanonicalEventSeatMap();

    const reservationsBySeatId = new Map(
      (cartItems || []).map((item) => [String(item.event_seat_id), item.event_seats]),
    );
    return (seatMap || [])
      .filter((seat) => {
        const reservation = reservationsBySeatId.get(String(seat.event_seat_id));
        return (
          reservation &&
          seat.status === "reserved" &&
          reservation.event_id === eventId &&
          reservation.reserved_by === userId &&
          new Date(reservation.reserved_until).getTime() > Date.now()
        );
      })
      .map((seat) => ({
        ...seat,
        reserved_until: reservationsBySeatId.get(String(seat.event_seat_id)).reserved_until,
      }));
  }

  async function loadCheckoutEvent() {
    const { data, error } = await client
      .from("events")
      .select("id, title, performer, event_date, event_time, venues:venues!events_venue_id_fkey(name)")
      .eq("id", eventId)
      .maybeSingle();
    if (error) {
      console.error("Checkout event query failed", error);
      throw error;
    }
    return data;
  }

  function calculateCheckoutTotal(items) {
    return items.reduce((sum, item) => sum + Number(item.price || 0), 0);
  }

  function renderOrderSummary(items) {
    const list = document.querySelector("#summaryItems");
    list.innerHTML = items.map((item) => {
      const eventName = checkoutEvent?.title || checkoutEvent?.performer || "Event";
      const details = [checkoutEvent?.venues?.name, checkoutEvent?.event_date, checkoutEvent?.event_time?.slice(0, 5), `Section ${item.section_name}`, `Row ${item.row_number}`, `Seat ${item.seat_number}`, item.ticket_type_name].filter(Boolean).join(" · ");
      return `<article class="summaryItem"><b>${escapeHtml(eventName)}</b><span>${escapeHtml(details)}</span><strong>${money(item.price)}</strong></article>`;
    }).join("");
    const total = calculateCheckoutTotal(items);
    document.querySelector("#subtotal").textContent = money(total);
    document.querySelector("#total").textContent = money(total);
  }

  async function releaseExpiredReservations() {
    await Promise.all(checkoutItems.map((item) => client.rpc("release_event_seat", { p_event_seat_id: item.event_seat_id })));
  }

  function beginReservationCountdown(items) {
    const expiry = Math.min(...items.map((item) => new Date(item.reserved_until).getTime()));
    const update = async () => {
      const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
      timer.hidden = false;
      timer.textContent = `Your tickets are reserved for ${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
      timer.classList.toggle("warning", remaining <= 60);
      if (!remaining) {
        clearInterval(countdownId);
        reservationExpired = true;
        placeOrder.disabled = true;
        status.textContent = "Your reservation has expired. Returning to ticket selection…";
        status.hidden = false;
        await releaseExpiredReservations();
        redirectToTickets();
      }
    };
    update().catch(() => redirectToTickets());
    countdownId = setInterval(() => update().catch(() => redirectToTickets()), 1000);
  }

  async function validateCheckoutAccess() {
    if (!eventId || !client || !window.authApi) return redirectToTickets();
    const session = await window.authApi.getSession();
    if (!session?.user) {
      window.location.replace("login.html");
      return;
    }
    const [items, event] = await Promise.all([
      loadCheckoutItems(session.user.id),
      loadCheckoutEvent(),
    ]);
    checkoutItems = items;
    checkoutEvent = event;
    if (!checkoutItems.length) return redirectToTickets();
    document.querySelector("#email").value = session.user.email || "";
    renderOrderSummary(checkoutItems);
    beginReservationCountdown(checkoutItems);
    content.hidden = false;
    content.setAttribute("aria-busy", "false");
    status.hidden = true;
  }

  document.querySelector("#goBack").addEventListener("click", redirectToTickets);
  document.querySelector("#checkoutForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (reservationExpired) return;
    placeOrder.disabled = true;
    try {
      const session = await window.authApi.getSession();
      const currentItems = session?.user ? await loadCheckoutItems(session.user.id) : [];
      const originalIds = new Set(checkoutItems.map((item) => item.event_seat_id));
      if (currentItems.length !== checkoutItems.length || currentItems.some((item) => !originalIds.has(item.event_seat_id))) throw new Error("Your reservation is no longer valid.");
      document.querySelector("#checkoutNotice").textContent = "Payment integration is not available yet. Your reservation remains active until its original expiry time.";
    } catch (error) {
      document.querySelector("#checkoutNotice").textContent = error.message || "Your reservation is no longer valid.";
    } finally {
      placeOrder.disabled = reservationExpired;
    }
  });

  validateCheckoutAccess().catch((error) => {
    console.error("Checkout access validation failed", error);
    redirectToTickets();
  });
})();
