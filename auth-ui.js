(() => {
  async function isAdmin(session) {
    if (!session?.user || !window.supabaseClient) return false;
    const { data, error } = await window.supabaseClient
      .from("admin_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) {
      console.error(error);
      return false;
    }
    return Boolean(data);
  }

  const floatingAdminLink = document.createElement("a");
  floatingAdminLink.className = "adminFloatingLink";
  floatingAdminLink.href = "admin-dashboard.html";
  floatingAdminLink.textContent = "Dashboard";
  floatingAdminLink.hidden = true;
  document.body.appendChild(floatingAdminLink);

  if (window.authApi) {
    window.authApi
      .getSession()
      .then(async (session) => {
        floatingAdminLink.hidden = !(await isAdmin(session));
      })
      .catch(() => {
        floatingAdminLink.hidden = true;
      });
    window.authApi.subscribeToAuthChanges(async (_event, session) => {
      floatingAdminLink.hidden = !(await isAdmin(session));
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
