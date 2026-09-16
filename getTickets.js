const params = new URLSearchParams(window.location.search);
const bandId = params.get("id");
let selectedBand = null;

function createTicketAdapter(ticketTypes) {
  const ticketByName = new Map(
    ticketTypes.map((ticket) => [ticket.name.toLowerCase(), ticket]),
  );
  const getTicket = (names) =>
    names.map((name) => ticketByName.get(name)).find(Boolean) || null;
  const toTicket = (ticket) =>
    ticket
      ? {
          id: ticket.id,
          name: ticket.name,
          price: Number(ticket.price),
          currency: "₾",
          availableQuantity: Number(ticket.available_quantity),
          description: ticket.description || "",
        }
      : null;

  return {
    cheap: toTicket(getTicket(["cheap / standard"])),
    medium: toTicket(getTicket(["medium / premium"])),
    vip: toTicket(getTicket(["vip", "expensive"])),
  };
}

async function loadSelectedEvent() {
  if (!bandId) return;

  const [event, ticketTypes] = await Promise.all([
    window.supabaseData.getEvent(bandId),
    window.supabaseData.getTicketTypes(bandId),
  ]);

  if (!event) return;

  const band = event.bands || {};
  selectedBand = {
    id: event.id,
    bandName: event.performer || band.name || event.title,
    bandDescription: band.description || event.description || "",
    bandImg2: event.image_url || band.image_url || "",
    event: {
      title: event.title,
      description: event.description || "",
      date: event.event_date,
      time: event.event_time,
      doorsOpen: event.doors_open,
    },
    tickets: createTicketAdapter(ticketTypes),
    location: {
      city: event.city,
      venue: event.venue,
      address: event.country || "",
      coordinates: { lat: 0, lng: 0 },
    },
  };

  renderSelectedEvent();
  initializeBasket();
  renderBasket();
  window.supabaseData.recordEventView(selectedBand.id).catch((error) => {
    console.error("Unable to record event view", error);
  });
}

function getEventState() {
  const stateByBand = window.__ticketState || (window.__ticketState = {});
  if (!stateByBand[bandId]) {
    stateByBand[bandId] = {
      basket: [],
      selectedSeat: null,
      countdownId: null,
      countdownSeconds: 10 * 60,
    };
  }

  return stateByBand[bandId];
}

const eventState = getEventState();
const basketTickets = eventState.basket;

function getTicketMetaForSeat(sectionId, row, seatNumber) {
  const section = hallMap.sections.find((item) => item.id === sectionId);
  if (!section || !selectedBand) return null;

  const ticket = selectedBand.tickets[section.ticketType];
  if (!ticket) return null;

  return {
    section: section.id,
    row: Number(row),
    seat: Number(seatNumber),
    type: ticket.name,
    price: Number(ticket.price),
    currency: ticket.currency,
    serviceFee: Number(ticket.serviceFee || Math.round(ticket.price * 0.05)),
    ticketTypeId: ticket.id,
  };
}

function getSeatKey(section, row, seat) {
  return `${section}-${row}-${seat}`;
}

function getSeatElement(section, row, seat) {
  return document.querySelector(
    `.seat[data-section="${section}"][data-row="${row}"][data-seat="${seat}"]`,
  );
}

function getCurrency() {
  return selectedBand?.tickets?.cheap?.currency || "₾";
}

function getSelectedTicketTypeValue(type) {
  return (type || "").toLowerCase();
}

function getVisibleAvailableTickets() {
  const allTickets = [];

  hallMap.sections.forEach((section) => {
    const ticket = selectedBand?.tickets?.[section.ticketType];
    if (!ticket) return;

    for (let row = 1; row <= section.rows; row++) {
      for (let seat = 1; seat <= section.seatsPerRow; seat++) {
        const key = getSeatKey(section.id, row, seat);
        const isAlreadySelected = basketTickets.some(
          (item) => getSeatKey(item.section, item.row, item.seat) === key,
        );

        if (isAlreadySelected) continue;

        allTickets.push({
          section: section.id,
          row,
          seat,
          type: ticket.name.toLowerCase(),
          displayType: ticket.name,
          price: Number(ticket.price),
          currency: ticket.currency,
          serviceFee: Number(
            ticket.serviceFee || Math.round(ticket.price * 0.05),
          ),
          ticketTypeId: ticket.id,
        });
      }
    }
  });

  return allTickets;
}

