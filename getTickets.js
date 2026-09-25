const params = new URLSearchParams(window.location.search);
const bandId = params.get("id");
let selectedBand = null;

const ticketHero = document.querySelector(".ticketHero");

function renderTicketHeroSkeleton() {
  if (!ticketHero) return;
  ticketHero.classList.add("is-loading");
  ticketHero.setAttribute("aria-busy", "true");
  const skeleton = document.createElement("div");
  skeleton.className = "ticketHeroSkeleton";
  skeleton.setAttribute("role", "status");
  skeleton.setAttribute("aria-label", "Loading event details");
  skeleton.innerHTML =
    '<span class="skeletonBlock ticketHeroSkeletonMedia"></span><div class="ticketHeroSkeletonContent"><span class="skeletonBlock ticketHeroSkeletonTitle"></span><span class="skeletonBlock ticketHeroSkeletonDate"></span><span class="skeletonBlock ticketHeroSkeletonDescription"></span><span class="skeletonBlock ticketHeroSkeletonButton"></span></div>';
  ticketHero.append(skeleton);
}

function finishTicketHeroLoading(state = "ready") {
  if (!ticketHero) return;
  ticketHero.querySelector(".ticketHeroSkeleton")?.remove();
  ticketHero.classList.remove("is-loading");
  ticketHero.classList.toggle("is-ready", state === "ready");
  ticketHero.setAttribute("aria-busy", "false");
}

function setTicketHeroState(message, isError = false) {
  finishTicketHeroLoading("state");
  const title = document.querySelector(".tittle-date-dcrp-btn h2");
  if (title) title.textContent = message;
  ticketHero?.classList.toggle("ticketHero--image-fallback", isError);
}

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
  if (!bandId) {
    setTicketHeroState("Event unavailable", true);
    return;
  }

  const releaseScroll = window.pageLoading?.lock("ticket-hero");
  renderTicketHeroSkeleton();

  try {
    const [event, ticketTypes] = await Promise.all([
      window.supabaseData.getEvent(bandId),
      window.supabaseData.getTicketTypes(bandId),
    ]);

    if (!event) {
      setTicketHeroState("Event unavailable", true);
      return;
    }

    const band = event.bands || {};
    const eventLocation = window.supabaseData.getEventLocation(event);
    selectedBand = {
      id: event.id,
      venueId: event.venue_id,
      venueName: event.venues?.name || eventLocation.venue,
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
        city: eventLocation.cityArea,
        venue: eventLocation.venue,
        region: eventLocation.region,
        country: eventLocation.country,
        address: eventLocation.address,
        coordinates: {
          lat: eventLocation.latitude,
          lng: eventLocation.longitude,
        },
      },
    };

    renderSelectedEvent();
    const heroImage = document.querySelector(".ticketHero .bandImg2");
    const imageReady = await window.pageLoading?.waitForImage(heroImage);
    if (imageReady === false)
      ticketHero?.classList.add("ticketHero--image-fallback");
    finishTicketHeroLoading();
    window.dispatchEvent(new CustomEvent("event-seat-context"));
    initializeBasket();
    renderBasket();
    window.supabaseData.recordEventView(selectedBand.id).catch((error) => {
      console.error("Unable to record event view", error);
    });
  } catch (error) {
    console.error(error);
    setTicketHeroState("Event unavailable", true);
  } finally {
    releaseScroll?.();
  }
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
                <h5>section <p class="section">${ticket.sectionName || ticket.section}</p></h5>
                <h5>row <p class="row">${ticket.row}</p></h5>
                <h5>seat <p class="seat">${ticket.seat}</p></h5>
              </div>
              <div class="tktPriceCont">
                <p class="tktType">${ticket.type}</p>
                <p class="tktprice">${ticket.price}${ticket.currency}</p>
                <h5 class="serviceFee">service fee <span>${ticket.serviceFee}${ticket.currency}</span></h5>
              </div>
            </div>
            <button class="removeTkt" data-event-seat-id="${ticket.eventSeatId || ""}" data-section="${ticket.section}" data-row="${ticket.row}" data-seat="${ticket.seat}">
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
          eventSeatId: button.dataset.eventSeatId || null,
          section: button.dataset.section,
          row: Number(button.dataset.row),
          seat: Number(button.dataset.seat),
        });
      });
    });
  }

  document.querySelectorAll(".tktListContainer").forEach((container) => {
    window.canonicalTicketSeatMap?.renderTicketListForContainer(container);
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
}

function initializeBasket() {
  if (!selectedBand) return;

  bindTicketListControls();
  renderBasket();
}

function uniqueLocationParts(parts) {
  return [...new Set(parts.filter(Boolean))];
}

function formatSelectedLocation(location) {
  const details = uniqueLocationParts([
    location.city,
    location.region,
    location.country,
  ]).join(", ");
  return [location.venue, details].filter(Boolean).join(", ");
}

function getMapQuery(location) {
  const { lat, lng } = location.coordinates || {};
  const hasCoordinates =
    lat !== null &&
    lat !== undefined &&
    lng !== null &&
    lng !== undefined &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng));

  if (hasCoordinates) return `${lat},${lng}`;

  return uniqueLocationParts([
    location.venue,
    location.address,
    location.city,
    location.region,
    location.country,
  ]).join(", ");
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
      if (
        window.requireAuthForTickets &&
        !(await window.requireAuthForTickets())
      )
        return;
      addToCartButton.disabled = true;
      addToCartButton.classList.add("cart-action-pending");
      addToCartButton.setAttribute("aria-busy", "true");
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
        addToCartButton.classList.remove("cart-action-pending");
        addToCartButton.setAttribute("aria-busy", "false");
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
  const locationText = formatSelectedLocation(selectedBand.location);
  if (timeLocation) {
    const time = timeLocation.querySelector("p:nth-of-type(1)");
    const location = timeLocation.querySelector("p:nth-of-type(2)");
    if (time)
      time.textContent = `${selectedBand.event.time} — Doors open ${selectedBand.event.doorsOpen}`;
    if (location) location.textContent = locationText;
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
    const mapQuery = encodeURIComponent(getMapQuery(selectedBand.location));
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
    container.querySelector(".vntLocation").textContent = locationText;
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

loadSelectedEvent();
