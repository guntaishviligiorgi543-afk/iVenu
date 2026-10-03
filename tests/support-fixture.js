// Local browser fixture only. No credentials or calls to a real backend.
(() => {
  const params = new URLSearchParams(location.search);
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  window.fixture = { role: params.get("role") || "customer", calls: [], failRoles: false, failList: false, failMessages: false, delay: 0, userId: id(1), errors: [] };
  addEventListener("error", (event) => fixture.errors.push(event.message));
  const stamp = "2026-10-03T10:00:00Z";
  const requests = Array.from({ length: 24 }, (_, index) => ({
    id: id(index + 10), customer_user_id: id(index % 2 + 1),
    customer_name: index % 2 ? "Customer B" : "Customer A",
    customer_email: index % 2 ? "b@example.test" : "a@example.test",
    subject: index === 0 ? "Ticket question <img src=x onerror=alert(1)>" : `Request ${index + 1}`,
    category: index % 2 ? "order" : "general", status: index === 2 ? "resolved" : "open",
    assigned_support_user_id: index % 2 ? id(3) : null,
    created_at: stamp, updated_at: stamp, resolved_at: index === 2 ? stamp : null,
    resolved_by_name: index === 2 ? "Agent" : null, resolved_by_email: index === 2 ? "agent@example.test" : null,
  }));
  const memberships = [{ id: id(90), user_id: id(3), user_name: "Support Agent", user_email: "agent@example.test", created_at: stamp, revoked_at: null, granted_by_name: "Admin", granted_by_email: "admin@example.test" }];
  window.fixture.requests = requests;
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.start = 0; this.end = 999; }
    select(columns, options = {}) { this.columns = columns; this.options = options; return this; }
    eq(column, value) { this.filters.push(["eq", column, value]); return this; }
    in(column, value) { this.filters.push(["in", column, value]); return this; }
    is(column, value) { return this.eq(column, value); }
    not(column, operator, value) { this.filters.push(["not", column, value]); return this; }
    or(value) { this.search = value; return this; }
    order() { return this; }
    range(start, end) { this.start = start; this.end = end; return this; }
    limit(size) { this.end = size - 1; return this; }
    maybeSingle() { this.single = true; return this; }
    update() { return this; }
    then(resolve, reject) {
      return Promise.resolve().then(async () => {
        fixture.calls.push({ table: this.table, columns: this.columns, filters: this.filters, search: this.search });
        if (fixture.delay) await new Promise((done) => setTimeout(done, fixture.delay));
        if (this.table === "support_requests" && fixture.failList || this.table === "support_messages" && fixture.failMessages) return { error: { message: "Fixture failure" } };
        let rows = this.table === "support_requests" ? requests : this.table === "support_users" ? memberships : this.table === "admin_users" ? [{ user_id: fixture.userId }] : this.table === "profiles" ? [{ id: fixture.userId, email: "a@example.test", first_name: "Customer", last_name: "A" }] : [];
        if (this.table === "support_messages") rows = Array.from({ length: 57 }, (_, index) => ({ id: id(200 + index), support_request_id: this.filters.find((f) => f[1] === "support_request_id")?.[2], sender_type: index % 2 ? "customer" : "support", body: index === 0 ? "<script>alert('unsafe')</script>\nThanks for your help." : `Message ${index + 1}`, created_at: stamp }));
        rows = rows.filter((row) => this.filters.every(([op, key, value]) => op === "in" ? value.includes(row[key]) : op === "not" ? row[key] !== value : row[key] === value));
        if (this.search) {
          const match = this.search.match(/customer_name\.ilike\.("(?:\\.|[^"\\])*")/);
          const search = match ? JSON.parse(match[1]).slice(1, -1).replace(/\\([\\%_])/g, "$1").toLowerCase() : "";
          rows = rows.filter((row) => [row.customer_name, row.customer_email, row.subject].join(" ").toLowerCase().includes(search));
        }
        const count = rows.length;
        rows = rows.slice(this.start, this.end + 1);
        return { data: this.single ? rows[0] || null : rows, count, error: null };
      }).then(resolve, reject);
    }
  }
  window.supabaseClient = {
    from: (table) => new Query(table),
    auth: { onAuthStateChange: (callback) => { fixture.authChanged = callback; } },
    rpc: async (name, args) => {
      fixture.calls.push({ rpc: name, args });
      if (name.startsWith("is_current_user_support")) {
        const role = fixture.role;
        await new Promise((done) => setTimeout(done, params.has("slow") ? name.endsWith("admin") ? 150 : 20 : 0));
        if (fixture.failRoles) return { error: { message: "Role lookup failed" } };
        return { data: name.endsWith("admin") ? ["admin", "both"].includes(role) : role === "support", error: null };
      }
      if (name === "get_support_unread_state") return { data: [{ request_id: id(10), unread_count: 2 }] };
      if (name === "get_user_dashboard_overview") return { error: { message: "Unrelated overview omitted by fixture" } };
      if (name === "add_customer_support_message") return { data: id(300) };
      return { data: null, error: null };
    },
  };
  window.authApi = { getSession: async () => ({ user: { id: fixture.userId, email: "a@example.test" } }), requiresGooglePasswordSetup: async () => false };
  window.cartSync = { getOwnCart: async () => [] };
  window.iVenueEventListing = { pageSize: 8 };
})();
