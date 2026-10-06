import {
  preview,
  supportEmail,
  supportRequestUrl,
} from "../supabase/functions/support-notifications/email.ts";
import {
  type Context,
  deliverBatch,
  type Event,
  handleWorker,
  type Outcome,
  processEvent,
  type Store,
} from "../supabase/functions/support-notifications/worker.ts";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
const ok = (value: unknown) => {
  if (!value) throw new Error("Assertion failed");
};
const requestId = "00000000-0000-4000-8000-000000000010";
const event = (): Event => ({
  id: crypto.randomUUID(),
  support_request_id: requestId,
  support_message_id: "message-1",
  actor_user_id: "support-1",
  kind: "reply",
  lease_token: "lease-1",
  payload: null,
});
const config = {
  from: "iVenue <support@example.test>",
  resendKey: "mock-provider-key",
};
class MemoryStore implements Store {
  events = [event()];
  request: Context | null = {
    id: requestId,
    customer_user_id: "customer-1",
    customer_deleted_at: null,
    subject: 'Missing ticket <img src=x onerror="bad()">',
    status: "waiting_for_user",
    reply: {
      id: "message-1",
      sender_type: "support",
      sender_user_id: "support-1",
      body:
        '<script>alert("unsafe")</script>\n Your ticket is in your account. ',
    },
  };
  email: string | null = "registered@example.test";
  emailLookups: string[] = [];
  outcomes: Outcome[] = [];
  claims = 0;
  saveAllowed = true;
  failFinish = false;
  contextCalls = 0;
  hideOnRecheck = false;
  async claim() {
    this.claims++;
    const events = this.events;
    this.events = [];
    return events;
  }
  async context() {
    this.contextCalls++;
    if (this.hideOnRecheck && this.contextCalls > 1 && this.request) {
      this.request.customer_deleted_at = "now";
    }
    return this.request;
  }
  async registeredEmail(id: string) {
    this.emailLookups.push(id);
    return this.email;
  }
  async savePayload(item: Event, payload: Event["payload"]) {
    if (this.saveAllowed) item.payload = payload;
    return this.saveAllowed;
  }
  async finish(_item: Event, outcome: Outcome) {
    if (this.failFinish) throw new Error("Database unavailable");
    this.outcomes.push(outcome);
    return true;
  }
}
const provider =
  (status = 200, capture?: (request: RequestInit) => void): typeof fetch =>
  (_url, init) => {
    capture?.(init!);
    return Promise.resolve(
      Response.json(
        status === 200
          ? { id: "provider-1" }
          : { message: "private provider text" },
        { status },
      ),
    );
  };

