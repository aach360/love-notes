<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Shared models live only in `src/shared/types.ts`; modules import from there so four teammates can work in parallel.
- Feature code lives in `src/modules/<area>/` (ingestion, discovery, recommendations, plan, assistant); routes stay thin.
- External event sources are independent `SourceAdapter`s aggregated in parallel; Heel Life tries replaceable transports in order (undocumented JSON endpoint, then RSS) so the unofficial API can be swapped without touching the importer.
- The app never shows demo events: when no source has a usable snapshot the feed is `unavailable` and empty; fixtures live only in src/test, so fake data can never mix with real listings.
- User state goes through `UserStateStorage` (localStorage today) so authenticated persistence can replace it without UI changes.
- Provider keys (Gemini, ElevenLabs, admin token) are read only inside server function handlers; unconfigured integrations return an explicit "unconfigured" status, never fake success.
- Visual styling uses the aero utilities in `src/styles.css` (aero-btn, aero-panel, aero-solid, bubble); components don't hardcode colors.
- Club chats live in Lovable Cloud and are reached only through server functions using a hashed anonymous device token; tables have no public policies so members-only chats can't be read directly.
- The Photon Spectrum iMessage agent runs as a separate long-lived process in `agent/` and calls `/api/public/agent/*` with a bearer token, because Spectrum's message stream can't run in edge workers.
- The Discover filters live in FilterSidebar (hover/tap-reveal from the left edge) so the swipe card keeps the full height; filter state stays in the Discover route.
- AI enrichment runs only inside the admin refresh request (bounded count/concurrency/time) and feed reads apply cached results, because edge runtimes may kill detached background work.
- Rameses' replies are written by `askAssistantAI` (src/modules/assistant/assistant.functions.ts) over a shortlist of already-imported events, and every event id the model names is checked against that shortlist before it renders; when the gateway is unavailable or unusable the deterministic `askAssistant` matcher answers instead, because the assistant must never invent an event.
- Calendar export is client-side RFC 5545 in src/modules/plan/ics.ts from local plan/saved state; no server or subscription feed, because user state is device-local.
- Poster scanning sends a browser-downscaled image to a server function that reads it with Gemini (strict JSON, visible text only) and matches the feed/clubs by token overlap; nothing is stored, because photos may contain people.
- Signed-in users' whole UserState is one RLS-owned jsonb row (user_app_state) synced by CloudSync (account replaces device state on load, debounced saves); profiles.onboarded_at gates the 5-card onboarding, because it keeps UserStateStorage's shape unchanged.
- Exploration is a slot policy layered on the LinUCB+MMR order in engine.ts (no second recommender); picked cards drop their UCB bonus so exploration is not double-counted, and swipes record `exploratory` for diagnostics.
- Discover lifecycle is owned by SwipeDeck (idle→dragging→details or exiting→settling→entering); pin the entire visible event snapshot across feed/vector refreshes, record its captured feedback exactly once on transitionend (with a fallback), and wait for ranking to remove it before selecting a new card, so no stale runner-up flashes. Details use that snapshot and never record feedback.
- The Discover map uses Leaflet with OpenStreetMap tiles (no key) and a reviewed building-level venue table in src/modules/map/venues.ts; pins are always labelled approximate and unmatched/online events stay in a separate list, because sources rarely give coordinates.
- Photon account linking and reminders live in `src/modules/assistant/messaging`; `photon_*` tables and service-only RPCs atomically commit inbound effects, lease sends, and enforce consent. Preserve the claim → final check → provider submission → acknowledgement protocol. A provider timeout is `unknown`, never an automatic resend. The legacy local reminder preference is not consent for real delivery.
