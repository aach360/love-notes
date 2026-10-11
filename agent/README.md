# Photon iMessage agent

The app uses Photon Spectrum Cloud (`spectrum-ts` pinned to 12.10.1). This is a separate, always-on Bun process. It receives direct messages, queues bot replies, mirrors explicit club posts, and checks for due event reminders. The website stays on its existing TanStack deployment.

## Deployment

1. Apply `supabase/migrations/20261010000000_photon_messaging.sql` to the **same database used by the website**, through its normal migration process. It requires the existing `clubs`, `club_members`, `club_messages`, `user_app_state`, and Supabase auth tables. No live migration is performed by starting the agent.
2. In [Photon](https://app.photon.codes/), select your project and provision/enable its iMessage line. Obtain its project ID, project secret, and actual bot address. Do not assume the example project belongs to your account.
3. Set these **website server secrets**: `PHOTON_PROJECT_ID`, `PHOTON_AGENT_TOKEN`, `PHOTON_BOT_ADDRESS`. Keep the existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and authenticated Supabase configuration. Set a cryptographically random token, at least 32 random bytes. The app does not need the Photon project secret.
4. Copy `agent/.env.example` to `agent/.env`. Set `SPECTRUM_PROJECT_ID` to the website's `PHOTON_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET` from Photon, `PULSEMATCH_URL` to the deployed website, and the **identical** `PHOTON_AGENT_TOKEN` used by the website.
5. From `agent/`, run `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, then `bun start`.
6. Run the process under your host's restart supervisor. Mount `PHOTON_STATE_DIR` on a private persistent volume. A sleeping laptop or an ephemeral deployment does not provide continuous reminders.
7. Deploy the website and agent together; the new outbox protocol is incompatible with the previous timestamp cursor. Stop the old agent before starting the new one.

Keep `.env` and the local `.state` journal out of Git. The journal retains incoming messages until the website acknowledges them and send receipts until recorded. It is private user data. Do not log its contents or upload it to error trackers.

## Connect and use

Sign in to the app, open Assistant or Plan, and choose **Connect iMessage**. Text the generated `link CODE` to the displayed bot address. Return to the app and confirm the sender address. Codes expire after ten minutes and cannot be reused. Confirming a connection does not enable reminders.

Enable plan reminders separately and choose 15, 30, or 60 minutes. Reminders use the latest **saved cloud plan**. Unsynced browser changes are not available to the server. The old local-only `remindersOptIn` flag does not opt anyone into this new delivery system.

Text commands:

- Ask an ordinary question, or use `ask <question>`.
- `plan` shows your linked account's saved plan.
- `reminders on` enables plan reminders at the selected lead time (30 minutes initially).
- `reminders off` disables all event reminders, including individual requests.
- `remind EVENT_ID 30` requests a specific event reminder. Suggested events include their exact IDs. Supported lead times are 15, 30, and 60 minutes.
- `cancel EVENT_ID` disables both individual and plan reminders for that event.
- `STOP` suppresses all outbound messages, including club mirrors and alerts. `START` allows replies again but does not restore old reminder subscriptions.
- `join CODE YourName`, `CODE message`, and `alerts on/off` preserve explicit club features. Ordinary text is now private to the assistant, rather than posted into the most recent club.

Only direct messages are processed. Group chat commands are ignored. Conversation and bot-line identifiers are persisted so replies and reminders work after restart.

## Scheduling and delivery behavior

Event ingestion remains twice weekly. Polling checks persisted snapshots and never fetches event publishers. The final reminder check bypasses the app's response cache so it sees the latest stored cancellation, location, or start time.

Timed reminders require a real, fresh, non-cancelled event that starts today or later in America/New_York and has not started. All-day and unknown-time events are excluded. A reminder can run up to five minutes late, but never after the event starts. Old reminders and club mirrors are not replayed in a burst after a long outage. The last-minute source changes that were not imported cannot be detected.

The database atomically deduplicates inbound commands and their replies, leases outgoing work, and rechecks account ownership, consent, and plan membership before submission. The agent records provider acceptance separately from delivery: **sent means accepted by Photon, not confirmed delivered or read**.

If a provider request times out or the process stops mid-send, the outcome is marked `unknown` and is not resent automatically. This avoids blind duplicates but may require manual reconciliation. The connection panel exposes unknown outcomes. There is no claim of exactly-once network delivery.

A leased job can be recovered before submission. A job interrupted during submission is retained as unknown. Per-message failures cannot silently advance a global timestamp cursor. The local inbound journal retries website failures; it cannot recover messages that Photon never delivered while the agent was offline.

Website status is based on a recent successful agent poll. A missing configuration shows unconfigured; a missing migration/database error shows unavailable; an expired heartbeat shows offline. This is a liveness signal, not a guarantee that a particular device received a text.

For the first deployment, run one agent process and keep contact volume modest. The current club scan reads at most 200 recent messages per membership per poll. Monitor polling latency and queue age before expanding campus-wide usage.

## Verification

From the repo root: `bun run test`, `bunx tsc --noEmit`, and `bun run build`.
From `agent/`: `bun run typecheck` and `bun test`.

The app tests include an isolated embedded PostgreSQL instance for the actual migration and transactions; they never use the live database. Agent tests use fake provider responses and temporary journals. A live smoke test still requires the configured account: link your own device, ask for an event, schedule a future reminder, receive it, then verify STOP prevents the next one. Never use unrelated contacts for tests.

## References

- [Spectrum SDK](https://github.com/photon-hq/spectrum-ts)
- [Messages and direction filtering](https://photon.codes/docs/spectrum-ts/messages)
- [Restoring spaces](https://photon.codes/docs/spectrum-ts/spaces-and-users)

This follows the repository's long-lived agent architecture; it does not use the deprecated Advanced iMessage Kit or add a second webhook transport.
