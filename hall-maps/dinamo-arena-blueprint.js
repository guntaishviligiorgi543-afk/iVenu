(() => {
  "use strict";

  // Transcribed from the supplied dinamo_arena_exact_scheme.json. This is
  // visual geometry only; Supabase event_seats remains the inventory authority.
  const blueprint = {
    name: "Dinamo Arena Exact User Scheme",
    version: 2,
    sourceOfTruth: "supplied Dinamo Arena geometry; production inventory remains Supabase event_seats",
    venueId: "66892b75-57e6-4a21-8fae-a9f01ceb4d13",
    viewBox: [0, 0, 1600, 900],
    outerBoundary: { type: "ellipse", cx: 780, cy: 450, rx: 755, ry: 425 },
    field: { type: "field", nonInteractive: true, x: 470, y: 325, width: 610, height: 245, rx: 30 },
    tierColors: {
      "Cheap / Standard": "#2878ff",
      "Medium / Premium": "#18d8bd",
      Expensive: "#ff3440",
      VIP: "#ad38ff",
    },
    restrictedSection: {
      id: "east_restricted",
      selectable: false,
      note: "Reserved/non-public block from supplied sketch; never allocate public event_seats here.",
    },
    sections: [
      { id: "north_cheap", ticketTier: "Cheap / Standard", selectable: true, polygon: [[365, 100], [1195, 100], [1195, 175], [365, 175]], normalizedPolygon: [[22.8125, 11.1111], [74.6875, 11.1111], [74.6875, 19.4444], [22.8125, 19.4444]] },
      { id: "nw_cheap", ticketTier: "Cheap / Standard", selectable: true, polygon: [[345, 190], [465, 190], [465, 305], [345, 305]], normalizedPolygon: [[21.5625, 21.1111], [29.0625, 21.1111], [29.0625, 33.8889], [21.5625, 33.8889]] },
      { id: "north_medium", ticketTier: "Medium / Premium", selectable: true, polygon: [[480, 195], [1030, 195], [1030, 245], [480, 245]], normalizedPolygon: [[30, 21.6667], [64.375, 21.6667], [64.375, 27.2222], [30, 27.2222]] },
      { id: "north_expensive", ticketTier: "Expensive", selectable: true, polygon: [[485, 260], [1025, 260], [1025, 305], [485, 305]], normalizedPolygon: [[30.3125, 28.8889], [64.0625, 28.8889], [64.0625, 33.8889], [30.3125, 33.8889]] },
      { id: "ne_cheap", ticketTier: "Cheap / Standard", selectable: true, polygon: [[1075, 190], [1195, 190], [1195, 305], [1075, 305]], normalizedPolygon: [[67.1875, 21.1111], [74.6875, 21.1111], [74.6875, 33.8889], [67.1875, 33.8889]] },
      { id: "west_outer_cheap", ticketTier: "Cheap / Standard", selectable: true, polygon: [[160, 200], [325, 200], [325, 675], [160, 675]], normalizedPolygon: [[10, 22.2222], [20.3125, 22.2222], [20.3125, 75], [10, 75]] },
      { id: "west_inner_expensive", ticketTier: "Expensive", selectable: true, polygon: [[400, 325], [450, 325], [450, 570], [400, 570]], normalizedPolygon: [[25, 36.1111], [28.125, 36.1111], [28.125, 63.3333], [25, 63.3333]] },
      { id: "east_restricted", ticketTier: null, selectable: false, polygon: [[1095, 325], [1215, 325], [1215, 570], [1095, 570]], normalizedPolygon: [[68.4375, 36.1111], [75.9375, 36.1111], [75.9375, 63.3333], [68.4375, 63.3333]] },
      { id: "east_outer_cheap", ticketTier: "Cheap / Standard", selectable: true, polygon: [[1240, 200], [1405, 200], [1405, 675], [1240, 675]], normalizedPolygon: [[77.5, 22.2222], [87.8125, 22.2222], [87.8125, 75], [77.5, 75]] },
      { id: "sw_cheap", ticketTier: "Cheap / Standard", selectable: true, polygon: [[345, 590], [465, 590], [465, 705], [345, 705]], normalizedPolygon: [[21.5625, 65.5556], [29.0625, 65.5556], [29.0625, 78.3333], [21.5625, 78.3333]] },
      { id: "south_expensive_left", ticketTier: "Expensive", selectable: true, polygon: [[485, 590], [600, 590], [600, 650], [485, 650]], normalizedPolygon: [[30.3125, 65.5556], [37.5, 65.5556], [37.5, 72.2222], [30.3125, 72.2222]] },
      { id: "south_vip", ticketTier: "VIP", selectable: true, polygon: [[615, 590], [925, 590], [925, 650], [615, 650]], normalizedPolygon: [[38.4375, 65.5556], [57.8125, 65.5556], [57.8125, 72.2222], [38.4375, 72.2222]] },
      { id: "south_expensive_right", ticketTier: "Expensive", selectable: true, polygon: [[940, 590], [1055, 590], [1055, 650], [940, 650]], normalizedPolygon: [[58.75, 65.5556], [65.9375, 65.5556], [65.9375, 72.2222], [58.75, 72.2222]] },
      { id: "se_cheap", ticketTier: "Cheap / Standard", selectable: true, polygon: [[1075, 590], [1195, 590], [1195, 705], [1075, 705]], normalizedPolygon: [[67.1875, 65.5556], [74.6875, 65.5556], [74.6875, 78.3333], [67.1875, 78.3333]] },
      { id: "south_medium", ticketTier: "Medium / Premium", selectable: true, polygon: [[485, 665], [1055, 665], [1055, 720], [485, 720]], normalizedPolygon: [[30.3125, 73.8889], [65.9375, 73.8889], [65.9375, 80], [30.3125, 80]] },
      { id: "south_cheap", ticketTier: "Cheap / Standard", selectable: true, polygon: [[370, 735], [1170, 735], [1170, 810], [370, 810]], normalizedPolygon: [[23.125, 81.6667], [73.125, 81.6667], [73.125, 90], [23.125, 90]] },
    ],
  };

  blueprint.sections.forEach((section) => {
    Object.freeze(section.polygon);
    Object.freeze(section.normalizedPolygon);
    Object.freeze(section);
  });
  Object.freeze(blueprint.sections);
  Object.freeze(blueprint.outerBoundary);
  Object.freeze(blueprint.field);
  Object.freeze(blueprint.restrictedSection);
  Object.freeze(blueprint.tierColors);
  window.dinamoArenaBlueprint = Object.freeze(blueprint);
})();
