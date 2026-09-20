(() => {
  "use strict";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const blueprint = window.expoGeorgiaPavilion11Blueprint;
  if (!blueprint) return;
  const tiers = ["cheap", "medium", "expensive", "vip"];
  const number = (value) => Number(value) || 0;
  const normalize = (value) => String(value || "").trim().toLowerCase();
  const svg = (name) => document.createElementNS(SVG_NS, name);
  const attrs = (node, values) => Object.entries(values).forEach(([key, value]) => node.setAttribute(key, String(value)));

  function allocate(total, weights) {
    const sum = weights.reduce((value, weight) => value + weight, 0);
    const values = weights.map((weight) => Math.floor(total * weight / sum));
    let remaining = total - values.reduce((value, count) => value + count, 0);
    weights.map((weight, index) => ({ index, remainder: total * weight / sum - values[index] }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .slice(0, remaining).forEach(({ index }) => { values[index] += 1; });
    return values;
  }

  function positions(section, rows) {
    if (!rows.length) return { points: [], radius: 1 };
    const px = Math.min(20, Math.max(6, section.width * 0.045));
    const py = Math.min(18, Math.max(7, section.height * 0.1));
    const width = Math.max(1, section.width - px * 2);
    const height = Math.max(1, section.height - py * 2);
    const nativeRows = new Set(rows.map((row) => `${row.section_id}:${row.row_number}`)).size;
    const visualRows = Math.max(1, Math.min(rows.length, Math.max(nativeRows, Math.ceil(Math.sqrt(rows.length * Math.max(height / width, 0.2))))));
    const columns = Math.ceil(rows.length / visualRows);
    const countRows = Math.ceil(rows.length / columns);
    const points = [];
    let index = 0;
    let gap = Math.min(width / columns, height / countRows);
    for (let row = 0; row < countRows; row += 1) {
      const count = Math.min(columns, rows.length - index);
      const xGap = width / count;
      gap = Math.min(gap, xGap, height / countRows);
      for (let column = 0; column < count; column += 1) {
        points.push({ row: rows[index++], x: section.x + px + xGap * (column + 0.5), y: section.y + py + height * (row + 0.5) / countRows });
      }
    }
    return { points, radius: Math.max(0.7, Math.min(4.8, gap * 0.3)) };
  }

  function renderSection(root, section, rows, ticket, color, selectedIds) {
    const frame = svg("rect");
    frame.classList.add("expo-georgia-pavilion-11-section");
    attrs(frame, { x: section.x, y: section.y, width: section.width, height: section.height, rx: section.rx, fill: color, "data-section-template-id": section.key, "data-ticket-type-id": ticket.ticket_type_id, "aria-hidden": "true" });
    frame.style.color = color;
    root.appendChild(frame);
    const placement = positions(section, rows);
    const group = svg("g");
    group.classList.add("expo-georgia-pavilion-11-seats");
    const fragment = document.createDocumentFragment();
    placement.points.forEach(({ row, x, y }) => {
      const seat = svg("circle");
      const selected = selectedIds.has(row.event_seat_id);
      seat.classList.add("seat", "is-visible");
      if (selected) seat.classList.add("selected");
      if (row.status !== "available" && !selected) seat.classList.add("unavailable");
      attrs(seat, { cx: x.toFixed(3), cy: y.toFixed(3), r: placement.radius.toFixed(2), fill: color, "data-event-seat-id": row.event_seat_id, "data-ticket-type-id": row.ticket_type_id, "data-row": row.row_number, "data-seat-number": row.seat_number, "data-seat": row.seat_number, "data-section": row.section_id, "data-status": row.status, role: "button", "aria-label": `${row.section_name}, row ${row.row_number}, seat ${row.seat_number}, ${row.ticket_type_name}, ₾${row.price}, ${row.status}` });
      fragment.appendChild(seat);
    });
    group.appendChild(fragment);
    root.appendChild(group);
    return placement.points.map(({ row }) => row.event_seat_id);
  }

  function render({ stageMap, rows, ticketTypes, colors, selectedIds }) {
    const ticketByTier = new Map();
    ticketTypes.forEach((ticket) => { const tier = normalize(ticket.canonical_tier); if (tiers.includes(tier) && !ticketByTier.has(tier)) ticketByTier.set(tier, ticket); });
    if (tiers.some((tier) => !ticketByTier.get(tier)?.ticket_type_id)) throw new Error("ExpoGeorgia Pavilion 11 requires active Cheap, Medium, Expensive and VIP ticket types.");
    const rowsByTicket = new Map();
    rows.forEach((row) => { if (!rowsByTicket.has(row.ticket_type_id)) rowsByTicket.set(row.ticket_type_id, []); rowsByTicket.get(row.ticket_type_id).push(row); });
    const assigned = [];
    const viewport = document.createElement("div");
    viewport.className = "expo-georgia-pavilion-11-map-viewport";
    const root = svg("svg");
    root.classList.add("expo-georgia-pavilion-11-svg");
    attrs(root, { viewBox: blueprint.viewBox, role: "group", "aria-label": "ExpoGeorgia Pavilion 11 interactive seat map", "data-seat-interaction-root": "true" });
    const stage = svg("rect");
    stage.classList.add("expo-georgia-pavilion-11-stage");
    attrs(stage, { ...blueprint.stage, "aria-hidden": "true" });
    root.appendChild(stage);
    const stageLabel = svg("text");
    stageLabel.classList.add("expo-georgia-pavilion-11-stage-label");
    attrs(stageLabel, { x: blueprint.stage.x + blueprint.stage.width / 2, y: blueprint.stage.y + blueprint.stage.height / 2 + 11, "text-anchor": "middle", "aria-hidden": "true" });
    stageLabel.textContent = blueprint.stage.label;
    root.appendChild(stageLabel);
    tiers.forEach((tier) => {
      const ticket = ticketByTier.get(tier);
      const sections = blueprint.sections.filter((section) => section.tier === tier);
      const tierRows = [...(rowsByTicket.get(ticket.ticket_type_id) || [])].sort((a, b) => number(a.section_order) - number(b.section_order) || number(a.row_number) - number(b.row_number) || number(a.seat_number) - number(b.seat_number) || String(a.event_seat_id).localeCompare(String(b.event_seat_id)));
      const quantities = allocate(tierRows.length, sections.map((section) => section.width * section.height));
      let offset = 0;
      sections.forEach((section, index) => { const sectionRows = tierRows.slice(offset, offset + quantities[index]); offset += quantities[index]; assigned.push(...renderSection(root, section, sectionRows, ticket, colors.get(ticket.ticket_type_id) || blueprint.tierColors[tier], selectedIds)); });
    });
    const unique = new Set(assigned);
    if (assigned.length !== rows.length || unique.size !== rows.length) throw new Error("ExpoGeorgia Pavilion 11 map could not bind every canonical event seat exactly once.");
    viewport.appendChild(root);
    const tooltip = document.createElement("div");
    tooltip.id = "seatMapTooltip"; tooltip.className = "seat-map-tooltip"; tooltip.setAttribute("role", "tooltip"); tooltip.hidden = true;
    stageMap.replaceChildren(viewport, tooltip);
    window.HallMapViewportController.attachSvg({ viewport, svg: root, viewBox: blueprint.viewBox.split(/\s+/).map(Number) });
    return { svg: root, assignedSeatCount: assigned.length, diagnostics: { assignedSeats: assigned.length, uniqueAssignedEventSeatIds: unique.size } };
  }
  window.expoGeorgiaPavilion11SeatMap = { render, blueprint };
})();
