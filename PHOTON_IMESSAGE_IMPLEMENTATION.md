# PulseMatch / UNCover — Photon iMessage implementation handoff

Prepared October 10, 2026 for `/Users/drp/love-notes/`.

## Task for the implementing AI

Connect the existing Photon Spectrum agent to the app so users can text the event assistant, link their app account, and receive explicitly requested event reminders while their browser is closed. Implement and test the work in this repository. This document itself does not activate messaging, apply database migrations, or contain credentials.

Read `AGENTS.md` first. Keep TanStack Start, React, the existing aero styling, shared models in `src/shared/types.ts`, and the established server-only secret boundaries. Preserve existing club chat functionality. Follow the repository's separate long-lived `agent/` architecture; do not put Spectrum's message stream inside an edge request handler.

## What is already in this repository

| File | Current behavior |
| --- | --- |
| `agent/index.ts` | Starts Spectrum, forwards inbound texts to the site, polls the outbox every five seconds. Conversation references currently live only in memory. |
| `agent/package.json` | Depends on `spectrum-ts: latest`; there is no reproducible version pin in this manifest. |
| `agent/.env.example` | Contains the project ID and placeholders for the project secret and site-to-agent token. |
| `agent/README.md` | Describes existing club commands and says its API usage was checked against Spectrum 12.10.1. Verify the package actually installed before changing calls. |
| `src/routes/api/public/agent/inbound.ts` | Supports club joining, questions prefixed with `ask`, club alerts, and posting texts into club chats. |
| `src/routes/api/public/agent/outbox.ts` | Returns club messages and new-event alerts. It records alerts as handed off before Photon confirms a send. |
| `src/modules/assistant/photon.ts` | Treats presence of the agent token as readiness. It does not verify connectivity. |
| `src/routes/assistant.tsx` | Calls that status helper from a UI component; move secret access into a server function. |
| `src/routes/plan.tsx` | Saves a reminder preference but explicitly says delivery is not connected. |
| `src/modules/auth/CloudSync.tsx` | Already synchronizes signed-in users' state to `user_app_state`. Use this rather than inventing a second account system. |
| `src/modules/assistant/assistant.functions.ts` | Grounded AI event answers with a deterministic fallback. Reuse its behavior for texts. |

The old general project description is out of date: this checkout already has sign-in and cloud state. Inspect current code rather than assuming all data is only in localStorage. Never print existing `.env` contents or write secrets into this file.

## Photon choice and setup

