(() => {
  "use strict";

  // Geometry transcribed from the supplied theatre_hall_map.json. Preview
  // coordinates are intentionally excluded: event_seats remains capacity truth.
  const blueprint = {
    name: "Theatre Hall Map",
    version: 1,
    sourceOfTruth: "Supplied Theatre geometry; Supabase event_seats is authoritative inventory.",
    venueId: "92f01596-32c0-4f0a-bb88-eccd5b3f1f41",
    viewBox: [0, 0, 1600, 1100],
    layoutType: "theatre",
    focalElement: {
      id: "stage",
      type: "stage",
      nonInteractive: true,
      x: 485,
      y: 155,
      width: 630,
      height: 150,
      rx: 38,
    },
    sections: [
      {
        id: "vip_left", ticketTier: "VIP", selectable: true,
        polygon: [[55, 190], [205, 190], [205, 470], [55, 470]],
        normalizedPolygon: [[3.4375, 17.2727], [12.8125, 17.2727], [12.8125, 42.7273], [3.4375, 42.7273]],
      },
      {
        id: "vip_right", ticketTier: "VIP", selectable: true,
        polygon: [[1395, 190], [1545, 190], [1545, 470], [1395, 470]],
        normalizedPolygon: [[87.1875, 17.2727], [96.5625, 17.2727], [96.5625, 42.7273], [87.1875, 42.7273]],
      },
      {
        id: "expensive_center", ticketTier: "Expensive", selectable: true,
        polygon: [[250, 355], [1350, 355], [1350, 535], [250, 535]],
        normalizedPolygon: [[15.625, 32.2727], [84.375, 32.2727], [84.375, 48.6364], [15.625, 48.6364]],
      },
      {
        id: "medium_center", ticketTier: "Medium / Premium", selectable: true,
        polygon: [[95, 575], [1505, 575], [1505, 780], [95, 780]],
        normalizedPolygon: [[5.9375, 52.2727], [94.0625, 52.2727], [94.0625, 70.9091], [5.9375, 70.9091]],
      },
      {
        id: "cheap_rear", ticketTier: "Cheap / Standard", selectable: true,
        polygon: [[95, 820], [1505, 820], [1505, 1030], [95, 1030]],
        normalizedPolygon: [[5.9375, 74.5455], [94.0625, 74.5455], [94.0625, 93.6364], [5.9375, 93.6364]],
      },
    ],
  };

  blueprint.sections.forEach((section) => {
    Object.freeze(section.polygon);
    Object.freeze(section.normalizedPolygon);
    Object.freeze(section);
  });
  Object.freeze(blueprint.sections);
  Object.freeze(blueprint.focalElement);
  window.theatreBlueprint = Object.freeze(blueprint);
})();
