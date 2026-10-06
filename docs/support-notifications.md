# Support transactional notifications

Backend deployed October 6, 2026 to the linked production project. The user subsequently confirmed that the Support transactional email feature works and authorized committing and pushing the completed Support work, including the frontend deep-link change. No production migration, function deployment, secret update or data mutation is part of Git finalization.

## Production deployment verification

- The sole pending migration, `20261006111828_support_transactional_notifications.sql`, was applied with its exact version. Remote history was compared against local migrations afterward: none remain pending, and no other migration was added.
- Only `support-notifications` was deployed. It is ACTIVE at version 1 with `verify_jwt = false` and its own private worker-key authentication.
- Existing `RESEND_API_KEY` and `EMAIL_FROM` digests remained unchanged. A new cryptographically random 32-byte worker key was generated inside private Vault and copied to `SUPPORT_NOTIFICATIONS_WORKER_KEY` without displaying it. Edge/Vault digests match. The private endpoint Vault entry is configured. Temporary protected secret storage was removed.
- Missing/incorrect worker keys return HTTP 401; an authenticated recipient override returns HTTP 400. An authorized empty worker invocation returns HTTP 200 with zero events processed. This confirms required server configuration is present, but does not establish provider acceptance or inbox delivery.
- One active `support-transactional-email-worker` cron job runs every minute with the intended dispatcher command. Cron history shows successful executions. A separate empty database-to-Edge probe through `pg_net`, using the private Vault configuration, returned HTTP 200 with no error or timeout and zero events processed. With an empty queue, the normal dispatcher does not call Edge.
- The queue has RLS enabled and no browser access. Anonymous/authenticated roles cannot execute the worker-management functions. The two new enqueue triggers exist. Existing public function definitions/ACLs, RLS policies and non-notification trigger hashes match their predeployment baseline.
- Existing Edge function code hashes, JWT settings and deployment timestamps match their baseline. Their reported version counters increased by one after the project secret update; no existing function deployment command was run.
- Reverified 17 worker unit tests, PostgreSQL migration/lease/retry/failure integration assertions and 18 mocked desktop/mobile navigation cases. Retry and duplicate-suppression evidence comes from these tests; no production failure was induced.
- No production Support request/message was manually inserted or updated by the deployment verification. At that time no controlled authenticated test request/session or mailbox was available, so production reply, resolution, Resend acceptance, actual inbox delivery, email rendering, live View Response/View Request navigation and duplicate-delivery checks were **unverified by the agent**. The user has since confirmed the feature works; this confirmation does not imply that the agent inspected a mailbox or performed those actions. The browser runtime had no available sessions.
- `account.js` passes local checks: own open requests load, own resolved links select Resolved and remain read-only, foreign/hidden requests are denied, and Admin/active Support users cannot use the customer section in mocked tests. The user authorized including this change in the Support commit and pushing it to `main` after confirming the feature works.

During backend deployment, no frontend, GitHub Pages or unrelated Edge Function deployment was performed. No existing provider secret was rotated.

## Existing infrastructure and scope

Reuses Resend, `RESEND_API_KEY`, the transactional `EMAIL_FROM` sender and Supabase's built-in backend URL/service-role credentials. The email uses the established Newsletter template's public iVenue logo, centered table layout and dark/peach/coral palette, with a transactional footer. It does not use newsletter subscribers, campaign tables, unsubscribe links or marketing consent. Existing Newsletter/OTP functions and secrets are unchanged. The new worker pins its Supabase client; the existing functions' dependency resolution is untouched.

The existing `reply_to_support_request` and `resolve_support_request` RPCs remain authoritative and unchanged. Support/Customer/Admin RLS, employee authorization, claiming, assigning, unread/read state, filtering, pagination, soft deletion and 90-day cleanup are unchanged. No browser, Support Workspace or Admin function sends email or chooses a recipient.

## Events and delivery

The single new migration is `20261006111828_support_transactional_notifications.sql`.

- A successful Support message INSERT by the current authorized, non-Admin employee enqueues a `reply` event uniquely keyed by the saved message ID.
- A transition from a non-resolved request to `resolved` by the current authorized employee enqueues one `resolved` event per request. Repeating the existing resolve call does not enqueue another email.
- Events roll back with unsuccessful Support actions. There is no historical backfill or event on customer replies, viewing, marking read, claiming, assigning, Admin oversight, filtering, pagination or customer hiding.
- A private worker is scheduled every minute. Delivery occurs after the Support transaction commits and does not depend on the browser staying open or retrying an action. Normal delivery can take approximately a minute, and longer during a backlog or outage.
- Outbox insertion belongs to the database transaction; a database failure to persist the transaction is distinct from an email-provider failure. No provider call is made inside the reply/resolve transaction.

The worker claims up to five due events with `FOR UPDATE SKIP LOCKED` and five-minute leases. It loads the stored request/message through service-role-only server access. `customer_user_id` selects the current registered Auth user via `auth.admin.getUserById`. Neither request/profile email snapshots nor frontend-supplied email are used. Missing/deleted owners or Auth emails are skipped. Browser roles cannot SELECT/INSERT/UPDATE the queue or execute worker-management RPCs.

The worker HTTP endpoint accepts only POST `{}` with the dedicated server-only `X-Support-Worker-Key`. Customer, Support, Admin and service-role JWTs alone do not authorize it. Body fields selecting a recipient, request or event are rejected. `verify_jwt = false` is intentional for this private scheduled endpoint; its own key check runs before backend access. No browser CORS access or manual notification button is added.

