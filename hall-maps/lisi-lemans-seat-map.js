(() => {
  "use strict";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const blueprint = window.lisiLemansBlueprint;
  if (!blueprint) return;
  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const numeric = (value) => Number(value) || 0;
  const svg = (name) => document.createElementNS(SVG_NS, name);
  const attrs = (node, values) =>
    Object.entries(values).forEach(([key, value]) =>
      node.setAttribute(key, String(value)),
    );
  const area = (polygon) =>
    Math.abs(
      polygon.reduce((sum, point, index) => {
        const next = polygon[(index + 1) % polygon.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0) / 2,
    );
  function allocate(total, weights) {
    const totalWeight = weights.reduce(
      (sum, value) => sum + Math.max(0, value),
      0,
    );
    if (!total || !totalWeight) return weights.map(() => 0);
    const values = weights.map((weight) =>
      Math.floor((total * Math.max(0, weight)) / totalWeight),
    );
    let remainder = total - values.reduce((sum, value) => sum + value, 0);
    weights
      .map((weight, index) => ({
        index,
        remainder: (total * Math.max(0, weight)) / totalWeight - values[index],
      }))
      .sort(
        (left, right) =>
          right.remainder - left.remainder || left.index - right.index,
      )
      .slice(0, remainder)
      .forEach(({ index }) => {
        values[index] += 1;
      });
    return values;
  }
  const stableSort = (left, right) =>
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
    let edge = [1, 0],
      longest = 0;
    polygon.forEach(([x, y], index) => {
      const [nx, ny] = polygon[(index + 1) % polygon.length];
      const candidate = [nx - x, ny - y];
      const length = Math.hypot(...candidate);
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
    return {
      points: polygon.map(([x, y]) => [
        (x - center[0]) * axis[0] + (y - center[1]) * axis[1],
        (x - center[0]) * normal[0] + (y - center[1]) * normal[1],
      ]),
      toWorld: ([u, v]) => [
        center[0] + u * axis[0] + v * normal[0],
        center[1] + u * axis[1] + v * normal[1],
      ],
    };
  }
  function intervals(polygon, value) {
    const hits = [];
    polygon.forEach(([a, b], index) => {
      const [c, d] = polygon[(index + 1) % polygon.length];
      if ((b <= value && d > value) || (d <= value && b > value))
        hits.push(a + ((value - b) * (c - a)) / (d - b));
    });
    hits.sort((a, b) => a - b);
    const result = [];
    for (let index = 0; index + 1 < hits.length; index += 2)
      result.push([hits[index], hits[index + 1]]);
    return result;
  }
  function signedArea(polygon) {
    return (
      polygon.reduce((sum, point, index) => {
        const next = polygon[(index + 1) % polygon.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0) / 2
    );
  }

  function lineIntersection(first, second) {
    const determinant =
      first.direction[0] * second.direction[1] -
      first.direction[1] * second.direction[0];
    if (Math.abs(determinant) < 0.000001) return null;
    const delta = [
      second.point[0] - first.point[0],
      second.point[1] - first.point[1],
    ];
    const scale =
      (delta[0] * second.direction[1] - delta[1] * second.direction[0]) /
      determinant;
    return [
      first.point[0] + first.direction[0] * scale,
      first.point[1] + first.direction[1] * scale,
    ];
  }

  function insetConvexPolygon(polygon, inset) {
    const ccw = signedArea(polygon) > 0;
    const lines = polygon.map((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      const direction = [next[0] - point[0], next[1] - point[1]];
      const length = Math.max(Math.hypot(...direction), 0.000001);
      const inward = ccw
        ? [-direction[1] / length, direction[0] / length]
        : [direction[1] / length, -direction[0] / length];
      return {
        point: [point[0] + inward[0] * inset, point[1] + inward[1] * inset],
        direction,
      };
    });
    return lines
      .map((line, index) =>
        lineIntersection(
          lines[(index + lines.length - 1) % lines.length],
          line,
        ),
      )
      .filter(Boolean);
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (
      let index = 0, previous = polygon.length - 1;
      index < polygon.length;
      previous = index++
    ) {
      const [x, y] = polygon[index];
      const [previousX, previousY] = polygon[previous];
      if (
        y > point[1] !== previousY > point[1] &&
        point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x
      )
        inside = !inside;
    }
    return inside;
  }

  function positionCandidate(
    geometry,
    safePolygon,
    rows,
    rowCount,
    radius,
    gap,
  ) {
    const values = safePolygon.map(([, value]) => value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spacing = (max - min) / rowCount;
    if (spacing < radius * 2 + gap) return null;
    const lines = Array.from({ length: rowCount }, (_, index) => {
      const value = min + spacing * (index + 0.5);
      const ranges = intervals(safePolygon, value).filter(
        ([start, end]) => end > start,
      );
      const capacities = ranges.map(([start, end]) =>
        Math.max(0, Math.floor((end - start) / (radius * 2 + gap))),
      );
      return {
        value,
        ranges,
        capacities,
        capacity: capacities.reduce((sum, count) => sum + count, 0),
      };
    }).filter((line) => line.capacity > 0);
    const totalCapacity = lines.reduce((sum, line) => sum + line.capacity, 0);
    if (totalCapacity < rows.length) return null;
    const counts = allocate(
      rows.length,
      lines.map((line) => line.capacity),
    );
    const items = [];
    let rowIndex = 0;
    lines.forEach((line, lineIndex) => {
      let remaining = counts[lineIndex];
      line.ranges.forEach(([start, end], rangeIndex) => {
        const count = Math.min(remaining, line.capacities[rangeIndex]);
        remaining -= count;
        for (let index = 0; index < count; index += 1) {
          const [x, y] = geometry.toWorld([
            start + ((end - start) * (index + 0.5)) / count,
            line.value,
          ]);
          items.push({ row: rows[rowIndex++], x, y });
        }
      });
    });
    return items.length === rows.length ? { items, radius } : null;
  }

  function seatInsidePolygon(item, polygon, radius) {
    const samples = [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
      [radius * 0.707, radius * 0.707],
      [radius * 0.707, -radius * 0.707],
      [-radius * 0.707, radius * 0.707],
      [-radius * 0.707, -radius * 0.707],
    ];
    return samples.every(([offsetX, offsetY]) =>
      pointInPolygon([item.x + offsetX, item.y + offsetY], polygon),
    );
  }

  function countOverlapPairs(items, radius) {
    let overlapPairs = 0;
    for (let firstIndex = 0; firstIndex < items.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < items.length;
        secondIndex += 1
      ) {
        if (
          Math.hypot(
            items[firstIndex].x - items[secondIndex].x,
            items[firstIndex].y - items[secondIndex].y,
          ) <=
          radius * 2
        )
          overlapPairs += 1;
      }
    }
    return overlapPairs;
  }

  function positions(section, rows) {
    if (!rows.length) return { items: [], radius: 1, outside: 0 };
    const geometry = localPolygon(section.polygon);
    const preferredRows = Math.max(
      1,
      section.rows || 1,
      new Set(rows.map((row) => `${row.section_id}:${row.row_number}`)).size,
    );
    const radii = [5, 4.5, 4, 3.5, 3, 2.5, 2.2];
    let result = null;
    for (const radius of radii) {
      const geometry = localPolygon(section.polygon);
      const values = geometry.points.map(([, value]) => value);
      const maxRows = Math.max(
        1,
        Math.floor(
          (Math.max(...values) - Math.min(...values)) / (radius * 2 + 2),
        ),
      );
      const rowCounts = [
        ...new Set([
          ...Array.from(
            { length: Math.max(0, maxRows - preferredRows + 1) },
            (_, index) => preferredRows + index,
          ),
          ...Array.from(
            { length: Math.min(preferredRows - 1, maxRows) },
            (_, index) => index + 1,
          ),
        ]),
      ].filter((rowCount) => rowCount <= maxRows);
      for (const rowCount of rowCounts) {
        const safePolygon = insetConvexPolygon(geometry.points, radius + 3);
        result = positionCandidate(
          geometry,
          safePolygon,
          rows,
          rowCount,
          radius,
          2,
        );
        if (result) break;
      }
      if (result) break;
    }
    if (!result)
      throw new Error(
        `Could not fit every canonical seat inside ${section.id}.`,
      );
    const outside = result.items.reduce(
      (count, item) =>
        count +
        (seatInsidePolygon(item, section.polygon, result.radius) ? 0 : 1),
      0,
    );
    const overlapPairs = countOverlapPairs(result.items, result.radius);
    if (outside)
      throw new Error(`${outside} Lisi Lemans seats escaped ${section.id}.`);
    if (overlapPairs)
      throw new Error(
        `${overlapPairs} Lisi Lemans seat pairs overlap in ${section.id}.`,
      );
    return { ...result, outside, overlapPairs };
  }
  function renderStage(target) {
    const stage = svg("polygon");
    stage.classList.add("lisi-lemans-stage");
    attrs(stage, {
      points: blueprint.stage.points.map(([x, y]) => `${x},${y}`).join(" "),
      "aria-hidden": "true",
    });
    target.appendChild(stage);
    const label = svg("text");
    label.classList.add("lisi-lemans-stage-label");
    attrs(label, { x: 800, y: 155, "aria-hidden": "true" });
    label.textContent = "STAGE";
    target.appendChild(label);
  }
  function render({ stageMap, rows, ticketTypes, colors, selectedIds }) {
    const target = svg("svg");
    target.classList.add("lisi-lemans-svg");
    attrs(target, {
      viewBox: blueprint.viewBox,
      role: "group",
      "aria-label": "Lisi Lemans interactive outdoor seat map",
      "data-seat-interaction-root": "true",
    });
    const result = renderSvg({
      target,
      rows,
      ticketTypes,
      colors,
      selectedIds,
      preview: false,
    });
    const viewport = document.createElement("div");
    viewport.className = "lisi-lemans-map-viewport";
    viewport.appendChild(target);
    const tooltip = document.createElement("div");
    tooltip.id = "seatMapTooltip";
    tooltip.className = "seat-map-tooltip";
    tooltip.hidden = true;
    stageMap.replaceChildren(viewport, tooltip);
    window.HallMapViewportController.attachSvg({
      viewport,
      svg: target,
      viewBox: blueprint.viewBox,
    });
    return {
      svg: target,
      assignedSeatCount: result.assignedSeatCount,
      diagnostics: result.diagnostics,
    };
  }
  function renderPreview({ svg: target, rows, tickets, colors }) {
    return renderSvg({
      target,
      rows,
      ticketTypes: tickets.map((ticket) => ({
        ticket_type_id: String(ticket.id),
        canonical_tier: ticket.canonical_tier,
        display_color: ticket.display_color,
      })),
      colors,
      selectedIds: new Set(),
      preview: true,
    });
  }
  function renderSvg({
    target,
    rows,
    ticketTypes,
    colors,
    selectedIds,
    preview,
  }) {
    const byId = new Map(
      ticketTypes.map((ticket) => [String(ticket.ticket_type_id), ticket]),
    );
    const byTier = new Map();
    ticketTypes.forEach((ticket) => {
      const tier = normalize(ticket.canonical_tier);
      if (ticket.ticket_type_id && tier && !byTier.has(tier))
        byTier.set(tier, ticket);
    });
    const byType = new Map();
    rows.forEach((row) => {
      const id = String(row.ticket_type_id);
      if (!byId.has(id))
        throw new Error(
          `Lisi Lemans seat ${row.event_seat_id} has no canonical ticket type.`,
        );
      if (!byType.has(id)) byType.set(id, []);
      byType.get(id).push(row);
    });
    const bySection = new Map();
    const sectionsByTier = new Map();
    blueprint.sections.forEach((section) => {
      const tier = normalize(section.ticketTier);
      if (!sectionsByTier.has(tier)) sectionsByTier.set(tier, []);
      sectionsByTier.get(tier).push(section);
    });
    sectionsByTier.forEach((sections, tier) => {
      const ticket = byTier.get(tier);
      if (!ticket?.ticket_type_id)
        throw new Error(`Lisi Lemans is missing canonical tier ${tier}.`);
      const tierRows = (byType.get(String(ticket.ticket_type_id)) || [])
        .slice()
        .sort(stableSort);
      const allocations = allocate(
        tierRows.length,
        sections.map((section) => area(section.polygon)),
      );
      let offset = 0;
      sections.forEach((section, index) => {
        bySection.set(
          section.id,
          tierRows.slice(offset, offset + allocations[index]),
        );
        offset += allocations[index];
      });
      if (offset !== tierRows.length)
        throw new Error(`Lisi Lemans ${tier} allocation lost canonical seats.`);
    });
    const assigned = [];
    const sectionDiagnostics = [];
    renderStage(target);
    blueprint.sections.forEach((section) => {
      const ticket = byTier.get(normalize(section.ticketTier));
      const color =
        colors.get(String(ticket.ticket_type_id)) ||
        blueprint.tierColors[section.ticketTier];
      const sectionGroup = svg("g");
      sectionGroup.classList.add("lisi-lemans-section-group");
      const polygon = svg("polygon");
      polygon.classList.add("lisi-lemans-section");
      attrs(polygon, {
        points: section.polygon.map(([x, y]) => `${x},${y}`).join(" "),
        fill: color,
        stroke: color,
        "stroke-width": 3,
        "data-ticket-type-id": ticket.ticket_type_id,
        "data-section-template-id": section.id,
        "aria-label": `${section.ticketTier} seating section`,
      });
      sectionGroup.appendChild(polygon);
      const placement = positions(section, bySection.get(section.id) || []);
      const group = svg("g");
      group.classList.add("lisi-lemans-seats");
      placement.items.forEach(({ row, x, y }) => {
        const seat = svg("circle");
        const selected = selectedIds.has(row.event_seat_id);
        seat.classList.add("seat", "is-visible");
        if (selected) seat.classList.add("selected");
        if (row.status !== "available" && !selected)
          seat.classList.add("unavailable");
        attrs(seat, {
          cx: x.toFixed(2),
          cy: y.toFixed(2),
          r: placement.radius.toFixed(2),
          fill: color,
          "data-event-seat-id": row.event_seat_id,
          "data-ticket-type-id": row.ticket_type_id,
          "data-row": row.row_number,
          "data-seat-number": row.seat_number,
          "data-section": row.section_id,
          "data-status": row.status,
          role: "button",
          "aria-label": `${row.section_name}, row ${row.row_number}, seat ${row.seat_number}, ${row.ticket_type_name}, ₾${row.price}`,
        });
        group.appendChild(seat);
        assigned.push(row.event_seat_id);
      });
      sectionGroup.appendChild(group);
      target.appendChild(sectionGroup);
      sectionDiagnostics.push({
        section: section.id,
        tier: section.ticketTier,
        canonical: (bySection.get(section.id) || []).length,
        placed: placement.items.length,
        outside: placement.outside,
        overlapPairs: placement.overlapPairs,
      });
    });
    const expected = new Set(rows.map((row) => row.event_seat_id));
    const counts = new Map();
    assigned.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    const unique = new Set(assigned);
    const missing = [...expected].filter((id) => !unique.has(id));
    const duplicates = [...counts]
      .filter(([, count]) => count > 1)
      .map(([id]) => id);
    const extra = [...unique].filter((id) => !expected.has(id));
    const outside = sectionDiagnostics.reduce(
      (sum, section) => sum + section.outside,
      0,
    );
    const overlapPairs = sectionDiagnostics.reduce(
      (sum, section) => sum + section.overlapPairs,
      0,
    );
    if (
      missing.length ||
      duplicates.length ||
      extra.length ||
      outside ||
      overlapPairs ||
      unique.size !== expected.size
    )
      throw new Error(
        `Lisi Lemans binding failed: missing ${missing.length}, duplicates ${duplicates.length}, extra ${extra.length}.`,
      );
    return {
      assignedSeatCount: assigned.length,
      diagnostics: {
        canonicalEventSeats: rows.length,
        assignedSeats: assigned.length,
        uniqueAssignedEventSeatIds: unique.size,
        missing,
        duplicates,
        extra,
        outside,
        overlapPairs,
        sections: sectionDiagnostics,
        preview,
      },
    };
  }
  window.lisiLemansSeatMap = { render, renderPreview, blueprint };
})();
