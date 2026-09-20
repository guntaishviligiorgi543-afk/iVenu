const eventsAccordion = document.querySelector("#eventsAccordion");
const heroSlider = document.querySelector(".heroSlider");
const eventShareDialog = document.querySelector("#eventShareDialog");
const eventShareFeedback = document.querySelector("#eventShareFeedback");
let sharedEvent = null;
let shareDialogTrigger = null;

const heroArrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="2em" height="2em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="m1.027 11.993l4.235 4.25L6.68 14.83l-1.821-1.828L22.974 13v-2l-18.12.002L6.69 9.174L5.277 7.757z" /></svg>`;

function heroDate(event) {
  const value = new Date(`${event.event_date}T00:00:00`);
  return Number.isNaN(value.getTime())
    ? "Date TBA"
    : value.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
}

function heroTime(event) {
  return event.event_time ? event.event_time.slice(0, 5) : "Time TBA";
}

function renderHeroSlide(event, index) {
  const location = window.supabaseData.getEventLocation(event);
  const slide = document.createElement("div");
  slide.className = `heroSlide${index === 0 ? " active" : ""}`;
  const image = document.createElement("img");
  image.src = event.image_url || "";
  image.alt = event.title || event.performer || "Event";
  slide.append(image);

  const content = document.createElement("div");
  content.className = "SlideContent heroEventOverlay";
  const title = document.createElement("h1");
  title.className = "heroEventTitle";
  title.textContent = event.title || event.performer || "Upcoming event";
  content.append(title);

  const details = document.createElement("section");
  details.className = "heroEventInfo";
  const dates = document.createElement("div");
  dates.className = "heroEventDetails";
  [heroDate(event), heroTime(event), location.venue || location.details]
    .filter(Boolean)
    .forEach((value) => {
      const line = document.createElement("p");
      line.className = "heroEventMeta";
      line.textContent = value;
      dates.append(line);
    });
  const cta = document.createElement("div");
  cta.className = "heroEventCta";
  cta.insertAdjacentHTML("beforeend", heroArrowSvg);
  const button = document.createElement("button");
  button.type = "button";
  const link = document.createElement("a");
  link.href = `getTickets.html?id=${encodeURIComponent(event.id)}`;
  const label = document.createElement("span");
  label.textContent = "get tickets";
  link.append(label);
  button.append(link);
  cta.append(button);
  details.append(dates, cta);
  content.append(details);
  slide.append(content);
  return slide;
}

function initializeHeroSlider() {
  const slides = [...heroSlider.querySelectorAll(".heroSlide")];
  const dots = [...heroSlider.querySelectorAll(".heroDot")];
  if (!slides.length) return;
  let currentSlide = 0;
  let autoSlide;
  let isAnimating = false;
  let wheelLocked = false;
  const slideDuration = 1300;
  const autoSlideTime = 7000;
  const showSlide = (index) => {
    if (isAnimating || slides.length < 2) return;
    isAnimating = true;
    index = (index + slides.length) % slides.length;
    slides[currentSlide].classList.remove("active");
    dots[currentSlide]?.classList.remove("active");
    slides[index].classList.add("active");
    dots[index]?.classList.add("active");
    currentSlide = index;
    window.setTimeout(() => {
      isAnimating = false;
    }, slideDuration);
  };
  const nextSlide = () => showSlide(currentSlide + 1);
  const previousSlide = () => showSlide(currentSlide - 1);
  const startAutoSlide = () => {
    window.clearInterval(autoSlide);
    if (slides.length > 1)
      autoSlide = window.setInterval(nextSlide, autoSlideTime);
  };
  dots.forEach((dot, index) =>
    dot.addEventListener("click", () => {
      showSlide(index);
      startAutoSlide();
    }),
  );
  heroSlider.addEventListener(
    "wheel",
    (event) => {
      const horizontalScroll = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const atTop = window.scrollY <= 0;
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      const shouldHandle =
        horizontalScroll ||
        (event.deltaY > 0 ? atBottom : event.deltaY < 0 && atTop);
      if (!shouldHandle || wheelLocked || isAnimating) return;
      event.preventDefault();
      wheelLocked = true;
      (horizontalScroll ? event.deltaX : event.deltaY) > 0
        ? nextSlide()
        : previousSlide();
      startAutoSlide();
      window.setTimeout(() => {
        wheelLocked = false;
      }, slideDuration);
    },
    { passive: false },
  );
  startAutoSlide();
}

