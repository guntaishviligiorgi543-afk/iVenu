(() => {
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

  let currentSession = null;

  async function render(session) {
    currentSession = session;
    authLink.textContent = session ? "logout" : "login";
    authLink.href = session ? "#" : "login.html";
    accountLink.hidden = !session;

    if (!session) return;
    if (authLink.dataset.bound === "true") return;

    authLink.dataset.bound = "true";
    authLink.addEventListener("click", async (event) => {
      if (!currentSession) return;
      event.preventDefault();
      authLink.textContent = "...";
      try {
        await window.authApi.signOut();
        window.location.reload();
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
