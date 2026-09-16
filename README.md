# The Launch / iVenue

The Launch is an iVenue music venue site with show discovery, ticket-cart support, account management, and Supabase-backed authentication.

## Features

- Responsive show discovery, venue, contact, and ticket pages
- Show carousel with dot, mouse-wheel, and trackpad navigation
- Authentication: registration, login, email verification, password reset, and account dashboard
- Account security controls for password and email changes
- Two-stage email-change flow: current-password confirmation, then an 8-digit email verification code
- Event cart and account order/cart views
- Supabase Edge Function integration for email-change verification and Resend delivery

## Project Structure

- `index.html` - Landing page
- `shows.html`, `venue.html`, `contact.html` - Public venue pages
- `login.html`, `register.html`, `forgot-password.html`, `reset-password.html`, `verify-email.html` - Authentication pages
- `profile.html` - Account dashboard and Change Email modal
- `main.css`, `auth.css` - Shared site and account/authentication styles
- `auth.js`, `auth-ui.js`, `email-change.js` - Client-side account flows
- `supabase/functions/email-change/index.ts` - Protected email-change Edge Function

## Run Locally

No build tools or dependencies are required. Open `index.html` directly in a browser, or serve the folder with any static file server:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Supabase configuration

The client configuration is in `supabase-config.js`. The email-change flow requires the `email-change` Edge Function and its configured server-side secrets:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `OTP_HASH_SECRET`
- Supabase service-role credentials supplied by the Edge Function runtime

Never place service-role keys or Resend API keys in browser code.

## Deployment

This project can be deployed to GitHub Pages or any static hosting service. Set the publishing source to the repository's main branch and use the repository root as the site directory.
