(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const blueprint = window.theatreBlueprint;
  if (!blueprint) return;

  const blueprintTierToCanonicalTier = Object.freeze({
    "cheap / standard": "cheap",
    "medium / premium": "medium",
    expensive: "expensive",
    vip: "vip",
  });
  const normalizeTier = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const numeric = (value) => Number(value) || 0;
  const createSvg = (name) => document.createElementNS(SVG_NS, name);
  const setAttributes = (node, attributes) => Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));

  function polygonArea(polygon) {
    return Math.abs(polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2);
  }

  function allocateByWeight(total, weights) {
    const safeWeights = weights.map((weight) => Math.max(0, numeric(weight)));
    const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
    if (!total || !weightTotal) return safeWeights.map(() => 0);
    const allocations = safeWeights.map((weight) => Math.floor(total * weight / weightTotal));
    let remaining = total - allocations.reduce((sum, allocation) => sum + allocation, 0);
    safeWeights
      .map((weight, index) => ({ index, remainder: total * weight / weightTotal - allocations[index] }))
      .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
      .slice(0, remaining)
      .forEach(({ index }) => { allocations[index] += 1; });
    return allocations;
  }

  function stableSeatSort(left, right) {
    return numeric(left.row_number) - numeric(right.row_number)
      || numeric(left.seat_number) - numeric(right.seat_number)
      || String(left.event_seat_id).localeCompare(String(right.event_seat_id));
  }

  function boundsForPolygon(polygon) {
    return polygon.reduce((bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x), maxX: Math.max(bounds.maxX, x),
      minY: Math.min(bounds.minY, y), maxY: Math.max(bounds.maxY, y),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const [x, y] = polygon[index];
      const [previousX, previousY] = polygon[previous];
      if ((y > point[1]) !== (previousY > point[1]) && point[0] < (previousX - x) * (point[1] - y) / (previousY - y) + x) inside = !inside;
    }
    return inside;
  }

  function theatreSeatPositions(section, rows) {
    if (!rows.length) return { positions: [], radius: 1 };
    const bounds = boundsForPolygon(section.polygon);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const paddingX = Math.min(24, Math.max(5, width * 0.035));
    const paddingY = Math.min(24, Math.max(5, height * 0.09));
    const usableWidth = Math.max(1, width - paddingX * 2);
    const usableHeight = Math.max(1, height - paddingY * 2);
    const uniqueCanonicalRows = new Set(rows.map((row) => `${row.section_id}:${row.row_number}`)).size;
    const densityRows = Math.ceil(Math.sqrt(rows.length * Math.max(usableHeight / usableWidth, 0.22)));
    const intendedRows = Math.max(1, Math.min(rows.length, Math.max(uniqueCanonicalRows, densityRows)));
    const columns = Math.max(1, Math.ceil(rows.length / intendedRows));
    const visualRows = Math.ceil(rows.length / columns);
    const positions = [];
    let seatIndex = 0;
    let smallestGap = Math.min(usableHeight / Math.max(visualRows, 1), usableWidth / Math.max(columns, 1));

    for (let visualRow = 0; visualRow < visualRows; visualRow += 1) {
      const seatsInRow = Math.min(columns, rows.length - seatIndex);
      const y = bounds.minY + paddingY + usableHeight * (visualRow + 0.5) / visualRows;
      const horizontalGap = usableWidth / seatsInRow;
      smallestGap = Math.min(smallestGap, horizontalGap, usableHeight / visualRows);
      for (let column = 0; column < seatsInRow; column += 1) {
        const x = bounds.minX + paddingX + usableWidth * (column + 0.5) / seatsInRow;
        if (!pointInPolygon([x, y], section.polygon)) throw new Error(`Generated Theatre seat position is outside ${section.id}.`);
        positions.push({ row: rows[seatIndex], x, y });
        seatIndex += 1;
      }
    }
    if (seatIndex !== rows.length) throw new Error(`Could not place every canonical seat in ${section.id}.`);
    return { positions, radius: Math.max(0.7, Math.min(4.8, smallestGap * 0.3)) };
  }

  function renderSeats(svg, section, rows, color, selectedIds) {
    const placement = theatreSeatPositions(section, rows);
    const group = createSvg("g");
    group.classList.add("theatre-seats");
    const fragment = document.createDocumentFragment();
    placement.positions.forEach(({ row, x, y }) => {
      const seat = createSvg("circle");
      const selected = selectedIds.has(row.event_seat_id);
      seat.classList.add("seat", "is-visible");
      if (selected) seat.classList.add("selected");
      if (row.status !== "available" && !selected) seat.classList.add("unavailable");
      setAttributes(seat, {
        cx: x.toFixed(3), cy: y.toFixed(3), r: placement.radius.toFixed(2), fill: color,
        "data-event-seat-id": row.event_seat_id,
        "data-ticket-type-id": row.ticket_type_id,
        "data-row": row.row_number,
        "data-seat-number": row.seat_number,
        "data-seat": row.seat_number,
        "data-section": row.section_id,
        "data-status": row.status,
        role: "button",
        "aria-label": `${row.section_name}, row ${row.row_number}, seat ${row.seat_number}, ${row.ticket_type_name}, ₾${row.price}, ${row.status}`,
      });
      fragment.appendChild(seat);
    });
    group.appendChild(fragment);
    svg.appendChild(group);
    return placement.positions.length;
  }

  function buildBindingDiagnostics(rows, ticketTypes) {
    const expectedIds = new Set(rows.map((row) => row.event_seat_id));
    const ticketById = new Map(ticketTypes.map((ticket) => [ticket.ticket_type_id, ticket]));
    const perTier = {};
    blueprint.sections.forEach((section) => {
      if (!perTier[section.ticketTier]) perTier[section.ticketTier] = { canonical: 0, generatedPositions: 0, assigned: 0 };
    });
    rows.forEach((row) => {
      const ticket = ticketById.get(row.ticket_type_id);
      const canonicalTier = normalizeTier(ticket?.canonical_tier);
      const sectionTier = blueprint.sections.find((section) => blueprintTierToCanonicalTier[normalizeTier(section.ticketTier)] === canonicalTier)?.ticketTier;
      if (sectionTier && perTier[sectionTier]) perTier[sectionTier].canonical += 1;
    });
    return {
      canonicalEventSeats: rows.length,
      generatedPositions: 0,
      assignedSeats: 0,
      uniqueAssignedEventSeatIds: 0,
      duplicateAssignments: [],
      unassignedSeats: [...expectedIds],
      inventedUnknownIds: [],
      perTier,
    };
  }

  function bindingError(message, diagnostics) {
    console.error("Theatre canonical seat-binding diagnostics", diagnostics);
    const error = new Error(message);
    error.bindingDiagnostics = diagnostics;
    throw error;
  }

  function resolveSectionsByTicketType(ticketTypes, diagnostics) {
    const ticketByCanonicalTier = new Map();
    ticketTypes.forEach((ticket) => {
      const tier = normalizeTier(ticket.canonical_tier);
      if (ticket.ticket_type_id && tier && !ticketByCanonicalTier.has(tier)) ticketByCanonicalTier.set(tier, ticket);
    });
    const sectionsByTicketType = new Map();
    blueprint.sections.forEach((section) => {
      const canonicalTier = blueprintTierToCanonicalTier[normalizeTier(section.ticketTier)];
      const ticket = ticketByCanonicalTier.get(canonicalTier);
      if (!canonicalTier || !ticket?.ticket_type_id) bindingError(`No canonical ticket type could be resolved for Theatre geometry tier ${section.ticketTier}.`, diagnostics);
      if (!sectionsByTicketType.has(ticket.ticket_type_id)) sectionsByTicketType.set(ticket.ticket_type_id, []);
      sectionsByTicketType.get(ticket.ticket_type_id).push(section);
    });
    return sectionsByTicketType;
  }

  function finalizeDiagnostics(diagnostics, expectedIds, assignedIds) {
    const uniqueAssignedIds = new Set();
    const duplicateAssignments = [];
    assignedIds.forEach((id) => {
      if (uniqueAssignedIds.has(id)) duplicateAssignments.push(id);
      uniqueAssignedIds.add(id);
    });
    diagnostics.assignedSeats = assignedIds.length;
    diagnostics.uniqueAssignedEventSeatIds = uniqueAssignedIds.size;
    diagnostics.duplicateAssignments = duplicateAssignments;
    diagnostics.unassignedSeats = [...expectedIds].filter((id) => !uniqueAssignedIds.has(id));
    diagnostics.inventedUnknownIds = [...uniqueAssignedIds].filter((id) => !expectedIds.has(id));
    return diagnostics;
  }

  function renderStage(svg) {
    const stage = createSvg("rect");
    stage.classList.add("theatre-stage");
    setAttributes(stage, {
      x: blueprint.focalElement.x, y: blueprint.focalElement.y,
      width: blueprint.focalElement.width, height: blueprint.focalElement.height,
      rx: blueprint.focalElement.rx, "aria-hidden": "true",
    });
    svg.appendChild(stage);
    const label = createSvg("text");
    label.classList.add("theatre-stage-label");
    setAttributes(label, {
      x: blueprint.focalElement.x + blueprint.focalElement.width / 2,
      y: blueprint.focalElement.y + blueprint.focalElement.height / 2 + 11,
      "aria-hidden": "true",
    });
    label.textContent = "STAGE";
    svg.appendChild(label);
  }

  function render({ stageMap, rows, ticketTypes, colors, selectedIds }) {
    const diagnostics = buildBindingDiagnostics(rows, ticketTypes);
    const sectionsByTicketType = resolveSectionsByTicketType(ticketTypes, diagnostics);
    const rowsByTicketType = new Map();
    rows.forEach((row) => {
      if (!sectionsByTicketType.has(row.ticket_type_id)) bindingError(`No Theatre polygon exists for canonical ticket type UUID ${row.ticket_type_id}.`, diagnostics);
      if (!rowsByTicketType.has(row.ticket_type_id)) rowsByTicketType.set(row.ticket_type_id, []);
      rowsByTicketType.get(row.ticket_type_id).push(row);
    });
    const expectedIds = new Set(rows.map((row) => row.event_seat_id));
    const assignedIds = [];
    const viewport = document.createElement("div");
    viewport.className = "theatre-map-viewport";
    const svg = createSvg("svg");
    svg.classList.add("theatre-svg");
    setAttributes(svg, { viewBox: blueprint.viewBox.join(" "), role: "group", "aria-label": "Theatre interactive seat map", "data-seat-interaction-root": "true" });

    renderStage(svg);
    [...sectionsByTicketType.entries()].forEach(([ticketTypeId, sections]) => {
      const canonicalRows = (rowsByTicketType.get(ticketTypeId) || []).sort(stableSeatSort);
      const allocations = allocateByWeight(canonicalRows.length, sections.map((section) => polygonArea(section.polygon)));
      if (allocations.reduce((sum, allocation) => sum + allocation, 0) !== canonicalRows.length) bindingError(`Theatre allocation did not total canonical seat count for ticket type UUID ${ticketTypeId}.`, diagnostics);
      let offset = 0;
      sections.forEach((section, index) => {
        const assignedRows = canonicalRows.slice(offset, offset + allocations[index]);
        offset += allocations[index];
        const color = colors.get(ticketTypeId);
        if (!color) bindingError(`No runtime ticket color exists for canonical ticket type UUID ${ticketTypeId}.`, diagnostics);
        const polygon = createSvg("polygon");
        polygon.classList.add("theatre-section");
        setAttributes(polygon, {
          points: section.polygon.map(([x, y]) => `${x},${y}`).join(" "),
          fill: color, "data-section-template-id": section.id,
          "data-ticket-type-id": ticketTypeId, "aria-hidden": "true",
        });
        polygon.style.color = color;
        svg.appendChild(polygon);
        let generatedPositions;
        try {
          generatedPositions = renderSeats(svg, section, assignedRows, color, selectedIds);
        } catch (error) {
          finalizeDiagnostics(diagnostics, expectedIds, assignedIds);
          bindingError(error.message || `Could not generate seat positions for ${section.id}.`, diagnostics);
        }
        diagnostics.generatedPositions += generatedPositions;
        diagnostics.perTier[section.ticketTier].generatedPositions += generatedPositions;
        assignedRows.forEach((seat) => {
          assignedIds.push(seat.event_seat_id);
          diagnostics.perTier[section.ticketTier].assigned += 1;
        });
      });
    });

    finalizeDiagnostics(diagnostics, expectedIds, assignedIds);
    if (
      diagnostics.generatedPositions !== diagnostics.canonicalEventSeats
      || diagnostics.assignedSeats !== diagnostics.canonicalEventSeats
      || diagnostics.uniqueAssignedEventSeatIds !== diagnostics.canonicalEventSeats
      || diagnostics.duplicateAssignments.length
      || diagnostics.unassignedSeats.length
      || diagnostics.inventedUnknownIds.length
    ) bindingError("Theatre map binding did not render every canonical event seat exactly once.", diagnostics);
    console.info("Theatre canonical seat-binding diagnostics", diagnostics);

    viewport.appendChild(svg);
    const tooltip = document.createElement("div");
    tooltip.id = "seatMapTooltip";
    tooltip.className = "seat-map-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    stageMap.replaceChildren(viewport, tooltip);
    if (!window.HallMapViewportController) throw new Error("Hall map viewport controller is unavailable.");
    window.HallMapViewportController.attachSvg({ viewport, svg, viewBox: blueprint.viewBox });
    return { svg, assignedSeatCount: diagnostics.assignedSeats, diagnostics };
  }

  window.theatreSeatMap = { render, blueprint };
})();
