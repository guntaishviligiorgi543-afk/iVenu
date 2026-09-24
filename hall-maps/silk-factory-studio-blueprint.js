(() => {
  "use strict";
  const blueprint = {
    venueId: "57eb7b77-8da8-4568-838b-b7ecd0cef8b5",
    venue: "Silk Factory Studio",
    slug: "silk-factory-studio",
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
      type: "rect",
      x: 565,
      y: 55,
      width: 470,
      height: 190,
      rx: 28,
      selectable: false,
    },
    sections: [
      {
        id: "left-expensive",
        label: "EXPENSIVE",
        ticketTier: "Expensive",
        polygon: [
          [345, 135],
          [515, 275],
          [445, 405],
          [260, 255],
        ],
        rows: 7,
        direction: "diagonal",
      },
      {
        id: "left-medium",
        label: "MEDIUM",
        ticketTier: "Medium",
        polygon: [
          [235, 300],
          [425, 445],
          [355, 565],
          [165, 415],
        ],
        rows: 6,
        direction: "diagonal",
      },
      {
        id: "left-cheap",
        label: "CHEAP",
        ticketTier: "Cheap",
        polygon: [
          [165, 455],
          [345, 595],
          [280, 735],
          [115, 585],
        ],
        rows: 6,
        direction: "diagonal",
      },
      {
        id: "center-vip",
        label: "VIP",
        ticketTier: "VIP",
        polygon: [
          [585, 260],
          [1015, 260],
          [1040, 380],
          [560, 380],
        ],
        rows: 5,
        direction: "horizontal",
      },
      {
        id: "center-medium",
        label: "MEDIUM",
        ticketTier: "Medium",
        polygon: [
          [520, 395],
          [1080, 395],
          [1120, 560],
          [480, 560],
        ],
        rows: 7,
        direction: "horizontal",
      },
      {
        id: "center-cheap",
        label: "CHEAP",
        ticketTier: "Cheap",
        polygon: [
          [430, 575],
          [1170, 575],
          [1220, 760],
          [380, 760],
        ],
        rows: 7,
        direction: "horizontal",
      },
      {
        id: "right-expensive",
        label: "EXPENSIVE",
        ticketTier: "Expensive",
        polygon: [
          [1255, 135],
          [1085, 275],
          [1155, 405],
          [1340, 255],
        ],
        rows: 7,
        direction: "diagonal",
      },
      {
        id: "right-medium",
        label: "MEDIUM",
        ticketTier: "Medium",
        polygon: [
          [1365, 300],
          [1175, 445],
          [1245, 565],
          [1435, 415],
        ],
        rows: 6,
        direction: "diagonal",
      },
      {
        id: "right-cheap",
        label: "CHEAP",
        ticketTier: "Cheap",
        polygon: [
          [1435, 455],
          [1255, 595],
          [1320, 735],
          [1485, 585],
        ],
        rows: 6,
        direction: "diagonal",
      },
    ],
  };
  blueprint.sections.forEach((section) => Object.freeze(section));
  Object.freeze(blueprint.sections);
  Object.freeze(blueprint.stage);
  Object.freeze(blueprint.tierColors);
  window.silkFactoryStudioBlueprint = Object.freeze(blueprint);
})();
