(() => {
  const form = document.querySelector("[data-email-change-form]");
  if (!form || !window.supabaseClient) return;

  const modal = document.querySelector("#emailChangeModal");
  const openButton = document.querySelector("#openEmailChange");
  const closeButton = document.querySelector("#closeEmailChange");
  const requestPanel = form.querySelector("[data-email-change-request]");
  const otpPanel = form.querySelector("[data-email-change-otp]");
  const successPanel = form.querySelector("[data-email-change-success]");
  const verifyButton = form.querySelector("[data-email-change-verify]");
  const resendButton = form.querySelector("[data-email-change-resend]");
  const doneButton = form.querySelector("[data-email-change-done]");
  const submitButton = form.querySelector('button[type="submit"]');
  const otpInput = form.elements.otp;
  const status = form.querySelector("[data-email-change-status]");
  const currentEmailElements = document.querySelectorAll(
    "[data-current-auth-email]",
  );
  const stepIndicators = document.querySelectorAll(
    "[data-email-change-step-indicator]",
  );
  let requestId = null;
  let resendTimer = null;
  let currentEmail = "";
  const requireAdmin = form.hasAttribute("data-require-admin");

  const setStatus = (text, type = "") => {
    status.className = `auth-message email-change-status ${type}`;
    status.textContent = text;
  };

  const setStep = (step) => {
    const isRequest = step === 1;
    requestPanel.hidden = !isRequest;
    otpPanel.hidden = isRequest;
    successPanel.hidden = true;
    stepIndicators.forEach((indicator) => {
      const active =
        indicator.dataset.emailChangeStepIndicator === String(step);
      indicator.classList.toggle("is-active", active);
      indicator.setAttribute("aria-current", active ? "step" : "false");
    });
  };

  const stopCooldown = () => {
    window.clearInterval(resendTimer);
    resendTimer = null;
    resendButton.disabled = false;
    resendButton.textContent = "Resend Code";
  };

  const startCooldown = () => {
    stopCooldown();
    let remaining = 60;
    resendButton.disabled = true;
    resendButton.textContent = `Resend Code (${remaining}s)`;
    resendTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stopCooldown();
        return;
      }
      resendButton.textContent = `Resend Code (${remaining}s)`;
    }, 1000);
  };

  const resetFlow = () => {
    stopCooldown();
    form.reset();
    requestId = null;
    setStep(1);
    setStatus("");
    submitButton.disabled = false;
    verifyButton.disabled = false;
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove("email-change-modal-open");
    resetFlow();
  };

  const showModal = () => {
    modal.hidden = false;
    document.body.classList.add("email-change-modal-open");
    form.elements.currentPassword.focus();
  };

  const friendlyError = (error, fallback) => {
    const text = String(error?.message || "").toLowerCase();
    if (
      text.includes("incorrect current password") ||
      text.includes("invalid login")
    )
      return "Your current password is incorrect.";
    if (text.includes("same") || text.includes("different from your current"))
      return "Your new email must be different from your current email.";
    if (text.includes("already registered") || text.includes("already exists"))
      return "That email address is already in use.";
    if (text.includes("expired"))
      return "The verification code has expired. Request a new code.";
    if (
      text.includes("too many") ||
      text.includes("rate limit") ||
      text.includes("wait before")
    )
      return "Please wait before requesting or verifying another code.";
    if (text.includes("authentication") || text.includes("session"))
      return "Your session has expired. Please sign in again.";
    if (text.includes("resend_error") || text.includes("resend http"))
      return "We could not send the verification email. Please try again later.";
    if (text.includes("network") || text.includes("fetch"))
      return "We could not reach the email service. Check your connection and try again.";
    return fallback;
  };

  const invoke = async (body) => {
    const {
      data: { session },
    } = await window.supabaseClient.auth.getSession();
    if (!session?.access_token)
      throw new Error("Authentication required. Please sign in again.");
    const { data, error } = await window.supabaseClient.functions.invoke(
      "email-change",
      {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );
    if (error) {
      let serverError = null;
      try {
        serverError = await error.context?.json();
      } catch {
        serverError = null;
      }
      if (serverError?.error) throw new Error(serverError.error);
      throw error;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  window.supabaseClient.auth.getUser().then(({ data }) => {
    currentEmail = data.user?.email || "";
    currentEmailElements.forEach((element) => {
      element.textContent = currentEmail || "Unavailable";
    });
  });

  openButton.addEventListener("click", showModal);
  closeButton.addEventListener("click", closeModal);
  doneButton.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  otpInput.addEventListener("input", () => {
    otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 8);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const currentPassword = String(values.get("currentPassword") || "");
    const newEmail = window.authApi.normalizeEmail(values.get("email"));
    if (!currentPassword || !newEmail)
      return setStatus("Enter your current password and new email.", "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
      return setStatus("Enter a valid new email address.", "error");
    if (currentEmail && newEmail === currentEmail.toLowerCase())
      return setStatus(
        "Your new email must be different from your current email.",
        "error",
      );

    submitButton.disabled = true;
    submitButton.textContent = "Sending Code...";
    setStatus("Verifying your password and sending a code...");
    try {
      const result = await invoke({
        action: "request",
        currentPassword,
        newEmail,
        requireAdmin,
      });
      requestId = result.requestId;
      setStep(2);
      setStatus(`A verification code was sent to ${newEmail}.`, "success");
      startCooldown();
      otpInput.focus();
    } catch (error) {
      console.error(error);
      setStatus(
        friendlyError(error, "Unable to start email change. Please try again."),
        "error",
      );
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Continue";
    }
  });

  verifyButton.addEventListener("click", async () => {
    const otp = String(otpInput.value || "").trim();
    if (!requestId || !/^\d{8}$/.test(otp))
      return setStatus("Enter the 8-digit verification code.", "error");
    verifyButton.disabled = true;
    verifyButton.textContent = "Verifying...";
    setStatus("Verifying your email code...");
    try {
      await invoke({ action: "verify", requestId, otp, requireAdmin });
      await window.supabaseClient.auth.refreshSession();
      const { data } = await window.supabaseClient.auth.getUser();
      currentEmail = data.user?.email || currentEmail;
      currentEmailElements.forEach((element) => {
        element.textContent = currentEmail || "Unavailable";
      });
      const profileEmail = document.querySelector(
        '#profileForm input[name="email"]',
      );
      if (profileEmail) profileEmail.value = currentEmail;
      const accountStatus = document.querySelector("#accountStatus");
      if (accountStatus && currentEmail)
        accountStatus.textContent = `Signed in as ${currentEmail}.`;
      stopCooldown();
      requestId = null;
      requestPanel.hidden = true;
      otpPanel.hidden = true;
      successPanel.hidden = false;
      stepIndicators.forEach((indicator) =>
        indicator.removeAttribute("aria-current"),
      );
      setStatus("");
      doneButton.focus();
    } catch (error) {
      console.error(error);
      setStatus(
        friendlyError(
          error,
          "The verification code is incorrect or has expired.",
        ),
        "error",
      );
    } finally {
      verifyButton.disabled = false;
      verifyButton.textContent = "Verify Email";
    }
  });

  resendButton.addEventListener("click", async () => {
    if (!requestId || resendButton.disabled) return;
    resendButton.disabled = true;
    setStatus("Sending a new verification code...");
    try {
      const result = await invoke({
        action: "resend",
        requestId,
        requireAdmin,
      });
      requestId = result.requestId;
      setStatus("A new verification code was sent.", "success");
      startCooldown();
      otpInput.focus();
    } catch (error) {
      console.error(error);
      setStatus(
        friendlyError(error, "Unable to resend the verification code."),
        "error",
      );
      resendButton.disabled = false;
    }
  });
})();