function filterTicketList(container) {
  if (!container || !selectedBand) return;

  const typeFilter = container.querySelector(".fillterByTktType");
  const zoneFilter = container.querySelector(".fillterByZone");
  const cardList = container.querySelector(".tktsInList");
  const freeTkts = container.querySelector(".freeTkts");

  if (!cardList || !freeTkts) return;

  const selectedType = typeFilter ? typeFilter.value : "";
  const selectedZone = zoneFilter ? zoneFilter.value : "";
  const cards = [...cardList.querySelectorAll(".tktCard")];

  let visibleCount = 0;
  cards.forEach((card) => {
    const tktType = (card.dataset.type || "").toLowerCase();
    const section = (card.dataset.section || "").toLowerCase();
    const zoneMatch =
      !selectedZone || section === selectedZone.replace("zone-", "");
    const typeMatch =
      !selectedType || tktType.includes(selectedType.toLowerCase());

    const shouldShow = typeMatch && zoneMatch;
    card.style.display = shouldShow ? "" : "none";
    if (shouldShow) visibleCount += 1;
  });

  freeTkts.textContent = `avaliable ticktets (${visibleCount})`;

  const mapState = document.querySelectorAll(".stageMap .hall-section");
  mapState.forEach((sectionEl) => {
    const sectionClass = sectionEl.className.match(/section-([a-c])/);
    if (!sectionClass) return;

    const sectionId = sectionClass[1].toLowerCase();
    if (!selectedType && !selectedZone) {
      sectionEl.style.opacity = "1";
      return;
    }

    const typeSectionMap = {
      standard: "a",
      cheap: "a",
      medium: "b",
      vip: "c",
    };
    const zoneSectionMap = {
      "zone-a": "a",
      "zone-b": "b",
      "zone-c": "c",
    };

    const typeSection = selectedType ? typeSectionMap[selectedType] : null;
    const zoneSection = selectedZone ? zoneSectionMap[selectedZone] : null;

    let matchingSections = [];
    if (typeSection) matchingSections.push(typeSection);
    if (zoneSection) matchingSections.push(zoneSection);

    if (selectedType && selectedZone) {
      matchingSections =
        typeSection && zoneSection && typeSection === zoneSection
          ? [typeSection]
          : [];
    }

    sectionEl.style.opacity = matchingSections.includes(sectionId)
      ? "1"
      : "0.3";
  });
}

