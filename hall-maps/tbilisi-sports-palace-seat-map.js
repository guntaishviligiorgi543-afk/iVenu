(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const blueprint = window.tbilisiSportsPalaceBlueprint;
  if (!blueprint) return;

  const normalizeTier = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const numeric = (value) => Number(value) || 0;
  const createSvg = (name) => document.createElementNS(SVG_NS, name);
  const setAttributes = (node, attributes) => Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));

  function allocateByWeight(total, weights) {
    const weightTotal = weights.reduce((sum, value) => sum + Math.max(0, numeric(value)), 0);
    if (!total || !weightTotal) return weights.map(() => 0);
    const allocations = weights.map((weight) => Math.floor(total * Math.max(0, numeric(weight)) / weightTotal));
    let remaining = total - allocations.reduce((sum, value) => sum + value, 0);
    weights.map((weight, index) => ({ index, remainder: total * Math.max(0, numeric(weight)) / weightTotal - allocations[index] }))
      .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
      .slice(0, remaining)
      .forEach(({ index }) => { allocations[index] += 1; });
    return allocations;
  }

  function stableSeatSort(left, right) {
    return numeric(left.section_order) - numeric(right.section_order)
      || String(left.section_code || "").localeCompare(String(right.section_code || ""))
      || numeric(left.row_number) - numeric(right.row_number)
      || numeric(left.seat_number) - numeric(right.seat_number)
      || String(left.event_seat_id).localeCompare(String(right.event_seat_id));
  }

  function seatPositions(section, rows) {
    if (!rows.length) return { positions: [], radius: 1 };
    const paddingX = Math.min(20, Math.max(6, section.width * 0.045));
    const paddingY = Math.min(20, Math.max(7, section.height * 0.12));
    const labelBand = Math.min(26, section.height * 0.22);
    const usableWidth = Math.max(1, section.width - paddingX * 2);
    const usableHeight = Math.max(1, section.height - paddingY * 2 - labelBand);
    const canonicalRows = new Set(rows.map((row) => `${row.section_id}:${row.row_number}`)).size;
    const densityRows = Math.ceil(Math.sqrt(rows.length * Math.max(usableHeight / usableWidth, 0.2)));
    const visualRows = Math.max(1, Math.min(rows.length, Math.max(canonicalRows, densityRows)));
    const columns = Math.max(1, Math.ceil(rows.length / visualRows));
    const renderedRows = Math.ceil(rows.length / columns);
    const positions = [];
    let index = 0;
    let smallestGap = Math.min(usableWidth / columns, usableHeight / renderedRows);
    for (let rowIndex = 0; rowIndex < renderedRows; rowIndex += 1) {
      const count = Math.min(columns, rows.length - index);
      const y = section.y + paddingY + labelBand + usableHeight * (rowIndex + 0.5) / renderedRows;
      const gap = usableWidth / count;
      smallestGap = Math.min(smallestGap, gap, usableHeight / renderedRows);
      for (let column = 0; column < count; column += 1) {
        positions.push({ row: rows[index], x: section.x + paddingX + gap * (column + 0.5), y });
        index += 1;
      }
    }
    return { positions, radius: Math.max(0.7, Math.min(4.8, smallestGap * 0.3)) };
  }

  function renderSection(svg, section, rows, color, selectedIds, ticketTypeId) {
    const rect = createSvg("rect");
    rect.classList.add("tbilisi-sports-palace-section");
    setAttributes(rect, { x: section.x, y: section.y, width: section.width, height: section.height, rx: section.rx, fill: color, "data-section-template-id": section.key, "data-ticket-type-id": ticketTypeId, "aria-hidden": "true" });
    rect.style.color = color;
    svg.appendChild(rect);

    const placement = seatPositions(section, rows);
    const group = createSvg("g");
    group.classList.add("tbilisi-sports-palace-seats");
    const fragment = document.createDocumentFragment();
    placement.positions.forEach(({ row, x, y }) => {
      const seat = createSvg("circle");
      const selected = selectedIds.has(row.event_seat_id);
      seat.classList.add("seat", "is-visible");
      if (selected) seat.classList.add("selected");
      if (row.status !== "available" && !selected) seat.classList.add("unavailable");
      setAttributes(seat, {
        cx: x.toFixed(3), cy: y.toFixed(3), r: placement.radius.toFixed(2), fill: color,
        "data-event-seat-id": row.event_seat_id, "data-ticket-type-id": row.ticket_type_id,
        "data-row": row.row_number, "data-seat-number": row.seat_number, "data-seat": row.seat_number,
        "data-section": row.section_id, "data-status": row.status, role: "button",
        "aria-label": `${row.section_name}, row ${row.row_number}, seat ${row.seat_number}, ${row.ticket_type_name}, ₾${row.price}, ${row.status}`,
      });
      fragment.appendChild(seat);
    });
    group.appendChild(fragment);
    svg.appendChild(group);
    return placement.positions.map(({ row }) => row.event_seat_id);
  }

  function renderStage(svg) {
    const { stage } = blueprint;
    const node = createSvg("rect");
    node.classList.add("tbilisi-sports-palace-stage");
    setAttributes(node, { x: stage.x, y: stage.y, width: stage.width, height: stage.height, rx: stage.rx, "aria-hidden": "true" });
    svg.appendChild(node);
    const label = createSvg("text");
    label.classList.add("tbilisi-sports-palace-stage-label");
    setAttributes(label, { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 + 11, "text-anchor": "middle", "aria-hidden": "true" });
    label.textContent = stage.label;
    svg.appendChild(label);
  }

  function render({ stageMap, rows, ticketTypes, colors, selectedIds }) {
    const ticketsByTier = new Map();
    ticketTypes.forEach((ticket) => {
      const tier = normalizeTier(ticket.canonical_tier);
      if (ticket.ticket_type_id && ["cheap", "medium", "expensive", "vip"].includes(tier) && !ticketsByTier.has(tier)) ticketsByTier.set(tier, ticket);
    });
    blueprint.sections.forEach((section) => {
      if (!ticketsByTier.get(section.tier)?.ticket_type_id) throw new Error(`Tbilisi Sports Palace requires an active ${section.tier} ticket type.`);
    });
    const rowsByTicketType = new Map();
    rows.forEach((row) => {
      if (!rowsByTicketType.has(row.ticket_type_id)) rowsByTicketType.set(row.ticket_type_id, []);
      rowsByTicketType.get(row.ticket_type_id).push(row);
    });
    const expectedIds = new Set(rows.map((row) => row.event_seat_id));
    const assignedIds = [];
    const viewport = document.createElement("div");
    viewport.className = "tbilisi-sports-palace-map-viewport";
    const svg = createSvg("svg");
    svg.classList.add("tbilisi-sports-palace-svg");
    setAttributes(svg, { viewBox: blueprint.viewBox, role: "group", "aria-label": "Tbilisi Sports Palace interactive seat map", "data-seat-interaction-root": "true" });
    renderStage(svg);
    ["cheap", "medium", "expensive", "vip"].forEach((tier) => {
      const ticket = ticketsByTier.get(tier);
      const tierSections = blueprint.sections.filter((section) => section.tier === tier);
      const tierRows = (rowsByTicketType.get(ticket.ticket_type_id) || []).sort(stableSeatSort);
      const allocations = allocateByWeight(tierRows.length, tierSections.map((section) => section.width * section.height));
      let offset = 0;
      tierSections.forEach((section, index) => {
        const assignedRows = tierRows.slice(offset, offset + allocations[index]);
        offset += allocations[index];
        const color = colors.get(ticket.ticket_type_id) || blueprint.tierColors[tier];
        assignedIds.push(...renderSection(svg, section, assignedRows, color, selectedIds, ticket.ticket_type_id));
      });
    });
    const uniqueIds = new Set(assignedIds);
    if (assignedIds.length !== rows.length || uniqueIds.size !== rows.length || [...expectedIds].some((id) => !uniqueIds.has(id))) {
      throw new Error("Tbilisi Sports Palace map could not bind every canonical event seat exactly once.");
    }
    viewport.appendChild(svg);
    const tooltip = document.createElement("div");
    tooltip.id = "seatMapTooltip";
    tooltip.className = "seat-map-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    stageMap.replaceChildren(viewport, tooltip);
    if (!window.HallMapViewportController) throw new Error("Hall map viewport controller is unavailable.");
    window.HallMapViewportController.attachSvg({ viewport, svg, viewBox: blueprint.viewBox.split(/\s+/).map(Number) });
    return { svg, assignedSeatCount: assignedIds.length, diagnostics: { assignedSeats: assignedIds.length, uniqueAssignedEventSeatIds: uniqueIds.size } };
  }

  window.tbilisiSportsPalaceSeatMap = { render, blueprint };
})();