Deno.test("reply email uses registered Auth owner email and escapes plain text", async () => {
  const store = new MemoryStore();
  let body: Record<string, unknown> = {};
  const result = await processEvent(
    store.events[0],
    store,
    config,
    provider(200, (init) => {
      body = JSON.parse(String(init.body));
    }),
  );
  equal(result, { status: "sent", providerId: "provider-1" });
  equal(store.emailLookups, ["customer-1"]);
  equal(body.to, ["registered@example.test"]);
  equal(body.subject, "New response from iVenue Support");
  ok(String(body.html).includes("&lt;script&gt;"));
  ok(!String(body.html).includes("<script>"));
  ok(String(body.html).includes("View Response"));
  ok(String(body.text).includes("Your ticket is in your account."));
  ok(!String(body.html).includes("support-1"));
  ok(!String(body.html).includes("Unsubscribe"));
});
Deno.test("resolution uses stored subject without invented summary and resolved CTA", async () => {
  const store = new MemoryStore();
  store.events[0].kind = "resolved";
  store.events[0].support_message_id = null;
  store.request!.status = "resolved";
  await processEvent(
    store.events[0],
    store,
    config,
    provider(200, (init) => {
      const mail = JSON.parse(String(init.body));
      equal(mail.subject, "Your iVenue Support request has been resolved");
      ok(mail.html.includes("Your request has been resolved"));
      ok(mail.html.includes("View Request"));
      ok(mail.html.includes("Missing ticket &lt;img"));
      ok(!mail.html.includes("Your ticket is in your account."));
      ok(mail.text.includes("different issue"));
    }),
  );
});
Deno.test("preview bounded, whitespace normalized, emoji not split; URL is fixed navigation only", () => {
  equal(preview("  a\n\t b  "), "a b");
  equal(preview("😀".repeat(300)).length, 479);
  const url = new URL(supportRequestUrl(requestId));
  equal(url.origin, "https://ivenue.site");
  equal([...url.searchParams.keys()], ["section", "request"]);
  equal(url.searchParams.get("request"), requestId);
  let rejected = false;
  try {
    supportRequestUrl('x" onmouseover="bad');
  } catch {
    rejected = true;
  }
  ok(rejected);
});
for (
  const scenario of [
    "hidden",
    "deleted-account",
    "customer-reply",
    "wrong-message",
    "missing-auth-email",
    "missing-request",
    "removed-actor",
    "email-changed",
    "hidden-before-send",
    "lease-lost",
    "not-resolved",
  ] as const
) {
  Deno.test(`suppresses delivery: ${scenario}`, async () => {
    const store = new MemoryStore(), item = store.events[0];
    if (scenario === "hidden") store.request!.customer_deleted_at = "now";
    if (scenario === "deleted-account") store.request!.customer_user_id = null;
    if (scenario === "customer-reply") {
      store.request!.reply!.sender_type = "customer";
    }
    if (scenario === "wrong-message") {
      store.request!.reply!.id = "other-message";
    }
    if (scenario === "missing-auth-email") store.email = null;
    if (scenario === "missing-request") store.request = null;
    if (scenario === "removed-actor") item.actor_user_id = null;
    if (scenario === "email-changed") {
      item.payload = supportEmail({
        kind: "reply",
        requestId,
        subject: "old",
        from: config.from,
        to: "old@example.test",
      });
    }
    if (scenario === "hidden-before-send") store.hideOnRecheck = true;
    if (scenario === "lease-lost") store.saveAllowed = false;
    if (scenario === "not-resolved") item.kind = "resolved";
    let sends = 0;
    const result = await processEvent(
      item,
      store,
      config,
      provider(200, () => sends++),
    );
    equal(result.status, "skipped");
    equal(sends, 0);
  });
}
Deno.test("provider failure preserves saved reply/resolution, retries stable payload/key only", async () => {
  for (const kind of ["reply", "resolved"] as const) {
    const store = new MemoryStore(), item = store.events[0];
    item.kind = kind;
    store.request!.status = kind === "resolved"
      ? "resolved"
      : "waiting_for_user";
    const before = JSON.stringify(store.request);
    const requests: RequestInit[] = [];
    const logs: string[] = [];
    let result = await deliverBatch(
      store,
      config,
      provider(503, (init) => requests.push(init)),
      (_id, code) => logs.push(code),
    );
    equal(result.retry, 1);
    equal(JSON.stringify(store.request), before);
    equal(store.outcomes[0].code, "PROVIDER_HTTP_503");
    store.request!.subject = "Changed since first send";
    store.events = [item];
    result = await deliverBatch(
      store,
      { ...config, from: "changed@example.test" },
      provider(200, (init) => requests.push(init)),
      () => {},
    );
    equal(result.sent, 1);
    equal(requests[0].body, requests[1].body);
    equal(
      new Headers(requests[0].headers).get("Idempotency-Key"),
      new Headers(requests[1].headers).get("Idempotency-Key"),
    );
    equal(
      (await deliverBatch(
        store,
        config,
        provider(200, () => {
          throw new Error("Duplicate send");
        }),
        () => {},
      )).claimed,
      0,
    );
    ok(!logs.join(" ").includes("private provider text"));
  }
});
Deno.test("timeouts retry; permanent provider rejection fails safely; outcome write failure uses lease recovery", async () => {
  let store = new MemoryStore();
  let result = await deliverBatch(
    store,
    config,
    () => Promise.reject(new Error("timeout with private data")),
    () => {},
  );
  equal(result.retry, 1);
  equal(store.outcomes[0].code, "DELIVERY_UNAVAILABLE");
  store = new MemoryStore();
  result = await deliverBatch(store, config, provider(422), () => {});
  equal(result.failed, 1);
  store = new MemoryStore();
  store.failFinish = true;
  result = await deliverBatch(store, config, provider(), () => {});
  equal(result.unrecorded, 1);
  equal(store.claims, 1);
});
Deno.test("private worker rejects customer/Support/Admin JWTs and recipient overrides", async () => {
  const store = new MemoryStore();
  const workerKey = "a".repeat(64);
  const options = {
    ...config,
    workerKey,
    createStore: () => store,
    send: provider(),
    log: () => {},
  };
  for (const role of ["anon", "customer", "support", "admin"]) {
    const response = await handleWorker(
      new Request("https://test.invalid", {
        method: "POST",
        headers: { Authorization: `Bearer mock-${role}` },
        body: "{}",
      }),
      options,
    );
    equal(response.status, 401);
  }
  const response = await handleWorker(
    new Request("https://test.invalid", {
      method: "POST",
      headers: { "X-Support-Worker-Key": workerKey },
      body: '{"customer_email":"attacker@example.test","request":"other"}',
    }),
    options,
  );
  equal(response.status, 400);
  equal(store.claims, 0);
  const missing = await handleWorker(
    new Request("https://test.invalid", {
      method: "POST",
      headers: { "X-Support-Worker-Key": workerKey },
      body: "{}",
    }),
    { ...options, resendKey: "" },
  );
  equal(missing.status, 503);
  equal(store.claims, 0);
});