function renderTicketListForContainer(container) {
  if (!container || !selectedBand) return;

  const list = container.querySelector(".tktsInList");
  const freeTickets = container.querySelector(".freeTkts");
  if (!list || !freeTickets) return;

  const availableTickets = getVisibleAvailableTickets();
  const selectedType =
    container.querySelector(".fillterByTktType")?.value || "";
  const selectedZone = container.querySelector(".fillterByZone")?.value || "";

  const filteredTickets = availableTickets.filter((ticket) => {
    const typeMatch =
      !selectedType || ticket.type.includes(selectedType.toLowerCase());
    const zoneMatch =
      !selectedZone ||
      ticket.section.toLowerCase() === selectedZone.replace("zone-", "");
    return typeMatch && zoneMatch;
  });

  list.innerHTML = filteredTickets
    .map(
      (ticket) => `
        <div class="tktCard section-${ticket.section.toLowerCase()}" data-type="${ticket.displayType.toLowerCase()}" data-section="${ticket.section.toLowerCase()}">
          <div class="tktInfo">
            <div class="sectionCont">
              <h5>section <p class="section">${ticket.section}</p></h5>
              <h5>row <p class="row">${ticket.row}</p></h5>
              <h5>seat <p class="seat">${ticket.seat}</p></h5>
            </div>
            <div class="tktPriceCont">
              <p class="tktType">${ticket.displayType}</p>
              <p class="tktprice">${ticket.price}${ticket.currency}</p>
              <h5 class="serviceFee">service fee <span>${ticket.serviceFee}${ticket.currency}</span></h5>
            </div>
          </div>
          <button class="addToBskt" data-section="${ticket.section}" data-row="${ticket.row}" data-seat="${ticket.seat}">
            <svg xmlns="http://www.w3.org/2000/svg" width="1.25em" height="1.25em" viewBox="0 0 24 24">
              <path d="M0 0h24v24H0z" fill="none"/>
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 20v-8m0 0V4m0 8h8m-8 0H4"/>
            </svg>
            <span>add to basket</span>
          </button>
        </div>
      `,
    )
    .join("");

  freeTickets.textContent = `avaliable ticktets (${filteredTickets.length})`;

  list.querySelectorAll(".addToBskt").forEach((button) => {
    button.addEventListener("click", () => {
      const seatData = getTicketMetaForSeat(
        button.dataset.section,
        button.dataset.row,
        button.dataset.seat,
      );

      if (!seatData) return;

      const seat = getSeatElement(
        seatData.section,
        seatData.row,
        seatData.seat,
      );
      if (seat) {
        eventState.selectedSeat = seat;
        const section = hallMap.sections.find(
          (item) => item.id === seatData.section,
        );
        const ticket = section
          ? selectedBand.tickets[section.ticketType]
          : null;
        if (!ticket) return;

        const confirmSectionElement = document.querySelector(".confirmSection");
        const confirmRowElement = document.querySelector(".confirmRow");
        const confirmSeatElement = document.querySelector(".confirmSeat");
        const confirmPriceElement = document.querySelector(".confirmPrice");

        if (confirmSectionElement)
          confirmSectionElement.textContent = section.name;
        if (confirmRowElement) confirmRowElement.textContent = seatData.row;
        if (confirmSeatElement) confirmSeatElement.textContent = seatData.seat;
        if (confirmPriceElement)
          confirmPriceElement.textContent = `${ticket.price}${ticket.currency}`;

        const confirmDialogElement = document.querySelector("#confirmDialog");
        if (confirmDialogElement) confirmDialogElement.style.display = "flex";
      }
    });
  });

  filterTicketList(container);
}

function updateBasketQuantity() {
  const qtyEls = document.querySelectorAll(".quantityOfTKts");
  qtyEls.forEach((el) => {
    el.textContent = `basket (${basketTickets.length})`;
  });
}

function updateBasketTotals() {
  const currency = getCurrency();
  const totalWithoutFees = basketTickets.reduce(
    (sum, item) => sum + Number(item.price),
    0,
  );
  const totalServiceFee = basketTickets.reduce(
    (sum, item) => sum + Number(item.serviceFee || 0),
    0,
  );
  const grandTotal = totalWithoutFees + totalServiceFee;

  const totalPriceLabel = document.querySelector(
    ".basketFooter .totalPrice-noFees",
  );
  const quantityLabel = document.querySelector(".basketFooter .tktQnt");
  const serviceFeeLabel = document.querySelector(".basketFooter .serviceFee");
  const grandTotalLabel = document.querySelector(
    ".basketFooter .footerTotalPrice-fees p",
  );
  const emptyTotalLabel = document.querySelector(".bastkeTotal p:last-of-type");

  if (quantityLabel)
    quantityLabel.textContent = `quantity ${basketTickets.length}`;
  if (totalPriceLabel)
    totalPriceLabel.textContent = `${totalWithoutFees}${currency}`;
  if (serviceFeeLabel)
    serviceFeeLabel.textContent = `${totalServiceFee}${currency}`;
  if (grandTotalLabel) grandTotalLabel.textContent = `${grandTotal}${currency}`;
  if (emptyTotalLabel)
    emptyTotalLabel.textContent = `(${totalWithoutFees}${currency})`;
}

