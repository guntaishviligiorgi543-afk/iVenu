# iVenue

iVenue is a static, browser-based event discovery and ticket reservation platform for venues and live shows in Georgia. It combines public event browsing with Supabase-backed authentication, profiles, carts, exact-seat reservations, checkout/order handling, customer support, newsletters, and an authenticated administration workspace.

This repository contains the frontend, database migration history, and Supabase Edge Functions. It is an educational and portfolio project. The current checkout flow handles reservations and order data; no external card-payment provider is implemented in the inspected source.

## Tech Stack

- HTML5, CSS, and vanilla browser JavaScript
- Supabase JS client loaded from jsDelivr
- Supabase Auth, Postgres, Row Level Security, RPCs, Storage, and Edge Functions
- Deno/TypeScript for Edge Functions
- Resend for server-side email delivery in the email-change and newsletter functions
- AOS for selected homepage animations
- Static hosting with the custom domain in `CNAME`

`package.json` is metadata-only. There is no frontend bundler, build pipeline, test script, or lint script in the repository. The browser application uses classic scripts and shared globals rather than ES modules.

## Architecture

The frontend is a collection of static HTML pages. Each page loads the shared Supabase client configuration and only the scripts needed for that page. Browser code reads public data directly through the Supabase client and calls protected RPCs for operations that require database-side authorization or atomicity.

The main layers are:

1. **Static frontend** — HTML pages, shared navigation, page-specific JavaScript, and CSS.
2. **Supabase Auth** — sessions, password authentication, OAuth, email verification, password recovery, and user identity.
3. **Postgres** — events, venues, tickets, profiles, carts, orders, support, newsletters, policy state, enforcement state, analytics, and seating data.
4. **RLS and RPCs** — row-level authorization and transactional operations such as seat reservation, checkout, support actions, and administration.
5. **Edge Functions** — server-side operations requiring service-role access or external email delivery.

The checked-in migrations extend an existing Supabase schema. They reference foundational tables such as `events`, `venues`, `bands`, `ticket_types`, `profiles`, `orders`, `order_items`, and `cart_items`; the repository does not contain a complete initial schema for every foundational table. Applying only this repository's migrations to an empty database is therefore not guaranteed to recreate the production database.

## Project Structure

### Public and account pages

| File | Responsibility |
| --- | --- |
| `index.html` | Public homepage, hero display, upcoming shows, newsletter signup, and event sharing |
| `shows.html` | Event listing, filtering, event cards, sharing, and cart interactions |
| `venue.html` | Venue catalog and venue/event presentation |
| `contact.html` | Contact form and newsletter signup |
| `getTickets.html` | Event details, ticket tiers, visual hall map, exact-seat selection, and reservation/cart flow |
| `checkout.html` | Review of reserved items and reservation expiry/release handling |
| `profile.html` | Authenticated profile, dashboard overview, cart, orders, account security, deletion, and customer Support Requests |
| `support.html` | Staff Support workspace for authorized support users |

### Authentication and legal pages

| File | Responsibility |
| --- | --- |
| `login.html` | Password login and Google/Facebook OAuth entry points |
| `register.html` | Account registration and email confirmation initiation |
| `verify-email.html` | Email OTP verification and resend flow |
| `forgot-password.html` | Password recovery request |
| `reset-password.html` | Password recovery completion |
| `oauth-password-setup.html` | Local-password setup required for qualifying Google accounts |
| `admin-login.html` | Administration login gate |
| `data-deletion.html` | Account/data-deletion policy and authenticated deletion entry point |
| `privacy-policy.html` | Privacy policy |
| `terms-of-use.html` | Terms of use |
| `unsubscribe.html` | Newsletter unsubscribe interface |

### Administration

| File | Responsibility |
| --- | --- |
| `admin-dashboard.html` | Administration workspace |
| `admin-dashboard.js` | Admin data loading, event wizard, seating, analytics, users, enforcement, Support membership, newsletter, and media actions |
| `admin.css` | Administration workspace styling |

### JavaScript

