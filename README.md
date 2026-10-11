# UNCover

UNC Chapel Hill event discovery built with TanStack Start, React, TypeScript and Tailwind v4.

## Run locally

```sh
bun install
cp .env.example .env
# Configure your Supabase project in .env.
bun run dev # http://localhost:8080
bun run test
bun run build
bun run start # production Node server, default port 3000
```

The build uses standard Vite and TanStack Start plugins with Nitro's Node server target.

## Features

- Discover real event listings, filter by date/category, and browse approximate venue pins on an OpenStreetMap map.
- Save events, build a plan with overlap warnings, view the calendar, and export an .ics file.
- Rank events using fixed topic/category weights, timing and category variety. Swipes adjust those weights locally; no predictive model or provider requests.
- Optional email/password and Google sign-in through Supabase. Google requires configuration in your own Supabase project, including allowed redirect URLs.
- Account state sync and members-only club chats through Supabase with RLS and server functions.

## Events and configuration

Independent source adapters refresh in parallel only during a protected admin or scheduled refresh. Feed reads use persisted Supabase snapshots with a 15-minute read cache. Failed sources retain usable snapshots for up to eight days. If none are usable, the feed is empty and unavailable; fixtures are only used in tests.

Set `ADMIN_IMPORT_TOKEN` to enable manual refresh at `/admin`. Scheduled requests to `/api/public/hooks/refresh` need `CRON_SECRET` (optional rotation via `CRON_SECRET_PREVIOUS`). Configure scheduling on your own host. `DATABASE_URL` is used by Drizzle migrations; server operations need `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Only public project URL/key use the `VITE_` prefix. Ticketmaster is optional.

Existing hosted data is not migrated or deleted by changing this repository. To move providers, provision your own Supabase project and apply the retained schemas/migrations before pointing the app at it.

See [contracts](CONTRACTS.md) and [ingestion](docs-ingestion.md).

## Photon iMessage

Photon messaging is available from Plan: account linking, opted-in reminders, club commands and keyword/date searches over imported events. It uses a separate always-on Spectrum agent and Supabase service-only RPCs; no AI integration is required. See [agent setup](agent/README.md). Apply the Photon migration to the website's database and configure the website's Photon settings plus `SUPABASE_SERVICE_ROLE_KEY`. The agent requires matching project/token settings, its Spectrum project secret and the reachable website URL. Code being present does not indicate a live line or confirmed delivery.
