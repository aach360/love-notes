# PulseMatch

Swipe-based UNC Chapel Hill event discovery. Built on TanStack Start + React + TypeScript + Tailwind v4.

## Run locally
```
bun install
cp .env.example .env   # fill what you have; everything is optional
bun run dev            # http://localhost:8080
bun run test           # dedupe, expiry, persistence, ranking, overlaps
```

## How events get in
- Server function `listEvents` aggregates independent source adapters in parallel (Heel Life RSS, UNC Calendar, UNC Libraries, Ackland, Morehead, Carrboro, Orange County, optional Ticketmaster). One failing source never erases the others; demo data appears only when every source fails. See docs-ingestion.md.
- Results are cached in server memory for 15 min (never fetched per swipe). Ended/cancelled events are dropped, duplicates merged by source + source ID.
- Manual re-import: open `/admin` and enter `ADMIN_IMPORT_TOKEN`. Without that secret, import is disabled server-side.
- Note: the default store is per server instance (in-memory). `supabase/schema.sql` is the proposed database version.

## Demo mode
No sign-up. Swipes, saved events, plan and preferences live in localStorage (`pulsematch:v1`) behind `UserStateStorage`.

## Integrations
| | Status |
|---|---|
| Heel Life JSON + RSS | Implemented |
| Recommendations (weighted category/tag) | Implemented |
| Assistant (rule-based, grounded in stored events) | Implemented |
| Gemini enrichment | Runs during the protected admin refresh (≤12 events, 2 at a time, ~25 s budget); results cached by event id + content hash **in memory only** (lost on restart). Feed reads use cached results and never wait on the model. Needs `GEMINI_API_KEY`. |
| ElevenLabs "Listen to my plan" | Implemented, needs `ELEVENLABS_API_KEY`; shows text itinerary otherwise |
| Photon messaging | Scaffolded interface only |
| Reminders | Opt-in preference stored; no delivery provider |
| Event suggestions / review queue | Not built |
| Auth + DB persistence | Not built (schema proposed) |

See `CONTRACTS.md` and `TEAM.md`.