- `public-header.js` — shared public navigation and authentication-aware header behavior.
- `loading-state.js` — shared page loading state coordination.
- `auth.js` — sessions, password auth, OAuth, verification, recovery, policy acceptance, ban checks, and account security helpers.
- `auth-ui.js` — shared authentication UI behavior.
- `supabase-data.js` — public event, venue, homepage, view, and share data access.
- `event-listing-config.js` — shared event-listing configuration.
- `event-cart.js` and `cart-sync.js` — cart UI, synchronization, reservation countdown, and cart cleanup.
- `event-seat-map.js` — canonical seat-map display, ticket legend, seat selection, reservation, and release behavior.
- `getTickets.js` — event details and ticket-selection page orchestration.
- `checkout.js` — reserved-seat checkout review and expiry handling.
- `account.js` — user dashboard, profile, orders, cart, support conversations, and account controls.
- `email-change.js` — protected email-change UI.
- `support.js` — staff Support workspace.
- `newsletter.js` — public newsletter subscription UI.
- `index.js`, `event-share.js`, `venue-hero-loader.js`, and `image-upload.js` — page-specific homepage, sharing, venue, and media helpers.
- `admin-dashboard.js` — administration orchestration.

### CSS

- `main.css` — shared public layout and visual system.
- `auth.css` — authentication and user-dashboard styling.
- `admin.css` — administration UI.
- `getTicket.css` — event and ticket-selection page styling.
- `support.css` — staff Support workspace styling.
- `legal-pages.css` — legal-page styling.

The repository also contains reusable hall-map definitions and controllers in `hall-maps/`.

## Core Features

- Public homepage with configurable hero and upcoming-show sections.
- Event listing and filtering with venue, category, performer, date, and ticket information.
- Venue catalog and venue presentation pages.
- Event sharing and event-view/share analytics.
- Account registration, authentication, verification, recovery, and profile management.
- Cart synchronization across relevant pages.
- Exact-seat selection and reservation countdowns.
- Ticket tiers and legacy non-seat ticket inventory support.
- Reservation-aware checkout/order handling.
- User dashboard with profile, orders, cart, reservations, support, security, and account deletion controls.
- Admin event and venue management.
- Hall-map and ticket-inventory configuration.
- Admin analytics, homepage configuration, media uploads, user management, enforcement, Support membership, and newsletter campaigns.
- Customer Support Requests with staff assignment, replies, resolution, unread state, and customer messaging.
- Newsletter subscriptions, campaign management, delivery, and unsubscribe flow.
- Policy acceptance, user violations, bans, and related access protections.

## Authentication

Supabase Auth is initialized in `supabase-config.js` and used by `auth.js`.

Implemented flows include:

- Email/password registration with first name, last name, phone, and email-confirmation initiation.
- Password sign-in and sign-out.
- Google OAuth and Facebook OAuth using Supabase OAuth redirects.
- Email OTP verification and resend.
- Password recovery request, OTP verification, and password reset.
- Password update and current-password verification.
- Email changes with a protected current-password step followed by an eight-digit verification flow.
- Session refresh and authentication-state listeners.
- Profile metadata synchronization through the authenticated account flow.

Google identities that do not have a configured local password can be redirected to `oauth-password-setup.html`. Current policy versions are defined in `auth.js`; authenticated users are prompted to accept current Terms and Privacy versions before proceeding on protected non-policy pages.

OAuth redirect URLs and provider enablement are Supabase project configuration. They are not fully defined by this repository alone.

## User Dashboard

`profile.html` and `account.js` provide the authenticated User Dashboard:

- Overview cards and dashboard summaries.
- Profile display, editing, avatar upload, and incomplete-profile reminders.
- Password update and email-change controls.
- Order and order-item history.
- Cart and active reservation visibility.
- Reservation countdown and release behavior when leaving or logging out with an active reservation.
- Customer Support Requests, filtering, pagination, request selection, conversation history, unread indicators, customer replies, and resolved-request restrictions.
- Account deletion entry point and related confirmation flow.

The dashboard uses `get_user_dashboard_overview` for consolidated overview data and calls protected RPCs for reservation and Support operations.

## Events, Venues & Seating

Public event data is loaded from Supabase relations involving events, venues, categories, performers/bands, ticket types, and display metadata.

The seating system has two related layers:

1. **Canonical inventory** — `venue_sections`, `venue_seats`, and `event_seats` represent physical or configured seat inventory and event-specific status.
2. **Presentation/configuration** — event section configurations, seat layouts, hall-map configurations, hall-map sections, colors, zones, and ticket tiers drive the visual editor and customer-facing map.

The `hall-maps/` directory contains reusable venue blueprints, seat-map definitions, and viewport behavior. Database constraints, foreign keys, uniqueness rules, status checks, and RPCs coordinate event-seat state.

The migration history documents that some initial layouts were generated from ticket-capacity information where verified physical seating plans were unavailable. The configured maps should therefore be treated as the repository's application data, not as a claim that every map represents a verified architectural plan.

