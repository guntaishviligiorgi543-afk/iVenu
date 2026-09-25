(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const blueprint = window.silkFactoryStudioBlueprint;
  if (!blueprint) return;
  const normalizeTier = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const numeric = (value) => Number(value) || 0;
  const createSvg = (name) => document.createElementNS(SVG_NS, name);
  const setAttributes = (node, attributes) =>
    Object.entries(attributes).forEach(([name, value]) =>
      node.setAttribute(name, String(value)),
    );
  const polygonArea = (polygon) =>
    Math.abs(
      polygon.reduce((sum, point, index) => {
        const next = polygon[(index + 1) % polygon.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0) / 2,
    );
  const allocateByWeight = (total, weights) => {
    const totalWeight = weights.reduce(
      (sum, weight) => sum + Math.max(0, weight),
      0,
    );
    if (!total || !totalWeight) return weights.map(() => 0);
    const allocations = weights.map((weight) =>
      Math.floor((total * Math.max(0, weight)) / totalWeight),
    );
    let remaining = total - allocations.reduce((sum, value) => sum + value, 0);
    weights
      .map((weight, index) => ({
        index,
        remainder:
          (total * Math.max(0, weight)) / totalWeight - allocations[index],
      }))
      .sort(
        (left, right) =>
          right.remainder - left.remainder || left.index - right.index,
      )
      .slice(0, remaining)
      .forEach(({ index }) => {
        allocations[index] += 1;
      });
    return allocations;
  };
  const stableSeatSort = (left, right) =>
    numeric(left.section_order) - numeric(right.section_order) ||
    String(left.section_code || "").localeCompare(
      String(right.section_code || ""),
    ) ||
    numeric(left.row_number) - numeric(right.row_number) ||
    numeric(left.seat_number) - numeric(right.seat_number) ||
    String(left.event_seat_id).localeCompare(String(right.event_seat_id));

  function localPolygon(polygon) {
    const center = polygon
      .reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
      .map((value) => value / polygon.length);
    let edge = [1, 0];
    let longest = 0;
    polygon.forEach(([x, y], index) => {
      const [nextX, nextY] = polygon[(index + 1) % polygon.length];
      const candidate = [nextX - x, nextY - y];
      const length = Math.hypot(candidate[0], candidate[1]);
      if (length > longest) {
        longest = length;
        edge = candidate;
      }
    });
    const axis = [
      edge[0] / Math.max(longest, 1),
      edge[1] / Math.max(longest, 1),
    ];
    const normal = [-axis[1], axis[0]];
    const toLocal = ([x, y]) => [
      (x - center[0]) * axis[0] + (y - center[1]) * axis[1],
      (x - center[0]) * normal[0] + (y - center[1]) * normal[1],
    ];
    const toWorld = ([u, v]) => [
      center[0] + u * axis[0] + v * normal[0],
      center[1] + u * axis[1] + v * normal[1],
    ];
    return { points: polygon.map(toLocal), toWorld };
  }

  function scanlineIntervals(polygon, v) {
    const intersections = [];
    polygon.forEach(([u1, v1], index) => {
      const [u2, v2] = polygon[(index + 1) % polygon.length];
      if ((v1 <= v && v2 > v) || (v2 <= v && v1 > v))
        intersections.push(u1 + ((v - v1) * (u2 - u1)) / (v2 - v1));
    });
    intersections.sort((left, right) => left - right);
    const intervals = [];
    for (let index = 0; index + 1 < intersections.length; index += 2)
      intervals.push([intersections[index], intersections[index + 1]]);
    return intervals;
  }

  function seatPositions(section, rows) {
    if (!rows.length) return { positions: [], radius: 1 };
    const geometry = localPolygon(section.polygon);
    const values = geometry.points.map(([, value]) => value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const height = maxV - minV;
    const width =
      Math.max(...geometry.points.map(([value]) => value)) -
      Math.min(...geometry.points.map(([value]) => value));
    const nativeRows = new Set(
      rows.map((row) => `${row.section_id}:${row.row_number}`),
    ).size;
    const visualRows = Math.max(
      1,
      Math.min(
        rows.length,
        Math.max(
          nativeRows,
          section.rows || 1,
          Math.ceil(
            Math.sqrt(rows.length * Math.max(height / Math.max(width, 1), 0.3)),
          ),
        ),
      ),
    );
    const padding = Math.min(14, Math.max(5, Math.min(width, height) * 0.08));
    const lineHeight = Math.max(1, (height - padding * 2) / visualRows);
    const lines = Array.from({ length: visualRows }, (_, index) => {
      const v = minV + padding + lineHeight * (index + 0.5);
      const intervals = scanlineIntervals(geometry.points, v)
        .map(([start, end]) => [start + padding, end - padding])
        .filter(([start, end]) => end > start);
      return {
        v,
        intervals,
        width: intervals.reduce((sum, [start, end]) => sum + end - start, 0),
      };
    }).filter((line) => line.width > 0);
    const perLine = allocateByWeight(
      rows.length,
      lines.map((line) => line.width),
    );
    const positions = [];
    let seatIndex = 0;
    let smallestGap = lineHeight;
    lines.forEach((line, lineIndex) => {
      const perInterval = allocateByWeight(
        perLine[lineIndex],
        line.intervals.map(([start, end]) => end - start),
      );
      line.intervals.forEach(([start, end], intervalIndex) => {
        const count = perInterval[intervalIndex];
        if (!count) return;
        smallestGap = Math.min(smallestGap, (end - start) / count);
        for (let index = 0; index < count; index += 1) {
          const [x, y] = geometry.toWorld([
            start + ((end - start) * (index + 0.5)) / count,
            line.v,
          ]);
          positions.push({ row: rows[seatIndex++], x, y });
        }
      });
    });
    if (seatIndex !== rows.length)
      throw new Error(`Could not place every canonical seat in ${section.id}.`);
    return {
      positions,
      radius: Math.max(2.2, Math.min(8, smallestGap * 0.32)),
    };
  }

  function renderStage(svg) {
    const stage = createSvg("rect");
    stage.classList.add("silk-factory-studio-stage");
    setAttributes(stage, {
      x: blueprint.stage.x,
      y: blueprint.stage.y,
      width: blueprint.stage.width,
      height: blueprint.stage.height,
      rx: blueprint.stage.rx,
      "aria-hidden": "true",
    });
    svg.appendChild(stage);
    const label = createSvg("text");
    label.classList.add("silk-factory-studio-stage-label");
    setAttributes(label, {
      x: blueprint.stage.x + blueprint.stage.width / 2,
      y: blueprint.stage.y + blueprint.stage.height / 2 + 12,
      "aria-hidden": "true",
    });
    label.textContent = blueprint.stage.label;
    svg.appendChild(label);
  }

  function render({ stageMap, rows, ticketTypes, colors, selectedIds }) {
    const svg = createSvg("svg");
    svg.classList.add("silk-factory-studio-svg");
    setAttributes(svg, {
      viewBox: blueprint.viewBox,
      role: "group",
      "aria-label": "Silk Factory Studio interactive seat map",
      "data-seat-interaction-root": "true",
    });
    const result = renderSvg({
      svg,
      rows,
      ticketTypes,
      colors,
      selectedIds,
      preview: false,
    });
    const viewport = document.createElement("div");
    viewport.className = "silk-factory-studio-map-viewport";
    viewport.appendChild(svg);
    const tooltip = document.createElement("div");
    tooltip.id = "seatMapTooltip";
    tooltip.className = "seat-map-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    stageMap.replaceChildren(viewport, tooltip);
    if (!window.HallMapViewportController)
      throw new Error("Hall map viewport controller is unavailable.");
    window.HallMapViewportController.attachSvg({
      viewport,
      svg,
      viewBox: blueprint.viewBox,
    });
    return {
      svg,
      assignedSeatCount: result.assignedSeatCount,
      diagnostics: result.diagnostics,
    };
  }

  function renderPreview({ svg, rows, tickets, colors }) {
    const ticketTypes = tickets.map((ticket) => ({
      ticket_type_id: String(ticket.id),
      canonical_tier: ticket.canonical_tier,
      display_color: ticket.display_color,
    }));
    return renderSvg({
      svg,
      rows,
      ticketTypes,
      colors,
      selectedIds: new Set(),
      preview: true,
    });
  }

  function renderSvg({ svg, rows, ticketTypes, colors, selectedIds, preview }) {
    const ticketById = new Map(
      ticketTypes.map((ticket) => [String(ticket.ticket_type_id), ticket]),
    );
    const ticketByTier = new Map();
    ticketTypes.forEach((ticket) => {
      const tier = normalizeTier(ticket.canonical_tier);
      if (ticket.ticket_type_id && tier && !ticketByTier.has(tier))
        ticketByTier.set(tier, ticket);
    });
    const rowsByType = new Map();
    rows.forEach((row) => {
      const id = String(row.ticket_type_id);
      if (!ticketById.has(id))
        throw new Error(
          `Silk Factory seat ${row.event_seat_id} has no canonical ticket type.`,
        );
      if (!rowsByType.has(id)) rowsByType.set(id, []);
      rowsByType.get(id).push(row);
    });
    const sectionsByTier = new Map();
    blueprint.sections.forEach((section) => {
      const tier = normalizeTier(section.ticketTier);
      if (!sectionsByTier.has(tier)) sectionsByTier.set(tier, []);
      sectionsByTier.get(tier).push(section);
    });
    const rowsBySection = new Map();
    sectionsByTier.forEach((sections, tier) => {
      const ticket = ticketByTier.get(tier);
      const canonicalRows = (
        rowsByType.get(String(ticket?.ticket_type_id)) || []
      )
        .slice()
        .sort(stableSeatSort);
      const allocations = allocateByWeight(
        canonicalRows.length,
        sections.map((section) => polygonArea(section.polygon)),
      );
      let offset = 0;
      sections.forEach((section, index) => {
        const assignedRows = canonicalRows.slice(
          offset,
          offset + allocations[index],
        );
        offset += allocations[index];
        rowsBySection.set(section.id, assignedRows);
      });
      if (offset !== canonicalRows.length) {
        throw new Error(
          `Silk Factory ${tier} allocation did not preserve every canonical seat.`,
        );
      }
    });
    const assigned = [];
    const sectionDiagnostics = [];
    renderStage(svg);
    blueprint.sections.forEach((section) => {
      const ticket = ticketByTier.get(normalizeTier(section.ticketTier));
      if (!ticket?.ticket_type_id)
        throw new Error(
          `Silk Factory is missing canonical ticket tier ${section.ticketTier}.`,
        );
      const sectionRows = rowsBySection.get(section.id) || [];
      const polygon = createSvg("polygon");
      polygon.classList.add("silk-factory-studio-section");
      const color =
        colors.get(String(ticket.ticket_type_id)) ||
        blueprint.tierColors[section.ticketTier];
      setAttributes(polygon, {
        points: section.polygon.map(([x, y]) => `${x},${y}`).join(" "),
        fill: color,
        stroke: color,
        "stroke-width": 3,
        "data-section-template-id": section.id,
        "data-ticket-type-id": ticket.ticket_type_id,
        "aria-label": section.label,
      });
      svg.appendChild(polygon);
      const placement = seatPositions(section, sectionRows);
      sectionDiagnostics.push({
        section: section.id,
        tier: section.ticketTier,
        canonical: sectionRows.length,
        placed: placement.positions.length,
      });
      const seats = createSvg("g");
      seats.classList.add("silk-factory-studio-seats");
      const fragment = document.createDocumentFragment();
      placement.positions.forEach(({ row, x, y }) => {
        const seat = createSvg("circle");
        const selected = selectedIds.has(row.event_seat_id);
        seat.classList.add("seat", "is-visible");
        if (selected) seat.classList.add("selected");
        if (row.status !== "available" && !selected)
          seat.classList.add("unavailable");
        setAttributes(seat, {
          cx: x.toFixed(2),
          cy: y.toFixed(2),
          r: placement.radius.toFixed(2),
          fill: color,
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
        fragment.appendChild(seat);
        assigned.push(row.event_seat_id);
      });
      seats.appendChild(fragment);
      svg.appendChild(seats);
    });
    const expected = new Set(rows.map((row) => row.event_seat_id));
    const unique = new Set(assigned);
    const counts = new Map();
    assigned.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    const missingIds = [...expected].filter((id) => !unique.has(id));
    const duplicateIds = [...counts]
      .filter(([, count]) => count > 1)
      .map(([id]) => id);
    const extraIds = [...unique].filter((id) => !expected.has(id));
    if (
      assigned.length !== rows.length ||
      unique.size !== expected.size ||
      missingIds.length ||
      duplicateIds.length ||
      extraIds.length
    ) {
      console.error("Silk Factory canonical binding diagnostics", {
        canonicalTotal: rows.length,
        renderedTotal: assigned.length,
        uniqueRenderedIds: unique.size,
        missingIds,
        duplicateIds,
        extraIds,
        sections: sectionDiagnostics,
      });
      throw new Error(
        "Silk Factory map did not bind every canonical event seat exactly once.",
      );
    }
    return {
      assignedSeatCount: assigned.length,
      diagnostics: {
        canonicalEventSeats: rows.length,
        assignedSeats: assigned.length,
        uniqueAssignedEventSeatIds: unique.size,
        sections: sectionDiagnostics,
        preview,
      },
    };
  }

  window.silkFactoryStudioSeatMap = { render, renderPreview, blueprint };
})();
