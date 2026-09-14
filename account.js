(() => {
  const client = window.supabaseClient;
  const form = document.querySelector("#profileForm");
  const status = document.querySelector("#accountStatus");
  const message = document.querySelector("#profileMessage");
  const ordersList = document.querySelector("#ordersList");
  const cartList = document.querySelector("#cartList");
  const securityForm = document.querySelector("#securityForm");
  const securityNewPasswordFields = document.querySelector(
    "#securityNewPasswordFields",
  );
  const emailForm = document.querySelector("#emailForm");
  const deleteButton = document.querySelector("#deleteAccount");
  const deleteMessage = document.querySelector("#deleteMessage");
  const securityMessage = document.querySelector("#securityMessage");
  const passwordResultDialog = document.querySelector("#passwordResultDialog");
  const passwordResultTitle = document.querySelector("#passwordResultTitle");
  const passwordResultText = document.querySelector("#passwordResultText");
  const passwordResultLabel = document.querySelector("#passwordResultLabel");
  const closePasswordResult = document.querySelector("#closePasswordResult");
  const passwordResultAction = document.querySelector("#passwordResultAction");
  const editProfileButton = document.querySelector("#editProfile");
  const cancelProfileButton = document.querySelector("#cancelProfile");
  const profileDisplayName = document.querySelector("#profileDisplayName");
  const profileDisplayEmail = document.querySelector("#profileDisplayEmail");
  const profileAvatar = document.querySelector("#profileAvatar");
  const ordersEmpty = document.querySelector("#ordersEmpty");
  const cartEmpty = document.querySelector("#cartEmpty");
  const ordersCount = document.querySelector("#ordersCount");
  const cartCount = document.querySelector("#cartCount");
  const logoutButton = document.querySelector("#dashboardLogout");

  function setMessage(text, type = "", target = message) {
    target.className = `auth-message ${type}`;
    target.textContent = text;
  }

  function showPasswordResult(success, text) {
    passwordResultLabel.textContent = success
      ? "Password change"
      : "Password not changed";
    passwordResultTitle.textContent = success
      ? "Password updated"
      : "Password change failed";
    passwordResultText.textContent = text;
    passwordResultDialog.hidden = false;
  }

  function hidePasswordResult() {
    passwordResultDialog.hidden = true;
  }

  closePasswordResult.addEventListener("click", hidePasswordResult);
  passwordResultAction.addEventListener("click", hidePasswordResult);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getSecurityErrorMessage(error, fallback) {
    const errorText = String(error?.message || "").toLowerCase();
    if (errorText.includes("rate limit") || errorText.includes("too many")) {
      return "Too many requests. Please wait before trying again.";
    }
    if (errorText.includes("expired")) {
      return "This code has expired. Request a new code.";
    }
    if (errorText.includes("invalid") || errorText.includes("otp")) {
      return "Invalid verification code.";
    }
    return fallback;
  }

  function renderOrders(orders) {
    ordersCount.textContent = `${orders.length} ${orders.length === 1 ? "order" : "orders"}`;
    if (!orders.length) {
      ordersList.innerHTML = "";
      ordersEmpty.hidden = false;
      return;
    }

    ordersEmpty.hidden = true;
    ordersList.innerHTML = orders
      .map(
        (order) => `
          <article class="dashboard-row">
            <div><strong>Order #${escapeHtml(String(order.id).slice(0, 8))}</strong><span>${new Date(order.created_at).toLocaleDateString()}</span></div>
            <div><strong>${Number(order.total_price || 0).toFixed(2)}₾</strong><span>${order.order_items?.length || 0} items</span></div>
            <span class="order-status">${escapeHtml(order.status || "Processing")}</span>
          </article>
        `,
      )
      .join("");
  }

  function renderCart(items, ticketTypes) {
    const ticketMap = new Map(ticketTypes.map((ticket) => [ticket.id, ticket]));
    const totalItems = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
    cartCount.textContent = `${totalItems} ${totalItems === 1 ? "item" : "items"}`;
    if (!items.length) {
      cartList.innerHTML = "";
      cartEmpty.hidden = false;
      return;
    }

    cartEmpty.hidden = true;
    cartList.innerHTML = items
      .map(
        (item) =>
          `<article class="dashboard-row"><div><strong>${escapeHtml(ticketMap.get(item.ticket_type_id)?.name || "Ticket")}</strong><span>Quantity ${Number(item.quantity || 0)}</span></div><strong>${(Number(ticketMap.get(item.ticket_type_id)?.price || 0) * Number(item.quantity || 0)).toFixed(2)}₾</strong></article>`,
      )
      .join("");
  }

  function updateProfilePreview(profile) {
    const firstName = profile.first_name || "";
    const lastName = profile.last_name || "";
    const displayName = `${firstName} ${lastName}`.trim() || "Your profile";
    profileDisplayName.textContent = displayName;
    profileDisplayEmail.textContent = profile.email || "";
    profileAvatar.textContent =
      displayName === "Your profile"
        ? "?"
        : displayName.charAt(0).toUpperCase();
    if (profile.avatar_url) {
      profileAvatar.style.backgroundImage = `url("${profile.avatar_url.replaceAll('"', "%22")}")`;
      profileAvatar.classList.add("has-image");
      profileAvatar.textContent = "";
    }
  }

  async function loadAccount() {
    let session;
    try {
      session = await window.authApi.getSession();
    } catch (error) {
      console.error(error);
      setMessage(
        "Your session could not be verified. Please try again.",
        "error",
        securityMessage,
      );
      return;
    }
    if (!session?.user) {
      status.textContent = "Please sign in to view your account.";
      form.hidden = true;
      securityForm.hidden = true;
      emailForm.hidden = true;
      deleteButton.hidden = true;
      editProfileButton.disabled = true;
      logoutButton.disabled = true;
      document
        .querySelectorAll(".account-sidebar-item[data-section]")
        .forEach((button) => {
          button.disabled = true;
        });
      ordersList.textContent = "";
      cartList.textContent = "";
      return;
    }

    const [profileResult, ordersResult, cartResult] = await Promise.all([
      client
        .from("profiles")
        .select("id, first_name, last_name, email, phone, avatar_url")
        .eq("id", session.user.id)
        .maybeSingle(),
      client
        .from("orders")
        .select(
          "id, total_price, status, created_at, order_items(quantity, unit_price, subtotal, ticket_types(name))",
        )
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false }),
      window.cartSync.getOwnCart(),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (ordersResult.error) throw ordersResult.error;

    const profile = profileResult.data;
    if (profile) {
      if (profile.email !== session.user.email) {
        const { error: emailSyncError } = await client
          .from("profiles")
          .update({
            email: session.user.email,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.user.id);
        if (emailSyncError) console.error(emailSyncError);
        profile.email = session.user.email;
      }
      form.elements.firstName.value = profile.first_name || "";
      form.elements.lastName.value = profile.last_name || "";
      form.elements.email.value = profile.email || session.user.email || "";
      form.elements.phone.value = profile.phone || "";
      form.elements.avatarUrl.value = profile.avatar_url || "";
      deleteButton.hidden = false;
      updateProfilePreview(profile);
      emailForm.elements.email.value =
        profile.email || session.user.email || "";
      status.textContent = `Signed in as ${profile.email || session.user.email}.`;
    } else {
      status.textContent =
        "Your account is signed in, but no profile row is available under the current RLS policies.";
    }

    renderOrders(ordersResult.data || []);
    const cartItems = cartResult || [];
    const ticketIds = cartItems.map((item) => item.ticket_type_id);
    const ticketResult = ticketIds.length
      ? await client
          .from("ticket_types")
          .select("id, name, price")
          .in("id", ticketIds)
      : { data: [] };
    if (ticketResult.error) throw ticketResult.error;
    renderCart(cartItems, ticketResult.data || []);
    window.eventCart?.render().catch((error) => console.error(error));
  }

  document
    .querySelectorAll(".account-sidebar-item[data-section]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const section = button.dataset.section;
        document
          .querySelectorAll(".account-sidebar-item[data-section]")
          .forEach((item) => {
            const active = item === button;
            item.classList.toggle("is-active", active);
            if (active) item.setAttribute("aria-current", "page");
            else item.removeAttribute("aria-current");
          });
        document
          .querySelectorAll(".account-section[data-section]")
          .forEach((panel) => {
            panel.classList.toggle(
              "is-visible",
              panel.dataset.section === section,
            );
          });
      });
    });

  if (window.location.hash === "#cart") {
    document
      .querySelector('.account-sidebar-item[data-section="cart"]')
      ?.click();
  }

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.querySelector("span").textContent = "Logging out...";
    try {
      await window.authApi.signOut({ redirectTo: "index.html" });
    } catch (error) {
      console.error(error);
      logoutButton.disabled = false;
      logoutButton.querySelector("span").textContent = "Logout";
    }
  });

  editProfileButton.addEventListener("click", () => {
    form.hidden = false;
    editProfileButton.hidden = true;
    form.elements.firstName.focus();
  });

  cancelProfileButton.addEventListener("click", () => {
    form.hidden = true;
    editProfileButton.hidden = false;
    setMessage("");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const session = await window.authApi.getSession();
    if (!session?.user) return;

    const values = new FormData(form);
    setMessage("Saving profile...");

    const { error } = await client
      .from("profiles")
      .update({
        first_name: values.get("firstName").trim(),
        last_name: values.get("lastName").trim(),
        phone: values.get("phone").trim(),
        avatar_url: values.get("avatarUrl").trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    if (error) {
      setMessage(
        "Profile could not be saved by the current RLS policy.",
        "error",
      );
      return;
    }

    updateProfilePreview({
      first_name: values.get("firstName"),
      last_name: values.get("lastName"),
      email: values.get("email"),
      avatar_url: values.get("avatarUrl"),
    });
    form.hidden = true;
    editProfileButton.hidden = false;
    setMessage("Profile saved.", "success");
  });

  securityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(securityForm);
    const currentPassword = values.get("currentPassword");
    const newPassword = values.get("password");
    const confirmPassword = values.get("confirmPassword");
    const submitButton = securityForm.querySelector('button[type="submit"]');

    if (!currentPassword) {
      showPasswordResult(false, "Enter your current password.");
      return;
    }
    const passwordError = window.authApi.validatePassword(newPassword);
    if (passwordError) {
      showPasswordResult(false, passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      showPasswordResult(false, "New password and confirmation do not match.");
      return;
    }

    submitButton.disabled = true;
    try {
      const session = await window.authApi.getSession();
      const email = session?.user?.email;
      if (!email) throw new Error("Please sign in again.");
      await window.authApi.verifyCurrentPassword(email, currentPassword);
      await window.authApi.updatePasswordWithCurrentPassword(
        newPassword,
        currentPassword,
      );
      securityForm.reset();
      setMessage("Password updated successfully.", "success", securityMessage);
      showPasswordResult(true, "Your password was changed successfully.");
    } catch (error) {
      console.error(error);
      const errorText = String(error?.message || "").toLowerCase();
      const text =
        errorText.includes("invalid") || errorText.includes("credential")
          ? "Current password is incorrect."
          : "Password was not changed. Please try again.";
      setMessage(text, "error", securityMessage);
      showPasswordResult(false, text);
    } finally {
      submitButton.disabled = false;
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (!window.confirm("Delete your account? This cannot be undone.")) return;

    deleteButton.disabled = true;
    deleteMessage.className = "auth-message";
    deleteMessage.textContent = "Deleting your account securely...";

    try {
      const session = await window.authApi.getSession();
      if (!session?.user)
        throw new Error("You must be signed in to delete your account.");

      const { data, error } = await client.functions.invoke("delete-account", {
        body: {},
      });
      if (error) throw error;
      if (!data?.deleted)
        throw new Error("Account deletion was not completed.");

      await window.authApi.signOut({ redirectTo: "index.html" });
    } catch (error) {
      console.error(error);
      deleteButton.disabled = false;
      deleteMessage.className = "auth-message error";
      deleteMessage.textContent =
        error.message ||
        "Account deletion failed. No account changes were confirmed.";
    }
  });

  loadAccount().catch((error) => {
    console.error(error);
    status.textContent = "Account data is temporarily unavailable.";
    ordersList.innerHTML =
      '<div class="dashboard-loading">Unable to load orders.</div>';
  });
})();
