# iVenue legal/information audit — October 5, 2026

> Final review refreshed October 6, 2026: **GO FOR COORDINATED RELEASE.** See [legal-predeployment-review-2026-10-05.md](legal-predeployment-review-2026-10-05.md). Both previous publication blockers are resolved: the verified public privacy contact is now published and Privacy discloses automatic removal of unverified accounts after more than 24 hours. The migration was applied in an earlier separately authorized step; no deployment, migration, commit or push occurred in this continuation. Browser checks remain unverified. The earlier permissive profile-policy warning is superseded by the restrictive production policy.

## Scope and release status

Updated the Privacy Policy, Terms of Use and User Data Deletion based on repository code and read-only inspection of the linked production database, deployed Edge Functions and production hosting. No database writes, deployment or push were performed for this task. This is a description of observed behavior, not certification of legal compliance.

The production audit inspected migrations/history, foreign keys, triggers, RLS policies, function definitions and grants, and scheduled jobs. All 71 pre-existing local migrations were applied at the time of inspection. The policy-version migration was pending at the original inspection; a fresh October 6 SELECT confirms it is now applied from the earlier separately authorized isolated deployment. Deployed functions inspected: `delete-account`, `admin-delete-user`, `admin-user-enforcement`, `email-change`, `login-security`, `reservation-security`, `newsletter-campaign`, and `newsletter-unsubscribe`.

Frontend areas inspected include authentication, Google OAuth/password setup, verification/recovery, profile/email changes, policy acceptance, event/ticket/seat selection, cart/reservations/expiry, checkout, account history, newsletter, Support and Admin/enforcement. Graph queries and repository searches were used to locate these paths; findings were checked against deployed function/schema definitions where relevant.

## Files changed by this task

| File | Change |
| --- | --- |
| `privacy-policy.html` | Audited processing, access, retention, providers, deletion and rights disclosures; October 5 date. |
| `terms-of-use.html` | Audited account/security, demo checkout, reservation, Support and enforcement rules; October 5 date. |
| `data-deletion.html` | Password/OAuth instructions and precise deletion, disassociation and retention distinctions; October 5 date. |
| `public-header.js` | Suppress normal-header auth/account links on exactly these three pages; retain burger controls. |
| `auth.js` | Change both existing required policy versions to `2026-10-05`. |
| `supabase/migrations/20261005144511_update_required_policy_versions_20261005.sql` | Existing single policy migration, already applied in the earlier authorized step; unchanged in this continuation. |
| `README.md` | Correct the related deletion-function description. |
| `tests/legal-pages.cjs` | Header/menu, document/link/date and version-contract regression checks. |
| `docs/legal-audit-2026-10-05.md` | This report. |

Concurrent edits appeared in `support.css`, `support.html` and `support.js`; they were not made or modified by this task. Their presence in the working tree is separate from this change.

## What was retained, added, removed and rewritten

Accurate concepts retained: educational/demo purpose with real personal information; no real payments or tickets of monetary value; account/profile and Google identity data; passwords not displayed to administrators; optional newsletter consent; event/cart statistics without continuous individual browsing-hour or mouse tracking; acceptable-use and responsible vulnerability-reporting rules; intellectual-property caveats; service availability limits; and conditional Georgian personal-data rights.

Added disclosures: publicly linked avatars; new-email verification data; remembered browser devices and verification records; local/session storage; required-policy version history; individual seat/account-linked statistics; Support identity snapshots, employee-wide queue access, assignment/resolution/read states, soft deletion and the verified 90-day cleanup; newsletter recipient snapshots, tests, delivery history and inactive status; concrete violation severity/points, ban/unban and reconciliation history; actual provider names; and the verified public privacy/data contact for users with or without account access.

Materially rewritten: account deletion and OAuth/password instructions; retention by category rather than generic necessity language; reservation duration, single-event rule and interface selection limit; the current checkout button's unavailable-payment behavior; Support lifecycle; restriction review and lack of guaranteed warning/ban notification; newsletter independence from account deletion/email changes; and renewed policy acceptance.

Removed or replaced misleading claims/implications: a profile being retained/anonymised to preserve orders; Support messages being an alternative to password-confirmed deletion; account deletion being equivalent to erasure of independent records; blanket anonymisation; vague hypothetical ticket limits; a functioning real/demo purchase through the current checkout button; guaranteed separate warning/review access; and unsupported child/age safeguards. The replacement says that age verification is not implemented. Old warning sections were consolidated into observed enforcement behavior rather than implying a separate warning-delivery system.

The repository search found legal links rather than additional full copies of the documents. The README deletion description was corrected. September 29 version literals in historical migrations were deliberately preserved: they document previously deployed behavior. A remaining ticket-limit popup mismatch is reported below, not edited.

## Account deletion and retained information

Self-service deletion requires a valid session, applicable sign-in security proof and the user's current **iVenue password**. The deployed endpoint verifies that password through authentication before hard-deleting the Auth user. It rejects banned/restricted accounts. No authentication or password requirement was changed. Users are explicitly told never to send passwords, OTPs or tokens to Support.

