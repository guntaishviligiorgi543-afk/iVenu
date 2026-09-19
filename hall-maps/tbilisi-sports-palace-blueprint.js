(() => {
  "use strict";

  // This file contains presentation geometry only. event_seats remains the
  // canonical inventory and every displayed dot is bound to its UUID.
  const blueprint = {
    venueId: "8e3eed84-8a65-46fb-9461-b7a3e75a8fc2",
    venue: "Tbilisi Sports Palace",
    viewBox: "0 0 1600 1000",
    tierColors: { cheap: "#2878ff", medium: "#16a085", expensive: "#e63232", vip: "#8e44ad" },
    stage: { key: "stage", type: "rect", x: 430, y: 350, width: 570, height: 230, rx: 40, selectable: false, label: "STAGE" },
    sections: [
      { key: "cheap_top", tier: "cheap", label: "CHEAP", type: "rect", x: 70, y: 70, width: 1050, height: 105, rx: 30 },
      { key: "expensive_top", tier: "expensive", label: "EXPENSIVE", type: "rect", x: 70, y: 200, width: 1050, height: 120, rx: 30 },
      { key: "medium_left", tier: "medium", label: "MEDIUM", type: "rect", x: 70, y: 350, width: 260, height: 300, rx: 35 },
      { key: "medium_right", tier: "medium", label: "MEDIUM", type: "rect", x: 1030, y: 350, width: 230, height: 300, rx: 35 },
      { key: "vip_front", tier: "vip", label: "VIP", type: "rect", x: 430, y: 600, width: 570, height: 80, rx: 22 },
      { key: "expensive_bottom", tier: "expensive", label: "EXPENSIVE", type: "rect", x: 70, y: 705, width: 1050, height: 105, rx: 30 },
      { key: "cheap_bottom", tier: "cheap", label: "CHEAP", type: "rect", x: 70, y: 835, width: 1050, height: 105, rx: 30 },
      { key: "cheap_right", tier: "cheap", label: "CHEAP", type: "rect", x: 1300, y: 90, width: 230, height: 720, rx: 45 },
    ],
  };

  blueprint.sections.forEach(Object.freeze);
  Object.freeze(blueprint.sections);
  Object.freeze(blueprint.stage);
  Object.freeze(blueprint.tierColors);
  window.tbilisiSportsPalaceBlueprint = Object.freeze(blueprint);
})();
