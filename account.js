(() => {
  const client = window.supabaseClient;
  const form = document.querySelector("#profileForm");
  const status = document.querySelector("#accountStatus");
  const message = document.querySelector("#profileMessage");
  const ordersList = document.querySelector("#ordersList");

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

  async function loadAccount() {
    const session = await window.authApi.getSession();
    if (!session?.user) {
      status.textContent = "Please sign in to view your account.";
      ordersList.textContent = "";
      return;
    }

    const [profileResult, ordersResult] = await Promise.all([
      client
        .from("profiles")
        .select("id, first_name, last_name, email, phone")
        .eq("id", session.user.id)
        .maybeSingle(),
      client
        .from("orders")
        .select(
          "id, total_price, status, created_at, order_items(quantity, unit_price, subtotal, ticket_types(name))",
        )
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (ordersResult.error) throw ordersResult.error;

    const profile = profileResult.data;
    if (profile) {
      form.elements.firstName.value = profile.first_name || "";
      form.elements.lastName.value = profile.last_name || "";
      form.elements.email.value = profile.email || session.user.email || "";
      form.elements.phone.value = profile.phone || "";
      form.hidden = false;
      status.textContent = `Signed in as ${profile.email || session.user.email}.`;
    } else {
      status.textContent =
        "Your account is signed in, but no profile row is available under the current RLS policies.";
    }

    renderOrders(ordersResult.data || []);
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

  loadAccount().catch((error) => {
    console.error(error);
    status.textContent = "Account data is temporarily unavailable.";
    ordersList.textContent = "Unable to load orders.";
  });
})();
