(() => {
  const form = document.querySelector("#contact-support-form");
  const client = window.supabaseClient;
  const authApi = window.authApi;
  if (!form || !client || !authApi) return;

  const nameInput = form.elements.contactName;
  const emailInput = form.elements.contactEmail;
  const subjectInput = form.elements.contactSubject;
  const categoryInput = form.elements.contactCategory;
  const messageInput = form.elements.contactMessage;
  const submitButton = form.querySelector('button[type="submit"]');
  const status = form.querySelector(".contactForm__message");
  const categories = new Set([
    "general",
    "account",
    "event",
    "reservation",
    "order",
    "technical",
    "other",
  ]);
  let isSubmitting = false;
  let lastSupportRequestId = null;

  const setStatus = (message = "", type = "") => {
    status.textContent = message;
    status.className = `contactForm__message ${type}`;
  };

  const profileName = (profile) =>
    [profile?.first_name, profile?.last_name]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");

  async function prefillIdentity(session) {
    if (!session?.user) {
      nameInput.value = "";
      emailInput.value = "";
      return;
    }

    let profile = null;
    try {
      const { data, error } = await client
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", session.user.id)
        .maybeSingle();
      if (error) throw error;
      profile = data;
    } catch (error) {
      console.error("Unable to load the Contact profile", error);
    }

    nameInput.value = profileName(profile);
    emailInput.value = String(profile?.email || session.user.email || "").trim();
  }

  async function refreshIdentity() {
    try {
      await prefillIdentity(await authApi.getSession());
    } catch (error) {
      console.error("Unable to read the Contact session", error);
      nameInput.value = "";
      emailInput.value = "";
    }
  }

  function validationError(message, input) {
    setStatus(message, "error");
    input?.focus();
  }

  form.noValidate = true;
  refreshIdentity();
  authApi.subscribeToAuthChanges((_event, session) => {
    prefillIdentity(session).catch((error) =>
      console.error("Unable to refresh the Contact profile", error),
    );
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    let session;
    try {
      session = await authApi.getSession();
    } catch (error) {
      console.error("Unable to read the Contact session", error);
    }
    if (!session?.user) {
      setStatus("Please sign in or register to send a support request.", "error");
      await (window.requireAuthForSupport || window.requireAuthForTickets)?.();
      return;
    }

    const subject = subjectInput.value.trim();
    const category = categoryInput.value;
    const body = messageInput.value.trim();
    if (!subject || subject.length > 200)
      return validationError("Enter a subject of up to 200 characters.", subjectInput);
    if (!categories.has(category))
      return validationError("Select a support category.", categoryInput);
    if (!body || body.length > 10000)
      return validationError("Enter a message of up to 10,000 characters.", messageInput);

    isSubmitting = true;
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
    setStatus();

    try {
      const { data, error } = await client.rpc(
        "create_authenticated_support_request",
        { p_subject: subject, p_category: category, p_body: body },
      );
      if (error) throw error;

      lastSupportRequestId = data || null;
      form.dataset.supportRequestId = lastSupportRequestId || "";
      subjectInput.value = "";
      categoryInput.value = "";
      messageInput.value = "";
      setStatus("Your support request has been submitted.", "success");
      await prefillIdentity(session);
    } catch (error) {
      console.error("Support request submission failed", error);
      if (error?.code === "42501") {
        setStatus("Your account cannot submit a customer support request.", "error");
      } else if (error?.code === "22023") {
        setStatus("Please complete your account name and email before contacting Support.", "error");
      } else {
        setStatus("We couldn't submit your support request. Please try again.", "error");
      }
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
})();
