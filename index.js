const eventsAccordion = document.querySelector("#eventsAccordion");

if (!eventsAccordion) {
  throw new Error("Events accordion container is missing.");
}

// =====================================================
// DATE
// =====================================================

function formatDate(date) {
  const d = new Date(date);

  const month = d
    .toLocaleString("en-US", {
      month: "short",
    })
    .toUpperCase();

  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

// =====================================================
// UPCOMING ACTIVE EVENTS
// =====================================================

const startDate = new Date();
startDate.setHours(0, 0, 0, 0);

// მხოლოდ მომდევნო 4 თვის კონცერტები
function renderAccordion(event) {
  const band = event.bands || {};
  const performer = event.performer || band.name || event.title;
  const accordion = document.createElement("div");

  accordion.classList.add("eventAcordion");

  accordion.innerHTML = `

    <div class="closedAcordion">

      <div>

        <p class="event-date">
          ${formatDate(event.event_date)}
        </p>

        <h2 class="artistNAm">
          ${performer}
        </h2>

 
      </div>

 <button class="getTicketBtn" data-id="${event.id}">
  <span>get tickets</span>
</button>
    </div>

    <div class="openAcordion">

      <div>

        <p class="vnt-dt-tm-drt">
          ${formatDate(event.event_date)}
          ·
          ${event.event_time?.slice(0, 5) || "Time TBA"}
        </p>

        <p class="adress">
          ${event.venue},
          ${event.city}, ${event.country || ""}
        </p>

      </div>

      <p class="vntDscrp">
        ${event.description || "Event details coming soon."}
      </p>

      <div class="share">

        <p>share</p>

        <!-- შენი არსებული SVG-ები აქ დატოვე -->

      </div>

    </div>
  `;

  // თავიდან დახურულია
  const open = accordion.querySelector(".openAcordion");
  open.style.display = "none";

  // CLOSED
  const closed = accordion.querySelector(".closedAcordion");

  closed.addEventListener("click", function (e) {
    const ticketBtn = e.target.closest(".getTicketBtn");

    // თუ Get Tickets-ს დააჭირე
    if (ticketBtn) {
      const bandId = ticketBtn.dataset.id;

      window.location.href = `getTickets.html?id=${bandId}`;

      return;
    }

    // სხვა ადგილას დაჭერისას accordion გაიხსნას/დაიხუროს
    if (open.style.display === "none") {
      open.style.display = "flex";
    } else {
      open.style.display = "none";
    }
  });

  eventsAccordion.appendChild(accordion);
}

async function loadUpcomingEvents() {
  eventsAccordion.innerHTML = "<p>Loading events...</p>";

  try {
    const events = await window.supabaseData.getEvents();
    const upcomingEvents = events.filter((event) => {
      const eventDate = new Date(event.event_date);
      return event.status === "active" && eventDate >= startDate;
    });

    eventsAccordion.innerHTML = "";

    if (!upcomingEvents.length) {
      eventsAccordion.innerHTML = "<p>No upcoming events are available.</p>";
      return;
    }

    upcomingEvents.slice(0, 4).forEach(renderAccordion);
  } catch (error) {
    console.error(error);
    eventsAccordion.innerHTML =
      "<p>Events are temporarily unavailable. Please try again later.</p>";
  }
}

loadUpcomingEvents();

// =====================================================
// CHECK
// =====================================================

console.log("EVENT SOURCE: Supabase");
