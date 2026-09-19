(() => {
  const PAGE_SIZE = 5;
  const CATALOG_BATCH_SIZE = 10;
  const client = window.supabaseClient;
  const state = {
    events: [],
    categories: [],
    ticketTypes: [],
    orderItems: [],
    inventory: [],
    users: 0,
    eventPage: 1,
    statsPage: 1,
    analytics: null,
    performanceVisible: 10,
    catalog: [],
    catalogVisibleCount: CATALOG_BATCH_SIZE,
    venues: [],
    eventCreationContext: { venues: [], ticket_colors: {} },
    wizardStep: 1,
    wizardHighestStep: 1,
    wizardTickets: null,
    wizardDirty: false,
    wizardSaving: false,
    editorReturnPanel: "overview",
    editorReturnScrollY: 0,
  };
  const status = document.querySelector("#adminStatus");
  const message = document.querySelector("#adminMessage");
  const form = document.querySelector("#eventForm");
  const eventList = document.querySelector("#eventList");
  const statsList = document.querySelector("#statsList");
  const eventsPagination = document.querySelector("#eventsPagination");
  const statsPagination = document.querySelector("#statsPagination");
  const metrics = document.querySelector("#overviewMetrics");
  const performerInput = document.querySelector("#eventPerformer");
  const categorySelect = document.querySelector("#eventCategorySelect");
  const venueSelect = document.querySelector("#eventVenueSelect");
  const venuePreview = document.querySelector("#venuePreview");
  const wizardMessage = document.querySelector("#eventWizardMessage");
  const wizardStepButtons = [...document.querySelectorAll("[data-event-step]")];
  const wizardStepPanels = [...document.querySelectorAll("[data-event-step-panel]")];
  const wizardBack = document.querySelector("#wizardBack");
  const wizardContinue = document.querySelector("#wizardContinue");
  const wizardSubmit = document.querySelector("#wizardSubmit");
  const ticketInventoryRows = document.querySelector("#ticketInventoryRows");
  const ticketInventoryError = document.querySelector("#ticketInventoryError");
  const ticketVenueSummary = document.querySelector("#ticketVenueSummary");
  const ticketPhysicalCapacity = document.querySelector("#ticketPhysicalCapacity");
  const ticketSellableCapacity = document.querySelector("#ticketSellableCapacity");
  const ticketBlockedCapacity = document.querySelector("#ticketBlockedCapacity");
  const ticketPotentialRevenue = document.querySelector("#ticketPotentialRevenue");
  const ticketCapacityLabel = document.querySelector("#ticketCapacityLabel");
  const ticketCapacityBar = document.querySelector("#ticketCapacityBar");
  const eventImagePreview = document.querySelector("#eventImagePreview");
  const eventImagePreviewImage = document.querySelector("#eventImagePreviewImage");
  const eventImageEmpty = document.querySelector("#eventImageEmpty");
  const eventReview = document.querySelector("#eventReview");
  const eventEditorShell = document.querySelector("#eventEditorShell");
  const eventEditor = document.querySelector("#eventEditor");
  const eventEditorBack = document.querySelector("#eventEditorBack");
  const eventEditorHome = document.querySelector("#eventEditorHome");
  const previewSeatMap = document.querySelector("#previewSeatMap");
  const eventMapPreviewDialog = document.querySelector("#eventMapPreviewDialog");
  const eventMapPreviewCanvas = document.querySelector("#eventMapPreviewCanvas");
  const eventMapPreviewDescription = document.querySelector("#eventMapPreviewDescription");
  const categoryFilter = document.querySelector("#eventCategory");
  const analyticsPeriod = document.querySelector("#analyticsPeriod");
  const performanceSort = document.querySelector("#performanceSort");
  const performanceMore = document.querySelector("#performanceMore");
  const backButton = document.querySelector("#adminBack");
  const catalogForm = document.querySelector("#catalogForm");
  const catalogList = document.querySelector("#catalogList");
  const catalogMore = document.querySelector("#catalogMore");
  const catalogMoreButton = document.querySelector("#catalogMoreButton");

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const setMessage = (text, type = "") => {
    message.className = `admin-message ${type}`;
    message.textContent = text;
  };

  const formatRevenue = (value) => `${Number(value || 0).toFixed(2)}₾`;
  const formatActivityDate = (value) =>
    value ? new Date(value).toLocaleString() : "";
  const eventTickets = (eventId) =>
    state.ticketTypes.filter(
      (ticket) => String(ticket.event_id) === String(eventId),
    );
  const soldForTicket = (ticketId) =>
    state.orderItems
      .filter((item) => String(item.ticket_type_id) === String(ticketId))
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const eventStats = (event) => {
    const inventory = state.inventory.find(
      (item) => String(item.event_id) === String(event.id),
    );
    if (inventory) {
      return {
        remaining: Number(inventory.available_capacity || 0),
        total: Number(inventory.total_capacity || 0),
        sold: Number(inventory.sold_capacity || 0),
        reserved: Number(inventory.reserved_capacity || 0),
        blocked: Number(inventory.blocked_capacity || 0),
        soldOut: Number(inventory.available_capacity || 0) <= 0,
      };
    }
    const tickets = eventTickets(event.id);
    const remaining = tickets.reduce(
      (sum, ticket) => sum + Number(ticket.available_quantity || 0),
      0,
    );
    const total = tickets.reduce(
      (sum, ticket) => sum + Number(ticket.total_quantity || 0),
      0,
    );
    const sold = tickets.reduce(
      (sum, ticket) => sum + soldForTicket(ticket.id),
      0,
    );
    return {
      remaining,
      total,
      sold,
      blocked: 0,
      soldOut: tickets.length > 0 && remaining <= 0,
    };
  };

  async function loadData() {
    const [events, categories, tickets, orders, users, catalog, venues, inventory, eventCreationContext] =
      await Promise.all([
        client
          .from("events")
          .select(
            "id, performer, category_id, title, description, event_date, event_time, doors_open, venue_id, venue, city, country, image_url, status, venues:venues!events_venue_id_fkey(id, name, city_area, region, country, address, latitude, longitude, image_url), categories(id, name)",
          )
          .order("event_date", { ascending: true }),
        client.from("categories").select("id, name").order("name"),
        client
          .from("ticket_types")
          .select("id, event_id, name, canonical_tier, display_color, price, is_active, total_quantity, available_quantity"),
        client.from("order_items").select("ticket_type_id, quantity"),
        client.from("profiles").select("id", { count: "exact", head: true }),
        client
          .from("venue_catalog")
          .select("id, image_url, display_order, created_at")
          .order("display_order", { ascending: true }),
        client
          .from("venues")
          .select(
            "id, name, city_area, region, country, address, latitude, longitude, image_url",
          )
          .order("name"),
        client.rpc("get_admin_event_inventory"),
        client.rpc("get_admin_event_creation_context"),
      ]);
    for (const result of [events, categories, tickets, orders, catalog, venues, inventory, eventCreationContext])
      if (result.error) throw result.error;
    state.events = events.data || [];
    state.categories = categories.data || [];
    state.ticketTypes = tickets.data || [];
    state.orderItems = orders.data || [];
    state.users = users.count || 0;
    state.catalog = catalog.data || [];
    state.catalogVisibleCount = CATALOG_BATCH_SIZE;
    state.venues = venues.data || [];
    state.inventory = inventory.data || [];
    state.eventCreationContext = eventCreationContext.data || { venues: [], ticket_colors: {} };
    state.eventPage = 1;
    state.statsPage = 1;
    await loadAnalytics();
    renderAll();
    fillCategories();
    fillVenues();
    renderCatalog();
  }

  function resetCatalogForm() {
    catalogForm.reset();
    catalogForm.elements.id.value = "";
    catalogForm.elements.display_order.value = state.catalog.length + 1;
    document.querySelector("#cancelCatalogEdit").hidden = true;
  }

  function renderCatalog() {
    const visibleCatalog = state.catalog.slice(0, state.catalogVisibleCount);
    catalogList.innerHTML = visibleCatalog.length
      ? visibleCatalog
          .map(
            (item) =>
              `<article class="admin-catalog-row"><img src="${escapeHtml(item.image_url)}" alt="Venue catalog image ${item.display_order}" /><div><strong>Image ${item.display_order}</strong><span>${escapeHtml(item.image_url)}</span></div><div class="admin-event-actions"><button type="button" data-catalog-edit="${item.id}">Edit</button><button type="button" data-catalog-delete="${item.id}">Delete</button></div></article>`,
          )
          .join("")
      : '<p class="admin-message">No catalog images found.</p>';
    updateCatalogMoreButton();
  }

  function updateCatalogMoreButton() {
    if (!catalogMore || !catalogMoreButton) return;
    catalogMore.hidden = state.catalog.length <= CATALOG_BATCH_SIZE;
    catalogMoreButton.textContent =
      state.catalogVisibleCount >= state.catalog.length
        ? "See Less"
        : "See More";
  }

  function fillCatalogForm(item) {
    catalogForm.elements.id.value = item.id;
    catalogForm.elements.image_url.value = item.image_url;
    catalogForm.elements.display_order.value = item.display_order;
    document.querySelector("#cancelCatalogEdit").hidden = false;
  }

  async function loadAnalytics() {
    state.performanceVisible = 10;
    const { data, error } = await client.rpc("get_admin_event_analytics", {
      p_period: analyticsPeriod.value,
    });
    if (error) throw error;
    state.analytics = data || null;
    renderAnalytics();
  }

  function renderPagination(container, currentPage, totalItems, onPageChange) {
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = Array.from({ length: totalPages }, (_, index) => {
      const page = index + 1;
      return `<button class="admin-pagination-button${page === currentPage ? " is-active" : ""}" data-page="${page}" type="button" aria-label="Go to page ${page}"${page === currentPage ? ' aria-current="page"' : ""}>${page}</button>`;
    }).join("");
    container.querySelectorAll("[data-page]").forEach((button) => {
      button.addEventListener("click", () =>
        onPageChange(Number(button.dataset.page)),
      );
    });
  }

  function renderOverview() {
    const stats = state.events.map(eventStats);
    const totalSold = stats.reduce((sum, item) => sum + item.sold, 0);
    const totalRemaining = stats.reduce((sum, item) => sum + item.remaining, 0);
    const soldOut = stats.filter((item) => item.soldOut).length;
    metrics.innerHTML = [
      ["Total events", state.events.length],
      ["Tickets sold", totalSold],
      ["Sold-out events", soldOut],
      ["Tickets available", totalRemaining],
      ["Total users", state.users],
    ]
      .map(
        ([label, value]) =>
          `<article class="admin-metric"><strong>${value}</strong><span>${label}</span></article>`,
      )
      .join("");
  }

  function renderAnalyticsList(containerId, items, valueLabel) {
    const container = document.querySelector(`#${containerId}`);
    if (!container) return;
    container.innerHTML = items?.length
      ? items
          .map(
            (item) =>
              `<div class="analytics-list-row"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(valueLabel(item))}</span></div>`,
          )
          .join("")
      : '<p class="analytics-empty">No data for this period.</p>';
  }

  function renderAnalytics() {
    const analytics = state.analytics;
    if (!analytics) return;
    const overview = analytics.overview || {};
    metrics.innerHTML = [
      ["Total users", overview.total_users],
      ["Total events", overview.total_events],
      ["Event views", overview.total_event_views],
      ["Cart additions", overview.total_cart_additions],
      ["Tickets sold", overview.total_tickets_sold],
      ["Revenue", formatRevenue(overview.total_revenue)],
    ]
      .map(
        ([label, value]) =>
          `<article class="admin-metric"><strong>${escapeHtml(value)}</strong><span>${label}</span></article>`,
      )
      .join("");

    renderAnalyticsList(
      "topCartAdditions",
      analytics.top_cart_additions,
      (item) => `${item.cart_adds} additions`,
    );
    renderAnalyticsList(
      "topViews",
      analytics.top_views,
      (item) => `${item.views} views`,
    );
    renderAnalyticsList(
      "topSales",
      analytics.top_sales,
      (item) => `${item.tickets_sold} sold · ${formatRevenue(item.revenue)}`,
    );

    const category = analytics.popular_category || {};
    document.querySelector("#popularCategory").innerHTML = category.category
      ? `<div class="popular-category"><strong>${escapeHtml(category.category)}</strong><span>${category.event_count} events · ${category.engagement} tickets sold</span></div>`
      : '<p class="analytics-empty">No category sales yet.</p>';

    const recent = document.querySelector("#recentActivity");
    const fiveMostRecentActivities = [...(analytics.recent_activity || [])]
      .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
      .slice(0, 5);
    recent.innerHTML = fiveMostRecentActivities.length
      ? fiveMostRecentActivities
          .map(
            (item) =>
              `<div class="analytics-activity"><strong>${escapeHtml(item.activity_type)}</strong><span>${escapeHtml(item.event_title || "")}</span><time>${escapeHtml(formatActivityDate(item.created_at))}</time></div>`,
          )
          .join("")
      : '<p class="analytics-empty">No recent activity.</p>';

    renderPerformanceTable();
  }

  function renderPerformanceTable() {
    const rows = [...(state.analytics?.performance || [])];
    const sortKey = performanceSort.value;
    rows.sort((first, second) => {
      if (sortKey === "performance") {
        return (
          second.views +
          second.cart_adds +
          second.tickets_sold -
          (first.views + first.cart_adds + first.tickets_sold)
        );
      }
      return Number(second[sortKey] || 0) - Number(first[sortKey] || 0);
    });
    const visibleRows = rows.slice(0, state.performanceVisible);
    document.querySelector("#performanceTable").innerHTML = visibleRows.length
      ? visibleRows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.category)}</td><td>${row.views}</td><td>${row.cart_adds}</td><td>${row.tickets_sold}</td><td>${formatRevenue(row.revenue)}</td></tr>`,
          )
          .join("")
      : '<tr><td colspan="6" class="analytics-empty">No event data.</td></tr>';
    const hasMore = state.performanceVisible < rows.length;
    performanceMore.hidden = rows.length <= 10;
    performanceMore.textContent = hasMore ? "See More" : "See Less";
  }

  function renderEvents() {
    const search = document.querySelector("#eventSearch").value.toLowerCase();
    const statusFilter = document.querySelector("#eventStatus").value;
    const selectedCategory = categoryFilter.value;
    const availability = document.querySelector("#eventAvailability").value;
    const filtered = state.events.filter((event) => {
      const stats = eventStats(event);
      const category = event.categories?.name || "";
      const location = getEventLocation(event);
      const text =
        `${event.title} ${event.performer} ${location.venue} ${location.details} ${category}`.toLowerCase();
      return (
        (!search || text.includes(search)) &&
        (!statusFilter || event.status === statusFilter) &&
        (!selectedCategory || event.category_id === selectedCategory) &&
        (!availability ||
          (availability === "sold-out" ? stats.soldOut : !stats.soldOut))
      );
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.eventPage = Math.min(state.eventPage, totalPages);
    const pageStart = (state.eventPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);
    eventList.innerHTML = pageItems.length
      ? pageItems
          .map((event) => {
            const stats = eventStats(event);
            const location = getEventLocation(event);
            return `<article class="admin-event-row"><div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.performer)} · ${escapeHtml(event.categories?.name || "Uncategorized")} · ${escapeHtml(event.event_date)} · ${escapeHtml(event.event_time)} · ${escapeHtml(location.text)}</span><span>${stats.sold} sold / ${stats.remaining} available${stats.blocked ? ` / ${stats.blocked} blocked` : ""}</span></div><span class="admin-badge">${escapeHtml(event.status || "active")}</span><div class="admin-event-actions"><button data-edit="${event.id}" type="button">Edit</button><button data-delete="${event.id}" type="button">Delete</button></div></article>`;
          })
          .join("")
      : '<p class="admin-message">No matching events.</p>';
    renderPagination(
      eventsPagination,
      state.eventPage,
      filtered.length,
      (page) => {
        state.eventPage = page;
        renderEvents();
      },
    );
  }

  function renderStats() {
    const totalPages = Math.max(1, Math.ceil(state.events.length / PAGE_SIZE));
    state.statsPage = Math.min(state.statsPage, totalPages);
    const pageStart = (state.statsPage - 1) * PAGE_SIZE;
    statsList.innerHTML =
      state.events
        .slice(pageStart, pageStart + PAGE_SIZE)
        .map((event) => {
          const stats = eventStats(event);
          return `<div class="admin-stat-line"><strong>${escapeHtml(event.title)}</strong><span>${stats.sold} sold</span><span>${stats.remaining} remaining</span>${stats.blocked ? `<span>${stats.blocked} blocked</span>` : ""}</div>`;
        })
        .join("") || '<p class="admin-message">No events found.</p>';
    renderPagination(
      statsPagination,
      state.statsPage,
      state.events.length,
      (page) => {
        state.statsPage = page;
        renderStats();
      },
    );
  }

  function renderAll() {
    renderOverview();
    renderEvents();
    renderStats();
    renderAnalytics();
  }

  function fillCategories() {
    categorySelect.innerHTML =
      '<option value="">Select category</option>' +
      state.categories
        .map(
          (category) =>
            `<option value="${category.id}">${escapeHtml(category.name)}</option>`,
        )
        .join("");
    categoryFilter.innerHTML =
      '<option value="">All categories</option>' +
      state.categories
        .map(
          (category) =>
            `<option value="${category.id}">${escapeHtml(category.name)}</option>`,
        )
        .join("");
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
      details: details.join(", "),
      text: [venue?.name ?? event?.venue ?? "", details.join(", ")]
        .filter(Boolean)
        .join(", "),
    };
  }

  function renderVenuePreview(venueId) {
    const venue = state.eventCreationContext.venues.find((item) => item.id === venueId)
      || state.venues.find((item) => item.id === venueId);
    if (!venue) {
      venuePreview.replaceChildren();
      venuePreview.hidden = true;
      return;
    }

    const location = [
      ...new Set([venue.city_area, venue.region, venue.country].filter(Boolean)),
    ].join(", ");
    venuePreview.innerHTML = `<strong>${escapeHtml(venue.name)}</strong><span>${escapeHtml(location || venue.address || "Venue details unavailable")}</span><span>Hall map: ${escapeHtml(venue.name)} · Capacity: ${formatSeatNumber(venue.physical_capacity || 0)}</span>`;
    venuePreview.hidden = false;
  }

  function fillVenues() {
    const selectedVenueId = venueSelect.value;
    venueSelect.innerHTML =
      '<option value="">Select venue</option>' +
      state.venues
        .map(
          (venue) =>
            `<option value="${venue.id}">${escapeHtml(venue.name)}</option>`,
        )
        .join("");
    venueSelect.value = state.venues.some(
      (venue) => venue.id === selectedVenueId,
    )
      ? selectedVenueId
      : "";
    renderVenuePreview(venueSelect.value);
  }

  const formatSeatNumber = (value) => Number(value || 0).toLocaleString();
  // Legacy standalone ticket and section CRUD is intentionally retired.

  // The wizard keeps its draft only in browser state until this single final RPC.
  const TICKET_TIERS = Object.freeze([
    { id: "cheap", name: "Cheap / Standard" },
    { id: "medium", name: "Medium / Premium" },
    { id: "expensive", name: "Expensive" },
    { id: "vip", name: "VIP" },
  ]);

  function selectedVenueContext() {
    return state.eventCreationContext.venues.find((venue) => venue.id === venueSelect.value)
      || state.venues.find((venue) => venue.id === venueSelect.value)
      || null;
  }

  function ticketColorForTier(tier) {
    const existing = state.ticketTypes.find((ticket) => ticket.canonical_tier === tier);
    return state.eventCreationContext.ticket_colors?.[tier] || existing?.display_color || "#ff9475";
  }

  function createTicketDraft() {
    return Object.fromEntries(TICKET_TIERS.map((tier) => {
      const existing = state.ticketTypes.find((ticket) => ticket.canonical_tier === tier.id);
      return [tier.id, {
        quantity: 0,
        price: Number(existing?.price || 0),
        color: ticketColorForTier(tier.id),
      }];
    }));
  }

  function currentTicketInventory() {
    if (!state.wizardTickets) state.wizardTickets = createTicketDraft();
    return TICKET_TIERS.map((tier) => ({
      canonical_tier: tier.id,
      name: tier.name,
      quantity: Math.max(0, Number(state.wizardTickets[tier.id]?.quantity || 0)),
      price: Math.max(0, Number(state.wizardTickets[tier.id]?.price || 0)),
      color: state.wizardTickets[tier.id]?.color || ticketColorForTier(tier.id),
    }));
  }

  function setWizardMessage(text = "") {
    wizardMessage.textContent = text;
    wizardMessage.hidden = !text;
  }

  function getInventoryValidation() {
    const venue = selectedVenueContext();
    const inventory = currentTicketInventory();
    if (!venue) return { valid: false, message: "Choose a venue before configuring ticket inventory." };
    const total = inventory.reduce((sum, tier) => sum + tier.quantity, 0);
    const tierOverage = inventory.find((tier) => tier.quantity > Number(venue.tier_capacities?.[tier.canonical_tier] || 0));
    if (tierOverage) {
      const capacity = Number(venue.tier_capacities?.[tierOverage.canonical_tier] || 0);
      return { valid: false, message: `${tierOverage.name} exceeds its physical venue inventory by ${formatSeatNumber(tierOverage.quantity - capacity)} seats.` };
    }
    if (total > Number(venue.physical_capacity || 0)) {
      return { valid: false, message: `Configured ticket quantity exceeds venue capacity by ${formatSeatNumber(total - Number(venue.physical_capacity || 0))} seats.` };
    }
    return { valid: true, venue, inventory, total };
  }

  function updateWizardControls() {
    const review = state.wizardStep === 5;
    wizardBack.hidden = state.wizardStep === 1;
    wizardContinue.hidden = review;
    wizardSubmit.hidden = !review;
    wizardContinue.disabled = state.wizardStep === 4 && !getInventoryValidation().valid;
    wizardSubmit.textContent = form.elements.id.value ? "Save changes" : "Create event";
    wizardStepButtons.forEach((button) => {
      const step = Number(button.dataset.eventStep);
      button.classList.toggle("is-active", step === state.wizardStep);
      button.classList.toggle("is-complete", step < state.wizardHighestStep);
      button.toggleAttribute("aria-current", step === state.wizardStep);
      button.disabled = step > state.wizardHighestStep;
    });
  }

  function renderTicketInventory() {
    const venue = selectedVenueContext();
    const inventory = currentTicketInventory();
    ticketInventoryRows.innerHTML = inventory.map((tier) => {
      const capacity = Number(venue?.tier_capacities?.[tier.canonical_tier] || 0);
      return `<div class="admin-ticket-row" role="row" data-ticket-tier="${tier.canonical_tier}">
        <div class="admin-ticket-row__tier" role="cell" style="--ticket-color: ${escapeHtml(tier.color)}"><i aria-hidden="true"></i><div><strong>${escapeHtml(tier.name)}</strong><span>${venue ? `${formatSeatNumber(capacity)} physical seats` : "Select a venue first"}</span></div></div>
        <label role="cell"><span class="sr-only">${escapeHtml(tier.name)} sellable seats</span><input data-ticket-quantity type="number" min="0" max="${capacity}" step="1" value="${tier.quantity}" inputmode="numeric" /></label>
        <label role="cell"><span class="sr-only">${escapeHtml(tier.name)} price</span><input data-ticket-price type="number" min="0" step="0.01" value="${tier.price}" inputmode="decimal" /></label>
      </div>`;
    }).join("");
    const validation = getInventoryValidation();
    const physical = Number(venue?.physical_capacity || 0);
    const sellable = validation.total ?? inventory.reduce((sum, tier) => sum + tier.quantity, 0);
    ticketVenueSummary.innerHTML = venue
      ? `<strong>${escapeHtml(venue.name)}</strong><span>Hall map: ${escapeHtml(venue.name)} · Physical capacity: ${formatSeatNumber(physical)}</span>`
      : "Select a venue to configure its ticket inventory.";
    ticketPhysicalCapacity.textContent = venue ? formatSeatNumber(physical) : "—";
    ticketSellableCapacity.textContent = formatSeatNumber(sellable);
    ticketBlockedCapacity.textContent = venue ? formatSeatNumber(Math.max(0, physical - sellable)) : "—";
    ticketPotentialRevenue.textContent = `₾${inventory.reduce((sum, tier) => sum + tier.quantity * tier.price, 0).toFixed(2)}`;
    ticketCapacityLabel.textContent = venue
      ? `${formatSeatNumber(sellable)} / ${formatSeatNumber(physical)} seats configured`
      : "Choose a venue to see its capacity.";
    ticketCapacityBar.style.width = venue && physical ? `${Math.min(100, (sellable / physical) * 100)}%` : "0%";
    ticketInventoryError.textContent = validation.valid ? "" : validation.message;
    ticketInventoryError.hidden = validation.valid;
    updateWizardControls();
  }

  function updateImagePreview() {
    const imageUrl = form.elements.image_url.value.trim();
    eventImagePreview.hidden = true;
    eventImageEmpty.hidden = false;
    eventImagePreviewImage.removeAttribute("src");
    if (imageUrl && form.elements.image_url.checkValidity()) eventImagePreviewImage.src = imageUrl;
  }

  eventImagePreviewImage.addEventListener("load", () => {
    eventImagePreview.hidden = false;
    eventImageEmpty.hidden = true;
  });
  eventImagePreviewImage.addEventListener("error", () => {
    eventImagePreview.hidden = true;
    eventImageEmpty.hidden = false;
  });

  function validateStep(step) {
    const panel = wizardStepPanels.find((item) => Number(item.dataset.eventStepPanel) === step);
    let firstInvalid = null;
    if (step < 4) {
      panel.querySelectorAll("input[required], select[required], textarea[required]").forEach((field) => {
        const valid = field.checkValidity();
        field.classList.toggle("is-invalid", !valid);
        if (!valid && !firstInvalid) firstInvalid = field;
      });
    }
    if (firstInvalid) {
      setWizardMessage("Complete the required fields before continuing.");
      firstInvalid.focus();
      return false;
    }
    if (step === 4 && !getInventoryValidation().valid) {
      setWizardMessage(getInventoryValidation().message);
      return false;
    }
    setWizardMessage("");
    return true;
  }

  function renderReview() {
    const values = new FormData(form);
    const venue = selectedVenueContext();
    const category = state.categories.find((item) => item.id === values.get("category_id"));
    const inventory = currentTicketInventory();
    const totals = getInventoryValidation();
    const edit = (step, label) => `<button type="button" data-review-edit="${step}">Edit ${label}</button>`;
    eventReview.innerHTML = `
      <section class="admin-review-section"><div class="admin-review-section__head"><h4>Event</h4>${edit(1, "event")}</div><strong>${escapeHtml(values.get("title") || "Untitled event")}</strong><span>${escapeHtml(values.get("performer") || "No performer")} · ${escapeHtml(category?.name || "No category")}</span><span>${escapeHtml(values.get("description") || "No description")}</span></section>
      <section class="admin-review-section"><div class="admin-review-section__head"><h4>Schedule</h4>${edit(2, "schedule")}</div><strong>${escapeHtml(values.get("event_date") || "No date")} · ${escapeHtml(values.get("event_time") || "No time")}</strong><span>Doors open ${escapeHtml(values.get("doors_open") || "—")}</span></section>
      <section class="admin-review-section"><div class="admin-review-section__head"><h4>Venue</h4>${edit(2, "venue")}</div><strong>${escapeHtml(venue?.name || "No venue")}</strong><span>Hall map: ${escapeHtml(venue?.name || "—")} · ${formatSeatNumber(venue?.physical_capacity || 0)} physical seats</span></section>
      <section class="admin-review-section"><div class="admin-review-section__head"><h4>Media</h4>${edit(3, "media")}</div><div class="admin-review-media">${values.get("image_url") ? `<img src="${escapeHtml(values.get("image_url"))}" alt="" />` : ""}<span>${values.get("image_url") ? "Main event image selected." : "No image selected."}</span></div></section>
      <section class="admin-review-section admin-review-section--wide"><div class="admin-review-section__head"><h4>Tickets</h4>${edit(4, "tickets")}</div>${inventory.map((tier) => `<span class="admin-review-ticket-row">${escapeHtml(tier.name)} · ${formatSeatNumber(tier.quantity)} × ₾${tier.price.toFixed(2)}</span>`).join("")}</section>
      <section class="admin-review-section admin-review-section--wide"><div class="admin-review-section__head"><h4>Inventory</h4>${edit(4, "inventory")}</div><strong>${formatSeatNumber(venue?.physical_capacity || 0)} physical · ${formatSeatNumber(totals.total || 0)} sellable · ${formatSeatNumber(Math.max(0, Number(venue?.physical_capacity || 0) - Number(totals.total || 0)))} blocked</strong><span>Potential revenue ₾${inventory.reduce((sum, tier) => sum + tier.quantity * tier.price, 0).toFixed(2)}</span></section>`;
  }

  function showWizardStep(step, validateCurrent = false) {
    if (step < 1 || step > 5 || step > state.wizardHighestStep + 1) return;
    if (validateCurrent && step > state.wizardStep && !validateStep(state.wizardStep)) return;
    state.wizardHighestStep = Math.max(state.wizardHighestStep, step);
    state.wizardStep = step;
    wizardStepPanels.forEach((panel) => {
      const active = Number(panel.dataset.eventStepPanel) === step;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    if (step === 4) renderTicketInventory();
    if (step === 5) renderReview();
    updateWizardControls();
  }

  function resetForm() {
    form.reset();
    form.elements.id.value = "";
    form.elements.status.value = "active";
    state.wizardTickets = createTicketDraft();
    state.wizardStep = 1;
    state.wizardHighestStep = 1;
    state.wizardDirty = false;
    renderVenuePreview("");
    updateImagePreview();
    document.querySelector("#eventFormTitle").textContent = "Add new event";
    document.querySelector("#eventFormEyebrow").textContent = "Publish to the calendar";
    document.querySelector("#eventFormSubtitle").textContent = "Create and configure a new iVenue event.";
    document.querySelector("#cancelEventEdit").hidden = true;
    showWizardStep(1);
  }

  async function loadExistingWizardInventory(eventId) {
    const { data, error } = await client.rpc("get_admin_event_seating_configuration", { p_event_id: eventId });
    if (error) throw error;
    const existing = new Map((data?.ticket_types || []).map((ticket) => [ticket.canonical_tier, ticket]));
    state.wizardTickets = Object.fromEntries(TICKET_TIERS.map((tier) => {
      const ticket = existing.get(tier.id);
      // `capacity` includes blocked canonical seats. Only seats that are
      // available, reserved, or sold are part of the sellable inventory.
      const sellableQuantity = Number(ticket?.available || 0)
        + Number(ticket?.reserved || 0)
        + Number(ticket?.sold || 0);
      return [tier.id, { quantity: sellableQuantity, price: Number(ticket?.price || 0), color: ticket?.display_color || ticketColorForTier(tier.id) }];
    }));
    renderTicketInventory();
  }

  function fillForm(event) {
    Object.entries({ id: event.id, title: event.title, performer: event.performer, category_id: event.category_id, event_date: event.event_date, event_time: event.event_time, doors_open: event.doors_open, status: event.status || "active", venue_id: event.venue_id, image_url: event.image_url, description: event.description }).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value || "";
    });
    state.wizardStep = 1;
    state.wizardHighestStep = 5;
    state.wizardDirty = false;
    renderVenuePreview(venueSelect.value);
    updateImagePreview();
    document.querySelector("#eventFormTitle").textContent = "Edit event";
    document.querySelector("#eventFormEyebrow").textContent = "Event management";
    document.querySelector("#eventFormSubtitle").textContent = "Review details and inventory without changing sold or reserved seats.";
    document.querySelector("#cancelEventEdit").hidden = false;
    loadExistingWizardInventory(event.id).catch((error) => setWizardMessage(error.message || "Ticket inventory could not be loaded."));
    showWizardStep(1);
    enterEventEditor();
  }

  async function saveEvent() {
    const values = new FormData(form);
    const payload = Object.fromEntries(["title", "performer", "category_id", "description", "event_date", "event_time", "doors_open", "venue_id", "image_url", "status"].map((key) => [key, String(values.get(key) || "").trim()]));
    state.wizardSaving = true;
    wizardSubmit.disabled = true;
    try {
      const { data, error } = await client.rpc("admin_save_event_with_inventory", {
        p_event_id: values.get("id") || null,
        p_event: payload,
        p_ticket_inventory: currentTicketInventory().map(({ canonical_tier, quantity, price }) => ({ canonical_tier, quantity, price })),
      });
      if (error) throw error;
      setMessage(values.get("id") ? "Event and canonical inventory updated." : "Event and canonical inventory created.", "success");
      resetForm();
      await loadData();
      return data;
    } finally {
      state.wizardSaving = false;
      wizardSubmit.disabled = false;
    }
  }

  function blueprintForVenue(venue) {
    if (!venue) return null;
    if (venue.name === "Black Sea Arena") return window.blackSeaArenaBlueprint || null;
    if (venue.id === window.dinamoArenaBlueprint?.venueId) return window.dinamoArenaBlueprint;
    if (venue.id === window.theatreBlueprint?.venueId) return window.theatreBlueprint;
    return null;
  }

  function renderHallMapPreview() {
    const venue = selectedVenueContext();
    const blueprint = blueprintForVenue(venue);
    eventMapPreviewCanvas.replaceChildren();
    if (!venue || !blueprint) {
      eventMapPreviewDescription.textContent = venue ? `${venue.name} has no approved draft geometry available for preview.` : "Choose a venue before previewing the hall map.";
      eventMapPreviewCanvas.innerHTML = '<p class="admin-map-preview__empty">No geometry has been invented for this venue. Canonical inventory is still configured from its physical capacity.</p>';
      return;
    }
    eventMapPreviewDescription.textContent = `${venue.name} geometry with draft ticket-tier colors. This preview does not create, reserve, or sell seats.`;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", blueprint.viewBox.join(" "));
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${venue.name} draft hall map`);
    const tierByLabel = { "Cheap / Standard": "cheap", "Medium / Premium": "medium", Expensive: "expensive", VIP: "vip" };
    if (blueprint.outerBoundary) {
      const ellipse = document.createElementNS(svg.namespaceURI, "ellipse");
      Object.entries(blueprint.outerBoundary).filter(([key]) => key !== "type").forEach(([key, value]) => ellipse.setAttribute(key, value));
      ellipse.setAttribute("class", "preview-focal");
      svg.appendChild(ellipse);
    }
    if (blueprint.stage) {
      const stage = document.createElementNS(svg.namespaceURI, "ellipse");
      Object.entries(blueprint.stage).forEach(([key, value]) => stage.setAttribute(key, value));
      stage.setAttribute("class", "preview-focal");
      svg.appendChild(stage);
    }
    const focal = blueprint.field || blueprint.focalElement;
    if (focal) {
      const rect = document.createElementNS(svg.namespaceURI, "rect");
      ["x", "y", "width", "height", "rx"].forEach((key) => focal[key] != null && rect.setAttribute(key, focal[key]));
      rect.setAttribute("class", "preview-focal");
      svg.appendChild(rect);
    }
    (blueprint.sections || []).filter((section) => section.selectable !== false).forEach((section) => {
      const polygon = document.createElementNS(svg.namespaceURI, "polygon");
      const tier = tierByLabel[section.ticketTier];
      polygon.setAttribute("points", section.polygon.map((point) => point.join(",")).join(" "));
      polygon.setAttribute("fill", state.wizardTickets?.[tier]?.color || ticketColorForTier(tier));
      polygon.setAttribute("fill-opacity", "0.72");
      polygon.setAttribute("class", "preview-seat-section");
      svg.appendChild(polygon);
    });
    eventMapPreviewCanvas.appendChild(svg);
  }

  function activeDashboardPanel() {
    return document.querySelector(".admin-panel.is-active")?.dataset.panel || "overview";
  }

  function setActiveDashboardPanel(panel) {
    document.querySelectorAll(".admin-nav button, .admin-panel").forEach((element) => {
      element.classList.toggle("is-active", element.dataset.panel === panel);
    });
  }

  function playEventEditorEntrance() {
    eventEditor.classList.remove("is-entering");
    void eventEditor.offsetWidth;
    window.requestAnimationFrame(() => eventEditor.classList.add("is-entering"));
  }

  function enterEventEditor() {
    if (!document.body.classList.contains("event-editor-mode")) {
      const currentPanel = activeDashboardPanel();
      state.editorReturnPanel = currentPanel === "add-event" ? "overview" : currentPanel;
      state.editorReturnScrollY = window.scrollY;
    }
    setActiveDashboardPanel("add-event");
    document.body.classList.add("event-editor-mode");
    eventEditorShell.scrollTop = 0;
    playEventEditorEntrance();
  }

  function leaveEventEditor(destination = state.editorReturnPanel, scrollY = state.editorReturnScrollY) {
    if (eventMapPreviewDialog.open) eventMapPreviewDialog.close();
    eventEditor.classList.remove("is-entering");
    document.body.classList.remove("event-editor-mode");
    setActiveDashboardPanel(destination || "overview");
    window.requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0 }));
  }

  function requestEventEditorExit(destination) {
    if (state.wizardDirty && !window.confirm("Discard unsaved event changes?")) return;
    resetForm();
    leaveEventEditor(destination, destination ? 0 : state.editorReturnScrollY);
  }

  document.querySelectorAll(".admin-nav button").forEach((button) =>
    button.addEventListener("click", () => {
      if (button.dataset.panel === "add-event") {
        resetForm();
        enterEventEditor();
        return;
      }
      setActiveDashboardPanel(button.dataset.panel);
    }),
  );
  ["eventSearch", "eventStatus", "eventCategory", "eventAvailability"].forEach(
    (id) =>
      document.querySelector(`#${id}`).addEventListener("input", () => {
        state.eventPage = 1;
        renderEvents();
      }),
  );
  document
    .querySelector("#refreshAdmin")
    .addEventListener("click", () =>
      loadData().catch((error) => setMessage(error.message, "error")),
    );
  analyticsPeriod.addEventListener("change", () =>
    loadAnalytics().catch((error) => setMessage(error.message, "error")),
  );
  performanceSort.addEventListener("change", () => {
    state.performanceVisible = 10;
    renderPerformanceTable();
  });
  performanceMore.addEventListener("click", () => {
    const total = state.analytics?.performance?.length || 0;
    state.performanceVisible =
      state.performanceVisible < total
        ? Math.min(state.performanceVisible + 10, total)
        : 10;
    renderPerformanceTable();
  });
  function requestWizardCancel() {
    requestEventEditorExit();
  }

  document.querySelector("#cancelEventEdit").addEventListener("click", requestWizardCancel);
  document.querySelector("#cancelEventWizard").addEventListener("click", requestWizardCancel);
  eventEditorBack.addEventListener("click", () => requestEventEditorExit());
  eventEditorHome.addEventListener("click", () => requestEventEditorExit("overview"));
  venueSelect.addEventListener("change", () => {
    renderVenuePreview(venueSelect.value);
    renderTicketInventory();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.wizardStep !== 5) {
      showWizardStep(state.wizardStep + 1, true);
      return;
    }
    if (!validateStep(4)) return;
    saveEvent(event).catch((error) => {
      console.error(error);
      setWizardMessage(error.message || "Event could not be saved.");
    });
  });
  wizardContinue.addEventListener("click", () => showWizardStep(state.wizardStep + 1, true));
  wizardBack.addEventListener("click", () => showWizardStep(state.wizardStep - 1));
  wizardStepButtons.forEach((button) => button.addEventListener("click", () => showWizardStep(Number(button.dataset.eventStep))));
  form.addEventListener("input", (event) => {
    state.wizardDirty = true;
    if (event.target.name === "image_url") updateImagePreview();
  });
  form.addEventListener("change", () => { state.wizardDirty = true; });
  ticketInventoryRows.addEventListener("input", (event) => {
    const row = event.target.closest("[data-ticket-tier]");
    if (!row || !state.wizardTickets) return;
    const tier = row.dataset.ticketTier;
    if (event.target.matches("[data-ticket-quantity]")) state.wizardTickets[tier].quantity = Math.max(0, Number(event.target.value || 0));
    if (event.target.matches("[data-ticket-price]")) state.wizardTickets[tier].price = Math.max(0, Number(event.target.value || 0));
    state.wizardDirty = true;
    renderTicketInventory();
  });
  eventReview.addEventListener("click", (event) => {
    const button = event.target.closest("[data-review-edit]");
    if (button) showWizardStep(Number(button.dataset.reviewEdit));
  });
  previewSeatMap.addEventListener("click", () => {
    renderHallMapPreview();
    if (typeof eventMapPreviewDialog.showModal === "function") eventMapPreviewDialog.showModal();
  });
  document.querySelector("#eventMapPreviewClose").addEventListener("click", () => eventMapPreviewDialog.close());
  document
    .querySelector("#cancelCatalogEdit")
    .addEventListener("click", resetCatalogForm);
  catalogMoreButton.addEventListener("click", () => {
    if (state.catalogVisibleCount < state.catalog.length) {
      state.catalogVisibleCount = Math.min(
        state.catalogVisibleCount + CATALOG_BATCH_SIZE,
        state.catalog.length,
      );
      renderCatalog();
      return;
    }

    state.catalogVisibleCount = CATALOG_BATCH_SIZE;
    renderCatalog();
    catalogList.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  catalogForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(catalogForm);
    const payload = {
      image_url: values.get("image_url").trim(),
      display_order: Number(values.get("display_order")),
    };
    const id = values.get("id");
    try {
      const result = id
        ? await client.from("venue_catalog").update(payload).eq("id", id)
        : await client.from("venue_catalog").insert(payload);
      if (result.error) throw result.error;
      setMessage(
        id ? "Catalog image updated." : "Catalog image added.",
        "success",
      );
      resetCatalogForm();
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Catalog image could not be saved.", "error");
    }
  });
  catalogList.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-catalog-edit]");
    const remove = event.target.closest("[data-catalog-delete]");
    if (edit) {
      const item = state.catalog.find(
        (candidate) => String(candidate.id) === edit.dataset.catalogEdit,
      );
      if (item) fillCatalogForm(item);
    }
    if (remove) {
      const item = state.catalog.find(
        (candidate) => String(candidate.id) === remove.dataset.catalogDelete,
      );
      if (!item || !window.confirm("Delete this catalog image?")) return;
      try {
        const result = await client
          .from("venue_catalog")
          .delete()
          .eq("id", item.id);
        if (result.error) throw result.error;
        setMessage("Catalog image deleted.", "success");
        await loadData();
      } catch (error) {
        console.error(error);
        setMessage(
          error.message || "Catalog image could not be deleted.",
          "error",
        );
      }
    }
  });
  eventList.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    if (edit)
      fillForm(
        state.events.find((item) => String(item.id) === edit.dataset.edit),
      );
    if (remove) {
      const item = state.events.find(
        (candidate) => String(candidate.id) === remove.dataset.delete,
      );
      if (!item || !window.confirm(`Delete ${item.title}?`)) return;
      try {
        const result = await client.from("events").delete().eq("id", item.id);
        if (result.error) throw result.error;
        setMessage("Event deleted.", "success");
        await loadData();
      } catch (error) {
        console.error(error);
        setMessage(
          "Event could not be deleted. Related tickets or orders may reference it.",
          "error",
        );
      }
    }
  });
  document
    .querySelector("#adminLogout")
    .addEventListener("click", () =>
      window.authApi.signOut({ redirectTo: "admin-login.html" }),
    );
  backButton.addEventListener("click", () => {
    const previousPage = document.referrer;
    if (
      previousPage &&
      new URL(previousPage).origin === window.location.origin
    ) {
      window.history.back();
      return;
    }
    window.location.href = "index.html";
  });

  (async () => {
    try {
      const session = await window.authApi.getSession();
      if (!session?.user) return window.location.replace("admin-login.html");
      const { data: admin, error } = await client
        .from("admin_users")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error || !admin) {
        await window.authApi.signOut();
        return window.location.replace("admin-login.html");
      }
      document.body.classList.remove("admin-gated");
      status.textContent = "Authorized administrator";
      await loadData();
      resetForm();
      resetCatalogForm();
    } catch (error) {
      console.error(error);
      status.textContent = "Unable to load admin dashboard.";
    }
  })();
})();