async function loadHeroEvents() {
  if (!heroSlider) return;
  try {
    const events = await window.supabaseData.getHomepageHeroEvents();
    if (!events.length) {
      heroSlider.replaceChildren();
      return;
    }
    const dots = document.createElement("div");
    dots.className = "heroDots";
    events.forEach((event, index) => {
      heroSlider.append(renderHeroSlide(event, index));
      const dot = document.createElement("button");
      dot.className = `heroDot${index === 0 ? " active" : ""}`;
      dot.dataset.slide = String(index);
      dot.type = "button";
      dot.setAttribute("aria-label", `Show slide ${index + 1}`);
      dots.append(dot);
    });
    heroSlider.append(dots);
    initializeHeroSlider();
  } catch (error) {
    console.error("Hero events could not be loaded.", error);
    heroSlider.replaceChildren();
  }
}

if (!eventsAccordion) {
  throw new Error("Events accordion container is missing.");
}

function setAccordionOpen(accordion, isOpen) {
  const open = accordion.querySelector(".openAcordion");
  if (!open) return;
  open.style.display = isOpen ? "flex" : "none";
  accordion.classList.toggle("is-open", isOpen);
}

function closeOpenAccordion(except = null) {
  const openAccordion = eventsAccordion.querySelector(".eventAcordion.is-open");
  if (openAccordion && openAccordion !== except)
    setAccordionOpen(openAccordion, false);
}

document.addEventListener("click", (event) => {
  if (
    event.target.closest?.(".eventAcordion") ||
    eventShareDialog?.contains(event.target)
  )
    return;
  closeOpenAccordion();
});

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

function eventShareUrl(eventId) {
  const url = new URL("getTickets.html", window.location.href);
  url.searchParams.set("id", eventId);
  return url.href;
}

function setShareFeedback(message = "") {
  if (eventShareFeedback) eventShareFeedback.textContent = message;
}

function openEventShareDialog(event, trigger) {
  window.iVenueEventShare?.open(event, trigger);
}

function closeEventShareDialog() {
  if (!eventShareDialog || eventShareDialog.hidden) return;
  eventShareDialog.hidden = true;
  document.body.classList.remove("event-share-dialog-open");
  setShareFeedback();
  sharedEvent = null;
  shareDialogTrigger?.focus();
  shareDialogTrigger = null;
}

async function copySharedEventUrl() {
  if (!sharedEvent?.url) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(sharedEvent.url);
    } else {
      const input = document.createElement("textarea");
      input.value = sharedEvent.url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("Clipboard copy was not available.");
    }
    setShareFeedback("Link copied");
    return true;
  } catch (error) {
    console.error("Event link could not be copied.", error);
    setShareFeedback(
      "Unable to copy the link. Please copy it from the address bar.",
    );
    return false;
  }
}

function openShareWindow(url) {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) popup.opener = null;
}

eventShareDialog?.addEventListener("click", async (event) => {
  if (window.iVenueEventShare) return;
  if (event.target.closest("[data-share-close]")) {
    closeEventShareDialog();
    return;
  }
  const platform = event.target.closest("[data-share-platform]")?.dataset
    .sharePlatform;
  if (!platform || !sharedEvent) return;
  if (platform === "facebook") {
    const target = new URL("https://www.facebook.com/sharer/sharer.php");
    target.searchParams.set("u", sharedEvent.url);
    openShareWindow(target.href);
  } else if (platform === "x") {
    const target = new URL("https://twitter.com/intent/tweet");
    target.searchParams.set("text", `${sharedEvent.title} — iVenue`);
    target.searchParams.set("url", sharedEvent.url);
    openShareWindow(target.href);
  } else {
    await copySharedEventUrl();
  }
});