## Reservation & Ticket Flow

1. A user opens an event through `shows.html` or `getTickets.html`.
2. The ticket page loads the event's ticket legend and, where applicable, canonical event seats.
3. Selecting an exact seat calls `reserve_event_seat`; the reservation has an expiry timestamp. Reservation, release, and checkout mutations additionally require a server-issued login-security proof whose validity is tied to the current trusted device window.
4. Reserved seats are represented in cart rows and synchronized across the ticket, cart, dashboard, and checkout UI.
5. Removing a seat or allowing the reservation to expire calls the corresponding release logic.
6. `checkout.html` validates that the current reservation is still valid and loads the reserved event data.
7. Abandoned or expired checkout items are released. The inspected source does not contain an external payment processor or card-capture integration.

Legacy non-seat ticket types remain supported through `ticket_types`, cart rows, and inventory synchronization functions.

## Admin Dashboard

Access to `admin-dashboard.html` is gated by authentication and admin authorization represented by `admin_users`. The current workspace includes:

- Event creation and editing through an atomic event wizard.
- Event metadata, categories, performers, dates, display order, and publishing-related configuration.
- Venue catalog CRUD.
- Ticket types, ticket tiers, inventory, zones, colors, and event-specific seating.
- Hall-map templates, sections, layouts, and presentation configuration.
- Homepage hero event configuration and upcoming-show configuration.
- Event views, cart additions, shares, and period-based analytics.
- Event image upload and Storage-backed media handling.
- User search, summaries, details, profile/account status, and administration actions.
- User policy violations, bans, unbans, and enforcement reconciliation.
- Granting and revoking Support membership.
- Newsletter subscriber administration and campaign management.
- Support metrics and Support-management entry points.

Sensitive admin operations are implemented through RLS-protected tables, admin-checking RPCs, and Edge Functions where service-role access is required.

## Support System

The Support system separates customer-facing and staff-facing workflows:

- `profile.html` and `account.js` let authenticated customers create or view their own requests, read messages, reply, see unread state, and continue open conversations.
- `support.html` and `support.js` provide the staff workspace for authorized Support employees and Support administrators.
- `support_users` represents Support membership and distinguishes Support administrators from active Support employees.
- `support_requests` stores request subject, category, status, ownership, assignment, and timestamps.
- `support_messages` stores customer and staff messages.
- `support_request_read_states` stores customer read state and supports unread counts.

Staff can search and filter requests, claim or assign work, reply, and resolve requests. Customers can reply through `add_customer_support_message`; resolved requests remain readable but are not replyable through the customer UI.

RLS policies distinguish:

- Customers reading only their own requests and messages.
- Support employees reading and operating on the Support queue within their allowed actions.
- Support administrators managing Support access and broader Support data.

The repository contains Support UI and messaging. A separate notification provider or automatic Support email notification flow is not established by the inspected source.

## Newsletter

Public newsletter forms use `newsletter.js` and the `subscribe_to_newsletter` RPC. Newsletter data is stored in `newsletter_subscribers`.

The admin workspace provides subscriber overview/search/status management and campaign management. Campaign data is stored in:

- `newsletter_campaigns`
- `newsletter_campaign_deliveries`
- `newsletter_unsubscribe_tokens`

The `newsletter-campaign` Edge Function handles authorized test/send delivery through Resend, recipient snapshots, unsubscribe-token generation, HTML sanitization, and campaign status transitions. The `newsletter-unsubscribe` Edge Function accepts token-based unsubscribe requests without requiring a logged-in user.

## User Safety & Enforcement

Policy and enforcement state is persisted in:

- `user_policy_acceptances`
- `user_policy_violations`
- `user_bans`
- `user_enforcement_reconciliations`

The client checks current policy versions and uses `accept_current_policy_versions`. Database-side ban checks include `is_current_user_banned` and `assert_current_user_not_banned`. Banned-user policies restrict profile, cart, and reservation-related operations.

Administrative ban/unban actions are mediated by the `admin-user-enforcement` Edge Function and service-role/audit RPCs. The repository does not treat client-side hiding as the authorization boundary.

## Database

The database is managed through Supabase migrations. Important current domain tables include:

