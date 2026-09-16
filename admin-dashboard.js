(() => {
  const PAGE_SIZE = 5;
  const client = window.supabaseClient;
  const state = {
    events: [],
    categories: [],
    ticketTypes: [],
    orderItems: [],
    users: 0,
    eventPage: 1,
    statsPage: 1,
    analytics: null,
    performanceVisible: 10,
    catalog: [],
    venues: [],
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
  const categoryFilter = document.querySelector("#eventCategory");
  const analyticsPeriod = document.querySelector("#analyticsPeriod");
  const performanceSort = document.querySelector("#performanceSort");
  const performanceMore = document.querySelector("#performanceMore");
  const backButton = document.querySelector("#adminBack");
  const catalogForm = document.querySelector("#catalogForm");
  const catalogList = document.querySelector("#catalogList");

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
      soldOut: tickets.length > 0 && remaining <= 0,
    };
  };

  async function loadData() {
    const [events, categories, tickets, orders, users, catalog, venues] =
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
          .select("id, event_id, name, total_quantity, available_quantity"),
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
      ]);
    for (const result of [events, categories, tickets, orders, catalog, venues])
      if (result.error) throw result.error;
    state.events = events.data || [];
    state.categories = categories.data || [];
    state.ticketTypes = tickets.data || [];
    state.orderItems = orders.data || [];
    state.users = users.count || 0;
    state.catalog = catalog.data || [];
    state.venues = venues.data || [];
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
    catalogList.innerHTML = state.catalog.length
      ? state.catalog
          .map(
            (item) =>
              `<article class="admin-catalog-row"><img src="${escapeHtml(item.image_url)}" alt="Venue catalog image ${item.display_order}" /><div><strong>Image ${item.display_order}</strong><span>${escapeHtml(item.image_url)}</span></div><div class="admin-event-actions"><button type="button" data-catalog-edit="${item.id}">Edit</button><button type="button" data-catalog-delete="${item.id}">Delete</button></div></article>`,
          )
          .join("")
      : '<p class="admin-message">No catalog images found.</p>';
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
    recent.innerHTML = analytics.recent_activity?.length
      ? analytics.recent_activity
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
            return `<article class="admin-event-row"><div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.performer)} · ${escapeHtml(event.categories?.name || "Uncategorized")} · ${escapeHtml(event.event_date)} · ${escapeHtml(event.event_time)} · ${escapeHtml(location.text)}</span><span>${stats.sold} sold / ${stats.remaining} available</span></div><span class="admin-badge">${escapeHtml(event.status || "active")}</span><div class="admin-event-actions"><button data-edit="${event.id}" type="button">Edit</button><button data-delete="${event.id}" type="button">Delete</button></div></article>`;
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
          return `<div class="admin-stat-line"><strong>${escapeHtml(event.title)}</strong><span>${stats.sold} sold</span><span>${stats.remaining} remaining</span></div>`;
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
    const venue = state.venues.find((item) => item.id === venueId);
    if (!venue) {
      venuePreview.textContent = "";
      venuePreview.hidden = true;
      return;
    }

    const location = [
      ...new Set([venue.city_area, venue.region, venue.country].filter(Boolean)),
    ].join(", ");
    venuePreview.textContent = [venue.name, location, venue.address]
      .filter(Boolean)
      .join(" — ");
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

  function resetForm() {
    form.reset();
    form.elements.id.value = "";
    renderVenuePreview("");
    document.querySelector("#eventFormTitle").textContent = "Add event";
    document.querySelector("#cancelEventEdit").hidden = true;
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
    renderVenuePreview(venueSelect.value);
    document.querySelector("#eventFormTitle").textContent = "Edit event";
    document.querySelector("#cancelEventEdit").hidden = false;
    document
      .querySelector('[data-panel="add-event"]')
      .classList.add("is-active");
    document
      .querySelectorAll(".admin-panel")
      .forEach((panel) =>
        panel.classList.toggle(
          "is-active",
          panel.dataset.panel === "add-event",
        ),
      );
  }

  async function saveEvent(event) {
    const values = new FormData(form);
    const payload = {
      title: values.get("title").trim(),
      performer: values.get("performer").trim(),
      category_id: values.get("category_id"),
      description: values.get("description").trim(),
      event_date: values.get("event_date"),
      event_time: values.get("event_time"),
      doors_open: values.get("doors_open"),
      venue_id: values.get("venue_id"),
      image_url: values.get("image_url").trim(),
      status: values.get("status"),
    };
    const id = values.get("id");
    const result = id
      ? await client.from("events").update(payload).eq("id", id)
      : await client.from("events").insert(payload);
    if (result.error) throw result.error;
    setMessage(id ? "Event updated." : "Event added.", "success");
    resetForm();
    await loadData();
  }

  document.querySelectorAll(".admin-nav button").forEach((button) =>
    button.addEventListener("click", () => {
      document
        .querySelectorAll(".admin-nav button, .admin-panel")
        .forEach((element) =>
          element.classList.toggle(
            "is-active",
            element.dataset.panel === button.dataset.panel,
          ),
        );
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
  document
    .querySelector("#cancelEventEdit")
    .addEventListener("click", resetForm);
  venueSelect.addEventListener("change", () =>
    renderVenuePreview(venueSelect.value),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveEvent(event).catch((error) => {
      console.error(error);
      setMessage(error.message || "Event could not be saved.", "error");
    });
  });
  document
    .querySelector("#cancelCatalogEdit")
    .addEventListener("click", resetCatalogForm);
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
      resetCatalogForm();
    } catch (error) {
      console.error(error);
      status.textContent = "Unable to load admin dashboard.";
    }
  })();
})();
