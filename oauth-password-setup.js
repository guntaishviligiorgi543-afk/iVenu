(() => {
  const form = document.querySelector("#oauthPasswordSetupForm");
  const message = document.querySelector("#oauthPasswordSetupMessage");
  const logout = document.querySelector("#oauthPasswordSetupLogout");
  const submit = form.querySelector('button[type="submit"]');

  const redirect = (path) => window.location.replace(path);

  const setMessage = (text = "", type = "") => {
    message.className = `auth-message${type ? ` ${type}` : ""}`;
    message.textContent = text;
  };

  const requireSetupSession = async () => {
    const session = await window.authApi.getSession();
    if (!session?.user) {
      redirect("login.html");
      return null;
    }

    const user = await window.authApi.getUser();
    if (!(await window.authApi.requiresGooglePasswordSetup(user))) {
      redirect("index.html");
      return null;
    }
    return user;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    let password = String(form.elements.password.value || "");
    let confirmPassword = String(form.elements.confirmPassword.value || "");
    const validationError = window.authApi.validatePassword(password);

    if (validationError) {
      setMessage(validationError, "error");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.", "error");
      return;
    }

    submit.disabled = true;
    logout.disabled = true;
    setMessage("Creating your password...");
    try {
      if (!(await requireSetupSession())) return;
      await window.authApi.updatePassword(password);
      const user = await window.authApi.getUser();
      if (await window.authApi.requiresGooglePasswordSetup(user)) {
        throw new Error("Password setup could not be confirmed.");
      }
      form.reset();
      setMessage("Password created. Redirecting...", "success");
      redirect("index.html");
    } catch (error) {
      console.error("Unable to create OAuth account password", error);
      setMessage(
        "Your password could not be created. Please try again.",
        "error",
      );
      submit.disabled = false;
      logout.disabled = false;
    } finally {
      password = "";
      confirmPassword = "";
    }
  });

  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      await window.authApi.signOut({ redirectTo: "login.html" });
    } catch (error) {
      console.error("Unable to sign out from password setup", error);
      setMessage("We could not sign you out. Please try again.", "error");
      logout.disabled = false;
    }
  });

  window.authApi.subscribeToAuthChanges((event, session) => {
    if (event === "SIGNED_OUT" || !session?.user) redirect("login.html");
  });

  requireSetupSession().catch((error) => {
    console.error("Unable to verify password setup session", error);
    setMessage("Your session could not be verified. Please sign in again.", "error");
    submit.disabled = true;
  });
})();
