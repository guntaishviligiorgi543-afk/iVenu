(() => {
  "use strict";
  const blueprint = {
    venueId: "cc298c54-ee8a-4782-b7ad-b115b5231d61",
    venue: "Lisi Lemans",
    canonicalVenue: "Lisi Wonderland",
    slug: "lisi-lemans",
    viewBox: "0 0 1600 900",
    tierColors: {
      Cheap: "#2878ff",
      Medium: "#16a085",
      Expensive: "#e63232",
      VIP: "#8e44ad",
    },
    stage: {
      id: "stage",
      label: "STAGE",
      type: "polygon",
      points: [
        [590, 55],
        [1010, 55],
        [1040, 235],
        [560, 235],
      ],
      selectable: false,
    },
    sections: [
      {
        id: "center-vip",
        ticketTier: "VIP",
        polygon: [
          [625, 270],
          [975, 270],
          [1000, 375],
          [600, 375],
        ],
        rows: 5,
      },
      {
        id: "left-expensive",
        ticketTier: "Expensive",
        polygon: [
          [340, 225],
          [565, 300],
          [520, 420],
          [285, 340],
        ],
        rows: 6,
      },
      {
        id: "center-expensive",
        ticketTier: "Expensive",
        polygon: [
          [555, 395],
          [1045, 395],
          [1080, 510],
          [520, 510],
        ],
        rows: 6,
      },
      {
        id: "right-expensive",
        ticketTier: "Expensive",
        polygon: [
          [1035, 300],
          [1260, 225],
          [1315, 340],
          [1080, 420],
        ],
        rows: 6,
      },
      {
        id: "left-medium",
        ticketTier: "Medium",
        polygon: [
          [205, 345],
          [500, 440],
          [455, 595],
          [150, 490],
        ],
        rows: 7,
      },
      {
        id: "center-medium",
        ticketTier: "Medium",
        polygon: [
          [485, 535],
          [1115, 535],
          [1160, 665],
          [440, 665],
        ],
        rows: 7,
      },
      {
        id: "right-medium",
        ticketTier: "Medium",
        polygon: [
          [1100, 440],
          [1395, 345],
          [1450, 490],
          [1145, 595],
        ],
        rows: 7,
      },
      {
        id: "left-cheap",
        ticketTier: "Cheap",
        polygon: [
          [95, 515],
          [420, 620],
          [365, 790],
          [45, 675],
        ],
        rows: 8,
      },
      {
        id: "center-cheap",
        ticketTier: "Cheap",
        polygon: [
          [400, 690],
          [1200, 690],
          [1245, 845],
          [355, 845],
        ],
        rows: 8,
      },
      {
        id: "right-cheap",
        ticketTier: "Cheap",
        polygon: [
          [1180, 620],
          [1505, 515],
          [1555, 675],
          [1235, 790],
        ],
        rows: 8,
      },
    ],
  };
  blueprint.sections.forEach(Object.freeze);
  Object.freeze(blueprint.sections);
  Object.freeze(blueprint.stage);
  Object.freeze(blueprint.tierColors);
  window.lisiLemansBlueprint = Object.freeze(blueprint);
})();
