(() => {
  const form = document.querySelector("[data-email-change-form]");
  if (!form || !window.supabaseClient) return;

  const otpPanel = form.querySelector("[data-email-change-otp]");
  const verifyButton = form.querySelector("[data-email-change-verify]");
  const resendButton = form.querySelector("[data-email-change-resend]");
  const submitButton = form.querySelector('button[type="submit"]');
  const status =
    document.querySelector("#securityMessage") ||
    document.querySelector("#adminMessage") ||
    document.querySelector("#accountStatus");
  let requestId = null;
  let resendTimer = null;
  const requireAdmin = form.hasAttribute("data-require-admin");
  window.supabaseClient.auth.getUser().then(({ data }) => {
    const currentEmail = form.querySelector("[data-current-auth-email]");
    if (currentEmail)
      currentEmail.textContent = data.user?.email || "Unavailable";
  });

  const show = (text, type = "") => {
    status.className = `auth-message ${type}`;
    status.textContent = text;
  };

  const startCooldown = () => {
    clearInterval(resendTimer);
    let remaining = 60;
    resendButton.disabled = true;
    resendButton.textContent = `Resend code (${remaining}s)`;
    resendTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        resendButton.disabled = false;
        resendButton.textContent = "Resend code";
        return;
      }
      resendButton.textContent = `Resend code (${remaining}s)`;
    }, 1000);
  };

  const invoke = async (body) => {
    const { data, error } = await window.supabaseClient.functions.invoke(
      "email-change",
      { body },
    );
    if (error) {
      let serverError = null;
      try {
        serverError = await error.context?.json();
      } catch {
        serverError = null;
      }
      if (serverError?.error) {
        const statusCode = error.context?.status;
        const details = serverError.details
          ? ` ${JSON.stringify(serverError.details)}`
          : "";
        throw new Error(
          `${serverError.code ? `${serverError.code}: ` : ""}${serverError.error}${statusCode ? ` (HTTP ${statusCode})` : ""}${details}`,
        );
      }
      throw error;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const currentPassword = String(values.get("currentPassword") || "");
    const newEmail = window.authApi.normalizeEmail(values.get("email"));
    if (!currentPassword || !newEmail)
      return show("Enter your current password and new email.", "error");

    submitButton.disabled = true;
    show("Verifying password and sending code...");
    try {
      const result = await invoke({
        action: "request",
        currentPassword,
        newEmail,
        requireAdmin,
      });
      requestId = result.requestId;
      otpPanel.hidden = false;
      show(`A verification code was sent to ${newEmail}.`, "success");
      startCooldown();
    } catch (error) {
      console.error(error);
      show(error.message || "Unable to start email change.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  verifyButton.addEventListener("click", async () => {
    const otp = String(new FormData(form).get("otp") || "").trim();
    if (!requestId || !/^\d{8}$/.test(otp))
      return show("Enter the 8-digit verification code.", "error");
    verifyButton.disabled = true;
    show("Verifying email code...");
    try {
      const result = await invoke({
        action: "verify",
        requestId,
        otp,
        requireAdmin,
      });
      await window.supabaseClient.auth.refreshSession();
      const { data } = await window.supabaseClient.auth.getUser();
      show(
        `Email changed successfully. Your new email: ${data.user.email}`,
        "success",
      );
      form.reset();
      otpPanel.hidden = true;
      requestId = null;
    } catch (error) {
      console.error(error);
      show(error.message || "Unable to verify the email code.", "error");
    } finally {
      verifyButton.disabled = false;
    }
  });

  resendButton.addEventListener("click", async () => {
    if (!requestId) return;
    resendButton.disabled = true;
    try {
      const result = await invoke({
        action: "resend",
        requestId,
        requireAdmin,
      });
      requestId = result.requestId;
      show("A new verification code was sent.", "success");
      startCooldown();
    } catch (error) {
      console.error(error);
      show(error.message || "Unable to resend the verification code.", "error");
      resendButton.disabled = false;
    }
  });
})();