Use **Photon Spectrum Cloud**. The legacy `@photon-ai/advanced-imessage-kit` repository is deprecated; avoid replacing the existing Spectrum integration with legacy HTTP-proxy examples. [Legacy deprecation notice](https://github.com/photon-hq/advanced-imessage-kit).

Spectrum's current setup uses a project ID and project secret from the [Photon dashboard](https://app.photon.codes/), the `spectrum-ts` package, and its iMessage provider. The SDK supports a continuous message stream, matching this repository's architecture. [Spectrum repository](https://github.com/photon-hq/spectrum-ts).

1. In Photon, select the intended project and complete its current iMessage line setup. Record the actual reachable bot address; do not invent a phone number or promise one before provisioning succeeds. Check the dashboard's current plan and limits.
2. Keep the existing project ID only if this is the user's intended project. Obtain its real project secret from Photon.
3. Configure `agent/.env` from `agent/.env.example`:

   ```dotenv
   SPECTRUM_PROJECT_ID=your_project_id
   SPECTRUM_PROJECT_SECRET=your_project_secret
   PULSEMATCH_URL=https://your-deployed-site.example
   PHOTON_AGENT_TOKEN=your_random_shared_secret
   ```

4. Configure the website's **server environment** with the identical `PHOTON_AGENT_TOKEN` and its existing Supabase server credentials. The site does not need the Spectrum project secret under this architecture.
5. Add a server setting for the configured bot address, for example `PHOTON_BOT_ADDRESS`. This name is an app configuration choice, not a documented Photon credential.
6. Pin a tested Spectrum version, commit its lockfile, and start the agent from `agent/` with `bun install` then `bun start`. Use an always-on Node/Bun-compatible host with restart supervision for production. Closing a laptop stops a locally hosted agent.

Do not claim setup succeeded until a real inbound message and reply have been tested. Never send test messages to unrelated contacts. A missing project secret, token, database migration, or provisioned line must produce a useful unconfigured/error state.

Photon also offers signed webhooks, but they are an alternative deployment design, not needed alongside this repository's stream. Do not run both inbound transports without shared deduplication. [Photon webhook overview](https://photon.codes/docs/webhooks/overview).

## User experience

Add a reusable iMessage connection panel to Assistant and Plan, using the existing aero components.

- Signed-out visitors can browse events and use the on-site assistant. Explain that sign-in is needed to connect their personal plan to reminders.
- Signed-in users choose **Connect iMessage**. Show the real bot address and a short-lived linking command they can copy into Messages.
- Show separate connection and reminder states: not configured, agent offline, not linked, linked with reminders off, reminders enabled, or temporarily unavailable.
- A successful link is not reminder consent. Offer a separate, initially unchecked setting: **Remind me 30 minutes before events in my plan**.
- Allow changing the lead time to 15, 30, or 60 minutes, disabling reminders, and disconnecting the linked conversation.
- Show dates and times in `America/New_York`, labelled Eastern. On reminder confirmation, name the event and the actual scheduled reminder time.
- Never report registration, attendance, or delivery merely because a text was queued.

## Secure account linking

Create link codes only through an authenticated server function using the existing Supabase auth middleware. Derive the user ID from the verified session, never from a client-supplied ID.

Generate an unpredictable code, store only its hash, expire it after ten minutes, limit attempts, and invalidate earlier unused codes for that account. Suggested text command: `link CODE`.

When the verified agent forwards this command, atomically consume the code and bind the account to the actual incoming sender, Photon project, line, and conversation identifiers. Use provider-returned identifiers; do not build group IDs from user text. Restrict the first version to direct messages. A sender may be an iMessage email address rather than a phone number.

Require confirmation in the originating authenticated browser before enabling personal plan access. This helps prevent a copied or forwarded code from silently connecting the wrong person. Until confirmation, reveal no plan or account information in the conversation. Enforce one active link per account and per provider identity, and provide a clear unlink/relink path.

Only the linked identity can read that user's plan or alter their reminders. Do not make club membership sufficient authorization for personal account data.

## Bot behavior

Support these explicit commands initially:

| Command | Result |
| --- | --- |
| `help` | Concise instructions for linking, questions, reminders, and club posts. |
| `ask what's happening tonight?` | Grounded suggestions from the current event feed. |
| `plan` | The linked user's server-persisted plan, in time order. |
| `reminders on` | Enable reminders after a linked user receives a clear description of the default lead time. |
| `reminders off` | Disable reminders and invalidate pending reminder jobs. |
| `remind EVENT_ID 30` | Request a reminder 30 minutes before a specific event, after validating its ID, start time, and eligibility. |
| `cancel EVENT_ID` | Cancel that user's pending reminder for the event. |
| `STOP` | Immediately suppress outbound messages to this identity and cancel pending sends, including club alerts and mirrors. |
| `START` | Permit conversational replies again; do not silently re-enable old reminder subscriptions. |

Return short event references with suggestions so users can select the exact event. If supporting numbered replies, persist the conversation's recent results with an expiry. Ask which event when a title or “that one” is ambiguous.

Treat ordinary, unprefixed text as a question to the event assistant. **Change the current default that posts arbitrary text into the most recent club.** Preserve club posting through an explicit command, such as `CODE message`, and explain the change in `help`. A private bot question must not accidentally become a club post.

Refactor a reusable server-side answer function out of the existing assistant handler if necessary. It must use imported events, preserve source links and unknown facts, and fall back to the deterministic assistant when AI is unavailable. AI may interpret a request but must not choose an arbitrary recipient, fabricate an event, or claim a reminder was saved before the database write succeeds.

## Persistent records and access control

Add a versioned migration under `supabase/migrations/`; inspect the deployed schema before assuming `supabase/schema.sql` is authoritative. Suggested entities, adapted to the existing schema:

- `imessage_links`: account, provider project/line/conversation/sender identifiers, pending/confirmed state, consent timestamps, suppression flag, and last inbound time.
- `imessage_link_codes`: hashed code, authenticated account, expiry, and consumption time.
- `event_reminders`: account/link, occurrence ID, lead time, event version/start, due time, and status.
- `agent_inbox`: stable provider message identity, receipt time, processing state, and bounded retry details.
- `agent_outbox`: logical delivery key, link, payload reference, status, lease, attempt count, provider message ID, and timestamps.
- `agent_health`: authenticated heartbeat, agent version, and last successful poll.

Keep these server-owned with RLS and no broad public access. Expose narrowly scoped authenticated server functions for the user's own link and reminder settings. Use shared TypeScript contracts in `src/shared/types.ts`. Update generated database types through the repository's normal generation process, not unchecked casts scattered across features.

## Reminder scheduling

Keep event ingestion on the agreed **Monday and Thursday, 04:00 America/New_York** schedule. Reminder processing is separate: have the running agent request due work at least once per minute. Polling may be more frequent without fetching publishers again.

Create and reconcile reminder jobs from server-persisted plan changes, not browser timers. Reconcile again after event refreshes. A plan removal, opt-out, unlink, cancellation, or event time change must invalidate or update pending work. Do not rely only on the browser to cancel a job.

Before every send:

1. Confirm the link is still active and the recipient is not suppressed.
2. Confirm consent for the specific reminder or plan-reminder subscription.
3. Confirm a plan-derived reminder still belongs to the current plan.
4. Load the latest stored event and verify the requested occurrence. Reject demos and cancelled, ended, or previous-day-start events using the shared Discover date rules.
5. Require a known timed start. Do not interpret an all-day event's midnight as a meeting time. Explain when a timed reminder cannot be scheduled.
6. Recalculate the due time after any start-time change. Store instants in UTC and display Eastern time.
7. Claim the job atomically and recheck consent immediately before sending.

Suggested late-send policy: allow a reminder up to five minutes late only if the event has not started; otherwise mark it missed. Make this configurable and test it. Never send a burst of old reminders after an outage.

A twice-weekly snapshot cannot detect an organizer's last-minute change. Use source links in reminders and describe times as the latest imported information. If the relevant snapshot exceeds the established freshness limit or the event can no longer be verified, skip the reminder with a recorded reason instead of guessing. Do not add unbounded publisher requests to the outbox poll.

## Repair delivery reliability

The existing outbox is not a durable delivery queue. It advances a timestamp cursor and marks alerts before confirmed sending; the agent also forgets conversations at restart. Replace this handoff with claim-and-acknowledge behavior for club messages, alerts, bot replies, and reminders.

- Persist incoming provider message IDs. Ignore the agent's own messages using the actual installed SDK's direction field. Process each inbound side effect idempotently and keep one failed message from stopping the stream.
- Persist provider routing identifiers and resolve conversations through the installed Spectrum API after restart. Do not depend on the in-memory `spaces` map. Verify exact SDK methods against the pinned package.
- Use a stable unique key per logical delivery, such as reminder + event version + recipient. Use transactional leases so concurrent polls cannot send the same item simultaneously.
- A successful provider response records its returned message ID and an accepted/sent status. Mark delivered only if that provider actually supplies a delivery receipt that has been verified in the selected API.
- A failed send must not advance an irreversible cursor or mark a reminder delivered. Use bounded retry/backoff for definite failures.
- A timeout after submission is ambiguous: the provider might have accepted it. Use provider idempotency if supported by the pinned version, or reconcile the outcome before retrying. If reconciliation is unavailable, record `unknown` and surface it rather than promising exactly-once delivery or blindly duplicating the text.
- A database outage is an error, not an empty successful poll. Redact credentials, full message text, and recipient details from logs.

Add an authenticated heartbeat to distinguish “token configured” from “agent recently connected.” Return this public-safe status through a server function; never read `process.env` in a React-rendered component.

## Tests and completion criteria

Use the existing Vitest setup for domain and server behavior, and add agent-specific validation where needed. Required cases:

- Linking rejects expired, reused, incorrect, and cross-account codes; concurrent consumption succeeds only once.
- Unlinked senders cannot read plans, and a group message cannot link an account.
- Unprefixed questions never leak into club chats.
- Duplicate inbound delivery does not repeat mutations or replies; outbound echoes are ignored.
- Reminders are correct around Eastern midnight and both DST transitions.
- Cancellation, plan removal, time change, STOP, and unlink prevent queued sends.
- Concurrent workers claim once; restarts retain routing and pending work.
- Provider rejection, ambiguous timeout, database errors, and acknowledgement failure retain honest states.
- Missing credentials render unconfigured; an expired heartbeat renders offline; the client bundle contains no server secrets.
- Existing club, ingestion, plan, assistant, and date-filter tests continue to pass.

Run tests, type checking for both the app and agent, and the production build. Report existing unrelated failures separately. Apply migrations and configure deployment only when the target environment is known and access is available; never imply a saved SQL file has been applied.

Finish with changed files, checks run, pending deployment steps, and which live operations were actually verified. A working local test with mocked Photon is not evidence of real iMessage delivery.

## Official references

- [Photon dashboard](https://app.photon.codes/)
- [Spectrum SDK](https://github.com/photon-hq/spectrum-ts)
- [Photon architecture and providers](https://photon.codes/docs/spectrum-ts/introduction)
- [Spaces and users](https://photon.codes/docs/spectrum-ts/spaces-and-users)
- [Optional webhook transport](https://photon.codes/docs/webhooks/overview)
- [Webhook signature verification, if that transport is adopted later](https://photon.codes/docs/webhooks/verifying-signatures)

No Photon project secret, shared agent token, or database credential is supplied by this document. Configure those through the host's secret settings.
