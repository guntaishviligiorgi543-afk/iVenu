(() => {
  "use strict";

  // Transcribed from black_sea_arena_final_blueprint.json. These values are
  // presentation geometry only; event_seats remains the inventory authority.
  const blueprint = {
    name: "Black Sea Arena Concert Layout",
    version: 3,
    sourceOfTruth: "visual geometry blueprint; production seat inventory remains Supabase event_seats",
    viewBox: [0, 0, 1600, 1000],
    stage: { shape: "ellipse", cx: 800, cy: 205, rx: 215, ry: 88 },
    tierColors: {
      "Cheap / Standard": "#2878ff",
      "Medium / Premium": "#18d8bd",
      Expensive: "#ff3440",
      VIP: "#ad38ff",
    },
    sections: [
      { id: "cheap_left_outer", ticketTier: "Cheap / Standard", label: "Cheap / Standard", previewRows: 8, polygon: [[20, 370], [120, 300], [220, 480], [155, 620]] },
      { id: "medium_left_outer", ticketTier: "Medium / Premium", label: "Medium / Premium", previewRows: 8, polygon: [[145, 245], [250, 190], [365, 395], [275, 475]] },
      { id: "expensive_left", ticketTier: "Expensive", label: "Expensive", previewRows: 8, polygon: [[345, 150], [445, 105], [615, 315], [520, 405], [405, 350]] },
      { id: "medium_left_inner", ticketTier: "Medium / Premium", label: "Medium / Premium", previewRows: 7, polygon: [[330, 440], [445, 370], [615, 475], [550, 610], [405, 565]] },
      { id: "cheap_left_lower", ticketTier: "Cheap / Standard", label: "Cheap / Standard", previewRows: 8, polygon: [[205, 655], [340, 575], [570, 705], [520, 875], [345, 825]] },
      { id: "vip_center", ticketTier: "VIP", label: "VIP", previewRows: 5, polygon: [[620, 315], [980, 315], [1010, 445], [590, 445]] },
      { id: "medium_center", ticketTier: "Medium / Premium", label: "Medium / Premium", previewRows: 8, polygon: [[605, 475], [995, 475], [1025, 650], [575, 650]] },
      { id: "cheap_center", ticketTier: "Cheap / Standard", label: "Cheap / Standard", previewRows: 9, polygon: [[585, 705], [1015, 705], [1040, 900], [560, 900]] },
      { id: "expensive_right", ticketTier: "Expensive", label: "Expensive", previewRows: 8, polygon: [[985, 315], [1155, 105], [1255, 150], [1195, 350], [1080, 405]] },
      { id: "medium_right_inner", ticketTier: "Medium / Premium", label: "Medium / Premium", previewRows: 7, polygon: [[985, 475], [1155, 370], [1270, 440], [1195, 565], [1050, 610]] },
      { id: "cheap_right_lower", ticketTier: "Cheap / Standard", label: "Cheap / Standard", previewRows: 8, polygon: [[1030, 705], [1260, 575], [1395, 655], [1255, 825], [1080, 875]] },
      { id: "medium_right_outer", ticketTier: "Medium / Premium", label: "Medium / Premium", previewRows: 8, polygon: [[1235, 395], [1350, 190], [1455, 245], [1325, 475]] },
      { id: "cheap_right_outer", ticketTier: "Cheap / Standard", label: "Cheap / Standard", previewRows: 8, polygon: [[1380, 480], [1480, 300], [1580, 370], [1445, 620]] },
    ],
  };

  blueprint.sections.forEach((section) => {
    Object.freeze(section.polygon);
    Object.freeze(section);
  });
  Object.freeze(blueprint.sections);
  Object.freeze(blueprint.stage);
  Object.freeze(blueprint.tierColors);
  window.blackSeaArenaBlueprint = Object.freeze(blueprint);
})();
