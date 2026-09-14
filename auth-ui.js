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

  const authLink = document.createElement("a");
  authLink.className = "authNavLink";
  nav.appendChild(authLink);
  const accountLink = document.createElement("a");
  accountLink.className = "authNavLink";
  accountLink.textContent = "account";
  accountLink.href = "profile.html";
  accountLink.hidden = true;
  nav.appendChild(accountLink);
  const isAccountPage = document.body.classList.contains("account-page");
  let currentSession = null;

  async function render(session) {
    currentSession = session;
    authLink.textContent = session ? "logout" : "login";
    authLink.href = session ? "#" : "login.html";
    accountLink.hidden = isAccountPage || !session;
    const admin = await isAdmin(session);
    floatingAdminLink.hidden = !admin;

    if (!session) return;
    if (authLink.dataset.bound === "true") return;

    authLink.dataset.bound = "true";
    authLink.addEventListener("click", async (event) => {
      if (!currentSession) return;
      event.preventDefault();
      authLink.textContent = "...";
      try {
        await window.authApi.signOut({ redirectTo: "index.html" });
      } catch (error) {
        console.error(error);
        authLink.textContent = "logout";
      }
    });
  }

  window.authApi
    .getSession()
    .then(render)
    .catch((error) => {
      console.error(error);
      render(null);
    });

  window.authApi.subscribeToAuthChanges((_event, session) => render(session));

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
