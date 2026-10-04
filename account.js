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
  const continueDeleteAccount = document.querySelector(
    "#continueDeleteAccount",
  );
  const backDeleteAccount = document.querySelector("#backDeleteAccount");
  const deleteWarning = document.querySelector("[data-delete-account-warning]");
  const deleteConfirmForm = document.querySelector(
    "[data-delete-account-confirm]",
  );
  const deleteDialogMessage = document.querySelector(
    "#deleteAccountDialogMessage",
  );
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
  const supportRequestsList = document.querySelector("#supportRequestsList");
  const supportRequestsEmpty = document.querySelector("#supportRequestsEmpty");
  const supportRequestsCount = document.querySelector("#supportRequestsCount");
  const supportRequestsPagination = document.querySelector(
    "#supportRequestsPagination",
  );
  const supportRequestConversation = document.querySelector(
    "#supportRequestConversation",
  );
  const supportConversationBack = document.querySelector(
    "#supportConversationBack",
  );
  const supportConversationCategory = document.querySelector(
    "#supportConversationCategory",
  );
  const supportConversationSubject = document.querySelector(
    "#supportConversationSubject",
  );
  const supportConversationMeta = document.querySelector(
    "#supportConversationMeta",
  );
  const supportConversationStatus = document.querySelector(
    "#supportConversationStatus",
  );
  const supportCustomerMessageList = document.querySelector(
    "#supportCustomerMessageList",
  );
  const supportResolvedMessage = document.querySelector(
    "#supportResolvedMessage",
  );
  const supportCustomerReplyForm = document.querySelector(
    "#supportCustomerReplyForm",
  );
  const supportCustomerReply = document.querySelector("#supportCustomerReply");
  const supportCustomerReplyStatus = document.querySelector(
    "#supportCustomerReplyStatus",
  );
  const supportCustomerReplySubmit = document.querySelector(
    "#supportCustomerReplySubmit",
  );
  const supportDeleteDialog = document.querySelector("#supportDeleteDialog");
  const supportDeleteRequestTitle = document.querySelector(
    "#supportDeleteRequestTitle",
  );
  const cancelSupportDelete = document.querySelector("#cancelSupportDelete");
  const confirmSupportDelete = document.querySelector("#confirmSupportDelete");
  const supportUnreadNavBadge = document.querySelector(
    "#supportUnreadNavBadge",
  );
  const supportState = {
    customerId: null,
    accessVersion: 0,
    requestVersion: 0,
    conversationVersion: 0,
    selectedStatus: null,
    requests: [],
    selectedId: null,
    filter: "all",
    page: 1,
    pageSize: 6,
    total: 0,
    loading: false,
    sending: false,
    unread: new Map(),
    unreadTotal: 0,
  };
  const SUPPORT_RESOLVED_STATUS = "resolved";
  const SUPPORT_ACTIVE_STATUSES = ["open", "waiting_for_user"];
  const isSupportMobile = () =>
    window.matchMedia("(max-width: 760px)").matches;
  let avatarPreviewUrl = "";
  const supportNav = document.querySelector('.account-sidebar-item[data-section="support"]');
  const supportSection = document.querySelector('.account-section[data-section="support"]');
  let supportDeepLinkHandled = false;

  function hideCustomerSupport() {
    supportState.customerId = null;
    supportState.requestVersion++;
    supportState.conversationVersion++;
    supportState.selectedId = null;
    supportState.selectedStatus = null;
    supportState.requests = [];
    supportState.unread = new Map();
    supportState.unreadTotal = 0;
    supportNav.hidden = true;
    supportSection.hidden = true;
    supportUnreadNavBadge.hidden = true;
    supportCustomerReplyForm.hidden = true;
    supportRequestConversation.hidden = true;
    supportRequestsList.replaceChildren();
    supportCustomerMessageList.replaceChildren();
    if (supportSection.classList.contains("is-visible")) {
      document.querySelector('.account-sidebar-item[data-section="overview"]').click();
    }
  }

  async function refreshCustomerSupportAccess(session) {
    const version = ++supportState.accessVersion;
    try {
      session ??= await window.authApi.getSession();
      if (!session?.user) {
        hideCustomerSupport();
        return false;
      }
      if (supportState.customerId && supportState.customerId !== session.user.id) hideCustomerSupport();
      // Resolve both authoritative checks before revealing any customer UI.
      const [admin, employee] = await Promise.all([
        client.rpc("is_current_user_support_admin"),
        client.rpc("is_current_user_support_employee"),
      ]);
      if (version !== supportState.accessVersion) return false;
      if (admin.error || employee.error) throw admin.error || employee.error;
      if (admin.data !== false || employee.data !== false) {
        hideCustomerSupport();
        return false;
      }
      supportState.customerId = session.user.id;
      supportNav.hidden = false;
      supportSection.hidden = false;
      return true;
    } catch (error) {
      if (version === supportState.accessVersion) hideCustomerSupport();
      console.error("Unable to verify customer Support access", error);
      return false;
    }
  }

  async function refreshCustomerSupport(session) {
    if (!(await refreshCustomerSupportAccess(session))) return;
    await loadSupportRequests();
    if (!supportState.customerId || supportDeepLinkHandled) return;
    supportDeepLinkHandled = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("section") === "support" || window.location.hash === "#support") {
      supportNav.click();
      const requestId = params.get("request");
      if (requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
        await openSupportRequest(requestId);
      }
    }
  }

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
        const title =
          event?.title || event?.performer || primaryTicket?.name || "Event";
        const image = event?.image_url || event?.bands?.image_url || "";
        const venue =
          event?.venues?.name || event?.venue || "Venue to be announced";
        const dateTime = [event?.event_date, event?.event_time?.slice(0, 5)]
          .filter(Boolean)
          .join(" — ");
        const ticketDetails = eventItems
          .map(({ item, ticket }) => {
            const ticketName = ticket?.name || "Ticket";
            const total =
              Number(ticket?.price || 0) * Number(item.quantity || 0);
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
      const seconds = Math.max(
        0,
        Math.ceil(
          (new Date(element.dataset.reservationUntil) - Date.now()) / 1000,
        ),
      );
      element.textContent = seconds
        ? `${Math.floor(seconds / 60)}m ${seconds % 60}s remaining`
        : "Reservation has expired";
    });
  }

  function renderOverview(
    data,
    profile,
    user,
    cartItems = [],
    ticketTypes = [],
    events = [],
  ) {
    const name =
      profile?.first_name || user?.user_metadata?.first_name || "there";
    const avatar = profile?.avatar_url
      ? `<img src="${escapeHtml(profile.avatar_url)}" alt="" />`
      : `<span>${escapeHtml(String(name).charAt(0).toUpperCase())}</span>`;
    const next = data.next_event;
    const reservation = data.reservation;
    const activity = data.activity || {};
    const ticketsById = new Map(
      ticketTypes.map((ticket) => [String(ticket.id), ticket]),
    );
    const eventsById = new Map(
      events.map((event) => [String(event.id), event]),
    );
    const cartCount = cartItems.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
    const cartTotal = cartItems.reduce(
      (sum, item) =>
        sum +
        Number(item.quantity || 0) *
          Number(ticketsById.get(String(item.ticket_type_id))?.price || 0),
      0,
    );
    const firstCartEvent = eventsById.get(
      String(ticketsById.get(String(cartItems[0]?.ticket_type_id))?.event_id),
    );
    const icon = (name) => {
      const paths = {
        account:
          '<circle cx="12" cy="8" r="3.25"/><path d="M5.5 19.25c.55-3.05 2.75-4.75 6.5-4.75s5.95 1.7 6.5 4.75"/>',
        cart:
          '<path d="M4 5.5h2l1.25 8.25h8.9l2.1-6.25H7"/><circle cx="9.25" cy="18.5" r="1"/><circle cx="16.25" cy="18.5" r="1"/>',
        ticket:
          '<path d="M4 7.25A2.25 2.25 0 0 1 6.25 5h11.5A2.25 2.25 0 0 1 20 7.25v1.5a2.25 2.25 0 0 0 0 4.5v1.5A2.25 2.25 0 0 1 17.75 17H6.25A2.25 2.25 0 0 1 4 14.75v-1.5a2.25 2.25 0 0 0 0-4.5z"/><path d="M12 7.5v9"/>',
        calendar:
          '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M7.5 3.5v4M16.5 3.5v4M4 9.5h16"/>',
        activity:
          '<path d="M4 16.5h3l2-6 3.25 8 2.25-5H20"/>',
        arrow: '<path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5"/>',
      };
      return `<svg class="overview-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.activity}</svg>`;
    };
    const formatEventDate = (event) => {
      if (!event?.date) return "";
      const date = new Date(`${event.date}T00:00:00`);
      return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
    };
    const cartEventLabel =
      firstCartEvent?.title ||
      firstCartEvent?.performer ||
      "Tickets in your cart";
    const cartEventMeta = firstCartEvent
      ? [
          firstCartEvent.venue,
          firstCartEvent.event_date
            ? new Date(
                `${firstCartEvent.event_date}T00:00:00`,
              ).toLocaleDateString()
            : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
    const stat = (title, value, description) =>
      `<article class="overview-card overview-stat"><p>${title}</p><strong>${value}</strong><span>${description}</span></article>`;
    const reservationCard = reservation
      ? `<h3>${escapeHtml(reservation.title || reservation.performer || "Event")}</h3><strong>${reservation.seat_count} ${reservation.seat_count === 1 ? "seat" : "seats"} reserved</strong><span>${escapeHtml(reservation.venue || "Venue to be announced")}</span><em data-reservation-until="${escapeHtml(reservation.reserved_until)}">Calculating time remaining…</em>`
      : overviewEmpty(
          "No active reservation",
          "Seats held for you will appear here.",
        );
    const purchases = Number(data.total_orders || 0);
    const activityBars = [
      ["7 days", activity.last_7_days || 0],
      ["30 days", activity.last_30_days || 0],
      ["This year", activity.this_year || 0],
    ]
      .map(
        ([label, value]) =>
          `<div class="activity-metric"><b>${value}</b><span>${label}</span></div>`,
      )
      .join("");
    const recent = data.recent_orders
      ?.map(
        (order) =>
          `<div><span><strong>${escapeHtml(order.event_name)}</strong><small>${escapeHtml(new Date(order.created_at).toLocaleDateString())} · ${order.ticket_count} tickets</small></span><b>${formatMoney(order.total_price)}</b></div>`,
      )
      .join("");
    const reservationGrid = reservation
      ? `<article class="overview-card reservation-event"><p>Active Reservation</p><h3>${escapeHtml(reservation.title || reservation.performer || "Event")}</h3><span>Your seats are temporarily held for this event.</span></article><article class="overview-card reservation-timer"><p>Time Remaining</p><strong data-reservation-until="${escapeHtml(reservation.reserved_until)}">Calculating time remaining…</strong><span>Reservation expiration countdown.</span></article><article class="overview-card reservation-venue"><p>Venue</p><h3>${escapeHtml(reservation.venue || "Venue to be announced")}</h3><span>Where your reservation is held.</span></article><article class="overview-card reservation-seats"><p>Seat Count</p><strong>${reservation.seat_count}</strong><span>${reservation.seat_count === 1 ? "Seat" : "Seats"} currently reserved for you.</span></article><article class="overview-card reservation-details"><p>Reserved Seats</p><h3>${escapeHtml(reservation.seats || "Seat details available at checkout")}</h3><span>Section, row, and seat information from your active reservation.</span></article>`
      : `<article class="overview-card reservation-event">${overviewEmpty("No active reservation", "Your next seat reservation will appear here.")}</article><article class="overview-card reservation-timer">${overviewEmpty("Timer unavailable", "A countdown appears when seats are held.")}</article><article class="overview-card reservation-venue">${overviewEmpty("Venue details", "Available with an active reservation.")}</article><article class="overview-card reservation-seats">${overviewEmpty("Reserved seats", "Available with an active reservation.")}</article><article class="overview-card reservation-details">${overviewEmpty("Seat details", "Available with an active reservation.")}</article>`;
    const activityGrid = purchases
      ? `<article class="overview-card activity-visual"><p>Activity Visualization</p><h3>Completed purchase activity</h3><span>Activity is based on recorded completed purchases.</span></article><article class="overview-card activity-ranking"><p>Activity Ranking — Last 30 Days</p>${data.ranking?.available ? `<strong>Top ${data.ranking.top_percent}%</strong><span>Your activity level compared with other active iVenue users.</span>` : overviewEmpty("Not enough activity data yet", "Ranking needs at least five active users.")}</article><article class="overview-card activity-periods"><p>Purchase activity by period</p><div class="activity-bars">${activityBars}</div></article>`
      : `<article class="overview-card activity-visual">${overviewEmpty("Activity insights will appear as you use iVenue.", "Completed purchases are not yet recorded.")}</article><article class="overview-card activity-ranking"><p>Activity Ranking — Last 30 Days</p>${overviewEmpty("Not enough activity data yet", "Ranking needs completed purchase activity.")}</article><article class="overview-card activity-periods"><p>Activity periods</p><div class="activity-bars"><div class="activity-metric"><b>—</b><span>7 days</span></div><div class="activity-metric"><b>—</b><span>30 days</span></div><div class="activity-metric"><b>—</b><span>This year</span></div></div></article>`;
    const purchaseGrid = purchases
      ? `${stat("Purchased Tickets", data.tickets || 0, "Tickets currently available in your account.")}${stat("Total Orders", purchases, "Completed purchases made through your iVenue account.")}<article class="overview-card overview-spending"><p>Total Spent</p><strong>${formatMoney(data.total_spent)}</strong><span>Total value of your completed iVenue purchases.</span><small>This year: ${formatMoney(data.this_year_spent)}</small></article><article class="overview-card overview-recent-orders"><p>Recent Orders</p><h3>Completed purchases</h3><div class="overview-order-list">${recent}</div></article><article class="overview-card purchase-next-event"><p>Next Purchased Event</p>${next ? `<h3>${escapeHtml(next.name)}</h3><span>${escapeHtml(next.venue || "Venue to be announced")}</span>` : overviewEmpty("No upcoming purchased event", "Your next eligible ticket will appear here.")}</article>`
      : `<article class="overview-card purchase-tickets">${overviewEmpty("Purchased Tickets", "Tickets will appear after completed purchases.")}</article><article class="overview-card purchase-orders">${overviewEmpty("Orders", "Completed purchases will appear here.")}</article><article class="overview-card purchase-spending">${overviewEmpty("Spending", "Your completed purchase total will appear here.")}</article><article class="overview-card purchase-history">${overviewEmpty("No purchases yet", "Your completed ticket purchases and spending history will appear here.")}</article><article class="overview-card purchase-next-event">${overviewEmpty("Next Event", "Your next purchased event will appear here.")}</article>`;
    const recentActivity = (data.recent_orders || [])
      .map(
        (order) =>
          `<div class="overview-activity-row">${icon("ticket")}<span><strong>Order completed</strong><small>${escapeHtml(order.event_name || "Event")} · ${order.ticket_count} ${order.ticket_count === 1 ? "ticket" : "tickets"}</small></span><time>${escapeHtml(new Date(order.created_at).toLocaleDateString())}</time></div>`,
      )
      .join("");
    const accountActivity = user?.created_at
      ? `<div class="overview-activity-row">${icon("account")}<span><strong>Account created</strong><small>Joined iVenue</small></span><time>${escapeHtml(new Date(user.created_at).toLocaleDateString())}</time></div>`
      : "";
    const activityFeed = recentActivity + accountActivity;
    overviewDashboard.innerHTML = `
      <section class="overview-panel is-active" id="overview-panel-summary" role="tabpanel" aria-labelledby="overview-tab-summary" data-overview-panel="summary">
        <div class="overview-summary-layout">
          <article class="overview-summary-hero">
            <div class="overview-summary-identity">
              <div class="overview-avatar">${avatar}</div>
              <div>
                <p class="overview-eyebrow">Welcome back,</p>
                <h3>${escapeHtml(name)}</h3>
                <span>${escapeHtml(profile?.email || user?.email || "Your iVenue account")}</span>
                ${user?.created_at ? `<small>Member since ${escapeHtml(new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" }))}</small>` : ""}
              </div>
              <button class="overview-action overview-edit-action" type="button" data-overview-edit-profile>Edit profile ${icon("arrow")}</button>
            </div>
            <div class="overview-summary-stats">
              <div class="overview-summary-stat">${icon("ticket")}<div><p>Cart items</p><strong>${cartCount}</strong><span>Tickets currently in your cart.</span></div></div>
              <div class="overview-summary-stat">${icon("cart")}<div><p>Cart value</p><strong>${formatMoney(cartTotal)}</strong><span>${escapeHtml(cartCount ? cartEventLabel : "Add tickets to calculate your total.")}</span></div></div>
              <div class="overview-summary-stat">${icon("calendar")}<div><p>Active reservation</p>${reservation ? `<strong>${reservation.seat_count} ${reservation.seat_count === 1 ? "seat" : "seats"}</strong><span>${escapeHtml(reservation.title || reservation.performer || "Event")} · <em data-reservation-until="${escapeHtml(reservation.reserved_until)}">Calculating time remaining…</em></span>` : `<strong>No active reservation</strong><span>Seats held for you will appear here.</span>`}</div></div>
            </div>
          </article>
          <section class="overview-summary-section overview-next-event-section">
            <div class="overview-summary-section-heading"><div><p class="overview-eyebrow">Your next event</p><h3>${next ? escapeHtml(next.name) : "Nothing scheduled yet"}</h3></div>${icon("calendar")}</div>
            ${next ? `<div class="overview-summary-detail"><span>${escapeHtml([formatEventDate(next), next.venue || "Venue to be announced"].filter(Boolean).join(" · "))}</span><span>${next.tickets || 0} ${next.tickets === 1 ? "ticket" : "tickets"}${next.seats ? ` · ${escapeHtml(next.seats)}` : ""}</span></div>` : `<p class="overview-muted">Your next purchased event will appear here.</p>`}
            <a class="overview-action" href="shows.html">Browse events ${icon("arrow")}</a>
          </section>
          <section class="overview-summary-section overview-cart-section">
            <div class="overview-summary-section-heading"><div><p class="overview-eyebrow">Current cart</p><h3>${cartCount ? escapeHtml(cartEventLabel) : "Your cart is empty"}</h3></div>${icon("cart")}</div>
            ${cartCount ? `<div class="overview-summary-detail"><span>${escapeHtml(cartEventMeta || `${cartCount} ${cartCount === 1 ? "ticket" : "tickets"} reserved`)}</span><span>${cartCount} ${cartCount === 1 ? "ticket" : "tickets"} reserved · Active</span></div>${cartItems.some((item) => item.event_seat_id) ? `<p class="overview-muted">Seat selections are held in your cart.</p>` : ""}<strong class="overview-summary-total">${formatMoney(cartTotal)}</strong>` : `<p class="overview-muted">Add tickets to prepare your next night out.</p>`}
            <a class="overview-action" href="#cart">View cart ${icon("arrow")}</a>
          </section>
          <section class="overview-summary-section overview-activity-section">
            <div class="overview-summary-section-heading"><div><p class="overview-eyebrow">Recent activity</p><h3>Your iVenue activity</h3></div><button class="overview-action overview-tab-link" type="button" data-overview-tab="activity">View all activity ${icon("arrow")}</button></div>
            ${activityFeed || `<div class="overview-empty-feed">${icon("activity")}<span><strong>No activity yet.</strong>Your reservations and purchases will appear here.</span></div>`}
            ${activityFeed ? `<div class="overview-activity-feed">${activityFeed}</div>` : ""}
          </section>
        </div>
      </section>
      <section class="overview-panel" id="overview-panel-reservations" role="tabpanel" aria-labelledby="overview-tab-reservations" data-overview-panel="reservations" hidden><div class="overview-grid overview-reservations-grid">${reservationGrid}</div></section>
      <section class="overview-panel" id="overview-panel-activity" role="tabpanel" aria-labelledby="overview-tab-activity" data-overview-panel="activity" hidden><div class="overview-grid overview-activity-grid">${activityGrid}</div></section>
      <section class="overview-panel" id="overview-panel-purchases" role="tabpanel" aria-labelledby="overview-tab-purchases" data-overview-panel="purchases" hidden><div class="overview-grid overview-purchases-grid">${purchaseGrid}</div></section>`;
    overviewDashboard.setAttribute("aria-busy", "false");
    updateReservationCountdown();
    activateOverviewTab(
      sessionStorage.getItem("iVenueOverviewTab") || "summary",
    );
  }

  function showOverviewError() {
    overviewDashboard.innerHTML = overviewEmpty(
      "Overview unavailable",
      "Your dashboard data could not be loaded. Please try again.",
    );
    overviewDashboard.setAttribute("aria-busy", "false");
  }

  function activateOverviewTab(name) {
    const tab =
      document.querySelector(`[data-overview-tab="${name}"]`) ||
      document.querySelector('[data-overview-tab="summary"]');
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

  const formatSupportDate = (value) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";
  const supportCategoryLabel = (value) =>
    String(value || "general")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const supportStatusLabel = (status) =>
    status === SUPPORT_RESOLVED_STATUS ? "Resolved" : "Open";

  function renderSupportPagination() {
    const pageCount = Math.max(
      1,
      Math.ceil(supportState.total / supportState.pageSize),
    );
    supportState.page = Math.min(supportState.page, pageCount);
    supportRequestsPagination.innerHTML =
      pageCount > 1
        ? Array.from(
            { length: pageCount },
            (_, index) =>
              `<button class="account-outline-button${index + 1 === supportState.page ? " is-active" : ""}" type="button" data-support-page="${index + 1}" ${index + 1 === supportState.page ? 'aria-current="page"' : ""}>${index + 1}</button>`,
          ).join("")
        : "";
  }

  function renderSupportRequestList() {
    const requests = supportState.requests;
    supportRequestsList.replaceChildren();
    supportRequestsCount.textContent = `${supportState.total} ${supportState.total === 1 ? "request" : "requests"}`;
    if (!requests.length) {
      supportRequestsEmpty.hidden = false;
      supportRequestsEmpty.querySelector("strong").textContent =
        supportState.filter === "all"
          ? "You don't have any Support requests yet."
          : "No Support requests match this filter.";
      supportRequestsEmpty.querySelector("span").textContent =
        supportState.filter === "all"
          ? "Need help? Send us a Support request."
          : "Try another filter or contact Support.";
      renderSupportPagination();
      return;
    }
    supportRequestsEmpty.hidden = true;
    requests.forEach((request) => {
      const item = document.createElement("div");
      item.className = `dashboard-row support-request-row${request.id === supportState.selectedId ? " is-selected" : ""}`;
      const unread = supportState.unread.get(request.id) || 0;
      item.innerHTML = `<button class="support-request-row__main" type="button" data-support-request-id="${escapeHtml(request.id)}"><span class="support-request-row__content"><strong>${escapeHtml(request.subject)}</strong><span>${escapeHtml(supportCategoryLabel(request.category))}</span><span class="support-request-row__meta"><span>Created ${escapeHtml(formatSupportDate(request.created_at))}</span><span>Updated ${escapeHtml(formatSupportDate(request.updated_at))}</span></span></span><span class="support-request-row__status"><strong class="support-request-status support-request-status--${request.status === SUPPORT_RESOLVED_STATUS ? "resolved" : "open"}">${supportStatusLabel(request.status)}</strong>${unread > 0 ? '<span class="support-request-new">New reply</span>' : ""}</span></button><button class="account-text-button support-request-row__delete" type="button" data-delete-support-request="${escapeHtml(request.id)}" aria-label="Delete support request: ${escapeHtml(request.subject)}">Delete</button>`;
      supportRequestsList.append(item);
    });
    renderSupportPagination();
  }

  function renderSupportMessages(messages) {
    supportCustomerMessageList.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement("p");
      empty.className = "support-customer-message-empty";
      empty.textContent = "No messages in this conversation yet.";
      supportCustomerMessageList.append(empty);
      return;
    }
    messages.forEach((message) => {
      const card = document.createElement("article");
      card.className = `support-customer-message support-customer-message--${message.sender_type === "customer" ? "customer" : "support"}`;
      const header = document.createElement("header");
      const sender = document.createElement("strong");
      const timestamp = document.createElement("time");
      const body = document.createElement("p");
      sender.textContent =
        message.sender_type === "customer" ? "You" : "iVenue Support";
      timestamp.textContent = formatSupportDate(message.created_at);
      body.textContent = message.body;
      header.append(sender, timestamp);
      card.append(header, body);
      supportCustomerMessageList.append(card);
    });
    supportCustomerMessageList.scrollTop =
      supportCustomerMessageList.scrollHeight;
  }

  async function openSupportRequest(requestId) {
    if (!supportState.customerId) return;
    const customerId = supportState.customerId;
    const version = ++supportState.conversationVersion;
    supportState.selectedId = requestId;
    supportState.selectedStatus = null;
    supportCustomerReplyForm.hidden = true;
    if (isSupportMobile()) {
      supportRequestsList.hidden = true;
      supportRequestsEmpty.hidden = true;
      supportRequestsPagination.hidden = true;
    } else {
      supportRequestsList.hidden = false;
      supportRequestsPagination.hidden = false;
    }
    supportRequestConversation.hidden = false;
    supportCustomerMessageList.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "dashboard-loading";
    loading.textContent = "Loading conversation...";
    supportCustomerMessageList.append(loading);
    try {
      const { data: request, error: requestError } = await client
          .from("support_requests")
          .select("id,subject,category,status,created_at,updated_at,customer_deleted_at")
          .eq("id", requestId)
          .eq("customer_user_id", customerId)
          .is("customer_deleted_at", null)
          .maybeSingle();
      if (version !== supportState.conversationVersion || customerId !== supportState.customerId) return;
      if (requestError || !request) throw requestError || new Error("Support request unavailable.");
      const { data: messages, error: messagesError } = await client
          .from("support_messages")
          .select("sender_type,body,created_at")
          .eq("support_request_id", requestId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
      if (version !== supportState.conversationVersion || customerId !== supportState.customerId) return;
      if (messagesError) throw messagesError;
      supportState.selectedStatus = request.status;
      supportConversationCategory.textContent = supportCategoryLabel(
        request.category,
      );
      supportConversationSubject.textContent = request.subject;
      supportConversationMeta.textContent = `Created ${formatSupportDate(request.created_at)} · Last updated ${formatSupportDate(request.updated_at)}`;
      supportConversationStatus.textContent = supportStatusLabel(
        request.status,
      );
      supportConversationStatus.className = `support-request-status support-request-status--${request.status === SUPPORT_RESOLVED_STATUS ? "resolved" : "open"}`;
      renderSupportMessages(messages || []);
      const resolved = request.status === SUPPORT_RESOLVED_STATUS;
      supportCustomerReplyForm.hidden = resolved;
      supportResolvedMessage.hidden = !resolved;
      await markCustomerRequestRead(requestId);
    } catch (error) {
      if (version !== supportState.conversationVersion || customerId !== supportState.customerId) return;
      supportCustomerMessageList.replaceChildren();
      const failure = document.createElement("p");
      failure.className = "auth-message error";
      failure.textContent =
        "This Support conversation could not be loaded. Please try again.";
      supportCustomerMessageList.append(failure);
      supportCustomerReplyForm.hidden = true;
      supportResolvedMessage.hidden = true;
    }
  }

  async function loadSupportRequests() {
    if (!supportState.customerId) return;
    const customerId = supportState.customerId;
    const version = ++supportState.requestVersion;
    supportRequestsList.hidden = false;
    supportRequestsEmpty.hidden = true;
    supportRequestsPagination.hidden = false;
    supportRequestsList.innerHTML =
      '<div class="dashboard-loading">Loading Support requests...</div>';
    let query = client
      .from("support_requests")
      .select("id,subject,category,status,created_at,updated_at,customer_deleted_at", {
        count: "exact",
      })
      .eq("customer_user_id", customerId)
      .is("customer_deleted_at", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(
        (supportState.page - 1) * supportState.pageSize,
        supportState.page * supportState.pageSize - 1,
      );
    if (supportState.filter === "resolved")
      query = query.eq("status", SUPPORT_RESOLVED_STATUS);
    if (supportState.filter === "open")
      query = query.in("status", SUPPORT_ACTIVE_STATUSES);
    const { data, error, count } = await query;
    if (version !== supportState.requestVersion || customerId !== supportState.customerId) return;
    if (error) throw error;
    supportState.requests = data || [];
    supportState.total = count || 0;
    try {
      await loadCustomerUnreadState();
    } catch (error) {
      console.error("Unable to load customer Support unread state", error);
      supportState.unread = new Map();
      supportState.unreadTotal = 0;
      updateSupportUnreadBadge();
    }
    if (version === supportState.requestVersion && customerId === supportState.customerId) renderSupportRequestList();
  }

  function updateSupportUnreadBadge() {
    supportUnreadNavBadge.textContent =
      supportState.unreadTotal > 99 ? "99+" : String(supportState.unreadTotal);
    supportUnreadNavBadge.hidden = !supportState.customerId || supportState.unreadTotal === 0;
  }

  async function loadCustomerUnreadState() {
    const customerId = supportState.customerId;
    if (!customerId) return;
    const session = await window.authApi.getSession();
    if (!session?.user || session.user.id !== customerId) {
      supportState.customerId = null;
      hideCustomerSupport();
      return;
    }
    const { data, error } = await client.rpc("get_support_unread_state");
    if (customerId !== supportState.customerId) return;
    if (error) throw error;
    supportState.unread = new Map(
      (data || []).map((item) => [
        item.request_id,
        Number(item.unread_count || 0),
      ]),
    );
    supportState.unreadTotal = [...supportState.unread.values()].reduce(
      (total, count) => total + count,
      0,
    );
    updateSupportUnreadBadge();
  }

  async function markCustomerRequestRead(requestId) {
    const customerId = supportState.customerId;
    if (!customerId || supportState.selectedId !== requestId || !supportState.selectedStatus) return;
    try {
      const { error } = await client.rpc("mark_support_request_read", {
        p_support_request_id: requestId,
      });
      if (error) throw error;
      if (customerId !== supportState.customerId) return;
      supportState.unread.set(requestId, 0);
      supportState.unreadTotal = [...supportState.unread.values()].reduce(
        (total, count) => total + count,
        0,
      );
      updateSupportUnreadBadge();
      renderSupportRequestList();
    } catch (error) {
      console.error("Unable to mark customer Support request as read", error);
    }
  }

  function showSupportRequestList() {
    if (!supportState.customerId) return;
    if (!isSupportMobile()) return;
    supportState.selectedId = null;
    supportRequestConversation.hidden = true;
    supportRequestsList.hidden = false;
    supportRequestsEmpty.hidden = true;
    supportRequestsPagination.hidden = false;
  }

  async function submitSupportCustomerReply(event) {
    event.preventDefault();
    if (!supportState.customerId || !SUPPORT_ACTIVE_STATUSES.includes(supportState.selectedStatus)) return;
    const body = supportCustomerReply.value.trim();
    if (!supportState.selectedId || !body || supportState.sending) return;
    supportState.sending = true;
    supportCustomerReplySubmit.disabled = true;
    supportCustomerReplyStatus.textContent = "Sending...";
    try {
      const { error } = await client.rpc("add_customer_support_message", {
        p_support_request_id: supportState.selectedId,
        p_body: body,
      });
      if (error) throw error;
      supportCustomerReply.value = "";
      supportCustomerReplyStatus.textContent = "Reply sent.";
      supportState.page = 1;
      await loadSupportRequests();
      await openSupportRequest(supportState.selectedId);
    } catch (error) {
      supportCustomerReplyStatus.textContent =
        "Your reply could not be sent. Please try again.";
    } finally {
      supportState.sending = false;
      supportCustomerReplySubmit.disabled = false;
    }
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
      hideCustomerSupport();
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

    refreshCustomerSupport(session).catch((error) => {
      console.error("Unable to load Support requests", error);
      supportRequestsList.innerHTML =
        '<div class="auth-message error">Support requests could not be loaded. Please try again.</div>';
    });

    const [profileResult, ordersResult, cartResult, overviewResult] =
      await Promise.all([
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

  document
    .querySelector(".overview-tabs")
    ?.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-overview-tab]");
      if (tab) activateOverviewTab(tab.dataset.overviewTab);
    });

  overviewDashboard?.addEventListener("click", (event) => {
    const editProfile = event.target.closest("[data-overview-edit-profile]");
    if (editProfile) {
      document
        .querySelector('.account-sidebar-item[data-section="profile"]')
        ?.click();
      editProfileButton?.click();
      return;
    }
    const tab = event.target.closest("[data-overview-tab]");
    if (tab) activateOverviewTab(tab.dataset.overviewTab);
  });

  document
    .querySelector(".overview-tabs")
    ?.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      const tabs = [...document.querySelectorAll("[data-overview-tab]")];
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      tabs[next].focus();
      activateOverviewTab(tabs[next].dataset.overviewTab);
    });

  document.querySelectorAll("[data-support-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      supportState.filter = button.dataset.supportFilter;
      supportState.page = 1;
      document
        .querySelectorAll("[data-support-filter]")
        .forEach((item) => item.classList.toggle("is-active", item === button));
      loadSupportRequests().catch(() => {
        supportRequestsList.innerHTML =
          '<div class="auth-message error">Support requests could not be loaded. Please try again.</div>';
      });
    });
  });
  supportRequestsList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-support-request]");
    if (deleteButton) {
      event.stopPropagation();
      const request = supportState.requests.find(
        (item) => item.id === deleteButton.dataset.deleteSupportRequest,
      );
      if (!request) return;
      supportDeleteDialog.dataset.requestId = request.id;
      supportDeleteDialog.hidden = false;
      document.body.classList.add("account-delete-modal-open");
      return;
    }
    const item = event.target.closest("[data-support-request-id]");
    if (item) openSupportRequest(item.dataset.supportRequestId);
  });
  const closeSupportDeleteDialog = () => {
    supportDeleteDialog.hidden = true;
    delete supportDeleteDialog.dataset.requestId;
    document.body.classList.remove("account-delete-modal-open");
  };
  cancelSupportDelete.addEventListener("click", closeSupportDeleteDialog);
  supportDeleteDialog.addEventListener("click", (event) => {
    if (event.target === supportDeleteDialog) closeSupportDeleteDialog();
  });
  confirmSupportDelete.addEventListener("click", async () => {
    const requestId = supportDeleteDialog.dataset.requestId;
    if (!requestId || confirmSupportDelete.disabled) return;
    confirmSupportDelete.disabled = true;
    try {
      const { error } = await client.rpc("delete_customer_support_request", {
        p_support_request_id: requestId,
      });
      if (error) throw error;
      if (supportState.selectedId === requestId) showSupportRequestList();
      closeSupportDeleteDialog();
      await loadSupportRequests();
    } catch (error) {
      console.error("Unable to delete customer Support request", error);
      supportDeleteRequestTitle.textContent =
        "This request could not be removed. Please try again.";
    } finally {
      confirmSupportDelete.disabled = false;
    }
  });
  supportRequestsPagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-support-page]");
    if (!button) return;
    supportState.page = Number(button.dataset.supportPage);
    loadSupportRequests().catch(() => {
      supportRequestsList.innerHTML =
        '<div class="auth-message error">Support requests could not be loaded. Please try again.</div>';
    });
  });
  supportConversationBack.addEventListener("click", showSupportRequestList);
  window.addEventListener("resize", () => {
    if (supportRequestConversation.hidden) return;
    const hideInbox = isSupportMobile();
    supportRequestsList.hidden = hideInbox;
    supportRequestsPagination.hidden = hideInbox;
    if (hideInbox) supportRequestsEmpty.hidden = true;
  });
  supportCustomerReplyForm.addEventListener(
    "submit",
    submitSupportCustomerReply,
  );

  overviewDashboard?.addEventListener("click", (event) => {
    if (!event.target.closest('a[href="#cart"]')) return;
    document
      .querySelector('.account-sidebar-item[data-section="cart"]')
      ?.click();
  });

  window.addEventListener("eventCartChanged", () => {
    loadAccount().catch((error) => console.error(error));
  });

  document
    .querySelectorAll(".account-sidebar-item[data-section]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const section = button.dataset.section;
        if (section === "support" && !supportState.customerId) return;
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
      .querySelector(
        `.account-sidebar-item[data-section="${window.location.hash.slice(1).toLowerCase()}"]`,
      )
      ?.click();
  }

  window.addEventListener("focus", () => {
    refreshCustomerSupport().catch((error) => console.error("Unable to refresh customer Support", error));
  });
  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      supportState.accessVersion++;
      hideCustomerSupport();
    }
  });

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
      setMessage(
        error.message || "This cart item could not be removed.",
        "error",
      );
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
    if (Object.hasOwn(userMetadata, "full_name"))
      nameMetadata.full_name = fullName;
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

    const submitButton = deleteConfirmForm.querySelector(
      'button[type="submit"]',
    );
    submitButton.disabled = true;
    deleteDialogMessage.className =
      "auth-message account-delete-dialog__message";
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
      deleteDialogMessage.textContent = message
        .toLowerCase()
        .includes("incorrect password")
        ? "Incorrect password."
        : message ||
          "Account deletion failed. No account changes were confirmed.";
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