Google sign-in without an iVenue password does not satisfy this check. The existing Google flow redirects users without a configured password to password setup. Google users with a configured password use that iVenue password, not their Google password. Deleting iVenue does not delete the external Google account.

| Category | Observed result when deletion succeeds |
| --- | --- |
| Auth user, identity/session relations | Hard deletion of the Auth account and linked authentication records. |
| Profile/name/email/phone/avatar link | Profile deleted by Auth-to-profile cascade. Orders do not preserve a profile. |
| Cart | Deleted. |
| Active reserved seats | Profile-delete trigger releases still-reserved seats and clears reservation ownership; sold-seat history remains. |
| Demo orders/order items | Retained; the order's account reference becomes null. Totals/status/ticket/seat/time data remains. |
| Event views/cart additions | Retained with user references null. Sharing statistics do not have an account reference. |
| Policy acceptances | Deleted by Auth cascade, including prior versions. |
| Email-change/sign-in security | Account-linked verification, devices, challenges, proofs and rate-limit records deleted by cascade. Expiry while the account exists is not scheduled erasure. |
| Support requests/messages | Account references null; copied names/emails/message bodies and assignment/resolution information remain. Account deletion does not resolve or customer-delete an open request. |
| Support read states | Deleted for the removed reader; request-linked states also disappear when a request is eventually purged. |
| Support employee membership history | References to deleted users cleared; copied identity and grant/revocation history retained. |
| Admin membership | Deleted. |
| Violations, bans/unbans, reconciliation | Account/actor references cleared where applicable; notes, reasons, points and timestamps retained. These can remain identifying. |
| Newsletter/subscriber/campaign history | Email-based records retained, including active subscriptions and recipient snapshots. Account deletion neither unsubscribes nor transfers an address. Campaign author references are cleared where applicable. |
| Uploaded images | Avatar link disappears with the profile; the flow does not remove storage objects. Existing public URLs can remain reachable. |
| Browser storage | Sign-out removes the active session/current proof, not every device identifier, preference or local selection across devices. |
| Provider logs/backups | No immediate-erasure guarantee; provider settings/retention were not established by this audit. |

The endpoint temporarily replaces profile identity fields if orders exist, then deletes Auth; production foreign keys subsequently delete that profile and null the orders' reference. It also deletes carts before the final Auth call. These steps are not one transaction: an eventual Auth failure can leave partial earlier changes. Therefore the pages consistently qualify outcomes with **when deletion succeeds**. No irreversible anonymisation of all remaining personal information is claimed.

## Support lifecycle and retention

Evidence: production functions/triggers/RLS and `20261004130000_support_lifecycle_retention.sql`, plus the foundation/read-state migrations and deployed account deletion.

Customers need sign-in and a completed profile name/email. Admin and Support employee accounts cannot create customer requests through this flow. Statuses are open, waiting for user and resolved. Support employees can access the queue and conversations, not merely their assigned tickets. Admins oversee assignment and membership rather than replying as Support employees.

Resolved requests cannot reopen. Customer deletion sets a timestamp and hides the request, stopping its active workflow. The live daily cleanup job runs at `02:15` on the database cron schedule and purges resolved or customer-deleted requests after 90 days from the later relevant timestamp when both exist. Messages and request read states cascade on purge. This is scheduled cleanup, not an exact instant at the 90-day boundary.

Open, undeleted requests have no automatic age-based purge, even after account deletion. Copied names/emails/messages remain until the applicable cleanup or a separately reviewed erasure action. Employee membership history has no fixed automatic purge found.

## Enforcement and newsletter

Enforcement evidence: Admin management migrations, live RPCs and deployed `admin-user-enforcement`. Violation severities carry 1/2/4 points; points are indicators, not automatic bans. Authorized Admin actions impose 24-hour, 7-day, 30-day or permanent restrictions and can unban with a note. Expiry/unban does not erase history. Reconciliation captures an audit-write failure after an authentication restriction operation; it is not a separate automated decision system. No fixed automatic enforcement-history purge or guaranteed separate warning/reason/appeal notification was found. Public pages omit internal anti-abuse operational detail.

Newsletter evidence: newsletter migrations/frontend and deployed campaign/unsubscribe functions. The consent checkbox is separate from registration and required policy acknowledgement. Subscriber rows use email, subscription time and active status. Administrators create drafts, choose all/selected active recipients, test to their own address and send through Resend. Campaign recipient snapshots and delivery/test results persist. Sending checks active status; unsubscribe marks inactive rather than erasing records. Account-email changes and account deletion do not unsubscribe or transfer records. No scheduled retention period exists for subscriber, campaign or unsubscribe-token history; campaign deletion can separately remove campaign/delivery records. No implemented double opt-in, persistent checkbox-version evidence or opening/click tracking was found; these are not claimed.

## Services, rights and policy versioning

Disclosed actual services: Supabase Auth/database/storage/server functions; Resend for custom security, email-change and newsletter email; Google sign-in/Maps/Fonts; GitHub Pages hosting; jsDelivr libraries; configured external images and user-initiated social/sharing destinations. The provider behind Supabase registration/recovery SMTP was not verified and is not assumed to be Resend. No payment processor was found. No credentials are included in the report or legal text.