function syncSelectedSeatStateOnMap() {
  document.querySelectorAll(".seat").forEach((seat) => {
    const seatKey = getSeatKey(
      seat.dataset.section,
      Number(seat.dataset.row),
      Number(seat.dataset.seat),
    );

    const isSelected = basketTickets.some(
      (item) => getSeatKey(item.section, item.row, item.seat) === seatKey,
    );

    seat.classList.toggle("selected", isSelected);
  });
}

function renderBasket() {
  const emptyBskt = document.querySelector(".emptyBskt");
  const nonEmptyBskt = document.querySelector(".nonEmptyBskt");
  const basketList = document.querySelector(".basketTicketsList");

  if (!emptyBskt || !nonEmptyBskt) return;

  const isEmpty = basketTickets.length === 0;
  emptyBskt.style.display = isEmpty ? "flex" : "none";
  nonEmptyBskt.style.display = isEmpty ? "none" : "flex";

  if (basketList) {
    const list = nonEmptyBskt.querySelector(".tktListContainer");
    const shouldHideBasketCards = !!list && list.classList.contains("active");
    basketList.style.display = shouldHideBasketCards ? "none" : "flex";
  }

  updateBasketQuantity();
  updateBasketTotals();

  if (basketList) {
    basketList.innerHTML = basketTickets
      .map(
        (ticket) => `
          <div class="tktCard section-${ticket.section.toLowerCase()}">
            <div class="tktInfo">
              <div class="sectionCont">
                <h5>section <p class="section">${ticket.section}</p></h5>
                <h5>row <p class="row">${ticket.row}</p></h5>
                <h5>seat <p class="seat">${ticket.seat}</p></h5>
              </div>
              <div class="tktPriceCont">
                <p class="tktType">${ticket.type}</p>
                <p class="tktprice">${ticket.price}${ticket.currency}</p>
                <h5 class="serviceFee">service fee <span>${ticket.serviceFee}${ticket.currency}</span></h5>
              </div>
            </div>
            <button class="removeTkt" data-section="${ticket.section}" data-row="${ticket.row}" data-seat="${ticket.seat}">
              <svg xmlns="http://www.w3.org/2000/svg" width="1.25em" height="1.25em" viewBox="0 0 1024 1024">
                <path d="M0 0h1024v1024H0z" fill="none"/>
                <path fill="currentColor" fill-opacity=".15" d="M292.7 840h438.6l24.2-512h-487z"/>
                <path fill="currentColor" d="M864 256H736v-80c0-35.3-28.7-64-64-64H352c-35.3 0-64 28.7-64 64v80H160c-17.7 0-32 14.3-32 32v32c0 4.4 3.6 8 8 8h60.4l24.7 523c1.6 34.1 29.8 61 63.9 61h454c34.2 0 62.3-26.8 63.9-61l24.7-523H888c4.4 0 8-3.6 8-8v-32c0-17.7-14.3-32-32-32m-504-72h304v72H360zm371.3 656H292.7l-24.2-512h487z"/>
              </svg>
              <p>remove from basket</p>
            </button>
          </div>
        `,
      )
      .join("");

    basketList.querySelectorAll(".removeTkt").forEach((button) => {
      button.addEventListener("click", () => {
        removeTicketFromBasket({
          section: button.dataset.section,
          row: Number(button.dataset.row),
          seat: Number(button.dataset.seat),
        });
      });
    });
  }

  document.querySelectorAll(".tktListContainer").forEach((container) => {
    renderTicketListForContainer(container);
  });

  syncSelectedSeatStateOnMap();
}

function addTicketToBasket(ticket) {
  const seatKey = getSeatKey(ticket.section, ticket.row, ticket.seat);
  const exists = basketTickets.some(
    (item) => getSeatKey(item.section, item.row, item.seat) === seatKey,
  );

  if (exists) return;

  const isFirstTicket = basketTickets.length === 0;
  basketTickets.push(ticket);

  if (window.cartSync) {
    const quantity = basketTickets.filter(
      (item) => item.ticketTypeId === ticket.ticketTypeId,
    ).length;
    window.cartSync
      .syncTicket(ticket.ticketTypeId, quantity)
      .catch(console.error);
  }

  if (typeof persistBasketState === "function") {
    persistBasketState();
  }

  if (isFirstTicket && typeof startSelectionCountdown === "function") {
    startSelectionCountdown();
  }

  renderBasket();
}

