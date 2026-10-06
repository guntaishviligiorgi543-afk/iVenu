import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { type EmailPayload } from "./email.ts";
import {
  type Context,
  DeliveryError,
  type Event,
  handleWorker,
  type Outcome,
  type Store,
} from "./worker.ts";

class SupabaseStore implements Store {
  private client;
  constructor() {
    const url = Deno.env.get("SUPABASE_URL"),
      key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new DeliveryError("BACKEND_CONFIG_REQUIRED");
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  async claim(): Promise<Event[]> {
    const { data, error } = await this.client.rpc(
      "claim_support_email_notifications",
    );
    if (error) throw new DeliveryError("QUEUE_UNAVAILABLE");
    return (data || []) as Event[];
  }
  async context(event: Event): Promise<Context | null> {
    const { data, error } = await this.client.from("support_requests")
      .select("id,customer_user_id,customer_deleted_at,subject,status")
      .eq("id", event.support_request_id).maybeSingle();
    if (error) throw new DeliveryError("REQUEST_LOOKUP_FAILED");
    if (!data) return null;
    const context: Context = data;
    if (event.kind === "reply" && event.support_message_id) {
      const { data: reply, error: replyError } = await this.client.from(
        "support_messages",
      )
        .select("id,sender_type,sender_user_id,body")
        .eq("id", event.support_message_id).eq(
          "support_request_id",
          event.support_request_id,
        ).maybeSingle();
      if (replyError) throw new DeliveryError("MESSAGE_LOOKUP_FAILED");
      context.reply = reply || undefined;
    }
    return context;
  }
  async registeredEmail(userId: string): Promise<string | null> {
    const { data, error } = await this.client.auth.admin.getUserById(userId);
    if (error && error.status !== 404) {
      throw new DeliveryError("AUTH_LOOKUP_FAILED");
    }
    return data.user?.email?.trim() || null;
  }
  async savePayload(event: Event, payload: EmailPayload): Promise<boolean> {
    const { data, error } = await this.client.from(
      "support_email_notifications",
    )
      .update({ payload }).eq("id", event.id).eq("status", "sending")
      .eq("lease_token", event.lease_token).gt(
        "lease_expires_at",
        new Date().toISOString(),
      )
      .is("payload", null).select("id").maybeSingle();
    if (error) throw new DeliveryError("PAYLOAD_SAVE_FAILED");
    return Boolean(data);
  }
  async finish(event: Event, outcome: Outcome): Promise<boolean> {
    const { data, error } = await this.client.rpc(
      "finish_support_email_notification",
      {
        p_id: event.id,
        p_lease_token: event.lease_token,
        p_status: outcome.status,
        p_error_code: outcome.code || null,
        p_provider_message_id: outcome.providerId || null,
      },
    );
    if (error) throw new DeliveryError("OUTCOME_SAVE_FAILED");
    return data === true;
  }
}

Deno.serve((request) =>
  handleWorker(request, {
    workerKey: Deno.env.get("SUPPORT_NOTIFICATIONS_WORKER_KEY") || "",
    resendKey: Deno.env.get("RESEND_API_KEY") || "",
    from: Deno.env.get("EMAIL_FROM") || "",
    createStore: () => new SupabaseStore(),
    send: fetch,
    // Never log provider response bodies, Auth emails, message text or secrets.
    log: (eventId, code) =>
      console.warn("Support notification", { eventId, code }),
  })
);
