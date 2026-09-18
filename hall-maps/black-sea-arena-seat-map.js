(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const blueprint = window.blackSeaArenaBlueprint;
  if (!blueprint) return;

  const normalizeTier = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const numeric = (value) => Number(value) || 0;
  const createSvg = (name) => document.createElementNS(SVG_NS, name);
  const setAttributes = (node, attributes) => Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  // This is a geometry-label-to-canonical-tier lookup only. Once resolved,
  // every seat is grouped and assigned strictly by ticket_type_id UUID.
  const blueprintTierToCanonicalTier = Object.freeze({
    "cheap / standard": "cheap",
    "medium / premium": "medium",
    expensive: "expensive",
    vip: "vip",
  });

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
    const allocations = safeWeights.map((weight) => Math.floor((total * weight) / weightTotal));
    let remaining = total - allocations.reduce((sum, allocation) => sum + allocation, 0);
    safeWeights
      .map((weight, index) => ({ index, remainder: (total * weight) / weightTotal - allocations[index] }))
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

  function localPolygon(polygon) {
    const center = polygon.reduce((sum, [x, y]) => [sum[0] + x, sum[1] + y], [0, 0]).map((value) => value / polygon.length);
    let edge = [1, 0];
    let longest = -1;
    polygon.forEach(([x, y], index) => {
      const [nextX, nextY] = polygon[(index + 1) % polygon.length];
      const candidate = [nextX - x, nextY - y];
      const length = Math.hypot(candidate[0], candidate[1]);
      if (length > longest) { longest = length; edge = candidate; }
    });
    const axis = [edge[0] / longest, edge[1] / longest];
    const normal = [-axis[1], axis[0]];
    const toLocal = ([x, y]) => [
      (x - center[0]) * axis[0] + (y - center[1]) * axis[1],
      (x - center[0]) * normal[0] + (y - center[1]) * normal[1],
    ];
    const toWorld = ([u, v]) => [
      center[0] + u * axis[0] + v * normal[0],
      center[1] + u * axis[1] + v * normal[1],
    ];
    return { points: polygon.map(toLocal), toWorld, rotation: Math.atan2(axis[1], axis[0]) * 180 / Math.PI };
  }

  function scanlineIntervals(polygon, v) {
    const intersections = [];
    polygon.forEach(([u1, v1], index) => {
      const [u2, v2] = polygon[(index + 1) % polygon.length];
      if ((v1 <= v && v2 > v) || (v2 <= v && v1 > v)) intersections.push(u1 + (v - v1) * (u2 - u1) / (v2 - v1));
    });
    intersections.sort((left, right) => left - right);
    const intervals = [];
    for (let index = 0; index + 1 < intersections.length; index += 2) intervals.push([intersections[index], intersections[index + 1]]);
    return intervals;
  }

  function seatPositions(section, rows) {
    const geometry = localPolygon(section.polygon);
    const vs = geometry.points.map(([, v]) => v);
    const minV = Math.min(...vs);
    const maxV = Math.max(...vs);
    const height = maxV - minV;
    const uniqueCanonicalRows = new Set(rows.map((row) => `${row.section_id}:${row.row_number}`)).size;
    const us = geometry.points.map(([u]) => u);
    const width = Math.max(...us) - Math.min(...us);
    const densityRows = Math.ceil(Math.sqrt(rows.length * Math.max(height / Math.max(width, 1), 0.35)));
    const visualRows = Math.max(1, Math.min(Math.max(rows.length, 1), Math.max(section.previewRows, uniqueCanonicalRows, densityRows)));
    const edgePadding = Math.min(12, height * 0.08);
    const labelBand = Math.min(30, height * 0.2);
    const usableMinV = minV + edgePadding + labelBand;
    const usableMaxV = Math.max(usableMinV + 1, maxV - edgePadding);
    const lineSpacing = (usableMaxV - usableMinV) / visualRows;
    const lines = Array.from({ length: visualRows }, (_, index) => {
      const v = usableMinV + lineSpacing * (index + 0.5);
      const intervals = scanlineIntervals(geometry.points, v)
        .map(([start, end]) => [start + edgePadding, end - edgePadding])
        .filter(([start, end]) => end > start);
      return { v, intervals, width: intervals.reduce((sum, [start, end]) => sum + end - start, 0) };
    }).filter((line) => line.width > 0);
    const perLine = allocateByWeight(rows.length, lines.map((line) => line.width));
    const positions = [];
    let seatIndex = 0;
    let smallestGap = lineSpacing;
    lines.forEach((line, lineIndex) => {
      const perInterval = allocateByWeight(perLine[lineIndex], line.intervals.map(([start, end]) => end - start));
      line.intervals.forEach(([start, end], intervalIndex) => {
        const count = perInterval[intervalIndex];
        if (!count) return;
        smallestGap = Math.min(smallestGap, (end - start) / count);
        for (let index = 0; index < count; index += 1) {
          const [x, y] = geometry.toWorld([start + (end - start) * (index + 0.5) / count, line.v]);
          positions.push({ row: rows[seatIndex], x, y });
          seatIndex += 1;
        }
      });
    });
    if (seatIndex !== rows.length) throw new Error(`Could not place every canonical seat in ${section.id}.`);
    return { positions, radius: Math.max(0.85, Math.min(5, smallestGap * 0.34)) };
  }

  function renderSeats(svg, section, seats, color, selectedIds) {
    const placement = seatPositions(section, seats);
    const group = createSvg("g");
    group.classList.add("black-sea-arena-seats");
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
        "aria-label": `${row.section_name}, row ${row.row_number}, seat ${row.seat_number}, ${row.ticket_type_name}, ₾${row.price}`,
      });
      group.appendChild(seat);
    });
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
      const blueprintTier = Object.entries(blueprintTierToCanonicalTier)
        .find(([, tier]) => tier === canonicalTier)?.[0];
      const displayTier = blueprint.sections.find((section) => normalizeTier(section.ticketTier) === blueprintTier)?.ticketTier;
      if (displayTier && perTier[displayTier]) perTier[displayTier].canonical += 1;
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
    console.error("Black Sea Arena canonical seat-binding diagnostics", diagnostics);
    const error = new Error(message);
    error.bindingDiagnostics = diagnostics;
    throw error;
  }

  function resolveSectionsByTicketType(ticketTypes, diagnostics) {
    const ticketByCanonicalTier = new Map();
    const ticketById = new Map();
    ticketTypes.forEach((ticket) => {
      const canonicalTier = normalizeTier(ticket.canonical_tier);
      if (ticket.ticket_type_id) ticketById.set(ticket.ticket_type_id, ticket);
      if (ticket.ticket_type_id && canonicalTier && !ticketByCanonicalTier.has(canonicalTier)) {
        ticketByCanonicalTier.set(canonicalTier, ticket);
      }
    });
    const sectionsByTicketType = new Map();
    blueprint.sections.forEach((section) => {
      const canonicalTier = blueprintTierToCanonicalTier[normalizeTier(section.ticketTier)];
      const ticket = ticketByCanonicalTier.get(canonicalTier);
      if (!canonicalTier || !ticket?.ticket_type_id) {
        bindingError(`No canonical ticket type could be resolved for Black Sea Arena geometry tier ${section.ticketTier}.`, diagnostics);
      }
      if (!sectionsByTicketType.has(ticket.ticket_type_id)) sectionsByTicketType.set(ticket.ticket_type_id, []);
      sectionsByTicketType.get(ticket.ticket_type_id).push(section);
    });
    return { sectionsByTicketType, ticketById };
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

  function updateViewBox(svg, viewBox) {
    svg.setAttribute("viewBox", viewBox.map((value) => value.toFixed(3)).join(" "));
  }

  function bindNavigation(viewport, svg) {
    const original = [...blueprint.viewBox];
    let current = [...original];
    const limits = { minWidth: 360, minHeight: 225 };
    const clamp = () => {
      current[2] = Math.max(limits.minWidth, Math.min(original[2], current[2]));
      current[3] = Math.max(limits.minHeight, Math.min(original[3], current[3]));
      current[0] = Math.max(original[0], Math.min(original[0] + original[2] - current[2], current[0]));
      current[1] = Math.max(original[1], Math.min(original[1] + original[3] - current[3], current[1]));
      updateViewBox(svg, current);
    };
    const zoom = (factor) => {
      const centerX = current[0] + current[2] / 2;
      const centerY = current[1] + current[3] / 2;
      current[2] *= factor;
      current[3] *= factor;
      current[0] = centerX - current[2] / 2;
      current[1] = centerY - current[3] / 2;
      clamp();
    };
    viewport.querySelector(".black-sea-arena-map-controls").addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.mapAction;
      if (action === "zoom-in") zoom(0.8);
      if (action === "zoom-out") zoom(1.25);
      if (action === "reset") { current = [...original]; clamp(); }
    });
    let pan = null;
    svg.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".seat")) return;
      pan = { x: event.clientX, y: event.clientY, viewBox: [...current] };
      svg.setPointerCapture?.(event.pointerId);
      svg.classList.add("is-panning");
    });
    svg.addEventListener("pointermove", (event) => {
      if (!pan) return;
      const rect = svg.getBoundingClientRect();
      current[0] = pan.viewBox[0] - (event.clientX - pan.x) * pan.viewBox[2] / Math.max(rect.width, 1);
      current[1] = pan.viewBox[1] - (event.clientY - pan.y) * pan.viewBox[3] / Math.max(rect.height, 1);
      clamp();
    });
    const stopPan = () => { pan = null; svg.classList.remove("is-panning"); };
    svg.addEventListener("pointerup", stopPan);
    svg.addEventListener("pointercancel", stopPan);
  }

  function render({ stageMap, rows, ticketTypes, colors, selectedIds }) {
    const diagnostics = buildBindingDiagnostics(rows, ticketTypes);
    const { sectionsByTicketType, ticketById } = resolveSectionsByTicketType(ticketTypes, diagnostics);
    const rowsByTicketType = new Map();
    rows.forEach((row) => {
      if (!sectionsByTicketType.has(row.ticket_type_id)) {
        bindingError(`No Black Sea Arena polygon exists for canonical ticket type UUID ${row.ticket_type_id}.`, diagnostics);
      }
      if (!rowsByTicketType.has(row.ticket_type_id)) rowsByTicketType.set(row.ticket_type_id, []);
      rowsByTicketType.get(row.ticket_type_id).push(row);
    });
    const expectedIds = new Set(rows.map((row) => row.event_seat_id));
    const assignedIds = [];
    const viewport = document.createElement("div");
    viewport.className = "black-sea-arena-map-viewport";
    const controls = document.createElement("div");
    controls.className = "black-sea-arena-map-controls";
    controls.innerHTML = '<button type="button" data-map-action="zoom-in" aria-label="Zoom in">+</button><button type="button" data-map-action="zoom-out" aria-label="Zoom out">−</button><button type="button" data-map-action="reset">Reset</button>';
    const svg = createSvg("svg");
    svg.classList.add("black-sea-arena-svg");
    setAttributes(svg, { viewBox: blueprint.viewBox.join(" "), role: "group", "aria-label": "Black Sea Arena interactive seat map", "data-seat-interaction-root": "true" });
    const stage = createSvg("ellipse");
    stage.classList.add("black-sea-arena-stage");
    setAttributes(stage, { cx: blueprint.stage.cx, cy: blueprint.stage.cy, rx: blueprint.stage.rx, ry: blueprint.stage.ry, "aria-hidden": "true" });
    svg.appendChild(stage);
    const stageLabel = createSvg("text");
    stageLabel.classList.add("black-sea-arena-stage-label");
    setAttributes(stageLabel, { x: blueprint.stage.cx, y: blueprint.stage.cy + 7, "aria-hidden": "true" });
    stageLabel.textContent = "STAGE";
    svg.appendChild(stageLabel);

    [...sectionsByTicketType.entries()].forEach(([ticketTypeId, sections]) => {
      const canonicalRows = (rowsByTicketType.get(ticketTypeId) || []).sort(stableSeatSort);
      const allocations = allocateByWeight(canonicalRows.length, sections.map((section) => polygonArea(section.polygon)));
      if (allocations.reduce((sum, allocation) => sum + allocation, 0) !== canonicalRows.length) {
        bindingError(`Black Sea Arena allocation did not total the canonical seat count for ticket type UUID ${ticketTypeId}.`, diagnostics);
      }
      let offset = 0;
      sections.forEach((section, index) => {
        const seats = canonicalRows.slice(offset, offset + allocations[index]);
        offset += allocations[index];
        const ticket = ticketById.get(ticketTypeId);
        const color = colors.get(ticket?.ticket_type_id) || blueprint.tierColors[section.ticketTier];
        const polygon = createSvg("polygon");
        polygon.classList.add("black-sea-arena-section");
        setAttributes(polygon, { points: section.polygon.map(([x, y]) => `${x},${y}`).join(" "), fill: color, "data-section-template-id": section.id, "data-ticket-type-id": ticket?.ticket_type_id || "" });
        polygon.style.color = color;
        svg.appendChild(polygon);
        let generatedPositions;
        try {
          generatedPositions = renderSeats(svg, section, seats, color, selectedIds);
        } catch (error) {
          finalizeDiagnostics(diagnostics, expectedIds, assignedIds);
          bindingError(error.message || `Could not generate seat positions for ${section.id}.`, diagnostics);
        }
        diagnostics.generatedPositions += generatedPositions;
        diagnostics.perTier[section.ticketTier].generatedPositions += generatedPositions;
        seats.forEach((seat) => {
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
    ) {
      bindingError("Black Sea Arena map binding did not render every canonical event seat exactly once.", diagnostics);
    }
    console.info("Black Sea Arena canonical seat-binding diagnostics", diagnostics);

    viewport.append(controls, svg);
    const tooltip = document.createElement("div");
    tooltip.id = "seatMapTooltip";
    tooltip.className = "seat-map-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    stageMap.replaceChildren(viewport, tooltip);
    bindNavigation(viewport, svg);
    return { svg, assignedSeatCount: diagnostics.assignedSeats, diagnostics };
  }

  window.blackSeaArenaSeatMap = { render, blueprint };
})();