function removeTicketFromBasket(ticket) {
  const index = basketTickets.findIndex(
    (item) =>
      item.section === ticket.section &&
      item.row === Number(ticket.row) &&
      item.seat === Number(ticket.seat),
  );

  if (index === -1) return;

  const [removedItem] = basketTickets.splice(index, 1);
  if (window.cartSync) {
    const quantity = basketTickets.filter(
      (item) => item.ticketTypeId === removedItem.ticketTypeId,
    ).length;
    window.cartSync
      .syncTicket(removedItem.ticketTypeId, quantity)
      .catch(console.error);
  }
  const seatElement = getSeatElement(
    removedItem.section,
    removedItem.row,
    removedItem.seat,
  );
  if (seatElement) seatElement.classList.remove("selected");

  if (typeof persistBasketState === "function") {
    persistBasketState();
  }

  renderBasket();
}

function toggleTicketList(parent, isOpen) {
  const list = parent?.querySelector(".tktListContainer");
  const listBtn = parent?.querySelector(".tktListBtn");
  const title = parent?.querySelector(".bsktTitle-p");
  const basketList = parent?.querySelector(".basketTicketsList");

  if (!list) return;

  list.classList.toggle("active", isOpen);
  list.style.display = isOpen ? "flex" : "none";

  if (basketList) {
    basketList.style.display = isOpen ? "none" : "flex";
  }

  if (listBtn) listBtn.style.display = isOpen ? "none" : "flex";
  if (title) title.style.display = isOpen ? "none" : "";
}

function bindTicketListControls() {
  document.querySelectorAll(".tktListBtn").forEach((button) => {
    button.addEventListener("click", () => {
      const parent = button.closest(".emptyBskt, .nonEmptyBskt");
      toggleTicketList(parent, true);
    });
  });

  document.querySelectorAll(".backToBskt").forEach((button) => {
    button.addEventListener("click", () => {
      const parent = button.closest(".emptyBskt, .nonEmptyBskt");
      toggleTicketList(parent, false);
    });
  });

  document.querySelectorAll(".fillterByTktType").forEach((select) => {
    select.addEventListener("change", () => {
      const container = select.closest(".tktListContainer");
      if (container) {
        renderTicketListForContainer(container);
        filterTicketList(container);
      }
    });
  });

  document.querySelectorAll(".fillterByZone").forEach((select) => {
    select.addEventListener("change", () => {
      const container = select.closest(".tktListContainer");
      if (container) {
        renderTicketListForContainer(container);
        filterTicketList(container);
      }
    });
  });
}

function initializeBasket() {
  if (!selectedBand) return;

  bindTicketListControls();
  renderBasket();
}

