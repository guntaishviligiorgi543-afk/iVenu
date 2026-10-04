(() => {
  const form = document.querySelector("#loginSecurityForm");
  const message = document.querySelector("#loginSecurityMessage");
  const submit = form.querySelector('button[type="submit"]');
  const resend = document.querySelector("#resendLoginSecurity");
  const logout = document.querySelector("#logoutLoginSecurity");
  let resendTimer = null;
  let resendSeconds = 0;

  const setMessage = (text, type = "") => {
    message.className = `auth-message${type ? ` ${type}` : ""}`;
    message.textContent = text;
  };

  const startCooldown = () => {
    clearInterval(resendTimer);
    resendSeconds = 60;
    resend.disabled = true;
    resend.textContent = `Resend code (${resendSeconds}s)`;
    resendTimer = setInterval(() => {
      resendSeconds -= 1;
      if (resendSeconds <= 0) {
        clearInterval(resendTimer);
        resend.disabled = false;
        resend.textContent = "Resend code";
        return;
      }
      resend.textContent = `Resend code (${resendSeconds}s)`;
    }, 1000);
  };

  const returnTo = (() => {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if (!requested || /[\\\u0000-\u001f\u007f]/.test(requested)) return "index.html";
    try {
      const target = new URL(requested, window.location.origin);
      if (target.origin !== window.location.origin || !target.pathname.startsWith("/"))
        return "index.html";
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return "index.html";
    }
  })();

  const requestCode = async () => {
    setMessage("Sending verification code...");
    resend.disabled = true;
    try {
      await window.authApi.requestLoginSecurityOtp();
      setMessage("A verification code was sent to your email.", "success");
      startCooldown();
    } catch (error) {
      console.error("Unable to request login verification code", error);
      setMessage(
        error.message || "Unable to send the verification code. Please retry.",
        "error",
      );
      resend.disabled = false;
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const otp = String(new FormData(form).get("otp") || "").trim();
    if (!/^\d{8}$/.test(otp)) {
      setMessage("Enter the eight-digit verification code.", "error");
      return;
    }
    submit.disabled = true;
    setMessage("Verifying sign-in...");
    try {
      await window.authApi.verifyLoginSecurityOtp(otp);
      window.location.replace(returnTo);
    } catch (error) {
      console.error("Unable to verify login security code", error);
      setMessage(
        error.message || "The code is invalid or expired. Please try again.",
        "error",
      );
      submit.disabled = false;
    }
  });

  resend.addEventListener("click", requestCode);
  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      await window.authApi.signOut({ redirectTo: "login.html" });
    } catch (error) {
      console.error("Unable to sign out from login verification", error);
      logout.disabled = false;
      setMessage("Unable to log out. Please retry.", "error");
    }
  });

  window.authApi
    .getSession()
    .then(async (session) => {
      if (!session?.user) {
        window.location.replace("login.html");
        return;
      }
      await requestCode();
    })
    .catch((error) => {
      console.error("Unable to load login verification session", error);
      setMessage("Your session could not be verified. Please log in again.", "error");
    });
})();