document.addEventListener("keydown", (event) => {
  if (window.iVenueEventShare) return;
  if (event.key === "Escape" && eventShareDialog && !eventShareDialog.hidden) {
    closeEventShareDialog();
  }
});

// =====================================================
// UPCOMING SHOWS
// =====================================================

function renderAccordion(event) {
  const band = event.bands || {};
  const performer = event.performer || band.name || event.title;
  const location = window.supabaseData.getEventLocation(event);
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
          ${location.text}
        </p>

      </div>

      <p class="vntDscrp">
        ${event.description || "Event details coming soon."}
      </p>

      <div class="share">

        <button class="shareEventButton" type="button" data-share-event="${event.id}" aria-label="Share this event">
          <svg xmlns="http://www.w3.org/2000/svg" width="1.69em" height="1.5em" viewBox="0 0 1792 1600" aria-hidden="true">
            <path d="M0 0h1792v1600H0z" fill="none" />
            <path fill="currentColor" d="M1792 576q0 26-19 45l-512 512q-19 19-45 19t-45-19t-19-45V832H928q-98 0-175.5 6t-154 21.5t-133 42.5T360 971.5t-80 101t-48.5 138.5t-17.5 181q0 55 5 123q0 6 2.5 23.5t2.5 26.5q0 15-8.5 25t-23.5 10q-16 0-28-17q-7-9-13-22t-13.5-30t-10.5-24Q0 1222 0 1056q0-199 53-333q162-403 875-403h224V64q0-26 19-45t45-19t45 19l512 512q19 19 19 45" />
          </svg>
        </button>

      </div>

    </div>
  `;

  // თავიდან დახურულია
  const open = accordion.querySelector(".openAcordion");
  const closed = accordion.querySelector(".closedAcordion");
  setAccordionOpen(accordion, false);

  // CLOSED
  const shareButton = accordion.querySelector("[data-share-event]");

  shareButton.addEventListener("click", (clickEvent) => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    openEventShareDialog(event, shareButton);
  });

  closed.addEventListener("click", function (e) {
    const ticketBtn = e.target.closest(".getTicketBtn");

    // თუ Get Tickets-ს დააჭირე
    if (ticketBtn) {
      const bandId = ticketBtn.dataset.id;

      window.location.href = `getTickets.html?id=${bandId}`;

      return;
    }

    // სხვა ადგილას დაჭერისას accordion გაიხსნას/დაიხუროს
    const isOpen = accordion.classList.contains("is-open");
    closeOpenAccordion(accordion);
    setAccordionOpen(accordion, !isOpen);
  });

  eventsAccordion.appendChild(accordion);
}

async function loadUpcomingEvents() {
  eventsAccordion.innerHTML = "<p>Loading events...</p>";

  try {
    const upcomingEvents = await window.supabaseData.getHomepageUpcomingShows();

    eventsAccordion.innerHTML = "";

    if (!upcomingEvents.length) {
      eventsAccordion.innerHTML = "<p>No upcoming events are available.</p>";
      return;
    }

    upcomingEvents.forEach(renderAccordion);
  } catch (error) {
    console.error(error);
    eventsAccordion.innerHTML =
      "<p>Events are temporarily unavailable. Please try again later.</p>";
  }
}

loadUpcomingEvents();
loadHeroEvents();

// =====================================================
// CHECK
// =====================================================

console.log("EVENT SOURCE: Supabase");
// =====================================================
// MOBILE HEADER / BURGER MENU
// =====================================================

const mobileMenuToggle = document.querySelector(".mobileMenuToggle");
const mobileMenu = document.querySelector("#mobileMenu");
const mobileMenuAccount = document.querySelector("#mobileMenuAccount");

// Burger menu open / close
function setMobileMenu(open) {
  if (!mobileMenuToggle || !mobileMenu) return;

  mobileMenuToggle.classList.toggle("is-open", open);
  mobileMenu.classList.toggle("is-open", open);

  mobileMenuToggle.setAttribute("aria-expanded", String(open));
  mobileMenu.setAttribute("aria-hidden", String(!open));

  document.body.classList.toggle("mobile-menu-open", open);
}

// Burger button click
mobileMenuToggle?.addEventListener("click", () => {
  const isOpen = mobileMenu.classList.contains("is-open");
  setMobileMenu(!isOpen);
});

// Close menu when clicking overlay or navigation link
mobileMenu?.addEventListener("click", (event) => {
  if (
    event.target === mobileMenu ||
    event.target.closest(".mobileMenuNav a")
  ) {
    setMobileMenu(false);
  }
});

// Close with Escape
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMobileMenu(false);
  }
});

// If resized back to desktop, close mobile menu
window.addEventListener("resize", () => {
  if (window.innerWidth > 900) {
    setMobileMenu(false);
  }
});

// =====================================================
// MOBILE AUTH MENU
// =====================================================

function mobileMenuLink(label, href, className = "") {
  const link = document.createElement("a");

  link.textContent = label;
  link.href = href;

  if (className) {
    link.className = className;
  }

  return link;
}

async function renderMobileAccountMenu() {
  if (!mobileMenuAccount) return;

  mobileMenuAccount.replaceChildren();

  const client = window.supabaseClient || window.supabase;

  // If Supabase is unavailable
  if (!client?.auth?.getSession) {
    mobileMenuAccount.append(
      mobileMenuLink("log in", "login.html"),
      mobileMenuLink("sign up", "signup.html")
    );

    return;
  }

  try {
    const { data, error } = await client.auth.getSession();

    if (error) {
      throw error;
    }

    const user = data?.session?.user || null;

    // =================================================
    // USER IS LOGGED OUT
    // =================================================

    if (!user) {
      mobileMenuAccount.append(
        mobileMenuLink("log in", "login.html"),
        mobileMenuLink("sign up", "signup.html")
      );

      return;
    }

    // =================================================
    // USER IS LOGGED IN
    // =================================================

    mobileMenuAccount.append(
      mobileMenuLink("account", "profile.html")
    );

    // =================================================
    // ADMIN CHECK
    // =================================================

    const role =
      user.app_metadata?.role ||
      user.user_metadata?.role ||
      user.app_metadata?.user_role ||
      user.user_metadata?.user_role;

    const isAdmin =
      role === "admin" ||
      user.app_metadata?.is_admin === true ||
      user.user_metadata?.is_admin === true ||
      window.isAdmin === true;

    // Admin only
    if (isAdmin) {
      mobileMenuAccount.append(
        mobileMenuLink(
          "dashboard",
          "admin-dashboard.html",
          "mobileAdminLink"
        )
      );
    }

    // =================================================
    // LOG OUT
    // =================================================

    const logoutButton = document.createElement("button");

    logoutButton.type = "button";
    logoutButton.textContent = "log out";
    logoutButton.className = "mobileLogoutButton";

    logoutButton.addEventListener("click", async () => {
      try {
        const { error } = await client.auth.signOut();

        if (error) {
          throw error;
        }

        setMobileMenu(false);

        window.location.href = "index.html";
      } catch (error) {
        console.error("Logout failed:", error);
      }
    });

    mobileMenuAccount.append(logoutButton);
  } catch (error) {
    console.error(
      "Mobile account menu could not be rendered:",
      error
    );
  }
}

// Initial check
renderMobileAccountMenu();

// Check again when page is loaded
window.addEventListener("DOMContentLoaded", () => {
  renderMobileAccountMenu();
});

// Automatically update menu after login/logout
(() => {
  const client = window.supabaseClient || window.supabase;

  client?.auth?.onAuthStateChange?.(() => {
    window.setTimeout(() => {
      renderMobileAccountMenu();
    }, 0);
  });
})();