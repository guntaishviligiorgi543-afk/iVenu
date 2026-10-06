# October 5 legal update: final predeployment review

Refreshed October 6, 2026. **GO FOR COORDINATED RELEASE.** Both previous publication blockers are resolved. This is a factual documentation recommendation, not legal compliance certification. Browser smoke checks remain outstanding.

No deployment, migration application, commit or push occurred during this continuation. The policy migration was applied in an earlier separately authorized step and rechecked here through SELECT. No application behavior or Support source files were modified.

## Resolved blockers

| Item | Evidence and final disclosure | Status |
| --- | --- | --- |
| Public privacy contact | User confirmed creation and successful testing of monitored public address `privacy@ivenue.site`. All three pages link to it, including for signed-out/deleted users. No forwarding destination, personal or administrator contact is disclosed. Email is distinct from secure password-confirmed account deletion. | Resolved; delivery evidence is user supplied. No email was sent in this task. |
| Unverified-account retention | Fresh SELECT confirms active hourly `delete-unverified-users-after-24h`, schedule `0 * * * *`, deleting users with null `email_confirmed_at` created more than 24 hours ago. Privacy section 12 explains eligibility and hourly processing without guaranteeing deletion at exactly 24 hours. Terms and Deletion give brief consistency references. | Resolved; configuration verified, job not invoked or execution-tested. |

## Preserved behavior and migration

Privacy and Terms versions are `2026-10-05`; all three document dates remain October 5, 2026. Educational/demo status, no real payments or monetary-value tickets, profile/authentication and Google OAuth, seats/reservations/orders, Support retention, independent newsletter consent, enforcement history, providers, storage, retention and rights disclosures remain intact.

Self-service deletion requires the current iVenue password and requested sign-in security proof. Google-only users must configure an iVenue password. All pages prohibit sending passwords, OTP codes, access/refresh/session tokens or other authentication credentials through email or Support. Email does not automatically delete an account or replace password confirmation. Terms clarifies that deletion does not guarantee immediate invalidation of all issued tokens.

The single existing migration `20261005144511_update_required_policy_versions_20261005.sql` is unchanged and already applied, confirmed by a fresh production ledger SELECT. The earlier authorized deployment verified both RPC versions as October 5, authenticated execution allowed, anon denied, all eight historical acceptance rows unchanged, and other public function/relation/trigger fingerprints unchanged. No acceptance writes were performed during this continuation.

The migration replaces the existing zero-argument RPC and reaffirms its ACL with a schema reload notification. It does not invoke acceptance, reset account/authentication data or alter newsletter consent. Existing unique version rows and ON CONFLICT DO NOTHING preserve older records/timestamps. Renewed acceptance uses the existing client/RPC architecture; both current versions are required. Data Deletion is not a third required acceptance policy. No second migration is needed.

## Verification

Passed `node tests/legal-pages.cjs`: 48 mocked header/menu combinations covering three legal pages plus homepage, guest/customer/Admin/Support identities and widths 1440/768/375. Document dates, local targets/cross-links, favicon, retained security/Support/newsletter wording and policy-version contracts passed. Older-only and partial October 5 acceptance fail; both October 5 records pass.

Additional checks passed: direct email allowlist contains only `privacy@ivenue.site` on each legal page; mailto links; no stale missing-contact claims; hourly/over-24-hour wording; email does not execute deletion or replace password confirmation. `node --check` passed for `auth.js`, `public-header.js` and `tests/legal-pages.cjs`; `git diff --check` passed. No final test failures. The initial suite attempt lacked its temporary jsdom dependency; restoring pinned `jsdom@26.1.0` allowed the successful rerun. Temporary dependencies and helper scripts were removed afterward.

The supported browser runtime returned an empty browser list. Real logged-out/logged-in desktop/mobile rendering, real-session burger behavior, browser console, failed network requests and responsive painted layout remain **unverified**. Mocked DOM tests cannot establish those results.

Only `privacy-policy.html`, `terms-of-use.html`, `data-deletion.html` and these two reports were edited during this continuation. Existing header/client/migration/tests and concurrent Support work were preserved.

## Non-blocking follow-ups

- Ticket UI/backend limit differences; Terms describe the interface limit.
- Image cleanup/storage ownership failures and nontransactional deletion; retained images and successful-deletion qualifications are disclosed.
- Broader historical retention governance, manual rights handling, operator/controller identity review and provider log/backup settings; no indefinite-retention justification or compliance certification is claimed.
- Contact-page placeholder cleanup outside this scoped task.
- Original profile-policy warning corrected: the production ban UPDATE policy is restrictive alongside owner permission; no demonstrated current defect on that evidence.

These separate improvements do not materially contradict the revised legal pages.

## Recommended coordinated release sequence

1. **Migration:** verify ledger `20261005144511` and October 5 RPC versions. It is already applied; do not reapply, create another migration or deploy unrelated pending migrations.
2. **Legal/frontend deployment:** after separate authorization, publish a reviewed scoped artifact containing these legal pages, existing legal-header behavior and October 5 client versions, excluding unrelated concurrent Support work. The RPC is already updated; align served documents/client promptly. Do not deploy Edge Functions or reset authentication.
3. **Production verification:** check served dates/contact/retention wording, cross-links/client versions, guest/member desktop and burger behavior, rendering, console/network. Verify RPC definition/ACL and history preservation read-only. Leave Login Security, reservations and newsletter unchanged.
4. **Renewed acceptance:** the user manually retries the checkbox using an older-acceptance account, verifies both October 5 rows and reload persistence, and confirms newsletter independence. Check new-user and stale-client behavior in authorized test sessions. Do not manually insert/update acceptance rows or submit acceptance on a user's behalf.

**GO FOR COORDINATED RELEASE.** No release action was performed in this continuation.
