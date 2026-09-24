(() => {
  const PAGE_SIZE = 5;
  const EVENTS_PAGE_SIZE = 8;
  const CATALOG_BATCH_SIZE = 10;
  const PUBLIC_EVENTS_PER_PAGE = window.iVenueEventListing?.pageSize;
  if (!Number.isInteger(PUBLIC_EVENTS_PER_PAGE) || PUBLIC_EVENTS_PER_PAGE < 1) {
    throw new Error(
      "The shared public event listing page size is unavailable.",
    );
  }
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
    saveSuccessTimeout: null,
    editorReturnPanel: "overview",
    editorReturnScrollY: 0,
    heroConfig: { mode: "latest_added", display_limit: 3, event_ids: [] },
    heroPreview: [],
    heroPreviewMode: "latest_added",
    upcomingShowsConfig: {
      mode: "latest_added",
      display_limit: 4,
      event_ids: [],
    },
    upcomingShowsPreview: [],
    upcomingShowsPreviewMode: "latest_added",
    refreshing: false,
    deletingEvent: false,
    eventPendingDeletion: null,
  };
  let expoGeorgiaPavilion11BlueprintPromise = null;
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
  const wizardStepPanels = [
    ...document.querySelectorAll("[data-event-step-panel]"),
  ];
  const wizardBack = document.querySelector("#wizardBack");
  const wizardContinue = document.querySelector("#wizardContinue");
  const wizardSubmit = document.querySelector("#wizardSubmit");
  const ticketInventoryRows = document.querySelector("#ticketInventoryRows");
  const ticketInventoryError = document.querySelector("#ticketInventoryError");
  const ticketVenueSummary = document.querySelector("#ticketVenueSummary");
  const ticketPhysicalCapacity = document.querySelector(
    "#ticketPhysicalCapacity",
  );
  const ticketSellableCapacity = document.querySelector(
    "#ticketSellableCapacity",
  );
  const ticketBlockedCapacity = document.querySelector(
    "#ticketBlockedCapacity",
  );
  const ticketPotentialRevenue = document.querySelector(
    "#ticketPotentialRevenue",
  );
  const ticketCapacityLabel = document.querySelector("#ticketCapacityLabel");
  const ticketCapacityBar = document.querySelector("#ticketCapacityBar");
  const eventImagePreview = document.querySelector("#eventImagePreview");
  const eventImagePreviewImage = document.querySelector(
    "#eventImagePreviewImage",
  );
  const eventImageEmpty = document.querySelector("#eventImageEmpty");
  const eventReview = document.querySelector("#eventReview");
  const placementMode = document.querySelector("#eventPlacementMode");
  const placementCustom = document.querySelector("#eventPlacementCustom");
  const placementPage = document.querySelector("#eventPlacementPage");
  const placementPagePosition = document.querySelector(
    "#eventPlacementPagePosition",
  );
  const placementPreview = document.querySelector("#eventPlacementPreview");
  const placementError = document.querySelector("#eventPlacementError");
  const eventEditorShell = document.querySelector("#eventEditorShell");
  const eventEditor = document.querySelector("#eventEditor");
  const eventEditorBack = document.querySelector("#eventEditorBack");
  const eventEditorHome = document.querySelector("#eventEditorHome");
  const eventSaveSuccess = document.querySelector("#eventSaveSuccess");
  const eventSaveSuccessMessage = document.querySelector(
    "#eventSaveSuccessMessage",
  );
  const previewSeatMap = document.querySelector("#previewSeatMap");
  const eventMapPreviewDialog = document.querySelector(
    "#eventMapPreviewDialog",
  );
  const eventMapPreviewCanvas = document.querySelector(
    "#eventMapPreviewCanvas",
  );
  const eventMapPreviewDescription = document.querySelector(
    "#eventMapPreviewDescription",
  );
  const categoryFilter = document.querySelector("#eventCategory");
  const analyticsPeriod = document.querySelector("#analyticsPeriod");
  const performanceSort = document.querySelector("#performanceSort");
  const performanceMore = document.querySelector("#performanceMore");
  const backButton = document.querySelector("#adminBack");
  const adminShell = document.querySelector(".admin-shell");
  const adminHeader = document.querySelector(".admin-header");
  const adminNav = document.querySelector(".admin-nav");
  const adminMenu = document.querySelector("#adminMenu");
  const adminMenuToggle = document.querySelector("#adminMenuToggle");
  const adminMenuNav = document.querySelector(".admin-menu-nav");
  const adminMenuLogout = document.querySelector(".admin-menu-logout");
  const adminHeaderActions = document.querySelector(".admin-header-actions");
  const adminMessage = document.querySelector("#adminMessage");
  const adminLogout = document.querySelector("#adminLogout");
  const catalogForm = document.querySelector("#catalogForm");
  const catalogList = document.querySelector("#catalogList");
  const catalogMore = document.querySelector("#catalogMore");
  const catalogMoreButton = document.querySelector("#catalogMoreButton");
  const refreshAdmin = document.querySelector("#refreshAdmin");
  const eventDeleteDialog = document.querySelector("#eventDeleteDialog");
  const eventDeleteName = document.querySelector("#eventDeleteName");
  const eventDeleteMessage = document.querySelector("#eventDeleteMessage");
  const cancelEventDelete = document.querySelector("#cancelEventDelete");
  const confirmEventDelete = document.querySelector("#confirmEventDelete");
  const heroForm = document.querySelector("#heroForm");
  heroForm.innerHTML = `<fieldset class="admin-hero-mode"><legend>Hero Display Mode</legend><label class="admin-check"><input type="radio" name="hero_mode" value="latest_added" checked /> Latest Added</label><label class="admin-check"><input type="radio" name="hero_mode" value="most_added_to_cart" /> Most Added to Cart</label><label class="admin-check"><input type="radio" name="hero_mode" value="best_selling" /> Best Selling</label><label class="admin-check"><input type="radio" name="hero_mode" value="custom_selection" /> Custom Selection</label></fieldset><label class="admin-hero-limit">Hero event count<input id="heroLimit" type="number" min="1" step="1" inputmode="numeric" /></label><p class="admin-hero-help" id="heroHelp"></p><div id="heroAutomatic"></div><div id="heroSlots" hidden><label>Find eligible events<input id="heroSearch" type="search" placeholder="Search title, date, venue or category" autocomplete="off" /></label><div class="upcoming-shows-results" id="heroResults"></div><p class="admin-hero-help" id="heroCount"></p><div class="upcoming-shows-selected" id="heroSelected"></div></div><div class="admin-form-actions"><button class="auth-submit" type="submit">Save Hero</button></div>`;
  const heroSlots = document.querySelector("#heroSlots");
  const heroHelp = document.querySelector("#heroHelp");
  const heroAutomatic = document.querySelector("#heroAutomatic");
  const heroSearch = document.querySelector("#heroSearch");
  const heroLimit = document.querySelector("#heroLimit");
  const heroResults = document.querySelector("#heroResults");
  const heroCount = document.querySelector("#heroCount");
  const heroSelected = document.querySelector("#heroSelected");
  const upcomingShowsForm = document.querySelector("#upcomingShowsForm");
  const upcomingShowsHelp = document.querySelector("#upcomingShowsHelp");
  const upcomingShowsAutomatic = document.querySelector(
    "#upcomingShowsAutomatic",
  );
  const upcomingShowsCustom = document.querySelector("#upcomingShowsCustom");
  const upcomingShowsSearch = document.querySelector("#upcomingShowsSearch");
  const upcomingShowsResults = document.querySelector("#upcomingShowsResults");
  const upcomingShowsCount = document.querySelector("#upcomingShowsCount");
  const upcomingShowsSelected = document.querySelector(
    "#upcomingShowsSelected",
  );

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
  const setRefreshLoading = (isLoading) => {
    state.refreshing = isLoading;
    refreshAdmin.disabled = isLoading;
    refreshAdmin.classList.toggle("is-loading", isLoading);
    refreshAdmin.setAttribute("aria-busy", String(isLoading));
  };
  const closeEventDeleteDialog = () => {
    if (state.deletingEvent) return;
    state.eventPendingDeletion = null;
    eventDeleteDialog.close();
  };
  const openEventDeleteDialog = (event) => {
    state.eventPendingDeletion = event;
    eventDeleteName.textContent = event.title;
    eventDeleteMessage.hidden = true;
    eventDeleteMessage.textContent = "";
    eventDeleteDialog.showModal();
    cancelEventDelete.focus();
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
    const [
      events,
      categories,
      tickets,
      orders,
      users,
      catalog,
      venues,
      inventory,
      eventCreationContext,
      heroConfig,
      heroPreview,
      upcomingShowsConfig,
      upcomingShowsPreview,
    ] = await Promise.all([
      client
        .from("events")
        .select(
          "id, performer, category_id, title, description, event_date, event_time, doors_open, venue_id, venue, city, country, image_url, status, display_order, venues:venues!events_venue_id_fkey(id, name, city_area, region, country, address, latitude, longitude, image_url), categories(id, name)",
        )
        .order("display_order", { ascending: true })
        .order("id", { ascending: true }),
      client.from("categories").select("id, name").order("name"),
      client
        .from("ticket_types")
        .select(
          "id, event_id, name, canonical_tier, display_color, price, is_active, total_quantity, available_quantity",
        ),
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
      client.rpc("get_admin_homepage_hero_config"),
      client.rpc("get_homepage_hero_events"),
      client.rpc("get_admin_homepage_upcoming_shows_config"),
      client.rpc("get_homepage_upcoming_shows"),
    ]);
    for (const result of [
      events,
      categories,
      tickets,
      orders,
      catalog,
      venues,
      inventory,
      eventCreationContext,
      heroConfig,
      heroPreview,
      upcomingShowsConfig,
      upcomingShowsPreview,
    ])
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
    state.eventCreationContext = eventCreationContext.data || {
      venues: [],
      ticket_colors: {},
    };
    state.heroConfig = heroConfig.data || {
      mode: "latest_added",
      display_limit: 3,
      event_ids: [],
    };
    state.heroConfig.event_ids = state.heroConfig.event_ids || [];
    state.heroPreview = heroPreview.data || [];
    state.heroPreviewMode = state.heroConfig.mode;
    state.upcomingShowsConfig = upcomingShowsConfig.data || {
      mode: "latest_added",
      display_limit: 4,
      event_ids: [],
    };
    state.upcomingShowsConfig.event_ids =
      state.upcomingShowsConfig.event_ids || [];
    state.upcomingShowsPreview = upcomingShowsPreview.data || [];
    state.upcomingShowsPreviewMode = state.upcomingShowsConfig.mode;
    state.eventPage = 1;
    state.statsPage = 1;
    await loadAnalytics();
    renderAll();
    fillCategories();
    fillVenues();
    renderCatalog();
    renderHeroForm();
    renderUpcomingShowsForm();
  }

  function renderHeroForm() {
    const config = state.heroConfig;
    const mode = [
      "latest_added",
      "most_added_to_cart",
      "best_selling",
      "custom_selection",
    ].includes(config.mode)
      ? config.mode
      : "latest_added";
    const eligibleEvents = state.events.filter(
      (event) =>
        event.status === "active" &&
        event.event_date >= new Date().toISOString().slice(0, 10),
    );
    const availableCount = eligibleEvents.length;
    const limit = Math.max(1, Math.floor(Number(config.display_limit) || 3));
    heroForm.elements.hero_mode.value = mode;
    heroLimit.max = String(Math.max(1, availableCount));
    heroLimit.value = String(limit);
    heroSlots.hidden = mode !== "custom_selection";
    heroAutomatic.hidden = mode === "custom_selection";
    const help = {
      latest_added: `Automatically shows the ${limit} newest active, upcoming events.`,
      most_added_to_cart:
        "Automatically ranks active, upcoming events by recorded add-to-cart ticket units.",
      best_selling:
        "Automatically ranks active, upcoming events by ticket quantities in paid orders.",
      custom_selection: `Choose and order up to ${limit} active, upcoming events. Removing one here does not delete the event.`,
    };
    heroHelp.textContent = help[mode];
    if (mode !== "custom_selection") {
      heroAutomatic.innerHTML =
        mode !== state.heroPreviewMode
          ? '<p class="admin-message">Save this display mode to update the current Hero preview.</p>'
          : state.heroPreview.length
            ? `<div class="upcoming-shows-preview">${state.heroPreview.map((event) => `<div><span>${formatUpcomingEvent(event)}</span><button type="button" data-hero-edit="${event.id}">Edit Event</button></div>`).join("")}</div>`
            : '<p class="admin-message">No eligible events are available for this mode.</p>';
      return;
    }
    const selectedIds = config.event_ids.map(String);
    const selected = selectedIds
      .map((id) => state.events.find((event) => String(event.id) === id))
      .filter(Boolean);
    heroCount.textContent = `${selected.length} of ${limit} events selected for the Hero.`;
    heroSelected.innerHTML = selected.length
      ? selected
          .map(
            (event, index) =>
              `<div class="upcoming-shows-row"><span>${index + 1}. ${formatUpcomingEvent(event)}</span><div><button type="button" data-hero-move="up" data-hero-id="${event.id}" ${index === 0 ? "disabled" : ""}>Move up</button><button type="button" data-hero-move="down" data-hero-id="${event.id}" ${index === selected.length - 1 ? "disabled" : ""}>Move down</button><button type="button" data-hero-edit="${event.id}">Edit Event</button><button type="button" data-hero-remove="${event.id}">Remove</button></div></div>`,
          )
          .join("")
      : '<p class="admin-message">No custom Hero events selected.</p>';
    const search = heroSearch.value.trim().toLowerCase();
    const matches = eligibleEvents
      .filter((event) => {
        const text = [
          event.title,
          event.performer,
          event.event_date,
          event.venues?.name || event.venue,
          event.categories?.name,
        ]
          .join(" ")
          .toLowerCase();
        return (
          !selectedIds.includes(String(event.id)) &&
          (!search || text.includes(search))
        );
      })
      .slice(0, 12);
    heroResults.innerHTML =
      selected.length >= limit
        ? ""
        : matches
            .map(
              (event) =>
                `<div class="upcoming-shows-row"><span>${formatUpcomingEvent(event)}</span><button type="button" data-hero-add="${event.id}">Add</button></div>`,
            )
            .join("") ||
          '<p class="admin-message">No eligible matching events found.</p>';
    return;
    /* const mode = state.heroConfig.mode === "manual" ? "manual" : "automatic";
    heroForm.elements.hero_mode.value = mode;
    heroSlots.hidden = mode !== "manual";
    heroHelp.textContent = mode === "manual"
      ? "Choose up to three active events. Empty or invalid slots are filled with the newest eligible events."
      : "The three newest active events will be displayed automatically.";
    const activeEvents = state.events.filter((event) => event.status === "active");
    [1, 2, 3].forEach((slot) => {
      const select = heroForm.elements[`hero_slot_${slot}`];
      const selectedId = state.heroConfig.slots?.[slot] || "";
      select.innerHTML = `<option value="">Automatic fallback</option>${activeEvents.map((event) => `<option value="${event.id}">${escapeHtml(event.title)} — ${escapeHtml(event.performer)}</option>`).join("")}`;
      select.value = selectedId;
    }); */
  }

  function formatUpcomingEvent(event) {
    const venue = event.venues?.name || event.venue || "Venue TBA";
    const category =
      event.categories?.name || event.category || "Uncategorized";
    const date = event.event_date || "Date TBA";
    return `${escapeHtml(event.title || event.performer || "Untitled event")} — ${escapeHtml(date)} · ${escapeHtml(venue)} · ${escapeHtml(category)}`;
  }

  function renderUpcomingShowsForm() {
    const config = state.upcomingShowsConfig;
    const mode = [
      "latest_added",
      "most_added_to_cart",
      "best_selling",
      "custom_selection",
    ].includes(config.mode)
      ? config.mode
      : "latest_added";
    upcomingShowsForm.elements.upcoming_mode.value = mode;
    upcomingShowsCustom.hidden = mode !== "custom_selection";
    upcomingShowsAutomatic.hidden = mode === "custom_selection";
    const limit = Number(config.display_limit) || 4;
    const help = {
      latest_added: `Automatically shows the ${limit} newest active, upcoming events.`,
      most_added_to_cart: `Automatically ranks active, upcoming events by recorded add-to-cart ticket units.`,
      best_selling: `Automatically ranks active, upcoming events by ticket quantities in paid orders.`,
      custom_selection: `Choose and order up to ${limit} active, upcoming events. Removing one here does not delete the event.`,
    };
    upcomingShowsHelp.textContent = help[mode];

    if (mode !== "custom_selection") {
      if (mode !== state.upcomingShowsPreviewMode) {
        upcomingShowsAutomatic.innerHTML =
          '<p class="admin-message">Save this display mode to update the current homepage preview.</p>';
        return;
      }
      upcomingShowsAutomatic.innerHTML = state.upcomingShowsPreview.length
        ? `<div class="upcoming-shows-preview">${state.upcomingShowsPreview.map((event) => `<div><span>${formatUpcomingEvent(event)}</span><button type="button" data-upcoming-edit="${event.id}">Edit Event</button></div>`).join("")}</div>`
        : '<p class="admin-message">No eligible events are available for this mode.</p>';
      return;
    }

    const selectedIds = config.event_ids.map(String);
    const selected = selectedIds
      .map((id) => state.events.find((event) => String(event.id) === id))
      .filter(Boolean);
    upcomingShowsCount.textContent = `${selected.length} of ${limit} events selected for the homepage accordion.`;
    upcomingShowsSelected.innerHTML = selected.length
      ? selected
          .map(
            (event, index) =>
              `<div class="upcoming-shows-row"><span>${index + 1}. ${formatUpcomingEvent(event)}</span><div><button type="button" data-upcoming-move="up" data-upcoming-id="${event.id}" ${index === 0 ? "disabled" : ""}>Move up</button><button type="button" data-upcoming-move="down" data-upcoming-id="${event.id}" ${index === selected.length - 1 ? "disabled" : ""}>Move down</button><button type="button" data-upcoming-edit="${event.id}">Edit Event</button><button type="button" data-upcoming-remove="${event.id}">Remove</button></div></div>`,
          )
          .join("")
      : '<p class="admin-message">No custom events selected.</p>';
    const search = upcomingShowsSearch.value.trim().toLowerCase();
    const matches = state.events
      .filter((event) => {
        const text = [
          event.title,
          event.performer,
          event.event_date,
          event.venues?.name || event.venue,
          event.categories?.name,
        ]
          .join(" ")
          .toLowerCase();
        return (
          event.status === "active" &&
          event.event_date >= new Date().toISOString().slice(0, 10) &&
          !selectedIds.includes(String(event.id)) &&
          (!search || text.includes(search))
        );
      })
      .slice(0, 12);
    upcomingShowsResults.innerHTML =
      selected.length >= limit
        ? ""
        : matches
            .map(
              (event) =>
                `<div class="upcoming-shows-row"><span>${formatUpcomingEvent(event)}</span><button type="button" data-upcoming-add="${event.id}">Add</button></div>`,
            )
            .join("") ||
          '<p class="admin-message">No eligible matching events found.</p>';
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

  function renderPagination(
    container,
    currentPage,
    totalItems,
    onPageChange,
    itemsPerPage = PAGE_SIZE,
  ) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
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

    renderAnalyticsList(
      "topShared",
      analytics.top_shared,
      (item) => `${item.shares} shares`,
    );

    const category = analytics.popular_category || {};
    document.querySelector("#popularCategory").innerHTML = category.category
      ? `<div class="popular-category"><strong>${escapeHtml(category.category)}</strong><span>${category.event_count} events · ${category.engagement} tickets sold</span></div>`
      : '<p class="analytics-empty">No category sales yet.</p>';

    const recent = document.querySelector("#recentActivity");
    const fiveMostRecentActivities = [...(analytics.recent_activity || [])]
      .sort(
        (left, right) =>
          new Date(right.created_at || 0) - new Date(left.created_at || 0),
      )
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
    const totalPages = Math.max(
      1,
      Math.ceil(filtered.length / EVENTS_PAGE_SIZE),
    );
    state.eventPage = Math.min(state.eventPage, totalPages);
    const pageStart = (state.eventPage - 1) * EVENTS_PAGE_SIZE;
    const pageItems = filtered.slice(pageStart, pageStart + EVENTS_PAGE_SIZE);
    if (pageItems.length) {
      const eventGroups = Array.from(
        { length: Math.ceil(pageItems.length / 4) },
        (_, index) => pageItems.slice(index * 4, index * 4 + 4),
      );
      const desktopEvents = eventGroups
        .map((group) => {
          const cards = group.map((event) => {
            const stats = eventStats(event);
            const location = getEventLocation(event);
            return {
              image: `<div class="admin-event-group__image"><img src="${escapeHtml(event.image_url || "")}" alt="${escapeHtml(event.title)}" loading="lazy" /></div>`,
              info: `<article class="admin-event-row admin-event-group__item"><div class="admin-event-group__details"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.performer)} &middot; ${escapeHtml(event.categories?.name || "Uncategorized")}</span><span>${escapeHtml(location.text)}</span><time datetime="${escapeHtml(event.event_date)}">${escapeHtml(event.event_date)} &middot; ${escapeHtml(event.event_time)}</time><small>${stats.sold} sold / ${stats.remaining} available${stats.blocked ? ` / ${stats.blocked} blocked` : ""}</small></div><div class="admin-event-group__footer"><span class="admin-badge">${escapeHtml(event.status || "active")}</span><div class="admin-event-actions"><button data-edit="${event.id}" type="button">Edit</button><button data-delete="${event.id}" type="button">Delete</button></div></div></article>`,
            };
          });
          return `<section class="admin-event-group"><div class="admin-event-group__images">${cards.map((card) => card.image).join("")}</div><div class="admin-event-group__information">${cards.map((card) => card.info).join("")}</div></section>`;
        })
        .join("");
      const mobileEvents = pageItems
        .map((event) => {
          const stats = eventStats(event);
          const location = getEventLocation(event);
          return `<article class="admin-event-mobile-row"><div class="admin-event-mobile-row__image"><img src="${escapeHtml(event.image_url || "")}" alt="${escapeHtml(event.title)}" loading="lazy" /></div><div class="admin-event-mobile-row__info"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.performer)} &middot; ${escapeHtml(event.categories?.name || "Uncategorized")}</span><span>${escapeHtml(location.text)}</span><time datetime="${escapeHtml(event.event_date)}">${escapeHtml(event.event_date)} &middot; ${escapeHtml(event.event_time)}</time><small>${stats.sold} sold / ${stats.remaining} available${stats.blocked ? ` / ${stats.blocked} blocked` : ""}</small></div><div class="admin-event-mobile-row__actions"><span class="admin-badge">${escapeHtml(event.status || "active")}</span><div class="admin-event-actions"><button data-edit="${event.id}" type="button">Edit</button><button data-delete="${event.id}" type="button">Delete</button></div></div></article>`;
        })
        .join("");
      eventList.innerHTML = `<div class="admin-event-desktop-list">${desktopEvents}</div><div class="admin-event-mobile-list">${mobileEvents}</div>`;
    } else {
      eventList.innerHTML = '<p class="admin-message">No matching events.</p>';
    }
    renderPagination(
      eventsPagination,
      state.eventPage,
      filtered.length,
      (page) => {
        state.eventPage = page;
        renderEvents();
      },
      EVENTS_PAGE_SIZE,
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
        .filter((category) => category.name !== "Sports")
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
    const venue =
      state.eventCreationContext.venues.find((item) => item.id === venueId) ||
      state.venues.find((item) => item.id === venueId);
    if (!venue) {
      venuePreview.replaceChildren();
      venuePreview.hidden = true;
      return;
    }

    const location = [
      ...new Set(
        [venue.city_area, venue.region, venue.country].filter(Boolean),
      ),
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
    return (
      state.eventCreationContext.venues.find(
        (venue) => venue.id === venueSelect.value,
      ) ||
      state.venues.find((venue) => venue.id === venueSelect.value) ||
      null
    );
  }

  function ticketColorForTier(tier) {
    const existing = state.ticketTypes.find(
      (ticket) => ticket.canonical_tier === tier,
    );
    return (
      state.eventCreationContext.ticket_colors?.[tier] ||
      existing?.display_color ||
      "#ff9475"
    );
  }

  function createTicketDraft() {
    return Object.fromEntries(
      TICKET_TIERS.map((tier) => {
        const existing = state.ticketTypes.find(
          (ticket) => ticket.canonical_tier === tier.id,
        );
        return [
          tier.id,
          {
            quantity: 0,
            price: Number(existing?.price || 0),
            color: ticketColorForTier(tier.id),
          },
        ];
      }),
    );
  }

  function ticketDraftValue(tier, field) {
    const value = state.wizardTickets?.[tier]?.[field];
    return value == null ? "" : String(value);
  }

  function nonNegativeDraftNumber(value) {
    const parsed = Number(String(value ?? "").trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  function isValidQuantityDraft(value) {
    return value === "" || /^\d+$/.test(value);
  }

  function isValidPriceDraft(value) {
    // Keep a trailing decimal point while it is being typed (for example, `29.`).
    return value === "" || /^\d+(?:\.\d*)?$/.test(value);
  }

  function currentTicketInventory() {
    if (!state.wizardTickets) state.wizardTickets = createTicketDraft();
    return TICKET_TIERS.map((tier) => ({
      canonical_tier: tier.id,
      name: tier.name,
      quantity: nonNegativeDraftNumber(state.wizardTickets[tier.id]?.quantity),
      price: nonNegativeDraftNumber(state.wizardTickets[tier.id]?.price),
      color: state.wizardTickets[tier.id]?.color || ticketColorForTier(tier.id),
    }));
  }

  function setWizardMessage(text = "") {
    wizardMessage.textContent = text;
    wizardMessage.hidden = !text;
  }

  function getInventoryValidation({ validateDraft = false } = {}) {
    const venue = selectedVenueContext();
    const inventory = currentTicketInventory();
    if (!venue)
      return {
        valid: false,
        message: "Choose a venue before configuring ticket inventory.",
      };
    if (validateDraft) {
      const invalidQuantity = TICKET_TIERS.find(
        (tier) => !isValidQuantityDraft(ticketDraftValue(tier.id, "quantity")),
      );
      if (invalidQuantity)
        return {
          valid: false,
          message: `${invalidQuantity.name} needs a whole, non-negative seat quantity.`,
        };
      const invalidPrice = TICKET_TIERS.find(
        (tier) => !isValidPriceDraft(ticketDraftValue(tier.id, "price")),
      );
      if (invalidPrice)
        return {
          valid: false,
          message: `${invalidPrice.name} needs a non-negative price.`,
        };
    }
    const total = inventory.reduce((sum, tier) => sum + tier.quantity, 0);
    const tierOverage = inventory.find(
      (tier) =>
        tier.quantity >
        Number(venue.tier_capacities?.[tier.canonical_tier] || 0),
    );
    if (tierOverage) {
      const capacity = Number(
        venue.tier_capacities?.[tierOverage.canonical_tier] || 0,
      );
      return {
        valid: false,
        message: `${tierOverage.name} exceeds its physical venue inventory by ${formatSeatNumber(tierOverage.quantity - capacity)} seats.`,
      };
    }
    if (total > Number(venue.physical_capacity || 0)) {
      return {
        valid: false,
        message: `Configured ticket quantity exceeds venue capacity by ${formatSeatNumber(total - Number(venue.physical_capacity || 0))} seats.`,
      };
    }
    return { valid: true, venue, inventory, total };
  }

  function updateWizardControls() {
    const review = state.wizardStep === 5;
    wizardBack.hidden = state.wizardStep === 1;
    wizardContinue.hidden = review;
    wizardSubmit.hidden = !review;
    wizardContinue.disabled =
      state.wizardStep === 4 &&
      !getInventoryValidation({ validateDraft: true }).valid;
    wizardSubmit.textContent = form.elements.id.value
      ? "Save changes"
      : "Create event";
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
    ticketInventoryRows.innerHTML = inventory
      .map((tier) => {
        const capacity = Number(
          venue?.tier_capacities?.[tier.canonical_tier] || 0,
        );
        const quantityValue = ticketDraftValue(tier.canonical_tier, "quantity");
        const priceValue = ticketDraftValue(tier.canonical_tier, "price");
        return `<div class="admin-ticket-row" role="row" data-ticket-tier="${tier.canonical_tier}">
        <div class="admin-ticket-row__tier" role="cell" style="--ticket-color: ${escapeHtml(tier.color)}"><i aria-hidden="true"></i><div><strong>${escapeHtml(tier.name)}</strong><span>${venue ? `${formatSeatNumber(capacity)} physical seats` : "Select a venue first"}</span></div></div>
        <label role="cell"><span class="sr-only">${escapeHtml(tier.name)} sellable seats</span><input data-ticket-quantity type="number" min="0" max="${capacity}" step="1" value="${escapeHtml(quantityValue)}" inputmode="numeric" /></label>
        <label role="cell"><span class="sr-only">${escapeHtml(tier.name)} price</span><input data-ticket-price type="text" inputmode="decimal" autocomplete="off" pattern="[0-9]*[.]?[0-9]*" value="${escapeHtml(priceValue)}" /></label>
      </div>`;
      })
      .join("");
    updateTicketInventorySummary();
  }

  function updateTicketInventorySummary() {
    const venue = selectedVenueContext();
    const inventory = currentTicketInventory();
    const validation = getInventoryValidation();
    const physical = Number(venue?.physical_capacity || 0);
    const sellable =
      validation.total ??
      inventory.reduce((sum, tier) => sum + tier.quantity, 0);
    ticketVenueSummary.innerHTML = venue
      ? `<strong>${escapeHtml(venue.name)}</strong><span>Hall map: ${escapeHtml(venue.name)} · Physical capacity: ${formatSeatNumber(physical)}</span>`
      : "Select a venue to configure its ticket inventory.";
    ticketPhysicalCapacity.textContent = venue
      ? formatSeatNumber(physical)
      : "—";
    ticketSellableCapacity.textContent = formatSeatNumber(sellable);
    ticketBlockedCapacity.textContent = venue
      ? formatSeatNumber(Math.max(0, physical - sellable))
      : "—";
    ticketPotentialRevenue.textContent = `₾${inventory.reduce((sum, tier) => sum + tier.quantity * tier.price, 0).toFixed(2)}`;
    ticketCapacityLabel.textContent = venue
      ? `${formatSeatNumber(sellable)} / ${formatSeatNumber(physical)} seats configured`
      : "Choose a venue to see its capacity.";
    ticketCapacityBar.style.width =
      venue && physical
        ? `${Math.min(100, (sellable / physical) * 100)}%`
        : "0%";
    ticketInventoryError.textContent = validation.valid
      ? ""
      : validation.message;
    ticketInventoryError.hidden = validation.valid;
    updateWizardControls();
  }

  function updateImagePreview() {
    const imageUrl = form.elements.image_url.value.trim();
    eventImagePreview.hidden = true;
    eventImageEmpty.hidden = false;
    eventImagePreviewImage.removeAttribute("src");
    if (imageUrl && form.elements.image_url.checkValidity())
      eventImagePreviewImage.src = imageUrl;
  }

  eventImagePreviewImage.addEventListener("load", () => {
    eventImagePreview.hidden = false;
    eventImageEmpty.hidden = true;
  });
  eventImagePreviewImage.addEventListener("error", () => {
    eventImagePreview.hidden = true;
    eventImageEmpty.hidden = false;
  });

  function listingPageDetails(overallPosition) {
    const page = Math.ceil(overallPosition / PUBLIC_EVENTS_PER_PAGE);
    const positionOnPage = ((overallPosition - 1) % PUBLIC_EVENTS_PER_PAGE) + 1;
    return { page, positionOnPage, overallPosition };
  }

  function finalEventCount() {
    return state.events.length + (form.elements.id.value ? 0 : 1);
  }

  function setPlacementInlineError(message) {
    placementError.textContent = message;
    placementError.hidden = !message;
  }

  function placementValidation({ showErrors = false } = {}) {
    const mode = placementMode.value;
    const currentTotal = finalEventCount();
    const maxPage = Math.max(
      1,
      Math.ceil(currentTotal / PUBLIC_EVENTS_PER_PAGE),
    );
    placementPage.max = String(maxPage);
    placementPagePosition.max = String(PUBLIC_EVENTS_PER_PAGE);

    placementPage.classList.remove("is-invalid");
    placementPagePosition.classList.remove("is-invalid");

    if (mode === "automatic") {
      setPlacementInlineError("");
      return {
        valid: true,
        mode,
        preview:
          "Automatic placement follows the existing chronological event order after saving.",
      };
    }

    if (mode === "first") {
      setPlacementInlineError("");
      return {
        valid: true,
        mode,
        position: 1,
        preview:
          "This event will be first in the public list · Page 1 · Position 1.",
      };
    }

    if (mode === "last") {
      const details = listingPageDetails(currentTotal);
      setPlacementInlineError("");
      return {
        valid: true,
        mode,
        position: details.overallPosition,
        preview: `This event will be last in the public list · Page ${details.page} · Position ${details.positionOnPage}.`,
      };
    }

    const pageValue = placementPage.value.trim();
    const positionValue = placementPagePosition.value.trim();
    const pageValid = /^[1-9]\d*$/.test(pageValue);
    const positionValid = /^[1-9]\d*$/.test(positionValue);
    const page = Number(pageValue);
    const positionOnPage = Number(positionValue);
    const overallPosition =
      (page - 1) * PUBLIC_EVENTS_PER_PAGE + positionOnPage;
    let error = "";

    if (!pageValid || page < 1) {
      error = "Page must be a positive whole number.";
      if (showErrors || pageValue) placementPage.classList.add("is-invalid");
    } else if (
      !positionValid ||
      positionOnPage < 1 ||
      positionOnPage > PUBLIC_EVENTS_PER_PAGE
    ) {
      error = `Position on page must be between 1 and ${PUBLIC_EVENTS_PER_PAGE}.`;
      if (showErrors || positionValue)
        placementPagePosition.classList.add("is-invalid");
    } else if (overallPosition > currentTotal) {
      error = `Choose a position between 1 and ${currentTotal} for this event list.`;
      placementPage.classList.add("is-invalid");
      placementPagePosition.classList.add("is-invalid");
    }

    if (error) {
      setPlacementInlineError(
        showErrors || pageValue || positionValue ? error : "",
      );
      return {
        valid: false,
        mode,
        error,
        page,
        positionOnPage,
        overallPosition,
      };
    }

    const details = listingPageDetails(overallPosition);
    const editedEvent = state.events.find(
      (event) => String(event.id) === String(form.elements.id.value),
    );
    const isCurrentPlacement =
      editedEvent && Number(editedEvent.display_order) === overallPosition;
    setPlacementInlineError("");
    return {
      valid: true,
      mode,
      position: overallPosition,
      page: details.page,
      positionOnPage: details.positionOnPage,
      preview: isCurrentPlacement
        ? `Current placement · Page ${details.page} · Position ${details.positionOnPage} · Overall position ${details.overallPosition}.`
        : `This event will appear approximately · Page ${details.page} · Position ${details.positionOnPage} · Overall position ${details.overallPosition}.`,
    };
  }

  function updatePlacementControls(options) {
    const custom = placementMode.value === "custom";
    placementCustom.hidden = !custom;
    placementPage.disabled = !custom;
    placementPagePosition.disabled = !custom;
    const placement = placementValidation(options);
    placementPreview.textContent = placement.preview || "";
    return placement;
  }

  function resetPlacement() {
    placementMode.value = "automatic";
    placementPage.value = "1";
    placementPagePosition.value = "1";
    updatePlacementControls();
  }

  function loadCurrentPlacement(event) {
    const currentPosition = Math.max(1, Number(event.display_order) || 1);
    const details = listingPageDetails(currentPosition);
    placementMode.value = "custom";
    placementPage.value = String(details.page);
    placementPagePosition.value = String(details.positionOnPage);
    updatePlacementControls();
  }

  function validateStep(step) {
    const panel = wizardStepPanels.find(
      (item) => Number(item.dataset.eventStepPanel) === step,
    );
    let firstInvalid = null;
    if (step < 4) {
      panel
        .querySelectorAll(
          "input[required], select[required], textarea[required]",
        )
        .forEach((field) => {
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
    if (step === 1 && !updatePlacementControls({ showErrors: true }).valid) {
      setWizardMessage(
        "Choose a valid public listing placement before continuing.",
      );
      (placementPage.classList.contains("is-invalid")
        ? placementPage
        : placementPagePosition
      ).focus();
      return false;
    }
    if (step === 4 && !getInventoryValidation({ validateDraft: true }).valid) {
      setWizardMessage(getInventoryValidation({ validateDraft: true }).message);
      return false;
    }
    setWizardMessage("");
    return true;
  }

  function renderReview() {
    const values = new FormData(form);
    const venue = selectedVenueContext();
    const category = state.categories.find(
      (item) => item.id === values.get("category_id"),
    );
    const inventory = currentTicketInventory();
    const totals = getInventoryValidation();
    const placement = updatePlacementControls({ showErrors: true });
    const edit = (step, label) =>
      `<button type="button" data-review-edit="${step}">Edit ${label}</button>`;
    eventReview.innerHTML = `
      <section class="admin-review-section"><div class="admin-review-section__head"><h4>Event</h4>${edit(1, "event")}</div><strong>${escapeHtml(values.get("title") || "Untitled event")}</strong><span>${escapeHtml(values.get("performer") || "No performer")} · ${escapeHtml(category?.name || "No category")}</span><span>${escapeHtml(values.get("description") || "No description")}</span></section>
      <section class="admin-review-section"><div class="admin-review-section__head"><h4>Listing placement</h4>${edit(1, "placement")}</div><strong>${escapeHtml(placement.mode === "automatic" ? "Automatic" : placement.mode === "first" ? "First" : placement.mode === "last" ? "Last" : `Page ${placement.page} · Position ${placement.positionOnPage}`)}</strong><span>${escapeHtml(placement.preview || placement.error || "Choose a valid listing placement.")}</span></section>
      <section class="admin-review-section"><div class="admin-review-section__head"><h4>Schedule</h4>${edit(2, "schedule")}</div><strong>${escapeHtml(values.get("event_date") || "No date")} · ${escapeHtml(values.get("event_time") || "No time")}</strong><span>Doors open ${escapeHtml(values.get("doors_open") || "—")}</span></section>
      <section class="admin-review-section"><div class="admin-review-section__head"><h4>Venue</h4>${edit(2, "venue")}</div><strong>${escapeHtml(venue?.name || "No venue")}</strong><span>Hall map: ${escapeHtml(venue?.name || "—")} · ${formatSeatNumber(venue?.physical_capacity || 0)} physical seats</span></section>
      <section class="admin-review-section"><div class="admin-review-section__head"><h4>Media</h4>${edit(3, "media")}</div><div class="admin-review-media">${values.get("image_url") ? `<img src="${escapeHtml(values.get("image_url"))}" alt="" />` : ""}<span>${values.get("image_url") ? "Main event image selected." : "No image selected."}</span></div></section>
      <section class="admin-review-section admin-review-section--wide"><div class="admin-review-section__head"><h4>Tickets</h4>${edit(4, "tickets")}</div>${inventory.map((tier) => `<span class="admin-review-ticket-row">${escapeHtml(tier.name)} · ${formatSeatNumber(tier.quantity)} × ₾${tier.price.toFixed(2)}</span>`).join("")}</section>
      <section class="admin-review-section admin-review-section--wide"><div class="admin-review-section__head"><h4>Inventory</h4>${edit(4, "inventory")}</div><strong>${formatSeatNumber(venue?.physical_capacity || 0)} physical · ${formatSeatNumber(totals.total || 0)} sellable · ${formatSeatNumber(Math.max(0, Number(venue?.physical_capacity || 0) - Number(totals.total || 0)))} blocked</strong><span>Potential revenue ₾${inventory.reduce((sum, tier) => sum + tier.quantity * tier.price, 0).toFixed(2)}</span></section>`;
  }

  function showWizardStep(step, validateCurrent = false) {
    if (step < 1 || step > 5 || step > state.wizardHighestStep + 1) return;
    if (
      validateCurrent &&
      step > state.wizardStep &&
      !validateStep(state.wizardStep)
    )
      return;
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
    resetPlacement();
    state.wizardTickets = createTicketDraft();
    state.wizardStep = 1;
    state.wizardHighestStep = 1;
    state.wizardDirty = false;
    renderVenuePreview("");
    updateImagePreview();
    document.querySelector("#eventFormTitle").textContent = "Add new event";
    document.querySelector("#eventFormEyebrow").textContent =
      "Publish to the calendar";
    document.querySelector("#eventFormSubtitle").textContent =
      "Create and configure a new iVenue event.";
    document.querySelector("#cancelEventEdit").hidden = true;
    showWizardStep(1);
  }

  async function loadExistingWizardInventory(eventId) {
    const { data, error } = await client.rpc(
      "get_admin_event_seating_configuration",
      { p_event_id: eventId },
    );
    if (error) throw error;
    const existing = new Map(
      (data?.ticket_types || []).map((ticket) => [
        ticket.canonical_tier,
        ticket,
      ]),
    );
    state.wizardTickets = Object.fromEntries(
      TICKET_TIERS.map((tier) => {
        const ticket = existing.get(tier.id);
        // `capacity` includes blocked canonical seats. Only seats that are
        // available, reserved, or sold are part of the sellable inventory.
        const sellableQuantity =
          Number(ticket?.available || 0) +
          Number(ticket?.reserved || 0) +
          Number(ticket?.sold || 0);
        return [
          tier.id,
          {
            quantity: sellableQuantity,
            price: Number(ticket?.price || 0),
            color: ticket?.display_color || ticketColorForTier(tier.id),
          },
        ];
      }),
    );
    renderTicketInventory();
  }

  function fillForm(event) {
    Object.entries({
      id: event.id,
      title: event.title,
      performer: event.performer,
      category_id: event.category_id,
      event_date: event.event_date,
      event_time: event.event_time,
      doors_open: event.doors_open,
      status: event.status || "active",
      venue_id: event.venue_id,
      image_url: event.image_url,
      description: event.description,
    }).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value || "";
    });
    loadCurrentPlacement(event);
    state.wizardStep = 1;
    state.wizardHighestStep = 5;
    state.wizardDirty = false;
    renderVenuePreview(venueSelect.value);
    updateImagePreview();
    document.querySelector("#eventFormTitle").textContent = "Edit event";
    document.querySelector("#eventFormEyebrow").textContent =
      "Event management";
    document.querySelector("#eventFormSubtitle").textContent =
      "Review details and inventory without changing sold or reserved seats.";
    document.querySelector("#cancelEventEdit").hidden = false;
    loadExistingWizardInventory(event.id).catch((error) =>
      setWizardMessage(
        error.message || "Ticket inventory could not be loaded.",
      ),
    );
    showWizardStep(1);
    enterEventEditor();
  }

  async function saveEvent() {
    const values = new FormData(form);
    const isEdit = Boolean(values.get("id"));
    const payload = Object.fromEntries(
      [
        "title",
        "performer",
        "category_id",
        "description",
        "event_date",
        "event_time",
        "doors_open",
        "venue_id",
        "image_url",
        "status",
      ].map((key) => [key, String(values.get(key) || "").trim()]),
    );
    const placement = updatePlacementControls({ showErrors: true });
    if (!placement.valid)
      throw new Error(placement.error || "Choose a valid listing placement.");
    payload.placement = {
      mode: placement.mode,
      ...(placement.mode === "custom"
        ? { position: String(placement.position) }
        : {}),
    };
    state.wizardSaving = true;
    wizardSubmit.disabled = true;
    try {
      const { data, error } = await client.rpc(
        "admin_save_event_with_display_order",
        {
          p_event_id: values.get("id") || null,
          p_event: payload,
          p_ticket_inventory: currentTicketInventory().map(
            ({ canonical_tier, quantity, price }) => ({
              canonical_tier,
              quantity,
              price,
            }),
          ),
        },
      );
      if (error) throw error;
      await loadData();
      showEventSaveSuccess(isEdit);
      return data;
    } finally {
      state.wizardSaving = false;
      wizardSubmit.disabled = false;
    }
  }

  function showEventSaveSuccess(isEdit) {
    window.clearTimeout(state.saveSuccessTimeout);
    eventSaveSuccessMessage.textContent = isEdit
      ? "Successfully edited"
      : "Successfully added";
    eventSaveSuccess.hidden = false;
    state.saveSuccessTimeout = window.setTimeout(() => {
      eventSaveSuccess.hidden = true;
      resetForm();
      leaveEventEditor("overview", 0);
      setMessage(
        isEdit
          ? "Event and canonical inventory updated."
          : "Event and canonical inventory created.",
        "success",
      );
    }, 3000);
  }

  async function expoGeorgiaPavilion11Blueprint() {
    if (!expoGeorgiaPavilion11BlueprintPromise) {
      expoGeorgiaPavilion11BlueprintPromise = fetch(
        "hall-maps/expo-georgia-pavilion-11.json",
      )
        .then((response) => {
          if (!response.ok)
            throw new Error(
              "ExpoGeorgia Pavilion 11 blueprint could not be loaded.",
            );
          return response.json();
        })
        .then((blueprint) => {
          const valid =
            blueprint?.slug === "expo-georgia-pavilion-11" &&
            typeof blueprint.venueId === "string" &&
            typeof blueprint.viewBox === "string" &&
            blueprint.stage?.type === "rect" &&
            Array.isArray(blueprint.sections) &&
            blueprint.sections.length === 13;
          if (!valid)
            throw new Error("ExpoGeorgia Pavilion 11 blueprint is invalid.");
          return blueprint;
        })
        .catch((error) => {
          expoGeorgiaPavilion11BlueprintPromise = null;
          throw error;
        });
    }
    return expoGeorgiaPavilion11BlueprintPromise;
  }

  async function blueprintForVenue(venue) {
    if (!venue) return null;
    if (venue.name === "Black Sea Arena")
      return window.blackSeaArenaBlueprint || null;
    if (venue.id === window.dinamoArenaBlueprint?.venueId)
      return window.dinamoArenaBlueprint;
    if (venue.id === window.theatreBlueprint?.venueId)
      return window.theatreBlueprint;
    const expoBlueprint = await expoGeorgiaPavilion11Blueprint();
    if (venue.id === expoBlueprint.venueId) return expoBlueprint;
    return null;
  }

  function createPreviewSvgElement(svg, name, attributes = {}) {
    const element = document.createElementNS(svg.namespaceURI, name);
    Object.entries(attributes).forEach(([key, value]) =>
      element.setAttribute(key, String(value)),
    );
    return element;
  }

  function allocatePreviewSeats(total, weights) {
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const allocation = weights.map((weight) =>
      Math.floor((total * weight) / weightTotal),
    );
    const remaining = total - allocation.reduce((sum, value) => sum + value, 0);
    weights
      .map((weight, index) => ({
        index,
        remainder: (total * weight) / weightTotal - allocation[index],
      }))
      .sort(
        (left, right) =>
          right.remainder - left.remainder || left.index - right.index,
      )
      .slice(0, remaining)
      .forEach(({ index }) => {
        allocation[index] += 1;
      });
    return allocation;
  }

  function expoPreviewSeatPositions(section, rows) {
    if (!rows.length) return { points: [], radius: 1 };
    const paddingX = Math.min(20, Math.max(6, section.width * 0.045));
    const paddingY = Math.min(18, Math.max(7, section.height * 0.1));
    const width = Math.max(1, section.width - paddingX * 2);
    const height = Math.max(1, section.height - paddingY * 2);
    const nativeRowCount = new Set(
      rows.map((row) => `${row.section_id}:${row.row_number}`),
    ).size;
    const visualRows = Math.max(
      1,
      Math.min(
        rows.length,
        Math.max(
          nativeRowCount,
          Math.ceil(Math.sqrt(rows.length * Math.max(height / width, 0.2))),
        ),
      ),
    );
    const columns = Math.ceil(rows.length / visualRows);
    const rowCount = Math.ceil(rows.length / columns);
    const points = [];
    let seatIndex = 0;
    let smallestGap = Math.min(width / columns, height / rowCount);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const count = Math.min(columns, rows.length - seatIndex);
      const xGap = width / count;
      smallestGap = Math.min(smallestGap, xGap, height / rowCount);
      for (let columnIndex = 0; columnIndex < count; columnIndex += 1) {
        points.push({
          row: rows[seatIndex++],
          x: section.x + paddingX + xGap * (columnIndex + 0.5),
          y: section.y + paddingY + (height * (rowIndex + 0.5)) / rowCount,
        });
      }
    }
    return { points, radius: Math.max(0.7, Math.min(4.8, smallestGap * 0.3)) };
  }

  async function expoPreviewRowsForEvent() {
    const eventId = form.elements.id.value;
    if (!eventId) return [];
    const { data, error } = await client.rpc("get_event_seat_map", {
      p_event_id: eventId,
    });
    if (error) throw error;
    return data || [];
  }

  function renderExpoGeorgiaPavilion11Preview(svg, blueprint, eventId, rows) {
    const tiers = ["cheap", "medium", "expensive", "vip"];
    const tickets = eventTickets(eventId);
    const ticketById = new Map(
      tickets.map((ticket) => [String(ticket.id), ticket]),
    );
    const rowsByTier = new Map(tiers.map((tier) => [tier, []]));
    rows.forEach((row) => {
      const tier = ticketById.get(String(row.ticket_type_id))?.canonical_tier;
      if (rowsByTier.has(tier)) rowsByTier.get(tier).push(row);
    });
    const stage = createPreviewSvgElement(svg, "rect", blueprint.stage);
    stage.setAttribute("class", "preview-focal");
    svg.appendChild(stage);
    const stageLabel = createPreviewSvgElement(svg, "text", {
      x: Number(blueprint.stage.x) + Number(blueprint.stage.width) / 2,
      y: Number(blueprint.stage.y) + Number(blueprint.stage.height) / 2 + 11,
    });
    stageLabel.textContent = blueprint.stage.label;
    svg.appendChild(stageLabel);

    const assignedSeatIds = [];
    tiers.forEach((tier) => {
      const sections = blueprint.sections.filter(
        (section) => section.tier === tier,
      );
      const ticket = tickets.find((item) => item.canonical_tier === tier);
      const color =
        ticket?.display_color ||
        state.wizardTickets?.[tier]?.color ||
        ticketColorForTier(tier);
      const tierRows = rowsByTier
        .get(tier)
        .slice()
        .sort(
          (left, right) =>
            Number(left.section_order) - Number(right.section_order) ||
            Number(left.row_number) - Number(right.row_number) ||
            Number(left.seat_number) - Number(right.seat_number) ||
            String(left.event_seat_id).localeCompare(
              String(right.event_seat_id),
            ),
        );
      const allocation = allocatePreviewSeats(
        tierRows.length,
        sections.map((section) => section.width * section.height),
      );
      let offset = 0;
      sections.forEach((section, index) => {
        const frame = createPreviewSvgElement(svg, "rect", {
          ...section,
          fill: color,
          "fill-opacity": "0.72",
        });
        frame.setAttribute("class", "preview-seat-section");
        svg.appendChild(frame);
        const sectionRows = tierRows.slice(offset, offset + allocation[index]);
        offset += allocation[index];
        const placement = expoPreviewSeatPositions(section, sectionRows);
        placement.points.forEach(({ row, x, y }) => {
          assignedSeatIds.push(row.event_seat_id);
          const seat = createPreviewSvgElement(svg, "circle", {
            cx: x.toFixed(3),
            cy: y.toFixed(3),
            r: placement.radius.toFixed(2),
            fill: color,
            "data-event-seat-id": row.event_seat_id,
            "data-ticket-type-id": row.ticket_type_id,
            "data-seat-status": row.status,
          });
          seat.setAttribute(
            "class",
            `preview-event-seat${row.status === "available" ? "" : " is-unavailable"}`,
          );
          svg.appendChild(seat);
        });
      });
    });
    if (
      assignedSeatIds.length !== rows.length ||
      new Set(assignedSeatIds).size !== rows.length
    ) {
      throw new Error(
        "ExpoGeorgia Pavilion 11 preview could not bind every canonical event seat exactly once.",
      );
    }
  }

  async function renderHallMapPreview() {
    const venue = selectedVenueContext();
    eventMapPreviewCanvas.replaceChildren();
    eventMapPreviewDescription.textContent = "Loading hall map preview…";
    let blueprint;
    try {
      blueprint = await blueprintForVenue(venue);
    } catch (error) {
      eventMapPreviewDescription.textContent =
        error.message || "The hall map blueprint could not be loaded.";
      eventMapPreviewCanvas.innerHTML =
        '<p class="admin-map-preview__empty">The hall map preview is unavailable right now.</p>';
      return;
    }
    if (!venue || !blueprint) {
      eventMapPreviewDescription.textContent = venue
        ? `${venue.name} has no approved draft geometry available for preview.`
        : "Choose a venue before previewing the hall map.";
      eventMapPreviewCanvas.innerHTML =
        '<p class="admin-map-preview__empty">No geometry has been invented for this venue. Canonical inventory is still configured from its physical capacity.</p>';
      return;
    }
    const eventId = form.elements.id.value;
    let eventRows = [];
    if (blueprint.slug === "expo-georgia-pavilion-11" && eventId) {
      try {
        eventRows = await expoPreviewRowsForEvent();
      } catch (error) {
        eventMapPreviewDescription.textContent =
          error.message || "The event seat inventory could not be loaded.";
        eventMapPreviewCanvas.innerHTML =
          '<p class="admin-map-preview__empty">The hall geometry is available, but this event\'s canonical seats could not be loaded.</p>';
        return;
      }
    }
    eventMapPreviewDescription.textContent =
      blueprint.slug === "expo-georgia-pavilion-11" && eventId
        ? `${venue.name} geometry with ${formatSeatNumber(eventRows.length)} canonical event seats. This preview does not modify seat state.`
        : `${venue.name} geometry with draft ticket-tier colors. This preview does not create, reserve, or sell seats.`;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute(
      "viewBox",
      Array.isArray(blueprint.viewBox)
        ? blueprint.viewBox.join(" ")
        : blueprint.viewBox,
    );
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${venue.name} draft hall map`);
    if (blueprint.slug === "expo-georgia-pavilion-11") {
      try {
        renderExpoGeorgiaPavilion11Preview(svg, blueprint, eventId, eventRows);
      } catch (error) {
        eventMapPreviewDescription.textContent =
          error.message || "The event seat inventory could not be rendered.";
        eventMapPreviewCanvas.innerHTML =
          '<p class="admin-map-preview__empty">The hall geometry is available, but this event\'s canonical seats could not be rendered.</p>';
        return;
      }
      eventMapPreviewCanvas.appendChild(svg);
      return;
    }
    const tierByLabel = {
      "Cheap / Standard": "cheap",
      "Medium / Premium": "medium",
      Expensive: "expensive",
      VIP: "vip",
    };
    if (blueprint.outerBoundary) {
      const ellipse = document.createElementNS(svg.namespaceURI, "ellipse");
      Object.entries(blueprint.outerBoundary)
        .filter(([key]) => key !== "type")
        .forEach(([key, value]) => ellipse.setAttribute(key, value));
      ellipse.setAttribute("class", "preview-focal");
      svg.appendChild(ellipse);
    }
    if (blueprint.stage) {
      const stage = document.createElementNS(svg.namespaceURI, "ellipse");
      Object.entries(blueprint.stage).forEach(([key, value]) =>
        stage.setAttribute(key, value),
      );
      stage.setAttribute("class", "preview-focal");
      svg.appendChild(stage);
    }
    const focal = blueprint.field || blueprint.focalElement;
    if (focal) {
      const rect = document.createElementNS(svg.namespaceURI, "rect");
      ["x", "y", "width", "height", "rx"].forEach(
        (key) => focal[key] != null && rect.setAttribute(key, focal[key]),
      );
      rect.setAttribute("class", "preview-focal");
      svg.appendChild(rect);
    }
    (blueprint.sections || [])
      .filter((section) => section.selectable !== false)
      .forEach((section) => {
        const polygon = document.createElementNS(svg.namespaceURI, "polygon");
        const tier = tierByLabel[section.ticketTier];
        polygon.setAttribute(
          "points",
          section.polygon.map((point) => point.join(",")).join(" "),
        );
        polygon.setAttribute(
          "fill",
          state.wizardTickets?.[tier]?.color || ticketColorForTier(tier),
        );
        polygon.setAttribute("fill-opacity", "0.72");
        polygon.setAttribute("class", "preview-seat-section");
        svg.appendChild(polygon);
      });
    eventMapPreviewCanvas.appendChild(svg);
  }

  function activeDashboardPanel() {
    return (
      document.querySelector(".admin-panel.is-active")?.dataset.panel ||
      "overview"
    );
  }

  function setActiveDashboardPanel(panel) {
    document
      .querySelectorAll(".admin-nav button, .admin-panel")
      .forEach((element) => {
        element.classList.toggle("is-active", element.dataset.panel === panel);
      });
  }

  const adminBurgerBreakpoint = window.matchMedia("(max-width: 850px)");
  let adminMenuOpen = false;

  function setAdminMenuOpen(open) {
    adminMenuOpen = Boolean(open) && adminBurgerBreakpoint.matches;
    adminMenu?.classList.toggle("is-open", adminMenuOpen);
    adminMenuToggle?.classList.toggle("is-open", adminMenuOpen);
    adminMenuToggle?.setAttribute("aria-expanded", String(adminMenuOpen));
    adminMenu?.setAttribute("aria-hidden", String(!adminMenuOpen));
    document.body.classList.toggle("admin-menu-open", adminMenuOpen);
  }

  function placeAdminResponsiveNodes() {
    if (
      !adminNav ||
      !adminLogout ||
      !adminShell ||
      !adminMenuNav ||
      !adminMenuLogout
    )
      return;
    if (adminBurgerBreakpoint.matches) {
      adminMenuNav.append(adminNav);
      adminMenuLogout.append(adminLogout);
      return;
    }
    adminShell.insertBefore(adminNav, adminMessage);
    adminHeaderActions?.append(adminLogout);
    setAdminMenuOpen(false);
  }

  function playEventEditorEntrance() {
    eventEditor.classList.remove("is-entering");
    void eventEditor.offsetWidth;
    window.requestAnimationFrame(() =>
      eventEditor.classList.add("is-entering"),
    );
  }

  function enterEventEditor() {
    if (!document.body.classList.contains("event-editor-mode")) {
      const currentPanel = activeDashboardPanel();
      state.editorReturnPanel =
        currentPanel === "add-event" ? "overview" : currentPanel;
      state.editorReturnScrollY = window.scrollY;
    }
    setActiveDashboardPanel("add-event");
    document.body.classList.add("event-editor-mode");
    eventEditorShell.scrollTop = 0;
    playEventEditorEntrance();
  }

  function leaveEventEditor(
    destination = state.editorReturnPanel,
    scrollY = state.editorReturnScrollY,
  ) {
    if (eventMapPreviewDialog.open) eventMapPreviewDialog.close();
    eventEditor.classList.remove("is-entering");
    document.body.classList.remove("event-editor-mode");
    setActiveDashboardPanel(destination || "overview");
    window.requestAnimationFrame(() =>
      window.scrollTo({ top: scrollY, left: 0 }),
    );
  }

  function requestEventEditorExit(destination) {
    if (state.wizardDirty && !window.confirm("Discard unsaved event changes?"))
      return;
    resetForm();
    leaveEventEditor(destination, destination ? 0 : state.editorReturnScrollY);
  }

  document.querySelectorAll(".admin-nav button").forEach((button) =>
    button.addEventListener("click", () => {
      setAdminMenuOpen(false);
      if (button.dataset.panel === "add-event") {
        resetForm();
        enterEventEditor();
        return;
      }
      setActiveDashboardPanel(button.dataset.panel);
    }),
  );
  adminMenuToggle?.addEventListener("click", () => {
    setAdminMenuOpen(!adminMenuOpen);
  });
  adminMenu?.addEventListener("click", (event) => {
    if (event.target === adminMenu) setAdminMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setAdminMenuOpen(false);
  });
  window.addEventListener("resize", placeAdminResponsiveNodes);
  placeAdminResponsiveNodes();
  heroForm.addEventListener("change", (event) => {
    if (event.target.name !== "hero_mode") return;
    state.heroConfig.mode = heroForm.elements.hero_mode.value;
    renderHeroForm();
  });
  heroSearch.addEventListener("input", renderHeroForm);
  heroLimit.addEventListener("change", () => {
    const availableCount = state.events.filter(
      (event) =>
        event.status === "active" &&
        event.event_date >= new Date().toISOString().slice(0, 10),
    ).length;
    const value = Number.parseInt(heroLimit.value, 10);
    state.heroConfig.display_limit = Number.isInteger(value)
      ? Math.min(Math.max(value, 1), Math.max(1, availableCount))
      : 3;
    renderHeroForm();
  });
  heroForm.addEventListener("click", (event) => {
    const add = event.target.closest("[data-hero-add]");
    const remove = event.target.closest("[data-hero-remove]");
    const move = event.target.closest("[data-hero-move]");
    const edit = event.target.closest("[data-hero-edit]");
    const ids = state.heroConfig.event_ids.map(String);
    if (add && !ids.includes(add.dataset.heroAdd))
      state.heroConfig.event_ids = [...ids, add.dataset.heroAdd];
    if (remove)
      state.heroConfig.event_ids = ids.filter(
        (id) => id !== remove.dataset.heroRemove,
      );
    if (move) {
      const index = ids.indexOf(move.dataset.heroId);
      const nextIndex = move.dataset.heroMove === "up" ? index - 1 : index + 1;
      if (index >= 0 && nextIndex >= 0 && nextIndex < ids.length)
        [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
      state.heroConfig.event_ids = ids;
    }
    if (edit) {
      const item = state.events.find(
        (candidate) => String(candidate.id) === edit.dataset.heroEdit,
      );
      if (item) fillForm(item);
    }
    if (add || remove || move) renderHeroForm();
  });
  heroForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const heroMode = heroForm.elements.hero_mode.value;
    const availableCount = state.events.filter(
      (candidate) =>
        candidate.status === "active" &&
        candidate.event_date >= new Date().toISOString().slice(0, 10),
    ).length;
    const displayLimit = Number.parseInt(heroLimit.value, 10);
    if (
      !Number.isInteger(displayLimit) ||
      displayLimit < 1 ||
      displayLimit > availableCount
    ) {
      setMessage(
        "Hero event count must be a positive number no greater than the available events.",
        "error",
      );
      return;
    }
    const heroIds =
      heroMode === "custom_selection" ? state.heroConfig.event_ids : [];
    if (heroMode === "custom_selection" && heroIds.length > displayLimit) {
      setMessage(
        "Reduce the selected Custom events or increase the Hero event count before saving.",
        "error",
      );
      return;
    }
    try {
      const { error } = await client.rpc("admin_save_homepage_hero_config", {
        p_mode: heroMode,
        p_display_limit: displayLimit,
        p_event_ids: heroIds,
      });
      if (error) throw error;
      setMessage("Homepage Hero saved.", "success");
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(
        "Homepage Hero could not be saved. Please review your selection and try again.",
        "error",
      );
    }
    return;
    const mode = heroForm.elements.hero_mode.value;
    const ids = [1, 2, 3].map(
      (slot) => heroForm.elements[`hero_slot_${slot}`].value || null,
    );
    const selectedIds = ids.filter(Boolean);
    if (new Set(selectedIds).size !== selectedIds.length) {
      setMessage("Choose each Hero event only once.", "error");
      return;
    }
    try {
      const { error } = await client.rpc("admin_save_homepage_hero_config", {
        p_mode: mode,
        p_event_ids: mode === "manual" ? ids : [],
      });
      if (error) throw error;
      setMessage("Homepage Hero saved.", "success");
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(
        "Homepage Hero could not be saved. Please review your selection and try again.",
        "error",
      );
    }
  });
  upcomingShowsForm.addEventListener("change", (event) => {
    if (event.target.name !== "upcoming_mode") return;
    state.upcomingShowsConfig.mode =
      upcomingShowsForm.elements.upcoming_mode.value;
    renderUpcomingShowsForm();
  });
  upcomingShowsSearch.addEventListener("input", renderUpcomingShowsForm);
  upcomingShowsForm.addEventListener("click", (event) => {
    const add = event.target.closest("[data-upcoming-add]");
    const remove = event.target.closest("[data-upcoming-remove]");
    const move = event.target.closest("[data-upcoming-move]");
    const edit = event.target.closest("[data-upcoming-edit]");
    const ids = state.upcomingShowsConfig.event_ids.map(String);
    if (add && !ids.includes(add.dataset.upcomingAdd)) {
      state.upcomingShowsConfig.event_ids = [...ids, add.dataset.upcomingAdd];
      renderUpcomingShowsForm();
    }
    if (remove) {
      state.upcomingShowsConfig.event_ids = ids.filter(
        (id) => id !== remove.dataset.upcomingRemove,
      );
      renderUpcomingShowsForm();
    }
    if (move) {
      const index = ids.indexOf(move.dataset.upcomingId);
      const nextIndex =
        move.dataset.upcomingMove === "up" ? index - 1 : index + 1;
      if (index >= 0 && nextIndex >= 0 && nextIndex < ids.length) {
        [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
        state.upcomingShowsConfig.event_ids = ids;
        renderUpcomingShowsForm();
      }
    }
    if (edit) {
      const item = state.events.find(
        (candidate) => String(candidate.id) === edit.dataset.upcomingEdit,
      );
      if (item) fillForm(item);
    }
  });
  upcomingShowsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = upcomingShowsForm.elements.upcoming_mode.value;
    const eventIds =
      mode === "custom_selection" ? state.upcomingShowsConfig.event_ids : [];
    try {
      const { error } = await client.rpc(
        "admin_save_homepage_upcoming_shows_config",
        {
          p_mode: mode,
          p_event_ids: eventIds,
        },
      );
      if (error) throw error;
      setMessage("Upcoming Shows saved.", "success");
      await loadData();
    } catch (error) {
      console.error(error);
      setMessage(
        error.message ||
          "Upcoming Shows could not be saved. Please review your selection and try again.",
        "error",
      );
    }
  });
  ["eventSearch", "eventStatus", "eventCategory", "eventAvailability"].forEach(
    (id) =>
      document.querySelector(`#${id}`).addEventListener("input", () => {
        state.eventPage = 1;
        renderEvents();
      }),
  );
  refreshAdmin.addEventListener("click", async () => {
    if (state.refreshing) return;
    setRefreshLoading(true);
    try {
      await loadData();
      setMessage("Dashboard refreshed.", "success");
    } catch (error) {
      console.error("Admin dashboard refresh failed", error);
      setMessage(
        error.message || "Dashboard data could not be refreshed.",
        "error",
      );
    } finally {
      setRefreshLoading(false);
    }
  });
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

  document
    .querySelector("#cancelEventEdit")
    .addEventListener("click", requestWizardCancel);
  document
    .querySelector("#cancelEventWizard")
    .addEventListener("click", requestWizardCancel);
  eventEditorBack.addEventListener("click", () => requestEventEditorExit());
  eventEditorHome.addEventListener("click", () => {
    if (state.wizardDirty && !window.confirm("Discard unsaved event changes?"))
      return;
    window.location.href = "index.html#hero";
  });
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
    if (!validateStep(1) || !validateStep(4)) return;
    saveEvent(event).catch((error) => {
      console.error("Admin event save failed", {
        code: error?.code || null,
        message: error?.message || "Unknown error",
        details: error?.details || null,
        hint: error?.hint || null,
      });
      setWizardMessage(
        "Could not save the event. Please review the form and try again.",
      );
    });
  });
  wizardContinue.addEventListener("click", () =>
    showWizardStep(state.wizardStep + 1, true),
  );
  wizardBack.addEventListener("click", () =>
    showWizardStep(state.wizardStep - 1),
  );
  wizardStepButtons.forEach((button) =>
    button.addEventListener("click", () =>
      showWizardStep(Number(button.dataset.eventStep)),
    ),
  );
  form.addEventListener("input", (event) => {
    state.wizardDirty = true;
    if (event.target.name === "image_url") updateImagePreview();
    if (
      event.target === placementPage ||
      event.target === placementPagePosition
    )
      updatePlacementControls();
  });
  form.addEventListener("change", () => {
    state.wizardDirty = true;
  });
  placementMode.addEventListener("change", () => {
    if (placementMode.value === "custom") {
      if (!placementPage.value) placementPage.value = "1";
      if (!placementPagePosition.value) placementPagePosition.value = "1";
    }
    updatePlacementControls();
  });
  ticketInventoryRows.addEventListener("input", (event) => {
    const row = event.target.closest("[data-ticket-tier]");
    if (!row || !state.wizardTickets) return;
    const tier = row.dataset.ticketTier;
    if (event.target.matches("[data-ticket-quantity]"))
      state.wizardTickets[tier].quantity = event.target.value;
    if (event.target.matches("[data-ticket-price]"))
      state.wizardTickets[tier].price = event.target.value;
    state.wizardDirty = true;
    updateTicketInventorySummary();
  });
  eventReview.addEventListener("click", (event) => {
    const button = event.target.closest("[data-review-edit]");
    if (button) showWizardStep(Number(button.dataset.reviewEdit));
  });
  previewSeatMap.addEventListener("click", () => {
    if (typeof eventMapPreviewDialog.showModal === "function")
      eventMapPreviewDialog.showModal();
    renderHallMapPreview();
  });
  document
    .querySelector("#eventMapPreviewClose")
    .addEventListener("click", () => eventMapPreviewDialog.close());
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
      if (item) openEventDeleteDialog(item);
    }
  });
  cancelEventDelete.addEventListener("click", closeEventDeleteDialog);
  eventDeleteDialog.addEventListener("cancel", (event) => {
    if (state.deletingEvent) event.preventDefault();
    else closeEventDeleteDialog();
  });
  eventDeleteDialog.addEventListener("click", (event) => {
    if (event.target === eventDeleteDialog) closeEventDeleteDialog();
  });
  confirmEventDelete.addEventListener("click", async () => {
    const item = state.eventPendingDeletion;
    if (!item || state.deletingEvent) return;
    let deleted = false;
    state.deletingEvent = true;
    confirmEventDelete.disabled = true;
    confirmEventDelete.classList.add("is-loading");
    eventDeleteMessage.hidden = true;
    try {
      const result = await client.rpc("admin_delete_event_with_display_order", {
        p_event_id: item.id,
      });
      if (result.error) throw result.error;
      deleted = true;
      state.deletingEvent = false;
      closeEventDeleteDialog();
      setMessage("Event deleted.", "success");
      await loadData();
    } catch (error) {
      console.error("Admin event deletion failed", error);
      if (deleted) {
        setMessage(
          "Event was deleted, but dashboard data could not be refreshed.",
          "error",
        );
      } else {
        eventDeleteMessage.textContent =
          "Event could not be deleted. Related tickets or orders may reference it.";
        eventDeleteMessage.hidden = false;
      }
    } finally {
      state.deletingEvent = false;
      confirmEventDelete.disabled = false;
      confirmEventDelete.classList.remove("is-loading");
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