## Emails and deep links

| Event | Subject | Content | CTA |
| --- | --- | --- | --- |
| Reply | New response from iVenue Support | “You have a new response”; actual stored request subject and a whitespace-normalized, HTML-escaped preview limited to 240 Unicode code points. No full conversation, staff identity or internal metadata. | View Response |
| Resolved | Your iVenue Support request has been resolved | “Your request has been resolved”; actual stored request subject and a brief explanation that Support marked it resolved. No fabricated summary: the current schema stores resolver identity/timestamp, not a resolution explanation. | View Request |

Both CTAs use `https://ivenue.site/profile.html?section=support&request=<uuid>`, the existing dashboard route, with only section and navigation ID. No email, credential or token is in the URL. The customer route explicitly checks ownership and `customer_deleted_at IS NULL` before loading messages, in addition to RLS. Resolved deep links now select the Resolved filter and keep the conversation read-only; active requests retain the All filter and can receive customer replies. Active Support/Admin users remain excluded from the customer section.

The existing signed-out dashboard prompts the user to sign in; after signing in they can reopen the email CTA. The existing login-security return handling is unchanged. This task does not add a new general login redirect/OAuth-return mechanism. An exact-request link grants no access by itself.

## Failures, retries and retention

Email failure never replays a Support RPC, inserts another message, repeats a resolution or reopens a resolved request. Errors are tracked only in the private delivery queue and logged as event ID plus safe error code; provider response bodies, message text, emails and secrets are not logged or returned. Permanent provider rejection stops delivery; transient failures and timeouts retry delivery only, with exponential backoff, a six-attempt cap and a 23-hour limit from first claim. Missing provider configuration does not claim or discard pending events.

The exact provider payload is persisted before external delivery and reused with `Idempotency-Key: support-notification/<event-uuid>`. This also covers a timeout/crash after provider acceptance or a failure recording success. Retries never automatically cross Resend's 24-hour key lifetime. Sent/skipped/terminal-failed payloads are cleared; pending retries retain only the rendered email payload, not an additional full conversation copy. An Auth email change suppresses retry to the old recipient rather than changing a request body under the same key. Exhausted/expired events require operator investigation; do not blindly reset them or replay Support actions.

Requests hidden/deleted before processing or the final visibility recheck are skipped. The queue follows the existing request/message purge through cascading foreign keys, including the existing 90-day lifecycle. No email can be recalled once accepted by the provider; a concurrent hide/email-change after the final checks is an unavoidable external-delivery race, not authorization to reopen a hidden conversation.

## Deployment configuration and remaining release checks

1. Review and deploy only `supabase/functions/support-notifications/{index,worker,email}.ts` with its `supabase/config.toml` entry. Reuse the existing `RESEND_API_KEY` and verified `EMAIL_FROM`; no new provider, sender or marketing configuration is required.
2. The configured worker key uses 32 cryptographically random bytes encoded as 64 hex characters. The Edge secret `SUPPORT_NOTIFICATIONS_WORKER_KEY` matches the private Vault secret named `support_notifications_worker_key`. Do not put values in source, frontend, logs or chat.
3. Set private Vault entry `support_notifications_url` to `https://aswiwlyydesskwvehmej.supabase.co/functions/v1/support-notifications`. Do not use an arbitrary host. The dispatcher validates the HTTPS Supabase function URL; a missing/invalid key or URL leaves events queued and logs a configuration warning.
4. Only the reviewed new migration was applied. It created the private queue, triggers, worker-management RPCs, enabled `pg_net`, and added one minute cron job. Existing `pg_cron`/Vault were reused. Do not replay this or the already-applied legal migration, or run a broad migration push.
5. Deploy only the small `account.js` resolved-deep-link filter change. No Support Workspace or Admin frontend changes are needed.
6. In an authorized test session, verify one new reply and one resolution are delivered to the current registered Auth email, check actual mailbox rendering/CTA, and inspect safe queue outcomes. Confirm no tests send email to other real customers or modify their acceptances/account data. A `sent` receipt means Resend accepted the email; inbox placement is not guaranteed or verified by this implementation.

Private worker/Vault configuration and real `pg_net`/cron execution were verified above. The user subsequently confirmed the feature works. Actual mailbox rendering and detailed real-session smoke checks were not independently inspected by the agent. Deployment verification invocations processed an empty queue and sent no email.

## Local validation

Install temporary pinned test dependencies without modifying the application package/lock files:

```powershell
npm.cmd install --prefix .tmp/support-tests --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.8 jsdom@26.1.0
deno test tests/support-notifications.test.ts
deno check supabase/functions/support-notifications/index.ts
node tests/support-notifications-db.cjs
node tests/support-notifications-navigation.cjs
node --check account.js
node --check support.js
git diff --check
```

Passed: 17 worker/email/security/failure unit tests; real PostgreSQL queue/migration integration assertions; 18 mocked desktop/mobile deep-link/role/lifecycle cases, including signed-out prompts; function type checks; JS syntax and whitespace checks. PostgreSQL tests apply the existing Support foundation/unread/lifecycle migrations plus this migration in an in-memory PGlite database, substituting only cron/Vault/network extension adapters. Existing Support RPC definitions and RLS policies are checked unchanged, and revoked employees cannot create new events. No production writes or live provider calls are made.

The browser runtime has no available sessions. Real authenticated browser layout/navigation and existing standalone Chromium screenshot tests were not run; the DOM checks do not establish painted layout or actual production behavior.

References: [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
