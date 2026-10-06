import {
  type EmailPayload,
  type NotificationKind,
  supportEmail,
} from "./email.ts";

export type Event = {
  id: string;
  support_request_id: string;
  support_message_id: string | null;
  actor_user_id: string | null;
  kind: NotificationKind;
  lease_token: string;
  payload: EmailPayload | null;
};
export type Context = {
  id: string;
  customer_user_id: string | null;
  customer_deleted_at: string | null;
  subject: string;
  status: string;
  reply?: {
    id: string;
    sender_type: string;
    sender_user_id: string | null;
    body: string;
  };
};
export type Outcome = {
  status: "sent" | "skipped" | "retry" | "failed";
  code?: string;
  providerId?: string;
};
export interface Store {
  claim(): Promise<Event[]>;
  context(event: Event): Promise<Context | null>;
  registeredEmail(userId: string): Promise<string | null>;
  savePayload(event: Event, payload: EmailPayload): Promise<boolean>;
  finish(event: Event, outcome: Outcome): Promise<boolean>;
}
export class DeliveryError extends Error {
  constructor(public code: string, public retryable = true) {
    super(code);
  }
}

export async function processEvent(
  event: Event,
  store: Store,
  config: { from: string; resendKey: string },
  send: typeof fetch,
): Promise<Outcome> {
  const context = await store.context(event);
  if (!context || context.customer_deleted_at || !context.customer_user_id) {
    return { status: "skipped", code: "REQUEST_UNAVAILABLE" };
  }
  if (context.id !== event.support_request_id || !event.actor_user_id) {
    return { status: "skipped", code: "EVENT_UNAVAILABLE" };
  }
  if (event.kind === "resolved" && context.status !== "resolved") {
    return { status: "skipped", code: "NOT_RESOLVED" };
  }
  if (
    event.kind === "reply" &&
    (!context.reply || context.reply.id !== event.support_message_id ||
      context.reply.sender_type !== "support" ||
      context.reply.sender_user_id !== event.actor_user_id)
  ) {
    return { status: "skipped", code: "NOT_SUPPORT_REPLY" };
  }
  // The request's copied customer_email/profile email and all HTTP body fields
  // are deliberately absent here. The current Auth user is the only authority.
  const email = await store.registeredEmail(context.customer_user_id);
  if (!email) return { status: "skipped", code: "AUTH_EMAIL_UNAVAILABLE" };
  let payload = event.payload;
  if (payload && (payload.to.length !== 1 || payload.to[0] !== email)) {
    return { status: "skipped", code: "AUTH_EMAIL_CHANGED" };
  }
  if (!payload) {
    payload = supportEmail({
      kind: event.kind,
      requestId: context.id,
      subject: context.subject,
      reply: context.reply?.body,
      from: config.from,
      to: email,
    });
    // Freeze the exact provider body before sending. A timeout/crash retries
    // the same body/key; edited text/from configuration cannot cause duplicates.
    if (!(await store.savePayload(event, payload))) {
      return { status: "skipped", code: "LEASE_LOST" };
    }
  }
  // Check visibility again immediately before external delivery. This cannot
  // recall an email already accepted by the provider during concurrent hiding.
  const current = await store.context(event);
  if (
    !current || current.customer_deleted_at ||
    current.customer_user_id !== context.customer_user_id
  ) return { status: "skipped", code: "REQUEST_UNAVAILABLE" };
  const response = await send("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Authorization": `Bearer ${config.resendKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `support-notification/${event.id}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new DeliveryError(
      `PROVIDER_HTTP_${response.status}`,
      response.status === 429 || response.status >= 500 ||
        response.status === 409,
    );
  }
  const result = await response.json().catch(() => null);
  if (!result || typeof result.id !== "string" || !result.id) {
    throw new DeliveryError("PROVIDER_RESULT_INVALID");
  }
  return { status: "sent", providerId: result.id };
}

export async function deliverBatch(
  store: Store,
  config: { from: string; resendKey: string },
  send: typeof fetch,
  log: (id: string, code: string) => void,
) {
  const events = await store.claim();
  const counts = {
    claimed: events.length,
    sent: 0,
    skipped: 0,
    retry: 0,
    failed: 0,
    unrecorded: 0,
  };
  for (const event of events) {
    let outcome: Outcome;
    try {
      outcome = await processEvent(event, store, config, send);
    } catch (error) {
      outcome = {
        status: error instanceof DeliveryError && !error.retryable
          ? "failed"
          : "retry",
        code: error instanceof DeliveryError
          ? error.code
          : "DELIVERY_UNAVAILABLE",
      };
    }
    try {
      if (!(await store.finish(event, outcome))) throw new Error("Lease lost");
      counts[outcome.status]++;
    } catch {
      counts.unrecorded++;
      log(event.id, "OUTCOME_UNRECORDED");
      // Leave lease recovery to the queue. Never retry the saved Support action.
    }
    if (outcome.code) log(event.id, outcome.code);
  }
  return counts;
}

export async function sameSecret(
  expected: string,
  actual: string,
): Promise<boolean> {
  if (expected.length < 32 || !actual || actual.length > 512) return false;
  const hash = (value: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([hash(expected), hash(actual)]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export async function handleWorker(request: Request, options: {
  workerKey: string;
  from: string;
  resendKey: string;
  createStore: () => Store;
  send: typeof fetch;
  log: (id: string, code: string) => void;
}): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
  if (
    !options.workerKey ||
    !(await sameSecret(
      options.workerKey,
      request.headers.get("X-Support-Worker-Key") || "",
    ))
  ) return json({ error: "Worker authorization required." }, 401);
  // No user-supplied recipient, request ID or manually selected event accepted.
  if (Number(request.headers.get("content-length") || 0) > 1024) {
    return json({ error: "Invalid request." }, 400);
  }
  const body = await request.json().catch(() => null);
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length
  ) return json({ error: "Invalid request." }, 400);
  if (!options.from || !options.resendKey) {
    return json({ error: "Support delivery is not configured." }, 503);
  }
  try {
    return json(
      await deliverBatch(
        options.createStore(),
        options,
        options.send,
        options.log,
      ),
    );
  } catch {
    options.log("worker", "QUEUE_UNAVAILABLE");
    return json({ error: "Support delivery is temporarily unavailable." }, 503);
  }
}
