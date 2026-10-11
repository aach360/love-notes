# UNCitall backend setup

The app already uses the Supabase SDK and Photon Spectrum SDK. Provider credentials and dashboard configuration are still required. Removing a frontend dependency does not change the hosted database, OAuth provider, confirmation emails, or sender.

## Supabase project

1. Create a Supabase project you own named UNCitall. Keep its database password private.
2. Copy the project URL and publishable key into `.env`: set both `SUPABASE_URL` / `VITE_SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` to the corresponding values from this one project. Keep server credentials in ignored `.env.local`: add its server secret/service role key as `SUPABASE_SERVICE_ROLE_KEY` only. The existing tracked `.env` contains public configuration; never put private keys there. Never use a `VITE_` prefix for that key.
3. For a fresh empty project, run `supabase/bootstrap.sql` in its SQL editor; this combines the existing migrations in order. For an existing project, apply only missing migrations through its normal migration process. The standalone `supabase/schema.sql` is a historical proposed schema, not the complete migration chain. Changing keys does not migrate existing users, saved cloud state or club chats.
4. In Authentication → URL Configuration, set the Site URL to `http://localhost:8080` for local development and add `http://localhost:8080/auth` and `http://127.0.0.1:8080/auth` as redirect URLs. For deployment, set Site URL to your real app domain and add its `/auth` callback. Do not retain the previous hosted domain as the default.
5. After configuring custom SMTP, in Authentication → Email Templates → Confirm signup, use subject `Confirm your UNCitall account` and copy `supabase/templates/confirmation.html`. Its link uses Supabase's `{{ .ConfirmationURL }}` so the verification token is preserved.
6. Configure your own SMTP provider, sender email and display name `UNCitall`. Supabase's default email service is limited to project team addresses; custom SMTP is needed for other hackathon participants. Keep email confirmation enabled. Configure custom SMTP to deliver signup verification and password recovery emails.
7. For Google sign-in, create your own Google OAuth client with UNCitall branding and set its client ID/secret in Supabase's Google provider. Its authorized redirect URI is `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. Add your app's origin to the Google client's allowed JavaScript origins as appropriate.
8. Restart `bun run dev` after changing environment files. Existing sessions from the old project are separate from the new project's accounts. Test signup with an address you own, confirm the email, and verify it returns to your app.

`supabase/config.toml` and the template configure local Supabase development only; they do not update a hosted project by being committed.

## Event import

Set private random values for `ADMIN_IMPORT_TOKEN` and `CRON_SECRET`. Open `/admin` with the import token to refresh the public source adapters. Most event sources need no key. `TICKETMASTER_API_KEY` is optional. Configure the independent host's refresh schedule; the handler accepts Monday/Thursday's 04:00 America/New_York slot.

## Photon

Use your Photon project's ID, secret and provisioned iMessage bot address. Configure the website's `PHOTON_PROJECT_ID`, `PHOTON_AGENT_TOKEN`, and `PHOTON_BOT_ADDRESS`. Copy `agent/.env.example` to `agent/.env`; set `SPECTRUM_PROJECT_ID` to the same project, `SPECTRUM_PROJECT_SECRET` to its private secret, `PHOTON_AGENT_TOKEN` to the website's identical private token, and `PULSEMATCH_URL` to the reachable website. Localhost works only when agent and website share a machine.

Apply the Photon migration before starting the agent. Run `cd agent`, `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, and `bun start`. Keep it running. From Plan, sign in, connect iMessage, text the link code, confirm the sender, then opt in to reminders. No real messages are sent by the configuration checker.

## Verify configuration

Run `bun run check:integrations` for missing variable names without printing keys. Use `bun run check:integrations --online` to check direct Google OAuth readiness without signing in or sending an email.

Sources: [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Google OAuth setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

## Current local connection

Connected to the owned UNCitall project `ampjjabkrzwwgkizknih`; bootstrap and local `/auth` redirects are applied. The initial import persisted 874 real events from seven sources. Photon uses the existing project `440f4b28-11a2-46d8-b24a-5dc0d7f5452f`, and authenticated outbox polling and its database heartbeat were verified. Private credentials are in ignored `.env.local` and `agent/.env`.

Signup confirmation delivery through the configured Gmail SMTP was confirmed by the owner. Remaining: configure Google OAuth and add the deployed site URL when hosting is ready. The hosted UNCitall confirmation subject/body are now applied. These settings cannot be completed with placeholder credentials. The new project has separate accounts; previous users and chat history were not migrated.

## Club chat and iMessage

Club chat stays private behind server functions and device membership checks. In a club, use the iMessage panel to generate a fresh account code, text `link CODE` to your assigned Photon bot, and confirm your sender in the app. Then select **Enable this club on iMessage**. This joins your confirmed sender to this device’s club membership; other members cannot see your phone number. Text `CLUBCODE message` to post to that club. Messages from other members are relayed to enabled members over direct iMessage, with a ten-minute delivery window. Turn off club texts, leave the club, disconnect your account, or text STOP to pause delivery; queued club messages recheck membership before submission.

Photon Stable Free / Pro shared routing requires each exact iMessage sender to be registered in the Photon project's Users tab. Use that user's assigned bot number. This is currently an organizer dashboard step, not automatic registration from the app. Shared lines relay individual messages and do not create native iMessage groups. The local agent must stay running; deploy it to a persistent Bun/Node host for delivery after your computer shuts down.

The owner confirmed a real HELP reply, and the backend recorded the inbound message and a sent provider acknowledgement. Club linking and membership revocation are covered by the database integration test. A real multi-person club exchange still needs participant testing.

## Signup email delivery

Email confirmation remains enabled in the hosted project and local configuration. Custom SMTP is required to complete signup for participants outside the Supabase project team. Configure a provider, verified sender address, SMTP host/port/username/password, and sender name `UNCitall` in Authentication → Emails → SMTP Settings. Enter private SMTP credentials directly in that dashboard, not in chat or the tracked `.env`. After saving SMTP, apply `supabase/templates/confirmation.html` and test signup with an address you own.

### Current SMTP attempt

The hosted project has custom Gmail SMTP enabled (`smtp.gmail.com`, port 465). The sender name has been corrected to `UNCitall`. Gmail SMTP requires an eligible Google account with 2-Step Verification and an app password; a normal Google password will not work. Create the app password yourself and enter it directly into the Supabase SMTP Password field, then save. The sender address should match the authenticated Gmail account. Do not share the app password in chat. If Google does not offer App passwords for your account, choose a transactional SMTP provider instead.

The hosted confirmation email template was saved with subject `Confirm your UNCitall account` and the checked-in HTML, preserving `{{ .ConfirmationURL }}`. SMTP credential submission and successful signup delivery must be verified separately; a saved template alone does not confirm delivery.

SMTP settings were verified persisted after the owner saved the app password. The previous signup failures at 00:09 Eastern on October 11 were Gmail SMTP 534 / 5.7.9 (application-specific password required). Those failures preceded the credential update. A fresh signup and received confirmation email are still required to verify delivery after the update.