- **Identity and authorization:** Supabase Auth users, `profiles`, `admin_users`, `support_users`.
- **Catalog:** foundational `events`, `venues`, `bands`, `ticket_types`, plus `categories` and `venue_catalog`.
- **Commerce:** `cart_items`, `orders`, `order_items`.
- **Seating:** `venue_sections`, `venue_seats`, `event_seats`, `event_section_configs`, `event_seat_layouts`, `event_hall_map_configs`, `event_hall_map_sections`.
- **Homepage and display:** `homepage_hero_configs`, `homepage_hero_slots`, `homepage_upcoming_shows_configs`, `homepage_upcoming_shows_custom_events`.
- **Analytics:** `event_views`, `cart_additions`, `event_shares`.
- **Support:** `support_requests`, `support_messages`, `support_request_read_states`.
- **Newsletter:** `newsletter_subscribers`, `newsletter_campaigns`, `newsletter_campaign_deliveries`, `newsletter_unsubscribe_tokens`.
- **Policy and enforcement:** `user_policy_acceptances`, `user_policy_violations`, `user_bans`, `user_enforcement_reconciliations`.
- **Verification:** `email_change_verifications`.

Relationships are enforced through foreign keys, unique constraints, checks, triggers, and RPC validation where applicable. The active migration directory contains the current migration history; `supabase/migrations-archive/` contains archived migrations and should not automatically be replayed as current history.

## RPC Functions

The database exposes many functions; the important families are:

### Public content and analytics

- `get_homepage_hero_events`
- `get_homepage_upcoming_shows`
- `record_event_view`
- `record_event_share`

### Reservations and seating

- `get_event_seat_map`
- `get_event_ticket_legend`
- `reserve_event_seat`
- `release_event_seat`
- `expire_event_seat_reservations`
- `checkout_reserved_event_seats`

### Dashboard and account security

- `get_user_dashboard_overview`
- `accept_current_policy_versions`
- `is_current_user_password_configured`

### Administration

- Event creation and deletion/wizard functions.
- Event inventory, ticket-type, zone, and hall-map configuration functions.
- Homepage hero/upcoming-show configuration functions.
- `get_admin_event_analytics`
- `get_admin_users`, `get_admin_users_summary`, and `get_admin_user_detail`
- Newsletter overview, subscriber, campaign, and deletion functions.

### Support

- `create_authenticated_support_request`
- `add_customer_support_message`
- `reply_to_support_request`
- `claim_support_request`
- `assign_support_request`
- `resolve_support_request`
- `mark_support_request_read`
- `get_support_unread_state`
- Support membership grant/revoke functions

### Newsletter and enforcement

- `subscribe_to_newsletter`
- Policy, ban, unban, violation, and reconciliation functions used by the admin and Edge Function flows.

Many administrative and reservation functions are `SECURITY DEFINER` functions. Their source should be reviewed in the migrations before changing grants or execution privileges.

## Edge Functions

The checked-in functions are:

| Function | Responsibility |
| --- | --- |
| `email-change` | Authenticated current-password verification, eight-digit OTP generation, hashed OTP persistence, expiry/attempt/cooldown controls, and Resend delivery |
| `delete-account` | Password-confirmed authenticated deletion, cart cleanup, Auth/profile deletion, and preservation of demo orders with their user link cleared; independent Support, newsletter, enforcement and uploaded-image records can remain |
| `admin-delete-user` | Admin-only deletion of eligible non-admin users with reconciliation checks |
| `admin-user-enforcement` | Admin-only Auth ban/unban actions plus enforcement audit and reconciliation records |
| `newsletter-campaign` | Admin-only campaign test/send delivery through Resend, snapshots, unsubscribe tokens, sanitization, and campaign state changes |
| `newsletter-unsubscribe` | Token-based unauthenticated unsubscribe flow using hashed one-time tokens |

`supabase/config.toml` explicitly sets JWT verification for `admin-user-enforcement` and `admin-delete-user`, and disables it for `newsletter-unsubscribe`. Other function deployment settings must be verified in the Supabase project rather than inferred from this file alone.

Required server-side configuration names used by the functions include `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` or `NEWSLETTER_FROM`, `OTP_HASH_SECRET`, and `SITE_URL`. Their values must remain in the Supabase/Edge Function environment and are intentionally not documented here.

## Security

The implementation uses layered controls rather than relying on frontend visibility:

