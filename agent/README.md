# PulseMatch iMessage agent (Photon Spectrum)

Texts in, club chats out — one place for every club instead of scattered group chats.

1. Sign up at https://app.photon.codes/dashboard (promo `HACKWITHPHOTON`) → get your project secret. Our project ID is `440f4b28-11a2-46d8-b24a-5dc0d7f5452f`.
2. Add a phone number to your Photon account (avatar menu, top-right) — Spectrum can't enroll you on the project until you do.
3. In `agent/`, copy `.env.example` to `.env` if you don't already have one. Fill in `SPECTRUM_PROJECT_SECRET` and a long random `PHOTON_AGENT_TOKEN`; confirm `PULSEMATCH_URL` points to your website. `.env` is ignored by Git.
4. Set the website's server secret `PHOTON_AGENT_TOKEN` to exactly the same value as in `agent/.env`.
5. `cd agent && bun install && bun start`. Bun automatically loads `agent/.env` when run from this folder. Keep the process running to receive and send texts.

The helper accepts `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET`, with legacy `PROJECT_ID` and `PROJECT_SECRET` as fallbacks. The `SPECTRUM_` values take precedence. Never commit project secrets or agent tokens.

Alternative: scaffold a fresh Spectrum project with `bun create spectrum-project@latest pulsematch --projectId 440f4b28-11a2-46d8-b24a-5dc0d7f5452f --providers imessage --yes` (writes a .env with credentials), then copy our `index.ts` logic into it.

Commands people can text: `join CODE Name`, `ask what's on tonight`, `alerts on|off`, `CODE message`, `help`.
Anything else posts to the sender's most recent club. Website messages are mirrored back every ~5s.

The Spectrum API used here is verified against `spectrum-ts@12.10.1`: `app.messages` yields `[space, message]`, text arrives as `message.content = { type: "text", text }` (or `{ type: "markdown", markdown }`), replies go through `message.reply(string)` / `space.send(string)`, and the sender phone is `message.sender.id`.
