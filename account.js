(() => {
  const client = window.supabaseClient;
  const form = document.querySelector("#profileForm");
  const status = document.querySelector("#accountStatus");
  const message = document.querySelector("#profileMessage");
  const ordersList = document.querySelector("#ordersList");
  const cartList = document.querySelector("#cartList");
  const securityForm = document.querySelector("#securityForm");
  const emailForm = document.querySelector("#emailForm");
  const deleteButton = document.querySelector("#deleteAccount");
  const deleteMessage = document.querySelector("#deleteMessage");
  const securityMessage = document.querySelector("#securityMessage");
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
    const session = await window.authApi.getSession();
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

  document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const input = securityForm.elements[button.dataset.target];
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.textContent = visible ? "Show" : "Hide";
    });
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

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = window.authApi.normalizeEmail(
      new FormData(emailForm).get("email"),
    );
    setMessage("Updating authentication email...");

    try {
      const result = await window.authApi.updateEmail(email);
      const updatedEmail = result.user?.email;
      if (updatedEmail === email) {
        const session = await window.authApi.getSession();
        const { error } = await client
          .from("profiles")
          .update({ email, updated_at: new Date().toISOString() })
          .eq("id", session.user.id);
        if (error) throw error;
        setMessage(
          "Authentication email and profile email updated.",
          "success",
        );
      } else {
        setMessage(
          "Check your new email to confirm the authentication change. Your profile email remains unchanged until confirmation.",
          "success",
        );
      }
    } catch (error) {
      console.error(error);
      setMessage("Authentication email could not be changed.", "error");
    }
  });

  securityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = new FormData(securityForm).get("password");
    const passwordError = window.authApi.validatePassword(password);
    if (passwordError) {
      setMessage(passwordError, "error", securityMessage);
      return;
    }
    if (password !== new FormData(securityForm).get("confirmPassword")) {
      setMessage("Passwords do not match.", "error", securityMessage);
      return;
    }
    try {
      await window.authApi.updatePassword(password);
      securityForm.reset();
      setMessage(
        "Password changed securely through Supabase Auth.",
        "success",
        securityMessage,
      );
    } catch (error) {
      console.error(error);
      setMessage("Password could not be changed.", "error", securityMessage);
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (!window.confirm("Delete your account? This cannot be undone.")) return;

    deleteButton.disabled = true;
    deleteMessage.className = "auth-message";
    deleteMessage.textContent = "Deleting your account securely...";

    try {
      const session = await window.authApi.getSession();
      if (!session?.user) {
        throw new Error("You must be signed in to delete your account.");
      }

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
