# Team workflow

These are **planned** branches for the exported repo (not created yet).

| Branch | Owns | Code |
|---|---|---|
| `feat/event-ingestion` | adapters, normalization, DB schema, Gemini | `src/modules/ingestion/`, `supabase/schema.sql` |
| `feat/swipe-ui` | Discover, cards, Saved, filters, visual polish | `src/modules/discovery/`, `src/routes/index.tsx`, `src/routes/saved.tsx`, `src/components/` |
| `feat/recommendations` | swipe handling, persistence, ranking | `src/modules/recommendations/` |
| `feat/chat-audio` | Assistant, Photon, ElevenLabs, reminders, Plan UI | `src/modules/assistant/`, `src/modules/plan/`, `src/routes/assistant.tsx`, `src/routes/plan.tsx` |

## Shared files (change only with a heads-up in team chat)
- `src/shared/types.ts`, `src/shared/time.ts`, `CONTRACTS.md` — any field change needs all four owners' OK; add fields as optional first.
- `src/fixtures/demo-events.ts` — append only.
- `src/styles.css` (design tokens) — owned by swipe-ui.
- `src/routes/__root.tsx`, `src/components/AppShell.tsx` — owned by swipe-ui.
- Database migrations — owned by event-ingestion. One migration file per PR, timestamp-prefixed, never edit a merged one.

## Integrating
1. Rebase on `main` daily. 2. `bun run test` must pass. 3. Keep public function signatures in CONTRACTS.md stable; update the doc in the same PR if you change one.
