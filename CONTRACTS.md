# PulseMatch contracts

All models live in `src/shared/types.ts` (single source of truth). `T | null` = "source didn't say" — never invent values.

## Models
- **PulseEvent** — required: `id`, `source`, `sourceEventId`, `title`, `startsAt` (ISO w/ offset), `timezone`, `categories[]`, `tags[]`, `status`, `lastFetchedAt`, `isDemo`. Nullable: `sourceUrl`, `description` (plain text), `endsAt`, `location`, `organizer`, `imageUrl`, `costAmount` (0 = confirmed free), `costText`, `eligibility`. Optional AI extras: `aiSummary`, `aiTags`.
- Stable id: `heellife:<id>` / `demo:<id>`. Dedupe key: source family + `sourceEventId` (`src/modules/ingestion/store.ts#dedupeKey`).
- **Swipe** `{eventId, direction: "like"|"pass", at}` · **SavedEvent** `{eventId, savedAt, event}` · **PlanItem** `{eventId, addedAt, event}` · **UserPreferences** `{weights, likeCounts, remindersOptIn}`.

## Services
| Function | Where | Input → Output |
|---|---|---|
| `listEvents()` | `modules/ingestion/events.functions.ts` (server fn) | → `EventFeed {events, origin, fetchedAt, warnings}` upcoming, deduped, non-ended |
| `refreshImport({token})` | same (server fn, protected by `ADMIN_IMPORT_TOKEN`) | → `{ok, result}` or `{ok:false, error}` |
| `SourceAdapter.fetchEvents({now, fetchedAt})` | `modules/ingestion/adapters.ts` | → `PulseEvent[]` (throw on failure → next adapter) |
| `enrichWithGemini({title, description})` | `modules/ingestion/gemini.ts` (server) | → `{status:"ok", data:{summary,tags}}` / `unconfigured` / `error` |
| `createEnrichmentCache().run(events, enrichFn)` / `.apply(events)` | `modules/ingestion/enrichment.ts` (server) | writes only `aiSummary`/`aiTags`; called by `forceImport` (admin), applied by `getFeed` |
| `recordSwipe(event, dir)` | `modules/recommendations/UserStateProvider.tsx` | updates swipes + prefs; like also saves |
| `getRecommendations({events, swipes, prefs, filters, now?})` | `modules/recommendations/ranking.ts` | → `RankedEvent[]` (filters first, swiped excluded) |
| `getSavedEvents` | `useUserState().state.saved` | → `SavedEvent[]` |
| `getPlan(items)` | `modules/plan/plan.ts` | → chronological `PlanEntry[]` with `overlapsWith` |
| `askAssistant(question, events, now?)` | `modules/assistant/assistant.ts` | → `{text, events (with sourceUrl), interpretation}` |
| `generatePlanAudio({text})` | `modules/plan/audio.functions.ts` (server fn) | → `{status:"ok", audioBase64, mime}` / `unconfigured` / `error` |
| `UserStateStorage.load/save/clear` | `modules/recommendations/storage.ts` | local demo session; swap for authed storage |

## Fixtures
`src/fixtures/demo-events.ts#buildDemoEvents(now)` — 12 demo events (relative dates, `isDemo: true`). Demo events are only shown when live sources fail, never mixed with real ones.
