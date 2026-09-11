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

  function setMessage(text, type = "") {
    message.className = `auth-message ${type}`;
    message.textContent = text;
  }

  function renderOrders(orders) {
    if (!orders.length) {
      ordersList.textContent = "No orders yet.";
      return;
    }

    ordersList.innerHTML = orders
      .map(
        (order) => `
          <p>
            ${new Date(order.created_at).toLocaleDateString()} ·
            ${order.status} · ${order.total_price}₾
          </p>
        `,
      )
      .join("");
  }

  function renderCart(items) {
    if (!items.length) {
      cartList.textContent = "Your cart is empty.";
      return;
    }

    cartList.innerHTML = items
      .map(
        (item) =>
          `<p>Ticket ${item.ticket_type_id} · quantity ${item.quantity}</p>`,
      )
      .join("");
  }

  async function loadAccount() {
    const session = await window.authApi.getSession();
    if (!session?.user) {
      status.textContent = "Please sign in to view your account.";
      form.hidden = true;
      securityForm.hidden = true;
      emailForm.hidden = true;
      deleteButton.hidden = true;
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
      form.hidden = false;
      securityForm.hidden = false;
      emailForm.hidden = false;
      deleteButton.hidden = false;
      status.textContent = `Signed in as ${profile.email || session.user.email}.`;
    } else {
      status.textContent =
        "Your account is signed in, but no profile row is available under the current RLS policies.";
    }

    renderOrders(ordersResult.data || []);
    renderCart(cartResult || []);
  }

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

    setMessage("Profile saved.", "success");
  });

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = new FormData(emailForm).get("email").trim();
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
    try {
      await window.authApi.updatePassword(password);
      securityForm.reset();
      setMessage("Password changed securely through Supabase Auth.", "success");
    } catch (error) {
      console.error(error);
      setMessage("Password could not be changed.", "error");
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

      await window.authApi.signOut();
      window.location.href = "login.html?deleted=1";
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
    ordersList.textContent = "Unable to load orders.";
  });
})();
