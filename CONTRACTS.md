# UNCitall contracts

Shared models live in `src/shared/types.ts`. Null means the source did not provide a value.

- `PulseEvent` holds source facts and deterministic taxonomy labels with source-text evidence.
- `listEvents()` reads persisted snapshots; `refreshImport({token})` requires `ADMIN_IMPORT_TOKEN` and refreshes all independent source adapters.
- `getRecommendations()` applies date/category/cost filters, excludes swiped/planned events, then uses fixed weights, timing and category variety. `frozenId` preserves the visible card across refreshes when it remains eligible.
- `recordSwipe(event, direction)` adjusts local topic/category weights; a like saves the event. Undo restores the previous user state.
- `UserStateStorage` owns device persistence. `CloudSync` replaces state on account load and debounces writes to the user's RLS-owned `user_app_state` row.
- `getPlan()` orders selected events and flags overlaps. Client-side `ics.ts` exports saved/planned events.
- Clubs use hashed anonymous device tokens and server functions for membership and chat access; tables are not publicly readable.
- `src/test/fixtures/demo-events.ts` contains test fixtures. The production feed never shows them.

- Photon uses bearer-authenticated `/api/public/agent/inbound` and `/api/public/agent/outbox` routes. Database RPCs atomically commit inbound effects, lease sends and enforce consent. The separate agent performs a final send check, submits to Spectrum, and acknowledges acceptance or unknown outcome. Timeout outcomes are never automatically retried.
- `searchEvents()` answers text queries using keyword/date matching on imported listings only.
