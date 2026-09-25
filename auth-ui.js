(() => {
  const floatingAdminLink = document.createElement("a");
  floatingAdminLink.className = "adminFloatingLink";
  floatingAdminLink.href = "admin-dashboard.html";
  floatingAdminLink.textContent = "Dashboard";
  floatingAdminLink.hidden = true;
  floatingAdminLink.dataset.adminVisible = "false";
  document.body.appendChild(floatingAdminLink);

  const setFloatingAdminVisibility = (visible) => {
    floatingAdminLink.dataset.adminVisible = String(visible);
    floatingAdminLink.hidden =
      !visible || document.body.classList.contains("mobile-menu-open");
  };

  const showAuthGate = () => {
    let gate = document.querySelector(".auth-gate");
    if (!gate) {
      gate = document.createElement("div");
      gate.className = "auth-gate";
      gate.innerHTML = `
        <div class="auth-gate__dialog" role="dialog" aria-modal="true" aria-labelledby="authGateTitle" aria-describedby="authGateMessage">
          <button class="auth-gate__close" type="button" aria-label="Close">×</button>
          <a class="auth-gate__logo" href="index.html" aria-label="iVenue home">
            <img src="assets/ivenue-logo.png" alt="iVenue" />
          </a>
          <h2 id="authGateTitle">Sign in first</h2>
          <p id="authGateMessage">You have to be signed in first to choose tickets.</p>
          <div class="auth-gate__actions">
            <a href="login.html">Log In</a>
            <a href="register.html">Register</a>
          </div>
        </div>
      `;
      const close = () => {
        gate.remove();
        document.body.classList.remove("auth-gate-open");
        document.removeEventListener("keydown", handleKeydown);
      };
      const handleKeydown = (event) => {
        if (event.key === "Escape") close();
      };
      gate.addEventListener("click", (event) => {
        if (event.target === gate) close();
      });
      gate.querySelector(".auth-gate__close").addEventListener("click", close);
      document.addEventListener("keydown", handleKeydown);
      document.body.appendChild(gate);
    }
    document.body.classList.add("auth-gate-open");
    return false;
  };

  if (window.authApi) {
    window.authApi
      .getSession()
      .then(async (session) => {
        setFloatingAdminVisibility(await window.authApi.isAdmin(session));
      })
      .catch(() => {
        setFloatingAdminVisibility(false);
      });
    window.authApi.subscribeToAuthChanges(async (_event, session) => {
      setFloatingAdminVisibility(await window.authApi.isAdmin(session));
    });
  }
  const nav = document.querySelector("header nav");
  if (!nav || !window.authApi) return;
  const sharedHeaderOwnsAuth =
    document.querySelector("header")?.dataset.publicHeaderReady === "true";
  if (sharedHeaderOwnsAuth) {
    window.requireAuthForTickets = async () => {
      const session = await window.authApi.getSession();
      if (session) return true;
      return showAuthGate();
    };
    return;
  }

  window.requireAuthForTickets = async () => {
    const session = await window.authApi.getSession();
    if (session) return true;
    return showAuthGate();
  };
})();