function renderSelectedEvent() {
  if (!selectedBand) return;

  const addToCartButton = document.querySelector(".addEventToCartBtn");
  if (addToCartButton) {
    const updateAddToCartButton = async () => {
      const isAdded = await window.eventCart.hasEvent(selectedBand.id);
      addToCartButton.textContent = isAdded ? "Added to Cart" : "Add to Cart";
      addToCartButton.classList.toggle("is-added", isAdded);
      addToCartButton.setAttribute("aria-pressed", String(isAdded));
    };

    addToCartButton.onclick = async () => {
      addToCartButton.disabled = true;
      try {
        const isAdded = await window.eventCart.hasEvent(selectedBand.id);
        if (isAdded) {
          await window.eventCart.removeEvent(selectedBand.id);
        } else {
          await window.eventCart.addEvent(selectedBand.id);
        }
        await updateAddToCartButton();
      } catch (error) {
        console.error(error);
        await updateAddToCartButton();
        console.error(error.message || "Unable to update cart");
      } finally {
        addToCartButton.disabled = false;
      }
    };

    updateAddToCartButton().catch((error) => console.error(error));
    window.addEventListener("eventCartChanged", () => {
      updateAddToCartButton().catch((error) => console.error(error));
    });
  }

  const firstSectionDate = document.querySelector(".tittle-date-dcrp-btn p");
  if (firstSectionDate) firstSectionDate.textContent = selectedBand.event.date;

  const description = document.querySelector(
    ".tittle-date-dcrp-btn p:nth-of-type(2)",
  );
  if (description) description.textContent = selectedBand.event.description;

  const bandImage = document.querySelector(".bandImg2");
  if (bandImage) {
    bandImage.src = selectedBand.bandImg2;
    bandImage.alt = selectedBand.bandName;
  }

  const timeLocation = document.querySelector(".timeLocation");
  if (timeLocation) {
    const time = timeLocation.querySelector("p:nth-of-type(1)");
    const location = timeLocation.querySelector("p:nth-of-type(2)");
    if (time)
      time.textContent = `${selectedBand.event.time} — Doors open ${selectedBand.event.doorsOpen}`;
    if (location)
      location.textContent = `${selectedBand.location.venue}, ${selectedBand.location.city}`;
  }

  const ticketInfo = document.querySelector(".ticketInfo");
  if (ticketInfo) {
    const priceRange = ticketInfo.querySelector("p:nth-of-type(2)");
    if (priceRange && selectedBand.tickets.cheap && selectedBand.tickets.vip) {
      priceRange.innerHTML = `from ${selectedBand.tickets.cheap.price}${selectedBand.tickets.cheap.currency}
        <span>to</span>
        ${selectedBand.tickets.vip.price}${selectedBand.tickets.vip.currency}`;
    }
  }

  const map = document.querySelector(".map");
  if (map) {
    const mapQuery = encodeURIComponent(
      `${selectedBand.location.venue}, ${selectedBand.location.city}`,
    );
    map.innerHTML = `
      <iframe
        src="https://www.google.com/maps?q=${mapQuery}&output=embed"
        title="${selectedBand.location.venue} map"
        width="100%"
        height="100%"
        style="border:0;"
        allowfullscreen=""
        loading="lazy">
      </iframe>
    `;
  }

  const container = document.querySelector(".selectTktContainer");
  if (container) {
    container.querySelector(".bandNam").textContent = selectedBand.bandName;
    container.querySelector(".vntDate").textContent =
      `${selectedBand.event.date} • ${selectedBand.event.time}`;
    container.querySelector(".vntLocation").textContent =
      `${selectedBand.location.venue}, ${selectedBand.location.city}`;
  }

  const bandName = document.querySelector(".tittle-date-dcrp-btn .bandNam");
  const heroDate = document.querySelector(
    ".tittle-date-dcrp-btn p:nth-of-type(1)",
  );
  const heroDescription = document.querySelector(
    ".tittle-date-dcrp-btn p:nth-of-type(2)",
  );
  const bandImg = document.querySelector(".bandImg2");

  if (bandName) bandName.textContent = selectedBand.bandName;
  if (heroDate)
    heroDate.textContent = `${selectedBand.event.date} • ${selectedBand.event.time}`;
  if (heroDescription)
    heroDescription.textContent = selectedBand.bandDescription.trim();
  if (bandImg) {
    bandImg.src = selectedBand.bandImg2;
    bandImg.alt = selectedBand.bandName;
  }

  const tickets = selectedBand.tickets;
  const premiumPrice = document.querySelector(".premiumPrice");
  const vipPrice = document.querySelector(".vipPrice");
  if (premiumPrice && tickets.medium) {
    premiumPrice.textContent = `${tickets.medium.name}: ${tickets.medium.price}${tickets.medium.currency}`;
  }
  if (vipPrice && tickets.vip) {
    vipPrice.textContent = `${tickets.vip.name}: ${tickets.vip.price}${tickets.vip.currency}`;
  }

  if (typeof renderTicketLegend === "function") {
    renderTicketLegend();
  }
}

loadSelectedEvent().catch((error) => {
  console.error(error);
  const title = document.querySelector(".tittle-date-dcrp-btn h2");
  if (title) title.textContent = "Event unavailable";
});
