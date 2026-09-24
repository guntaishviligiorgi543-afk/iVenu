(() => {
  const isDashboard =
    document.body.classList.contains("account-page") ||
    /(?:^|\/)admin-dashboard\.html$/.test(location.pathname);
  if (isDashboard) return;

  let header = document.querySelector("header");
  if (!header) {
    header = document.createElement("header");
    document.body.prepend(header);
  }
  if (header.dataset.publicHeaderReady) return;
  header.dataset.publicHeaderReady = "true";

  const isAuthPage =
    document.body.className.includes("auth") ||
    /login|register|verify|reset|forgot/.test(location.pathname);
  let toggle = header.querySelector(".mobileMenuToggle");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.className = "mobileMenuToggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Open menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = "<span></span><span></span><span></span>";
    header.append(toggle);
  }

  let menu = document.querySelector("#mobileMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "mobileMenu";
    menu.id = "mobileMenu";
    menu.setAttribute("aria-hidden", "true");
    menu.innerHTML =
      '<div class="mobileMenuPanel"><nav class="mobileMenuNav" aria-label="Mobile navigation"><a href="index.html">home</a><a href="shows.html">shows</a><a href="venue.html">venue</a><a href="contact.html">contact</a><a href="profile.html#cart">Cart</a><a href="profile.html">Dashboard</a></nav><div class="mobileMenuSocial"></div><div class="mobileMenuAccount"></div></div>';
    document.body.append(menu);
  }

  const panel = menu.querySelector(".mobileMenuPanel");
  const nav = menu.querySelector(".mobileMenuNav");
  if (nav && !nav.querySelector('[href="profile.html#cart"]')) {
    nav.insertAdjacentHTML(
      "beforeend",
      '<a href="profile.html#cart">Cart</a><a href="profile.html">Dashboard</a>',
    );
  }
  let socialSlot = menu.querySelector(".mobileMenuSocial");
  let account = menu.querySelector(".mobileMenuAccount");
  if (!socialSlot && panel) {
    socialSlot = document.createElement("div");
    socialSlot.className = "mobileMenuSocial";
    panel.insertBefore(socialSlot, account || null);
  }
  if (!account && panel) {
    account = document.createElement("div");
    account.className = "mobileMenuAccount";
    panel.append(account);
  }

  const headerNav = header.querySelector("nav");
  const headerAuth = document.createElement("a");
  headerAuth.className = "authNavLink";
  const headerAccount = document.createElement("a");
  headerAccount.className = "authNavLink";
  headerAccount.href = "profile.html";
  headerAccount.textContent = "account";
  headerNav?.querySelectorAll(".authNavLink").forEach((link) => link.remove());
  headerNav?.append(headerAuth, headerAccount);

  const social = document.querySelector(".socIcons");
  const socialParent = social?.parentNode;
  const socialNext = social?.nextSibling;
  const burgerBreakpoint = window.matchMedia("(max-width: 1290px)");
  const cart = document.querySelector("#eventCartToggle");
  const placeSocial = (isMenuOpen = false) => {
    if (!social) return;
    if (isMenuOpen && socialSlot) socialSlot.append(social);
    else if (burgerBreakpoint.matches) header.append(social);
    else if (socialParent) socialParent.insertBefore(social, socialNext);
  };
  const setOpen = (open) => {
    menu.classList.toggle("is-open", open);
    toggle.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("mobile-menu-open", open);
    cart?.classList.toggle("header-cart-hidden", open || isAuthPage);
    placeSocial(open);
  };

  const renderAuth = (session) => {
    const signedIn = Boolean(session?.user);
    headerAuth.textContent = signedIn ? "logout" : "login";
    headerAuth.href = signedIn ? "#" : "login.html";
    headerAccount.hidden = !signedIn;
    account.replaceChildren();

    if (!signedIn) {
      const login = document.createElement("a");
      login.href = "login.html";
      login.textContent = "login";
      account.append(login);
      return;
    }

    const logout = document.createElement("button");
    logout.type = "button";
    logout.textContent = "logout";
    logout.className = "mobileLogoutButton";
    logout.addEventListener("click", async () => {
      try {
        await window.authApi.signOut();
        setOpen(false);
        renderAuth(null);
      } catch (error) {
        console.error("Logout failed:", error);
      }
    });
    const mobileAccount = document.createElement("a");
    mobileAccount.href = "profile.html";
    mobileAccount.textContent = "account";
    account.append(logout, mobileAccount);
  };

  headerAuth.addEventListener("click", async (event) => {
    if (headerAuth.textContent !== "logout") return;
    event.preventDefault();
    try {
      await window.authApi.signOut();
      renderAuth(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  });
  toggle.addEventListener("click", () =>
    setOpen(!menu.classList.contains("is-open")),
  );
  menu.addEventListener("click", (event) => {
    if (event.target === menu || event.target.closest(".mobileMenuNav a"))
      setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  window.addEventListener("resize", () => {
    if (innerWidth > 1290) setOpen(false);
    else if (!menu.classList.contains("is-open")) placeSocial();
  });
  placeSocial();
  if (isAuthPage) cart?.classList.add("header-cart-hidden");

  if (!window.authApi) {
    renderAuth(null);
    return;
  }
  window.authApi
    .getSession()
    .then(renderAuth)
    .catch(() => renderAuth(null));
  window.authApi.subscribeToAuthChanges((_event, session) =>
    renderAuth(session),
  );
})();