- **RLS:** Newer domain tables enable Row Level Security and define customer, Support, and admin policies. Direct grants are restricted or revoked where the operation is intended to go through an RPC or Edge Function.
- **Role separation:** Admin authorization is represented by `admin_users`. Support membership is represented separately by `support_users`, with Support administrator and employee checks.
- **SECURITY DEFINER:** Database functions perform atomic operations and privileged reads/writes where needed. Several functions set an empty `search_path` and perform explicit role/user checks.
- **Authorization checks:** Admin, Support, customer ownership, authenticated-user, and banned-user checks are enforced in database policies/functions and, for service-role operations, in Edge Functions.
- **Reservation protections:** Seat status, uniqueness, foreign keys, expiry, release, and checkout RPCs protect exact-seat inventory from conflicting reservations.
- **Policy enforcement:** Current policy acceptance is persisted and checked before protected application use. Bans affect profile, cart, and reservation-related operations.
- **Sensitive operations:** Account deletion, admin user deletion, enforcement, email-change delivery, and newsletter delivery run through server-side Edge Functions when service-role or external-provider access is required.
- **Client rendering:** Message bodies and other user-provided text are rendered with text-safe DOM APIs or escaping in the relevant frontend code.
- **Secrets:** Service-role keys, Resend keys, OTP hashing secrets, and other private values are not part of browser configuration or this README. The browser configuration contains only the Supabase project endpoint and publishable client key.

These are implemented protections, not a guarantee that the application is fully secure. Supabase project configuration, Auth providers, Storage policies, grants, deployed functions, and secrets must be audited in the target environment.

## SEO

The repository includes:

- `CNAME` for `ivenue.site`.
- `robots.txt` with crawler access for public pages and exclusions for admin, account, checkout, ticket-selection, and recovery pages.
- `sitemap.xml` listing the main public and legal pages.
- Canonical, Open Graph, title, description, and robots metadata on the principal public/legal pages.

Some authenticated or non-public pages intentionally have limited SEO metadata. `getTickets.html` currently has the generic title `Document`, which is a known metadata limitation in the current repository.

## Local Development

There is no local frontend build step. Use any static file server from the repository root:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>.

The application expects:

1. A browser-compatible static server rather than `file://` for flows that use redirects, modules from CDNs, or Supabase Auth.
2. The Supabase JS CDN script loaded before `supabase-config.js`.
3. A valid Supabase project configured in `supabase-config.js`.
4. Auth redirect URLs, Google/Facebook providers, Storage, RLS, RPCs, and Edge Functions configured in the Supabase project.
5. Edge Function secrets configured server-side for email-change, deletion, enforcement, and newsletter operations.

Do not place service-role credentials, Resend API keys, OTP secrets, or other private values in frontend files.

## Supabase Development

The repository includes:

- `supabase/config.toml`
- `supabase/migrations/`
- `supabase/migrations-archive/`
- `supabase/functions/`
- `deno.json` and `deno.lock`

The active migration directory contains the current migration history and the archive contains older migrations. Because the active migrations extend foundational tables that are not all created in this repository, a clean local database may require the project's existing baseline schema or a linked Supabase project before the migrations can be replayed successfully.

When using the Supabase CLI, link to the intended project and review migration history before applying changes. Deploy Edge Functions and configure their secrets through Supabase tooling or the Supabase dashboard; never commit those secrets.

Login-security deployment is phased. Apply `20261005000000_login_security_trusted_devices.sql` and `20261005010000_login_security_backend_enforcement.sql` as additive migrations before deploying the protected Edge Functions and frontend. Apply `20261005020000_login_security_legacy_rpc_cutover.sql` only after those deployments and live verification; it removes the legacy customer reservation RPC path.

## Deployment

The repository is structured for static hosting and contains `CNAME` with the custom domain `ivenue.site`. The frontend has no build output or server process. A deployment must serve the repository root and provide the corresponding Supabase project configuration.

The repository alone cannot verify the current hosting provider, Supabase project state, Auth provider settings, Storage bucket policies, deployed Edge Function versions, or production secrets. Confirm those settings in the target environments before deploying.

## Educational Project Notice

iVenue is an educational/portfolio project. It demonstrates event discovery, venue presentation, ticket inventory, exact-seat reservation, account management, administration, Support, newsletters, and policy/enforcement workflows.

The inspected implementation does not include a real external payment processor or card-payment integration. Checkout currently focuses on validating reservations and handling order/reservation data.

## Current Status

The repository contains a broad, functionally integrated static frontend and Supabase backend surface, including customer, staff, and admin workflows. The current source supports the features described in this document.

“Functionally complete” should be understood in the context of the checked-in implementation. Production readiness still depends on separately verifying the Supabase schema baseline, deployed migrations, RLS/grants, Auth/OAuth configuration, Storage policies, Edge Function deployment, email-provider configuration, hosting, and payment requirements.
