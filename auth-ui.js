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

      let gate = document.querySelector(".auth-gate");
      if (!gate) {
        gate = document.createElement("div");
        gate.className = "auth-gate";
        gate.innerHTML = `
            <div class="auth-gate__dialog" role="dialog" aria-modal="true" aria-labelledby="authGateTitle">
              <h2 id="authGateTitle">Sign in first</h2>
              <p>You have to be signed in first to choose tickets.</p>
              <div class="auth-gate__actions">
                <a href="login.html">Log in</a>
                <a href="register.html">Create account</a>
                <button type="button" class="auth-gate__close">Close</button>
              </div>
            </div>
          `;
        gate
          .querySelector(".auth-gate__close")
          .addEventListener("click", () => {
            gate.remove();
          });
        document.body.appendChild(gate);
      }
      return false;
    };
    return;
  }

  window.requireAuthForTickets = async () => {
    const session = await window.authApi.getSession();
    if (session) return true;

    let gate = document.querySelector(".auth-gate");
    if (!gate) {
      gate = document.createElement("div");
      gate.className = "auth-gate";
      gate.innerHTML = `
        <div class="auth-gate__dialog" role="dialog" aria-modal="true" aria-labelledby="authGateTitle">
          <h2 id="authGateTitle">Sign in first</h2>
          <p>You have to be signed in first to choose tickets.</p>
          <div class="auth-gate__actions">
            <a href="login.html">Log in</a>
            <a href="register.html">Create account</a>
            <button type="button" class="auth-gate__close">Close</button>
          </div>
        </div>
      `;
      gate.querySelector(".auth-gate__close").addEventListener("click", () => {
        gate.remove();
      });
      document.body.appendChild(gate);
    }
    return false;
  };
})();