Georgian rights are expressed conditionally and linked to the consolidated [Law of Georgia on Personal Data Protection](https://www.matsne.gov.ge/en/document/view/5827307). No invented legal retention deadline, infrastructure location or compliance certification is asserted.

These are material changes. Both `CURRENT_POLICY_VERSIONS` values move from `2026-09-29` to `2026-10-05`. The existing, now-applied migration replaces **the existing** `public.accept_current_policy_versions()` zero-argument RPC, updating its inserted and returned version literals. It preserves `auth.uid()` authorization, empty search path, the existing uniqueness/conflict handling, authenticated execution, revocation from public/anon and earlier acceptance rows. No second acceptance system and no newsletter linkage were added.

Existing users with only older acceptance records must renew Terms acceptance and Privacy acknowledgement after a coordinated release. Production now uses October 5 following the earlier authorized migration deployment. This continuation does not deploy or reapply it. The remaining authorized release must align the served legal pages/client and verify current and stale-client acceptance behavior. The User Data Deletion page has an October 5 date but is not made a third required acceptance policy.

## Header and verification

Exactly the three legal filenames suppress normal desktop-header Login/Logout/Account anchors. Logo and normal navigation stay. Burger Login for guests and Logout/Account for authenticated users retain their existing routing/behavior. Other pages retain normal-header controls. Existing styles, responsive breakpoints, typography and colors were preserved; no CSS redesign was made.

`node tests/legal-pages.cjs` passed 48 mocked header/menu combinations: three legal pages plus homepage, widths 1440/768/375 and guest/customer/Admin/Support states. Checks include absence/presence, menu open/close, logout wiring, auth transitions and duplicate initialization. Additional assertions check dates, favicon, local targets, document structure, cross-links, retained security requirements, Support/newsletter wording and the existing policy RPC/version contract. Prior-only acceptance and partial new acceptance fail; both new versions pass. The migration preserves history and excludes newsletter changes. JavaScript syntax checks and `git diff --check` passed.

The in-app browser reported no available browser sessions. These are DOM tests with mocked authentication, **not** real production logged-in tests, screenshots or verification of painted mobile layout. The responsive stylesheet was retained and inspected; actual visual layout and real-session menu behavior still need a browser check before publication. No destructive production account deletion, restriction or email send was performed as part of this audit.

## Remaining issues for separate work

1. **Contact readiness resolved:** the user confirmed successful testing of the monitored public address `privacy@ivenue.site`. All three pages now publish it for privacy/data requests without requiring sign-in or exposing private forwarding details. Contact-page placeholders and broader operator/controller identity review remain separate work, without inventing identifying details or certifying compliance.
2. **Profile-policy warning corrected:** production combines permissive self-owner UPDATE permission with a restrictive ban policy in USING and WITH CHECK. No demonstrated current defect on that evidence; no RLS changes or destructive authorization tests were performed.
3. **Ticket limit:** the frontend enforces four selected tickets, while one popup says four per account. The current protected reservation RPC lacks the same count enforcement after the login-security cutover. Terms describe the observable interface limit, not a server-enforced lifetime/account quota. Reservation code and popup wording were not changed.
4. **Deletion completeness/reliability:** no image-storage cleanup occurs. Auth deletion may also fail where storage ownership prevents it; this possibility was not reproduced on a real account. Profile/cart preliminary writes are not transactional with Auth deletion. Separate tests and design work are needed before promising unconditional deletion or full erasure.
5. **Retention governance:** most historical enforcement, newsletter, demo-order/statistics, membership and image records have no automatic cleanup. Security/email-change expiry is not record erasure. Absence of a purge is disclosed; it does not establish a lawful indefinite-retention purpose. Retention justification, manual rights handling and provider backup/log settings remain operational/legal review items.
6. **Policy release coordination:** the sole October 5 migration is already applied from the earlier authorized step. Publish the scoped legal/frontend artifact only after separate authorization; verify version alignment and renewed acceptance. Do not apply the migration again.

Authentication, deletion confirmation, reservations, Support, enforcement, newsletter and event data were not changed to fit the documents. No deployment or push was performed.

## October 6 continuation verification

The user confirmed `privacy@ivenue.site` is tested and monitored. Privacy, Terms and Data Deletion now publish only that direct email contact. Credential warnings cover email and Support; emailing does not automatically delete an account or replace current-password confirmation. Existing OAuth/password requirements and historical retention disclosures remain intact. Terms clarifies that deletion does not guarantee immediate invalidation of every previously issued access token.

A fresh SELECT confirms active production job `delete-unverified-users-after-24h` runs hourly (`0 * * * *`) and deletes Auth users with null `email_confirmed_at` created more than 24 hours ago. Privacy section 12 now discloses eligibility and hourly processing, without internal SQL or function names; Terms and Deletion provide short references. The job was not invoked, and individual execution success was not tested.

Only the three legal pages and two reports were edited in this continuation. Existing header/client/migration/tests were preserved; no Support source was edited or restored. Browser discovery returned no sessions, so visual layout, real authenticated desktop/burger behavior, console and network checks remain unverified. Final local test results and release steps are in the predeployment review.
