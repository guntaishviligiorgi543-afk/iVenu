(() => {
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setMessage(message, type = "") {
    const status = this.querySelector(".newsletter-message");
    if (!status) return;
    status.className = `newsletter-message ${type}`;
    status.textContent = message;
  }

  function initializeNewsletterForm(form) {
    const email = form.elements.email;
    const consent = form.querySelector('input[type="checkbox"]');
    const submitButton = form.querySelector('button[type="submit"]');
    if (!email || !consent || !submitButton) return;

    form.noValidate = true;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitButton.disabled) return;

      const normalizedEmail = email.value.trim().toLowerCase();
      if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
        setMessage.call(form, "Please enter a valid email address.", "error");
        email.focus();
        return;
      }

      if (!consent.checked) {
        setMessage.call(form, "Please accept the newsletter consent.", "error");
        consent.focus();
        return;
      }

      if (!window.supabaseClient) {
        setMessage.call(form, "Something went wrong. Please try again.", "error");
        return;
      }

      const originalText = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = "Subscribing...";
      setMessage.call(form, "");

      try {
        const { data, error } = await window.supabaseClient.rpc(
          "subscribe_to_newsletter",
          { p_email: normalizedEmail },
        );
        if (error) throw error;

        if (data === "subscribed") {
          setMessage.call(form, "You're subscribed!", "success");
          form.reset();
        } else if (data === "already_subscribed") {
          setMessage.call(form, "This email is already subscribed.", "error");
        } else {
          throw new Error("Unexpected newsletter subscription response.");
        }
      } catch (error) {
        console.error("Newsletter subscription failed", error);
        setMessage.call(form, "Something went wrong. Please try again.", "error");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    });
  }

  document.querySelectorAll(".newsletter-form").forEach(initializeNewsletterForm);
})();
