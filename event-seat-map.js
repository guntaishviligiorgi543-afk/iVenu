(() => {
  const client = window.supabaseClient;
  const seatState = {
    rows: [],
    legendTypes: [],
    byId: new Map(),
    selectedIds: new Set(),
    pendingIds: new Set(),
    interactionAbortController: null,
    interactionRoot: null,
    countdownId: null,
    isCheckingOut: false,
    isExpiring: false,
    loadRequestId: 0,
    eventId: null,
    runtimeDiagnostics: null,
  };
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const validColor = (value) => /^#[0-9a-f]{6}$/i.test(value || "");
  const EVENT_SEAT_RPC_PAGE_SIZE = 1000;

  function canonicalTicketTypes() {
    return seatState.legendTypes.filter((ticket) => ticket.is_active);
  }
  function selectedTicketTypeId() {
    return (
      [...document.querySelectorAll(".fillterByTktType")]
        .map((select) => select.value)
        .find(Boolean) || ""
    );
  }
  function renderTicketTypeFilter(
    ticketTypes = canonicalTicketTypes(),
    preferredTicketTypeId = selectedTicketTypeId(),
  ) {
    const selected = ticketTypes.some(
      (ticket) => ticket.ticket_type_id === preferredTicketTypeId,
    )
      ? preferredTicketTypeId
      : "";
    const options =
      '<option value="">All Ticket Types</option>' +
      ticketTypes
        .map(
          (ticket) =>
            `<option value="${ticket.ticket_type_id}">${escapeHtml(ticket.ticket_type_name)}</option>`,
        )
        .join("");
    document.querySelectorAll(".fillterByTktType").forEach((select) => {
      select.innerHTML = options;
      select.value = selected;
      select.dataset.ticketFilterOwner = "canonical-event-ticket-legend";
    });
    document.querySelectorAll(".fillterList").forEach((filters) => {
      filters.hidden = ticketTypes.length < 2;
    });
  }
  function synchronizeTicketTypeFilter(ticketTypeId) {
    const selected = canonicalTicketTypes().some(
      (ticket) => ticket.ticket_type_id === ticketTypeId,
    )
      ? ticketTypeId
      : "";
    document.querySelectorAll(".fillterByTktType").forEach((select) => {
      select.value = selected;
    });
    refreshTicketLists();
  }
  function colorsByTicketType() {
    const colors = new Map();
    [...seatState.legendTypes, ...seatState.rows].forEach((item) => {
      const color = item.display_color || item.ticket_color;
      if (item.ticket_type_id && !colors.has(item.ticket_type_id)) {
        if (!validColor(color))
          console.error(
            "Ticket type is missing a stored display color",
            item.ticket_type_id,
          );
        colors.set(item.ticket_type_id, validColor(color) ? color : "#6b7280");
      }
    });
    return colors;
  }

  // The Theatre renderer must never conceal a missing canonical colour with the
  // generic fallback used by the legacy/fallback map. Its visual tier colours
  // are part of the active Ticket Types configuration, so fail closed instead.
  function strictCanonicalTicketColors(ticketTypes = canonicalTicketTypes()) {
    const colors = new Map();
    ticketTypes.forEach((ticket) => {
      const color = ticket.display_color || ticket.ticket_color;
      if (!ticket.ticket_type_id || !validColor(color)) {
        throw new Error(
          `Theatre ticket type ${ticket.ticket_type_id || "(missing UUID)"} is missing a valid canonical display color.`,
        );
      }
      colors.set(ticket.ticket_type_id, color);
    });
    return colors;
  }

  function countRowsByTicketType(rows) {
    const counts = new Map();
    rows.forEach((row) => {
      const ticketTypeId = row.ticket_type_id || row.ticketTypeId;
      if (!ticketTypeId) return;
      const current = counts.get(ticketTypeId) || {
        ticketTypeId,
        ticketTypeName: row.ticket_type_name || row.ticketTypeName || "Unknown",
        count: 0,
      };
      current.count += 1;
      counts.set(ticketTypeId, current);
    });
    return Object.fromEntries(
      [...counts.values()]
        .sort((left, right) =>
          left.ticketTypeName.localeCompare(right.ticketTypeName),
        )
        .map((entry) => [
          entry.ticketTypeName,
          { ticketTypeId: entry.ticketTypeId, count: entry.count },
        ]),
    );
  }

  function normalizeCanonicalEventSeat(row) {
    const normalized = {
      ...row,
      event_seat_id: String(row.event_seat_id || ""),
      ticket_type_id: String(row.ticket_type_id || ""),
      ticket_type_name: String(row.ticket_type_name || ""),
      price: Number(row.price),
      status: String(row.status || ""),
      row_number: Number(row.row_number),
      seat_number: Number(row.seat_number),
    };
    if (
      !normalized.event_seat_id ||
      !normalized.ticket_type_id ||
      !normalized.ticket_type_name ||
      !Number.isFinite(normalized.price) ||
      !normalized.status ||
      !Number.isFinite(normalized.row_number) ||
      !Number.isFinite(normalized.seat_number)
    ) {
      throw new Error(
        "get_event_seat_map returned a seat without its required canonical identity fields.",
      );
    }
    return normalized;
  }

  async function loadAllEventSeatMapRows(eventId) {
    const rows = [];
    const seenSeatIds = new Set();
    for (let from = 0; ; from += EVENT_SEAT_RPC_PAGE_SIZE) {
      const { data, error } = await client
        .rpc("get_event_seat_map", { p_event_id: eventId })
        .range(from, from + EVENT_SEAT_RPC_PAGE_SIZE - 1);
      if (error) throw error;
      const page = data || [];
      page.forEach((row) => {
        const eventSeatId = String(row.event_seat_id || "");
        if (!eventSeatId || seenSeatIds.has(eventSeatId)) {
          throw new Error(
            "get_event_seat_map pagination returned a missing or duplicate event_seat_id.",
          );
        }
        seenSeatIds.add(eventSeatId);
        rows.push(row);
      });
      if (page.length < EVENT_SEAT_RPC_PAGE_SIZE) return rows;
    }
  }

  function isBlackSeaArenaEvent() {
    const venueName =
      selectedBand?.venueName || selectedBand?.location?.venue || "";
    return (
      Boolean(selectedBand?.venueId) &&
      venueName.trim().toLowerCase().replace(/\s+/g, " ") === "black sea arena"
    );
  }
  function isTbilisiSportsPalaceEvent() {
    return (
      Boolean(selectedBand?.venueId) &&
      selectedBand.venueId === window.tbilisiSportsPalaceBlueprint?.venueId
    );
  }
  function isExpoGeorgiaPavilion11Event() {
    return (
      Boolean(selectedBand?.venueId) &&
      selectedBand.venueId === window.expoGeorgiaPavilion11Blueprint?.venueId
    );
  }
  function isDinamoArenaEvent() {
    return (
      Boolean(selectedBand?.venueId) &&
      selectedBand.venueId === window.dinamoArenaBlueprint?.venueId
    );
  }
  function isTheatreEvent() {
    return (
      Boolean(selectedBand?.venueId) &&
      selectedBand.venueId === window.theatreBlueprint?.venueId
    );
  }
  function isSilkFactoryStudioEvent() {
    return (
      Boolean(selectedBand?.venueId) &&
      selectedBand.venueId === window.silkFactoryStudioBlueprint?.venueId
    );
  }
  function isLisiLemansEvent() {
    return (
      Boolean(selectedBand?.venueId) &&
      selectedBand.venueId === window.lisiLemansBlueprint?.venueId
    );
  }

  function mapRowsToHallMap() {
    const sections = new Map();
    seatState.rows.forEach((row) => {
      if (!sections.has(row.section_id))
        sections.set(row.section_id, {
          id: row.section_id,
          name: row.section_name,
          ticketType: row.ticket_type_id,
          rows: 0,
          seatsPerRow: 0,
        });
      const section = sections.get(row.section_id);
      section.rows = Math.max(section.rows, Number(row.row_number));
      section.seatsPerRow = Math.max(
        section.seatsPerRow,
        Number(row.seat_number),
      );
    });
    hallMap.sections = [...sections.values()];
    selectedBand.tickets = selectedBand.tickets || {};
    canonicalTicketTypes().forEach((ticket) => {
      selectedBand.tickets[ticket.ticket_type_id] = {
        id: ticket.ticket_type_id,
        name: ticket.ticket_type_name,
        price: Number(ticket.price),
        currency: "₾",
      };
    });
  }

  function currentFilters() {
    return {
      ticketTypeId:
        document.querySelector(".tktListContainer .fillterByTktType")?.value ||
        "",
    };
  }
  function applyMapFilters() {
    const { ticketTypeId } = currentFilters();
    const hasFilter = Boolean(ticketTypeId);
    document
      .querySelectorAll(".stageMap [data-ticket-type-id]")
      .forEach((node) => {
        const dimmed = hasFilter && node.dataset.ticketTypeId !== ticketTypeId;
        node.classList.toggle("is-filter-dimmed", dimmed);
        if (node.matches(".seat"))
          node.style.pointerEvents = dimmed ? "none" : "";
      });
    document
      .querySelectorAll(
        ".stageMap .black-sea-arena-stage, .stageMap .black-sea-arena-stage-label, .stageMap .dinamo-arena-boundary, .stageMap .dinamo-arena-restricted, .stageMap .dinamo-arena-field, .stageMap .dinamo-arena-field-label, .stageMap .theatre-stage, .stageMap .theatre-stage-label, .stageMap .tbilisi-sports-palace-stage, .stageMap .tbilisi-sports-palace-stage-label, .stageMap .expo-georgia-pavilion-11-stage, .stageMap .expo-georgia-pavilion-11-stage-label, .stageMap .silk-factory-studio-stage, .stageMap .silk-factory-studio-stage-label, .stageMap .lisi-lemans-stage, .stageMap .lisi-lemans-stage-label",
      )
      .forEach((node) => node.classList.toggle("is-filter-dimmed", hasFilter));
  }

  async function loadOwnReservedSeats() {
    const session = await window.authApi?.getSession();
    if (!session?.user || !seatState.byId.size) return [];
    const { data, error } = await client
      .from("cart_items")
      .select(
        "event_seat_id, event_seats!cart_items_event_seat_id_fkey(status, reserved_until)",
      )
      .eq("user_id", session.user.id)
      .not("event_seat_id", "is", null);
    if (error) throw error;
    return (data || [])
      .filter((item) => item.event_seats?.status === "reserved")
      .map((item) => {
        const row = seatState.byId.get(item.event_seat_id);
        return row
          ? { ...row, reserved_until: item.event_seats?.reserved_until || null }
          : null;
      })
      .filter(Boolean);
  }

  function stopCanonicalCountdown() {
    if (seatState.countdownId) clearInterval(seatState.countdownId);
    seatState.countdownId = null;
  }
  function syncCanonicalCountdown() {
    stopCanonicalCountdown();
    const timer = document.querySelector(".selectionCountdown");
    const value = document.querySelector(".selectionCountdownValue");
    if (!timer || !value) return;
    const expirations = basketTickets
      .map((item) => new Date(item.reservedUntil || 0).getTime())
      .filter((time) => Number.isFinite(time) && time > Date.now());
    if (!expirations.length) {
      timer.style.display = "none";
      return;
    }
    const earliest = Math.min(...expirations);
    const update = () => {
      const seconds = Math.max(0, Math.ceil((earliest - Date.now()) / 1000));
      value.textContent = `expires in ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      timer.style.display = "flex";
      timer.classList.toggle("warning", seconds <= 60);
      if (seconds === 0) {
        stopCanonicalCountdown();
        expireCurrentTicketSelection().catch((error) =>
          console.error("Unable to reconcile expired reservations", error),
        );
      }
    };
    update();
    seatState.countdownId = setInterval(update, 1000);
  }

  function replaceBasketWithReservations(rows) {
    basketTickets.length = 0;
    seatState.selectedIds.clear();
    rows.forEach((row) => {
      seatState.selectedIds.add(row.event_seat_id);
      basketTickets.push({
        eventSeatId: row.event_seat_id,
        section: row.section_id,
        sectionName: row.section_name,
        row: Number(row.row_number),
        seat: Number(row.seat_number),
        type: row.ticket_type_name,
        price: Number(row.price),
        currency: "₾",
        serviceFee: Math.round(Number(row.price) * 0.05),
        ticketTypeId: row.ticket_type_id,
        reservedUntil: row.reserved_until,
      });
    });
    if (typeof persistBasketState === "function") persistBasketState();
    renderBasket();
    syncCanonicalCountdown();
  }

  async function expireCurrentTicketSelection() {
    if (seatState.isExpiring) return;
    seatState.isExpiring = true;
    // get_event_seat_map first invokes the canonical expiration RPC. Any seats
    // reserved a moment later are then explicitly released as part of leaving
    // this single purchase session, so no hold survives the expired countdown.
    try {
      await loadEventSeatMap();
      const remainingReservations = [...basketTickets];
      const releases = await Promise.all(
        remainingReservations.map((ticket) =>
          client.rpc("release_event_seat", {
            p_event_seat_id: ticket.eventSeatId,
          }),
        ),
      );
      const releaseError = releases.find((result) => result.error)?.error;
      if (releaseError) throw releaseError;
      await loadEventSeatMap();
    } finally {
      seatState.isExpiring = false;
      window.exitTicketPurchase?.({ expired: true });
    }
  }

  window.handleTicketSelectionExpiry = expireCurrentTicketSelection;

  function reportTicketConfigurationIssues() {
    canonicalTicketTypes().forEach((ticket) => {
      if (
        !Number.isFinite(Number(ticket.price)) ||
        Number(ticket.price) < 0 ||
        !validColor(ticket.display_color) ||
        Number(ticket.canonical_seat_count) === 0
      )
        console.error("Ticket configuration issue", ticket);
    });
  }

  async function loadEventSeatMap() {
    if (!selectedBand?.id) return;
    const eventId = selectedBand.id;
    const requestId = ++seatState.loadRequestId;
    const [seatResult, legendResult] = await Promise.all([
      loadAllEventSeatMapRows(eventId),
      client.rpc("get_event_ticket_legend", { p_event_id: eventId }),
    ]);
    if (legendResult.error) throw legendResult.error;
    if (requestId !== seatState.loadRequestId || selectedBand?.id !== eventId)
      return;
    const isNewEvent = seatState.eventId !== eventId;
    seatState.eventId = eventId;
    seatState.rows = seatResult.map(normalizeCanonicalEventSeat);
    seatState.legendTypes = legendResult.data || [];
    seatState.byId = new Map(
      seatState.rows.map((row) => [row.event_seat_id, row]),
    );
    seatState.runtimeDiagnostics = {
      eventId,
      rpc: countRowsByTicketType(seatResult),
      normalized: countRowsByTicketType(seatState.rows),
      mapAllocation: null,
      ticketListSource: null,
      ticketListRendered: null,
    };
    console.info(
      "Canonical get_event_seat_map runtime counts",
      seatState.runtimeDiagnostics,
    );
    mapRowsToHallMap();
    renderTicketTypeFilter(
      canonicalTicketTypes(),
      isNewEvent ? "" : selectedTicketTypeId(),
    );
    reportTicketConfigurationIssues();
    const reservations = await loadOwnReservedSeats();
    if (requestId !== seatState.loadRequestId || selectedBand?.id !== eventId)
      return;
    replaceBasketWithReservations(reservations);
    window.renderTicketLegend();
    window.renderHallMap();
    refreshTicketLists();
  }

  window.renderTicketLegend = function renderDatabaseTicketLegend() {
    const container = document.querySelector("#legendItems");
    if (!container) return;
    const colors = colorsByTicketType();
    container.innerHTML = canonicalTicketTypes()
      .map((ticket) => {
        const price =
          Number.isFinite(Number(ticket.price)) && Number(ticket.price) >= 0
            ? `₾${Number(ticket.price)}`
            : "Price unavailable";
        return `<div class="legendItem" data-ticket-type-id="${ticket.ticket_type_id}"><span class="legendColor" style="background:${colors.get(ticket.ticket_type_id)}"></span><span class="legendName">${escapeHtml(ticket.ticket_type_name)}</span><span class="legendPrice">${price}</span></div>`;
      })
      .join("");
  };

  function canonicalSeatGroups() {
    const groups = new Map();
    seatState.rows.forEach((row) => {
      if (!groups.has(row.section_id)) groups.set(row.section_id, []);
      groups.get(row.section_id).push(row);
    });
    return [...groups.values()].sort(
      (left, right) =>
        Number(left[0].section_order) - Number(right[0].section_order) ||
        String(left[0].section_code).localeCompare(
          String(right[0].section_code),
        ),
    );
  }
  function showSeatTooltip(seat, event) {
    const row = seatState.byId.get(seat.dataset.eventSeatId);
    const tooltip = document.querySelector("#seatMapTooltip");
    if (!row || !tooltip) return;
    tooltip.textContent = `${row.section_name} · Row ${row.row_number} · Seat ${row.seat_number} · ${row.ticket_type_name} · ₾${row.price}`;
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
    tooltip.hidden = false;
  }

  window.renderHallMap = function renderCanonicalSeatMap() {
    const stageMap = document.querySelector(".stageMap");
    if (!stageMap) return;
    if (isExpoGeorgiaPavilion11Event() && window.expoGeorgiaPavilion11SeatMap) {
      try {
        const mapResult = window.expoGeorgiaPavilion11SeatMap.render({
          stageMap,
          rows: seatState.rows,
          ticketTypes: canonicalTicketTypes(),
          colors: colorsByTicketType(),
          selectedIds: seatState.selectedIds,
        });
        if (seatState.runtimeDiagnostics)
          seatState.runtimeDiagnostics.mapAllocation = mapResult.diagnostics;
        applyMapFilters();
        window.attachSeatClickHandlers();
        return;
      } catch (error) {
        console.error(
          "ExpoGeorgia Pavilion 11 map could not bind canonical event seats",
          error,
        );
        stageMap.replaceChildren();
        const message = document.createElement("p");
        message.className = "seat-map-load-error";
        message.textContent =
          "The ExpoGeorgia Pavilion 11 seat map could not be loaded without risking an incomplete seat binding.";
        stageMap.appendChild(message);
        return;
      }
    }
    if (isTbilisiSportsPalaceEvent() && window.tbilisiSportsPalaceSeatMap) {
      try {
        const mapResult = window.tbilisiSportsPalaceSeatMap.render({
          stageMap,
          rows: seatState.rows,
          ticketTypes: canonicalTicketTypes(),
          colors: colorsByTicketType(),
          selectedIds: seatState.selectedIds,
        });
        if (seatState.runtimeDiagnostics) {
          seatState.runtimeDiagnostics.mapAllocation = mapResult.diagnostics;
          console.info(
            "Tbilisi Sports Palace map allocation runtime counts",
            mapResult.diagnostics,
          );
        }
        applyMapFilters();
        window.attachSeatClickHandlers();
        return;
      } catch (error) {
        console.error(
          "Tbilisi Sports Palace map could not bind canonical event seats",
          error,
        );
        stageMap.replaceChildren();
        const message = document.createElement("p");
        message.className = "seat-map-load-error";
        message.textContent =
          "The Tbilisi Sports Palace seat map could not be loaded without risking an incomplete seat binding.";
        stageMap.appendChild(message);
        return;
      }
    }
    if (isBlackSeaArenaEvent() && window.blackSeaArenaSeatMap) {
      try {
        const mapResult = window.blackSeaArenaSeatMap.render({
          stageMap,
          rows: seatState.rows,
          ticketTypes: canonicalTicketTypes(),
          colors: colorsByTicketType(),
          selectedIds: seatState.selectedIds,
        });
        if (seatState.runtimeDiagnostics) {
          seatState.runtimeDiagnostics.mapAllocation =
            mapResult.diagnostics.perTier;
          console.info(
            "Black Sea Arena map allocation runtime counts",
            seatState.runtimeDiagnostics.mapAllocation,
          );
        }
        applyMapFilters();
        window.attachSeatClickHandlers();
        return;
      } catch (error) {
        console.error(
          "Black Sea Arena map could not bind canonical event seats",
          error,
        );
        stageMap.replaceChildren();
        const message = document.createElement("p");
        message.className = "seat-map-load-error";
        message.textContent =
          "The Black Sea Arena seat map could not be loaded without risking an incomplete seat binding.";
        stageMap.appendChild(message);
        return;
      }
    }
    if (isDinamoArenaEvent() && window.dinamoArenaSeatMap) {
      try {
        const mapResult = window.dinamoArenaSeatMap.render({
          stageMap,
          rows: seatState.rows,
          ticketTypes: canonicalTicketTypes(),
          colors: colorsByTicketType(),
          selectedIds: seatState.selectedIds,
        });
        if (seatState.runtimeDiagnostics) {
          seatState.runtimeDiagnostics.mapAllocation =
            mapResult.diagnostics.perTier;
          console.info(
            "Dinamo Arena map allocation runtime counts",
            seatState.runtimeDiagnostics.mapAllocation,
          );
        }
        applyMapFilters();
        window.attachSeatClickHandlers();
        return;
      } catch (error) {
        console.error(
          "Dinamo Arena map could not bind canonical event seats",
          error,
        );
        stageMap.replaceChildren();
        const message = document.createElement("p");
        message.className = "seat-map-load-error";
        message.textContent =
          "The Dinamo Arena seat map could not be loaded without risking an incomplete seat binding.";
        stageMap.appendChild(message);
        return;
      }
    }
    if (isTheatreEvent() && window.theatreSeatMap) {
      try {
        const mapResult = window.theatreSeatMap.render({
          stageMap,
          rows: seatState.rows,
          ticketTypes: canonicalTicketTypes(),
          colors: strictCanonicalTicketColors(),
          selectedIds: seatState.selectedIds,
        });
        if (seatState.runtimeDiagnostics) {
          seatState.runtimeDiagnostics.mapAllocation =
            mapResult.diagnostics.perTier;
          console.info(
            "Theatre map allocation runtime counts",
            seatState.runtimeDiagnostics.mapAllocation,
          );
        }
        applyMapFilters();
        window.attachSeatClickHandlers();
        return;
      } catch (error) {
        console.error(
          "Theatre map could not bind canonical event seats",
          error,
        );
        stageMap.replaceChildren();
        const message = document.createElement("p");
        message.className = "seat-map-load-error";
        message.textContent =
          "The Theatre seat map could not be loaded without risking an incomplete seat binding.";
        stageMap.appendChild(message);
        return;
      }
    }
    if (isSilkFactoryStudioEvent() && window.silkFactoryStudioSeatMap) {
      try {
        const mapResult = window.silkFactoryStudioSeatMap.render({
          stageMap,
          rows: seatState.rows,
          ticketTypes: canonicalTicketTypes(),
          colors: colorsByTicketType(),
          selectedIds: seatState.selectedIds,
        });
        if (seatState.runtimeDiagnostics) {
          seatState.runtimeDiagnostics.mapAllocation = mapResult.diagnostics;
          console.info(
            "Silk Factory Studio canonical seat-binding diagnostics",
            mapResult.diagnostics,
          );
        }
        applyMapFilters();
        window.attachSeatClickHandlers();
        return;
      } catch (error) {
        console.error(
          "Silk Factory Studio map could not bind canonical event seats",
          error,
        );
        stageMap.replaceChildren();
        const message = document.createElement("p");
        message.className = "seat-map-load-error";
        message.textContent =
          "The Silk Factory Studio seat map could not be loaded without risking an incomplete seat binding.";
        stageMap.appendChild(message);
        return;
      }
    }
    if (isLisiLemansEvent() && window.lisiLemansSeatMap) {
      try {
        const mapResult = window.lisiLemansSeatMap.render({
          stageMap,
          rows: seatState.rows,
          ticketTypes: canonicalTicketTypes(),
          colors: colorsByTicketType(),
          selectedIds: seatState.selectedIds,
        });
        if (seatState.runtimeDiagnostics)
          seatState.runtimeDiagnostics.mapAllocation = mapResult.diagnostics;
        applyMapFilters();
        window.attachSeatClickHandlers();
        return;
      } catch (error) {
        console.error(
          "Lisi Lemans map could not bind canonical event seats",
          error,
        );
        stageMap.replaceChildren();
        const message = document.createElement("p");
        message.className = "seat-map-load-error";
        message.textContent =
          "The Lisi Lemans seat map could not be loaded without risking an incomplete seat binding.";
        stageMap.appendChild(message);
        return;
      }
    }
    stageMap.replaceChildren();
    const colors = colorsByTicketType();
    const viewport = document.createElement("div");
    viewport.className = "canonical-seat-map-viewport";
    const canvas = document.createElement("div");
    canvas.className = "canonical-seat-map-canvas";
    canonicalSeatGroups().forEach((sectionRows) => {
      const first = sectionRows[0];
      const section = document.createElement("section");
      section.className = "canonical-seat-section";
      section.dataset.ticketTypeId = first.ticket_type_id;
      const grid = document.createElement("div");
      grid.className = "canonical-seat-grid";
      grid.style.setProperty(
        "--seat-columns",
        String(Math.max(...sectionRows.map((row) => Number(row.seat_number)))),
      );
      sectionRows.forEach((row) => {
        const node = document.createElement("button");
        const selected = seatState.selectedIds.has(row.event_seat_id);
        node.type = "button";
        node.className = `seat is-visible${selected ? " selected" : ""}${row.status !== "available" && !selected ? " unavailable" : ""}`;
        node.dataset.eventSeatId = row.event_seat_id;
        node.dataset.section = row.section_id;
        node.dataset.row = row.row_number;
        node.dataset.seat = row.seat_number;
        node.dataset.ticketTypeId = row.ticket_type_id;
        node.style.background = colors.get(row.ticket_type_id);
        node.style.gridRow = String(row.row_number);
        node.style.gridColumn = String(row.seat_number);
        node.setAttribute(
          "aria-label",
          `${row.section_name}, row ${row.row_number}, seat ${row.seat_number}, ${row.ticket_type_name}, ₾${row.price}`,
        );
        grid.appendChild(node);
      });
      section.append(grid);
      canvas.appendChild(section);
    });
    const tooltip = document.createElement("div");
    tooltip.id = "seatMapTooltip";
    tooltip.className = "seat-map-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    viewport.appendChild(canvas);
    stageMap.append(viewport, tooltip);
    if (!window.HallMapViewportController)
      throw new Error("Hall map viewport controller is unavailable.");
    window.HallMapViewportController.attachHtml({ viewport, content: canvas });
    applyMapFilters();
    window.attachSeatClickHandlers();
  };

  window.attachSeatClickHandlers = function attachCanonicalSeatClickHandlers() {
    const stageMap = document.querySelector(".stageMap");
    const interactionRoot =
      stageMap?.querySelector("[data-seat-interaction-root]") || stageMap;
    if (!interactionRoot || seatState.interactionRoot === interactionRoot)
      return;
    seatState.interactionAbortController?.abort();
    seatState.interactionRoot = interactionRoot;
    seatState.interactionAbortController = new AbortController();
    const listenerOptions = {
      signal: seatState.interactionAbortController.signal,
    };
    interactionRoot.addEventListener(
      "click",
      (event) => {
        const seat = event.target.closest(".seat[data-event-seat-id]");
        if (
          !seat ||
          seat.classList.contains("unavailable") ||
          seat.classList.contains("selected")
        )
          return;
        if (seatState.selectedIds.size >= 4) {
          window.showTicketLimitDialog?.();
          return;
        }
        const row = seatState.byId.get(seat.dataset.eventSeatId);
        if (!row) return;
        eventState.selectedSeat = seat;
        document.querySelector(".confirmSection").textContent =
          row.section_name;
        document.querySelector(".confirmRow").textContent = row.row_number;
        document.querySelector(".confirmSeat").textContent = row.seat_number;
        document.querySelector(".confirmPrice").textContent = `₾${row.price}`;
        document.querySelector("#confirmDialog").style.display = "flex";
      },
      listenerOptions,
    );
    interactionRoot.addEventListener(
      "pointerover",
      (event) => {
        const seat = event.target.closest(".seat[data-event-seat-id]");
        if (seat) showSeatTooltip(seat, event);
      },
      listenerOptions,
    );
    interactionRoot.addEventListener(
      "pointermove",
      (event) => {
        const seat = event.target.closest(".seat[data-event-seat-id]");
        if (seat) showSeatTooltip(seat, event);
      },
      listenerOptions,
    );
    interactionRoot.addEventListener(
      "pointerout",
      (event) => {
        if (event.target.closest(".seat[data-event-seat-id]"))
          document.querySelector("#seatMapTooltip").hidden = true;
      },
      listenerOptions,
    );
  };

  function updateSeatNode(row) {
    const node = document.querySelector(
      `.seat[data-event-seat-id="${row.event_seat_id}"]`,
    );
    if (!node) return;
    const selected = seatState.selectedIds.has(row.event_seat_id);
    node.setAttribute(
      "class",
      `seat is-visible${selected ? " selected" : ""}${row.status !== "available" && !selected ? " unavailable" : ""}`,
    );
    node.dataset.status = row.status;
  }
  function refreshTicketLists() {
    document
      .querySelectorAll(".tktListContainer")
      .forEach((container) => window.renderTicketListForContainer(container));
    applyMapFilters();
  }

  window.addTicketToBasket = async function reserveSeat(ticket) {
    const row = seatState.byId.get(ticket.eventSeatId);
    if (
      !row ||
      seatState.selectedIds.has(row.event_seat_id) ||
      seatState.pendingIds.has(row.event_seat_id)
    )
      return;
    if (seatState.selectedIds.size >= 4) {
      window.showTicketLimitDialog?.();
      return;
    }
    seatState.pendingIds.add(row.event_seat_id);
    const { data, error } = await client.rpc("reserve_event_seat", {
      p_event_seat_id: row.event_seat_id,
    });
    seatState.pendingIds.delete(row.event_seat_id);
    if (error) {
      await loadEventSeatMap().catch((refreshError) =>
        console.error("Unable to reconcile seat state", refreshError),
      );
      if (String(error.message || "").includes("TICKET_LIMIT_REACHED")) {
        window.showTicketLimitDialog?.();
      } else {
        window.alert(
          error.message || "That seat was just reserved by another customer.",
        );
      }
      return;
    }
    seatState.selectedIds.add(row.event_seat_id);
    row.status = "reserved";
    row.reserved_until = data?.[0]?.reserved_until || null;
    basketTickets.push({
      eventSeatId: row.event_seat_id,
      section: row.section_id,
      sectionName: row.section_name,
      row: Number(row.row_number),
      seat: Number(row.seat_number),
      type: row.ticket_type_name,
      price: Number(row.price),
      currency: "₾",
      serviceFee: Math.round(Number(row.price) * 0.05),
      ticketTypeId: row.ticket_type_id,
      reservedUntil: row.reserved_until,
    });
    if (typeof persistBasketState === "function") persistBasketState();
    renderBasket();
    syncCanonicalCountdown();
    updateSeatNode(row);
    refreshTicketLists();
  };
  window.removeTicketFromBasket = async function releaseSeat(ticket) {
    const item =
      basketTickets.find(
        (candidate) => candidate.eventSeatId === ticket.eventSeatId,
      ) ||
      basketTickets.find(
        (candidate) =>
          candidate.section === ticket.section &&
          candidate.row === Number(ticket.row) &&
          candidate.seat === Number(ticket.seat),
      );
    if (!item?.eventSeatId) return;
    const { error } = await client.rpc("release_event_seat", {
      p_event_seat_id: item.eventSeatId,
    });
    if (error) {
      await loadEventSeatMap().catch((refreshError) =>
        console.error("Unable to reconcile seat state", refreshError),
      );
      window.alert(error.message || "The seat could not be released.");
      return;
    }
    basketTickets.splice(basketTickets.indexOf(item), 1);
    seatState.selectedIds.delete(item.eventSeatId);
    const row = seatState.byId.get(item.eventSeatId);
    if (row) row.status = "available";
    if (typeof persistBasketState === "function") persistBasketState();
    renderBasket();
    syncCanonicalCountdown();
    updateSeatNode(row);
    refreshTicketLists();
  };

  window.getVisibleAvailableTickets = function getDatabaseAvailableTickets() {
    return seatState.rows
      .filter(
        (row) =>
          row.status === "available" &&
          !seatState.selectedIds.has(row.event_seat_id),
      )
      .map((row) => ({
        eventSeatId: row.event_seat_id,
        section: row.section_id,
        sectionName: row.section_name,
        row: Number(row.row_number),
        seat: Number(row.seat_number),
        type: row.ticket_type_name.toLowerCase(),
        displayType: row.ticket_type_name,
        price: Number(row.price),
        currency: "₾",
        serviceFee: Math.round(Number(row.price) * 0.05),
        ticketTypeId: row.ticket_type_id,
      }));
  };
  window.renderTicketListForContainer = function renderDatabaseTicketList(
    container,
  ) {
    if (!container) return;
    const list = container.querySelector(".tktsInList");
    const counter = container.querySelector(".freeTkts");
    if (!list || !counter) return;
    const typeFilter =
      container.querySelector(".fillterByTktType")?.value || "";
    const canonicalRows = getVisibleAvailableTickets();
    const rows = canonicalRows.filter(
      (row) => !typeFilter || row.ticketTypeId === typeFilter,
    );
    if (seatState.runtimeDiagnostics)
      seatState.runtimeDiagnostics.ticketListSource = countRowsByTicketType(
        canonicalRows.map((row) => ({
          ticket_type_id: row.ticketTypeId,
          ticket_type_name: row.displayType,
        })),
      );
    list.innerHTML = rows
      .map(
        (row) =>
          `<div class="tktCard" data-type="${escapeHtml(row.type)}" data-ticket-type-id="${row.ticketTypeId}" data-section="${escapeHtml(row.section)}"><div class="tktInfo"><div class="sectionCont"><h5>section <p class="section">${escapeHtml(row.sectionName)}</p></h5><h5>row <p class="row">${row.row}</p></h5><h5>seat <p class="seat">${row.seat}</p></h5></div><div class="tktPriceCont"><p class="tktType">${escapeHtml(row.displayType)}</p><p class="tktprice">₾${row.price}</p></div></div><button class="addToBskt" data-event-seat-id="${row.eventSeatId}"><span>add to basket</span></button></div>`,
      )
      .join("");
    if (seatState.runtimeDiagnostics) {
      seatState.runtimeDiagnostics.ticketListRendered = countRowsByTicketType(
        rows.map((row) => ({
          ticket_type_id: row.ticketTypeId,
          ticket_type_name: row.displayType,
        })),
      );
      console.info("Canonical ticket-list runtime counts", {
        source: seatState.runtimeDiagnostics.ticketListSource,
        rendered: seatState.runtimeDiagnostics.ticketListRendered,
        filterTicketTypeId: typeFilter || null,
      });
    }
    counter.textContent = `available tickets (${rows.length})`;
    list.querySelectorAll(".addToBskt").forEach((button) =>
      button.addEventListener("click", () => {
        const row = seatState.byId.get(button.dataset.eventSeatId);
        if (!row) return;
        if (seatState.selectedIds.size >= 4) {
          window.showTicketLimitDialog?.();
          return;
        }
        eventState.selectedSeat = document.querySelector(
          `.seat[data-event-seat-id="${row.event_seat_id}"]`,
        );
        document.querySelector(".confirmSection").textContent =
          row.section_name;
        document.querySelector(".confirmRow").textContent = row.row_number;
        document.querySelector(".confirmSeat").textContent = row.seat_number;
        document.querySelector(".confirmPrice").textContent = `₾${row.price}`;
        document.querySelector("#confirmDialog").style.display = "flex";
      }),
    );
  };
  window.filterTicketList = function filterDatabaseTicketList(container) {
    window.renderTicketListForContainer(container);
    applyMapFilters();
  };
  window.canonicalTicketSeatMap = {
    renderTicketListForContainer: window.renderTicketListForContainer,
    refreshTicketLists,
    getRuntimeDiagnostics: () => seatState.runtimeDiagnostics,
    hasReachedTicketLimit: () => seatState.selectedIds.size >= 4,
  };
  document.querySelectorAll(".fillterByTktType").forEach((select) =>
    select.addEventListener("change", (event) => {
      synchronizeTicketTypeFilter(event.target.value);
    }),
  );
  document.querySelectorAll(".checkout").forEach((button) =>
    button.addEventListener("click", async () => {
      if (seatState.isCheckingOut) return;
      seatState.isCheckingOut = true;
      button.disabled = true;
      try {
        const session = await window.authApi?.getSession();
        if (!session?.user) {
          window.location.assign("login.html");
          return;
        }
        if (!selectedBand?.id) throw new Error("This event is unavailable.");

        // Keep the checkout boundary event-specific.  The database remains the
        // source of truth: a local basket can never authorize checkout.
        const now = new Date().toISOString();
        const { data, error } = await client
          .from("cart_items")
          .select(
            "event_seat_id, event_seats!inner(status, reserved_until, event_id)",
          )
          .eq("user_id", session.user.id)
          .eq("event_seats.event_id", selectedBand.id)
          .eq("event_seats.reserved_by", session.user.id)
          .eq("event_seats.status", "reserved")
          .gt("event_seats.reserved_until", now)
          .not("event_seat_id", "is", null);
        if (error) throw error;
        if (!data?.length) {
          await loadEventSeatMap();
          window.alert("Select currently reserved tickets before checking out.");
          return;
        }
        window.location.assign(
          `checkout.html?event=${encodeURIComponent(selectedBand.id)}`,
        );
      } catch (error) {
        console.error("Checkout access validation failed", error);
        window.alert(error.message || "Checkout could not be opened.");
      } finally {
        seatState.isCheckingOut = false;
        button.disabled = false;
      }
    }),
  );
  window.addEventListener("event-seat-context", () =>
    loadEventSeatMap().catch((error) =>
      console.error("Unable to load event seats", error),
    ),
  );
  if (typeof selectedBand !== "undefined" && selectedBand)
    loadEventSeatMap().catch((error) =>
      console.error("Unable to load event seats", error),
    );
})();
