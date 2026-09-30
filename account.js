(() => {
  const client = window.supabaseClient;
  const form = document.querySelector("#profileForm");
  const status = document.querySelector("#accountStatus");
  const message = document.querySelector("#profileMessage");
  const ordersList = document.querySelector("#ordersList");
  const cartList = document.querySelector("#cartList");
  const securityForm = document.querySelector("#securityForm");
  const securityNewPasswordFields = document.querySelector(
    "#securityNewPasswordFields",
  );
  const emailForm = document.querySelector("#emailForm");
  const deleteButton = document.querySelector("#deleteAccount");
  const deleteMessage = document.querySelector("#deleteMessage");
  const deleteDialog = document.querySelector("#deleteAccountDialog");
  const closeDeleteDialog = document.querySelector("#closeDeleteAccountDialog");
  const cancelDeleteAccount = document.querySelector("#cancelDeleteAccount");
  const continueDeleteAccount = document.querySelector("#continueDeleteAccount");
  const backDeleteAccount = document.querySelector("#backDeleteAccount");
  const deleteWarning = document.querySelector("[data-delete-account-warning]");
  const deleteConfirmForm = document.querySelector("[data-delete-account-confirm]");
  const deleteDialogMessage = document.querySelector("#deleteAccountDialogMessage");
  const securityMessage = document.querySelector("#securityMessage");
  const passwordResultDialog = document.querySelector("#passwordResultDialog");
  const passwordResultTitle = document.querySelector("#passwordResultTitle");
  const passwordResultText = document.querySelector("#passwordResultText");
  const passwordResultLabel = document.querySelector("#passwordResultLabel");
  const closePasswordResult = document.querySelector("#closePasswordResult");
  const passwordResultAction = document.querySelector("#passwordResultAction");
  const editProfileButton = document.querySelector("#editProfile");
  const cancelProfileButton = document.querySelector("#cancelProfile");
  const profileDisplayName = document.querySelector("#profileDisplayName");
  const profileDisplayEmail = document.querySelector("#profileDisplayEmail");
  const profileAvatar = document.querySelector("#profileAvatar");
  const ordersEmpty = document.querySelector("#ordersEmpty");
  const cartEmpty = document.querySelector("#cartEmpty");
  const ordersCount = document.querySelector("#ordersCount");
  const cartCount = document.querySelector("#cartCount");
  const logoutButton = document.querySelector("#dashboardLogout");
  const overviewDashboard = document.querySelector("#overviewDashboard");
  let avatarPreviewUrl = "";

  function setMessage(text, type = "", target = message) {
    target.className = `auth-message ${type}`;
    target.textContent = text;
  }

  function showPasswordResult(success, text) {
    passwordResultLabel.textContent = success
      ? "Password change"
      : "Password not changed";
    passwordResultTitle.textContent = success
      ? "Password updated"
      : "Password change failed";
    passwordResultText.textContent = text;
    passwordResultDialog.hidden = false;
  }

  function hidePasswordResult() {
    passwordResultDialog.hidden = true;
  }

  closePasswordResult.addEventListener("click", hidePasswordResult);
  passwordResultAction.addEventListener("click", hidePasswordResult);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getSecurityErrorMessage(error, fallback) {
    const errorText = String(error?.message || "").toLowerCase();
    if (errorText.includes("rate limit") || errorText.includes("too many")) {
      return "Too many requests. Please wait before trying again.";
    }
    if (errorText.includes("expired")) {
      return "This code has expired. Request a new code.";
    }
    if (errorText.includes("invalid") || errorText.includes("otp")) {
      return "Invalid verification code.";
    }
    return fallback;
  }

  function renderOrders(orders) {
    ordersCount.textContent = `${orders.length} ${orders.length === 1 ? "order" : "orders"}`;
    if (!orders.length) {
      ordersList.innerHTML = "";
      ordersEmpty.hidden = false;
      return;
    }

    ordersEmpty.hidden = true;
    ordersList.innerHTML = orders
      .map(
        (order) => `
          <article class="dashboard-row">
            <div><strong>Order #${escapeHtml(String(order.id).slice(0, 8))}</strong><span>${new Date(order.created_at).toLocaleDateString()}</span></div>
            <div><strong>${Number(order.total_price || 0).toFixed(2)}₾</strong><span>${order.order_items?.length || 0} items</span></div>
            <span class="order-status">${escapeHtml(order.status || "Processing")}</span>
          </article>
        `,
      )
      .join("");
  }

  function renderCart(items, ticketTypes, events) {
    const ticketMap = new Map(ticketTypes.map((ticket) => [ticket.id, ticket]));
    const eventMap = new Map(events.map((event) => [event.id, event]));
    const totalItems = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
    cartCount.textContent = `${totalItems} ${totalItems === 1 ? "item" : "items"}`;
    if (!items.length) {
      cartList.innerHTML = "";
      cartEmpty.hidden = false;
      return;
    }

    const eventGroups = new Map();
    items.forEach((item) => {
      const ticket = ticketMap.get(item.ticket_type_id);
      const eventId = ticket?.event_id;
      const groupKey = eventId || `ticket-${item.ticket_type_id}`;
      if (!eventGroups.has(groupKey)) {
        eventGroups.set(groupKey, {
          event: eventMap.get(eventId) || null,
          items: [],
        });
      }
      eventGroups.get(groupKey).items.push({ item, ticket });
    });

    cartEmpty.hidden = true;
    cartList.innerHTML = [...eventGroups.values()]
      .map(({ event, items: eventItems }) => {
        const primaryTicket = eventItems[0].ticket;
        const title = event?.title || event?.performer || primaryTicket?.name || "Event";
        const image = event?.image_url || event?.bands?.image_url || "";
        const venue = event?.venues?.name || event?.venue || "Venue to be announced";
        const dateTime = [event?.event_date, event?.event_time?.slice(0, 5)]
          .filter(Boolean)
          .join(" — ");
        const ticketDetails = eventItems
          .map(({ item, ticket }) => {
            const ticketName = ticket?.name || "Ticket";
            const total = Number(ticket?.price || 0) * Number(item.quantity || 0);
            return `<div class="cart-event-ticket"><span><strong>${escapeHtml(ticketName)}</strong><small>Quantity ${Number(item.quantity || 0)}</small></span><strong>${total.toFixed(2)}₾</strong></div>`;
          })
          .join("");
        const actions = eventItems
          .map(({ item, ticket }) => {
            const ticketName = ticket?.name || "Ticket";
            return `<button class="dashboard-cart-remove" type="button" data-cart-item-id="${escapeHtml(item.id)}" data-event-seat-id="${escapeHtml(item.event_seat_id || "")}" aria-label="Remove ${escapeHtml(ticketName)} from cart">Remove</button>`;
          })
          .join("");

        return `<article class="cart-event-item"><div class="cart-event-image">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" />` : '<span aria-hidden="true">iVenue</span>'}</div><div class="cart-event-info"><h3>${escapeHtml(title)}</h3><p class="cart-event-meta">${escapeHtml(venue)}</p>${dateTime ? `<p class="cart-event-meta">${escapeHtml(dateTime)}</p>` : ""}<div class="cart-event-ticket-list">${ticketDetails}</div></div><div class="cart-event-actions">${actions}</div></article>`;
      })
      .join("");
  }

  async function removeCartItem({ cartItemId, eventSeatId }) {
    const session = await window.authApi.getSession();
    if (!session?.user) throw new Error("Please sign in to manage your cart.");

    if (eventSeatId) {
      // Exact-seat rows must release their reservation, not be deleted directly.
      const { error } = await client.rpc("release_event_seat", {
        p_event_seat_id: eventSeatId,
      });
      if (error) throw error;
    } else {
      const { error } = await client
        .from("cart_items")
        .delete()
        .eq("id", cartItemId)
        .eq("user_id", session.user.id)
        .is("event_seat_id", null);
      if (error) throw error;
    }

    await loadAccount();
    window.eventCart?.render().catch((error) => console.error(error));
    window.eventCart?.broadcastChange();
  }

  function updateProfilePreview(profile) {
    const firstName = profile.first_name || "";
    const lastName = profile.last_name || "";
    const displayName = `${firstName} ${lastName}`.trim() || "Your profile";
    profileDisplayName.textContent = displayName;
    profileDisplayEmail.textContent = profile.email || "";
    profileAvatar.textContent =
      displayName === "Your profile"
        ? "?"
        : displayName.charAt(0).toUpperCase();
    if (profile.avatar_url) {
      profileAvatar.style.backgroundImage = `url("${profile.avatar_url.replaceAll('"', "%22")}")`;
      profileAvatar.classList.add("has-image");
      profileAvatar.textContent = "";
    }
  }

  function formatMoney(value) {
    return `${Number(value || 0).toFixed(2)}₾`;
  }

  function overviewEmpty(title, description) {
    return `<div class="overview-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>`;
  }

  function updateReservationCountdown() {
    document.querySelectorAll("[data-reservation-until]").forEach((element) => {
      const seconds = Math.max(0, Math.ceil((new Date(element.dataset.reservationUntil) - Date.now()) / 1000));
      element.textContent = seconds ? `${Math.floor(seconds / 60)}m ${seconds % 60}s remaining` : "Reservation has expired";
    });
  }

  function renderOverview(data, profile, user, cartItems = [], ticketTypes = [], events = []) {
    const name = profile?.first_name || user?.user_metadata?.first_name || "there";
    const avatar = profile?.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" alt="" />` : `<span>${escapeHtml(String(name).charAt(0).toUpperCase())}</span>`;
    const next = data.next_event;
    const reservation = data.reservation;
    const activity = data.activity || {};
    const ticketsById = new Map(ticketTypes.map((ticket) => [String(ticket.id), ticket]));
    const eventsById = new Map(events.map((event) => [String(event.id), event]));
    const cartCount = cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const cartTotal = cartItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(ticketsById.get(String(item.ticket_type_id))?.price || 0), 0);
    const firstCartEvent = eventsById.get(String(ticketsById.get(String(cartItems[0]?.ticket_type_id))?.event_id));
    const stat = (title, value, description) => `<article class="overview-card overview-stat"><p>${title}</p><strong>${value}</strong><span>${description}</span></article>`;
    const reservationCard = reservation ? `<h3>${escapeHtml(reservation.title || reservation.performer || "Event")}</h3><strong>${reservation.seat_count} ${reservation.seat_count === 1 ? "seat" : "seats"} reserved</strong><span>${escapeHtml(reservation.venue || "Venue to be announced")}</span><em data-reservation-until="${escapeHtml(reservation.reserved_until)}">Calculating time remaining…</em>` : overviewEmpty("No active reservation", "Seats held for you will appear here.");
    const purchases = Number(data.total_orders || 0);
    const activityBars = [["7 days", activity.last_7_days || 0], ["30 days", activity.last_30_days || 0], ["This year", activity.this_year || 0]].map(([label, value]) => `<div class="activity-metric"><b>${value}</b><span>${label}</span></div>`).join("");
    const recent = data.recent_orders?.map((order) => `<div><span><strong>${escapeHtml(order.event_name)}</strong><small>${escapeHtml(new Date(order.created_at).toLocaleDateString())} · ${order.ticket_count} tickets</small></span><b>${formatMoney(order.total_price)}</b></div>`).join("");
    const reservationGrid = reservation
      ? `<article class="overview-card reservation-event"><p>Active Reservation</p><h3>${escapeHtml(reservation.title || reservation.performer || "Event")}</h3><span>Your seats are temporarily held for this event.</span></article><article class="overview-card reservation-timer"><p>Time Remaining</p><strong data-reservation-until="${escapeHtml(reservation.reserved_until)}">Calculating time remaining…</strong><span>Reservation expiration countdown.</span></article><article class="overview-card reservation-venue"><p>Venue</p><h3>${escapeHtml(reservation.venue || "Venue to be announced")}</h3><span>Where your reservation is held.</span></article><article class="overview-card reservation-seats"><p>Seat Count</p><strong>${reservation.seat_count}</strong><span>${reservation.seat_count === 1 ? "Seat" : "Seats"} currently reserved for you.</span></article><article class="overview-card reservation-details"><p>Reserved Seats</p><h3>${escapeHtml(reservation.seats || "Seat details available at checkout")}</h3><span>Section, row, and seat information from your active reservation.</span></article>`
      : `<article class="overview-card reservation-event">${overviewEmpty("No active reservation", "Your next seat reservation will appear here.")}</article><article class="overview-card reservation-timer">${overviewEmpty("Timer unavailable", "A countdown appears when seats are held.")}</article><article class="overview-card reservation-venue">${overviewEmpty("Venue details", "Available with an active reservation.")}</article><article class="overview-card reservation-seats">${overviewEmpty("Reserved seats", "Available with an active reservation.")}</article><article class="overview-card reservation-details">${overviewEmpty("Seat details", "Available with an active reservation.")}</article>`;
    const activityGrid = purchases
      ? `<article class="overview-card activity-visual"><p>Activity Visualization</p><h3>Completed purchase activity</h3><span>Activity is based on recorded completed purchases.</span></article><article class="overview-card activity-ranking"><p>Activity Ranking — Last 30 Days</p>${data.ranking?.available ? `<strong>Top ${data.ranking.top_percent}%</strong><span>Your activity level compared with other active iVenue users.</span>` : overviewEmpty("Not enough activity data yet", "Ranking needs at least five active users.")}</article><article class="overview-card activity-periods"><p>Purchase activity by period</p><div class="activity-bars">${activityBars}</div></article>`
      : `<article class="overview-card activity-visual">${overviewEmpty("Activity insights will appear as you use iVenue.", "Completed purchases are not yet recorded.")}</article><article class="overview-card activity-ranking"><p>Activity Ranking — Last 30 Days</p>${overviewEmpty("Not enough activity data yet", "Ranking needs completed purchase activity.")}</article><article class="overview-card activity-periods"><p>Activity periods</p><div class="activity-bars"><div class="activity-metric"><b>—</b><span>7 days</span></div><div class="activity-metric"><b>—</b><span>30 days</span></div><div class="activity-metric"><b>—</b><span>This year</span></div></div></article>`;
    const purchaseGrid = purchases
      ? `${stat("Purchased Tickets", data.tickets || 0, "Tickets currently available in your account.")}${stat("Total Orders", purchases, "Completed purchases made through your iVenue account.")}<article class="overview-card overview-spending"><p>Total Spent</p><strong>${formatMoney(data.total_spent)}</strong><span>Total value of your completed iVenue purchases.</span><small>This year: ${formatMoney(data.this_year_spent)}</small></article><article class="overview-card overview-recent-orders"><p>Recent Orders</p><h3>Completed purchases</h3><div class="overview-order-list">${recent}</div></article><article class="overview-card purchase-next-event"><p>Next Purchased Event</p>${next ? `<h3>${escapeHtml(next.name)}</h3><span>${escapeHtml(next.venue || "Venue to be announced")}</span>` : overviewEmpty("No upcoming purchased event", "Your next eligible ticket will appear here.")}</article>`
      : `<article class="overview-card purchase-tickets">${overviewEmpty("Purchased Tickets", "Tickets will appear after completed purchases.")}</article><article class="overview-card purchase-orders">${overviewEmpty("Orders", "Completed purchases will appear here.")}</article><article class="overview-card purchase-spending">${overviewEmpty("Spending", "Your completed purchase total will appear here.")}</article><article class="overview-card purchase-history">${overviewEmpty("No purchases yet", "Your completed ticket purchases and spending history will appear here.")}</article><article class="overview-card purchase-next-event">${overviewEmpty("Next Event", "Your next purchased event will appear here.")}</article>`;
    overviewDashboard.innerHTML = `
      <section class="overview-panel is-active" id="overview-panel-summary" role="tabpanel" aria-labelledby="overview-tab-summary" data-overview-panel="summary"><div class="overview-grid overview-summary-grid">
        <article class="overview-card overview-welcome"><div class="overview-avatar">${avatar}</div><div><p>Welcome back, ${escapeHtml(name)}</p><h3>${escapeHtml(profile?.email || user?.email || "Your iVenue account")}</h3><span>${user?.created_at ? `Member since ${escapeHtml(new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" }))}` : ""}</span></div><small>Your iVenue overview, all in one place.</small></article>
        <article class="overview-card overview-summary-reservation"><p>Reservation summary</p>${reservationCard}</article>
        <article class="overview-card overview-cart-summary"><p>Cart Items</p>${cartCount ? `<strong>${cartCount}</strong><span>${cartCount === 1 ? "Ticket" : "Tickets"} currently in your cart.</span><a class="overview-action" href="#cart">View cart</a>` : overviewEmpty("Your cart is empty", "Add tickets to prepare your next night out.")}</article>
        <article class="overview-card overview-cart-value"><p>Cart Value</p>${cartCount ? `<strong>${formatMoney(cartTotal)}</strong><span>${escapeHtml(firstCartEvent?.title || firstCartEvent?.performer || "Current cart total")}</span>` : overviewEmpty("No cart value", "Add tickets to calculate your total.")}</article>
        <article class="overview-card overview-upcoming-summary"><p>Upcoming Event</p>${next ? `<h3>${escapeHtml(next.name)}</h3><strong>${escapeHtml(new Date(`${next.date}T00:00:00`).toLocaleDateString())}</strong><span>${escapeHtml(next.venue || "Venue to be announced")}</span>` : overviewEmpty("Nothing scheduled yet", "Your next purchased event will appear here.")}</article>
        <article class="overview-card overview-quick-info"><p>Quick Information</p><strong>${reservation ? `${reservation.seat_count} reserved` : cartCount ? "Cart ready" : "Ready to explore"}</strong><span>${reservation ? "Your held seats are visible in Reservations." : "Browse events to find your next live experience."}</span></article>
      </div></section>
      <section class="overview-panel" id="overview-panel-reservations" role="tabpanel" aria-labelledby="overview-tab-reservations" data-overview-panel="reservations" hidden><div class="overview-grid overview-reservations-grid">${reservationGrid}</div></section>
      <section class="overview-panel" id="overview-panel-activity" role="tabpanel" aria-labelledby="overview-tab-activity" data-overview-panel="activity" hidden><div class="overview-grid overview-activity-grid">${activityGrid}</div></section>
      <section class="overview-panel" id="overview-panel-purchases" role="tabpanel" aria-labelledby="overview-tab-purchases" data-overview-panel="purchases" hidden><div class="overview-grid overview-purchases-grid">${purchaseGrid}</div></section>`;
    overviewDashboard.setAttribute("aria-busy", "false");
    updateReservationCountdown();
    activateOverviewTab(sessionStorage.getItem("iVenueOverviewTab") || "summary");
  }

  function showOverviewError() {
    overviewDashboard.innerHTML = overviewEmpty("Overview unavailable", "Your dashboard data could not be loaded. Please try again.");
    overviewDashboard.setAttribute("aria-busy", "false");
  }

  function activateOverviewTab(name) {
    const tab = document.querySelector(`[data-overview-tab="${name}"]`)
      || document.querySelector('[data-overview-tab="summary"]');
    if (!tab) return;
    const activeName = tab.dataset.overviewTab;
    document.querySelectorAll("[data-overview-tab]").forEach((item) => {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-overview-panel]").forEach((panel) => {
      const active = panel.dataset.overviewPanel === activeName;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    sessionStorage.setItem("iVenueOverviewTab", activeName);
  }

  async function loadAccount() {
    let session;
    try {
      session = await window.authApi.getSession();
    } catch (error) {
      console.error(error);
      setMessage(
        "Your session could not be verified. Please try again.",
        "error",
        securityMessage,
      );
      return;
    }
    if (!session?.user) {
      status.textContent = "Please sign in to view your account.";
      form.hidden = true;
      securityForm.hidden = true;
      emailForm.hidden = true;
      deleteButton.hidden = true;
      editProfileButton.disabled = true;
      logoutButton.disabled = true;
      document
        .querySelectorAll(".account-sidebar-item[data-section]")
        .forEach((button) => {
          button.disabled = true;
        });
      ordersList.textContent = "";
      cartList.textContent = "";
      return;
    }

    const [profileResult, ordersResult, cartResult, overviewResult] = await Promise.all([
      client
        .from("profiles")
        .select("id, first_name, last_name, email, phone, avatar_url")
        .eq("id", session.user.id)
        .maybeSingle(),
      client
        .from("orders")
        .select(
          "id, total_price, status, created_at, order_items(quantity, unit_price, subtotal, ticket_types(name))",
        )
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false }),
      window.cartSync.getOwnCart(),
      client.rpc("get_user_dashboard_overview"),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (overviewResult.error) {
      console.error("Unable to load dashboard overview", overviewResult.error);
      showOverviewError();
    }

    const profile = profileResult.data;
    if (profile) {
      if (profile.email !== session.user.email) {
        const { error: emailSyncError } = await client
          .from("profiles")
          .update({
            email: session.user.email,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.user.id);
        if (emailSyncError) console.error(emailSyncError);
        profile.email = session.user.email;
      }
      form.elements.firstName.value = profile.first_name || "";
      form.elements.lastName.value = profile.last_name || "";
      form.elements.email.value = profile.email || session.user.email || "";
      form.elements.phone.value = profile.phone || "";
      form.elements.avatarUrl.value = profile.avatar_url || "";
      deleteButton.hidden = false;
      updateProfilePreview(profile);
      emailForm.elements.email.value =
        profile.email || session.user.email || "";
      status.textContent = `Signed in as ${profile.email || session.user.email}.`;
    } else {
      status.textContent =
        "Your account is signed in, but no profile row is available under the current RLS policies.";
    }

    renderOrders(ordersResult.data || []);
    const cartItems = cartResult || [];
    const ticketIds = cartItems.map((item) => item.ticket_type_id);
    const ticketResult = ticketIds.length
      ? await client
          .from("ticket_types")
          .select("id, event_id, name, price")
          .in("id", ticketIds)
      : { data: [] };
    if (ticketResult.error) throw ticketResult.error;
    const eventIds = [
      ...new Set(
        (ticketResult.data || [])
          .map((ticket) => ticket.event_id)
          .filter(Boolean),
      ),
    ];
    const eventResult = eventIds.length
      ? await client
          .from("events")
          .select(
            "id, performer, title, event_date, event_time, venue, image_url, venues:venues!events_venue_id_fkey(name), bands(name, image_url)",
          )
          .in("id", eventIds)
      : { data: [] };
    if (eventResult.error) {
      console.error("Unable to load cart event details", eventResult.error);
    }
    renderCart(cartItems, ticketResult.data || [], eventResult.data || []);
    if (!overviewResult.error) {
      renderOverview(
        overviewResult.data || {},
        profile,
        session.user,
        cartItems,
        ticketResult.data || [],
        eventResult.data || [],
      );
    }
  }

  document.querySelector(".overview-tabs")?.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-overview-tab]");
    if (tab) activateOverviewTab(tab.dataset.overviewTab);
  });

  document.querySelector(".overview-tabs")?.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[data-overview-tab]")];
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    activateOverviewTab(tabs[next].dataset.overviewTab);
  });

  overviewDashboard?.addEventListener("click", (event) => {
    if (!event.target.closest('a[href="#cart"]')) return;
    document.querySelector('.account-sidebar-item[data-section="cart"]')?.click();
  });

  window.addEventListener("eventCartChanged", () => {
    loadAccount().catch((error) => console.error(error));
  });

  document
    .querySelectorAll(".account-sidebar-item[data-section]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const section = button.dataset.section;
        document
          .querySelectorAll(".account-sidebar-item[data-section]")
          .forEach((item) => {
            const active = item === button;
            item.classList.toggle("is-active", active);
            if (active) item.setAttribute("aria-current", "page");
            else item.removeAttribute("aria-current");
          });
        document
          .querySelectorAll(".account-section[data-section]")
          .forEach((panel) => {
            panel.classList.toggle(
              "is-visible",
              panel.dataset.section === section,
            );
          });
      });
    });

  if (["#cart", "#profile"].includes(window.location.hash.toLowerCase())) {
    document
      .querySelector(`.account-sidebar-item[data-section="${window.location.hash.slice(1).toLowerCase()}"]`)
      ?.click();
  }

  cartList.addEventListener("click", async (event) => {
    const button = event.target.closest(".dashboard-cart-remove");
    if (!button || !cartList.contains(button) || button.disabled) return;
    button.disabled = true;
    button.classList.add("cart-action-pending");
    button.setAttribute("aria-busy", "true");
    try {
      await removeCartItem({
        cartItemId: button.dataset.cartItemId,
        eventSeatId: button.dataset.eventSeatId,
      });
    } catch (error) {
      console.error("Unable to remove cart item", error);
      setMessage(error.message || "This cart item could not be removed.", "error");
    } finally {
      button.disabled = false;
      button.classList.remove("cart-action-pending");
      button.setAttribute("aria-busy", "false");
    }
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.querySelector("span").textContent = "Logging out...";
    try {
      const signedOut = await window.authApi.requestSignOut({
        redirectTo: "index.html",
      });
      if (!signedOut) {
        logoutButton.disabled = false;
        logoutButton.querySelector("span").textContent = "Logout";
      }
    } catch (error) {
      console.error(error);
      logoutButton.disabled = false;
      logoutButton.querySelector("span").textContent = "Logout";
    }
  });

  editProfileButton.addEventListener("click", () => {
    form.hidden = false;
    editProfileButton.hidden = true;
    form.elements.firstName.focus();
  });

  cancelProfileButton.addEventListener("click", () => {
    form.hidden = true;
    editProfileButton.hidden = false;
    setMessage("");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const session = await window.authApi.getSession();
    if (!session?.user) return;

    const submitButton = form.querySelector('button[type="submit"]');
    const avatarFile = form.elements.avatarFile?.files?.[0];
    if (avatarFile) {
      try {
        submitButton.disabled = true;
        setMessage("Uploading avatar...");
        const { publicUrl } = await window.iVenueImageUpload.upload(
          avatarFile,
          `avatars/${session.user.id}`,
        );
        form.elements.avatarUrl.value = publicUrl;
      } catch (error) {
        setMessage(error.message || "Avatar upload failed.", "error");
        submitButton.disabled = false;
        return;
      }
    }
    const values = new FormData(form);
    const firstName = values.get("firstName").trim();
    const lastName = values.get("lastName").trim();
    setMessage("Saving profile...");

    const { error } = await client
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        phone: values.get("phone").trim(),
        avatar_url: values.get("avatarUrl").trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    if (error) {
      setMessage(
        "Profile could not be saved by the current RLS policy.",
        "error",
      );
      submitButton.disabled = false;
      return;
    }

    const userMetadata = session.user.user_metadata || {};
    const nameMetadata = { first_name: firstName, last_name: lastName };
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    if (Object.hasOwn(userMetadata, "full_name")) nameMetadata.full_name = fullName;
    if (Object.hasOwn(userMetadata, "name")) nameMetadata.name = fullName;
    const { error: authMetadataError } = await client.auth.updateUser({
      data: nameMetadata,
    });

    if (authMetadataError) {
      setMessage(
        "Profile saved, but your Auth display name could not be synchronized. Please try again.",
        "error",
      );
      submitButton.disabled = false;
      return;
    }

    updateProfilePreview({
      first_name: firstName,
      last_name: lastName,
      email: values.get("email"),
      avatar_url: values.get("avatarUrl"),
    });
    form.hidden = true;
    editProfileButton.hidden = false;
    setMessage("Profile saved.", "success");
    if (avatarPreviewUrl) {
      window.iVenueImageUpload.revoke(avatarPreviewUrl);
      avatarPreviewUrl = "";
    }
    submitButton.disabled = false;
  });

  form.elements.avatarFile?.addEventListener("change", () => {
    const file = form.elements.avatarFile.files?.[0];
    if (!file) return;
    try {
      if (avatarPreviewUrl) window.iVenueImageUpload.revoke(avatarPreviewUrl);
      avatarPreviewUrl = window.iVenueImageUpload.preview(file);
      profileAvatar.style.backgroundImage = `url("${avatarPreviewUrl}")`;
      profileAvatar.classList.add("has-image");
      profileAvatar.textContent = "";
    } catch (error) {
      form.elements.avatarFile.value = "";
      setMessage(error.message, "error");
    }
  });

  securityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(securityForm);
    const currentPassword = values.get("currentPassword");
    const newPassword = values.get("password");
    const confirmPassword = values.get("confirmPassword");
    const submitButton = securityForm.querySelector('button[type="submit"]');

    if (!currentPassword) {
      showPasswordResult(false, "Enter your current password.");
      return;
    }
    const passwordError = window.authApi.validatePassword(newPassword);
    if (passwordError) {
      showPasswordResult(false, passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      showPasswordResult(false, "New password and confirmation do not match.");
      return;
    }

    submitButton.disabled = true;
    try {
      const session = await window.authApi.getSession();
      const email = session?.user?.email;
      if (!email) throw new Error("Please sign in again.");
      await window.authApi.verifyCurrentPassword(email, currentPassword);
      await window.authApi.updatePasswordWithCurrentPassword(
        newPassword,
        currentPassword,
      );
      securityForm.reset();
      setMessage("Password updated successfully.", "success", securityMessage);
      showPasswordResult(true, "Your password was changed successfully.");
    } catch (error) {
      console.error(error);
      const errorText = String(error?.message || "").toLowerCase();
      const text =
        errorText.includes("invalid") || errorText.includes("credential")
          ? "Current password is incorrect."
          : "Password was not changed. Please try again.";
      setMessage(text, "error", securityMessage);
      showPasswordResult(false, text);
    } finally {
      submitButton.disabled = false;
    }
  });

  const showDeleteStep = (confirmPassword) => {
    deleteWarning.hidden = confirmPassword;
    deleteConfirmForm.hidden = !confirmPassword;
    deleteDialogMessage.textContent = "";
    if (confirmPassword) deleteConfirmForm.elements.currentPassword.focus();
  };

  const closeDeleteAccountDialog = () => {
    deleteDialog.hidden = true;
    document.body.classList.remove("account-delete-modal-open");
    deleteConfirmForm.reset();
    showDeleteStep(false);
  };

  deleteButton.addEventListener("click", () => {
    deleteDialog.hidden = false;
    document.body.classList.add("account-delete-modal-open");
    deleteConfirmForm.reset();
    showDeleteStep(false);
    continueDeleteAccount.focus();
  });

  closeDeleteDialog.addEventListener("click", closeDeleteAccountDialog);
  cancelDeleteAccount.addEventListener("click", closeDeleteAccountDialog);
  backDeleteAccount.addEventListener("click", () => {
    deleteConfirmForm.reset();
    showDeleteStep(false);
    continueDeleteAccount.focus();
  });
  continueDeleteAccount.addEventListener("click", () => showDeleteStep(true));
  deleteDialog.addEventListener("click", (event) => {
    if (event.target === deleteDialog) closeDeleteAccountDialog();
  });

  deleteConfirmForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = String(
      deleteConfirmForm.elements.currentPassword.value || "",
    );
    if (!currentPassword) return;

    const submitButton = deleteConfirmForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    deleteDialogMessage.className = "auth-message account-delete-dialog__message";
    deleteDialogMessage.textContent = "Verifying password...";

    try {
      const { data, error } = await client.functions.invoke("delete-account", {
        body: { currentPassword },
      });
      if (error) {
        let responseError = null;
        try {
          responseError = await error.context?.json();
        } catch {
          responseError = null;
        }
        throw new Error(responseError?.error || error.message);
      }
      if (!data?.deleted)
        throw new Error("Account deletion was not completed.");

      await window.authApi.signOut({ redirectTo: "index.html" });
    } catch (error) {
      const message = String(error?.message || "");
      deleteDialogMessage.className =
        "auth-message account-delete-dialog__message error";
      deleteDialogMessage.textContent =
        message.toLowerCase().includes("incorrect password")
          ? "Incorrect password."
          : message || "Account deletion failed. No account changes were confirmed.";
      submitButton.disabled = false;
    }
  });

  loadAccount().catch((error) => {
    console.error(error);
    status.textContent = "Account data is temporarily unavailable.";
    ordersList.innerHTML =
      '<div class="dashboard-loading">Unable to load orders.</div>';
  });
})();
