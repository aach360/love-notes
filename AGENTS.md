## Architecture rules

- Shared models live only in `src/shared/types.ts`; modules import from there so four teammates can work in parallel.
- Feature code lives in `src/modules/<area>/` (ingestion, discovery, recommendations, plan, auth, clubs, map); routes stay thin.
- External event sources are independent `SourceAdapter`s aggregated in parallel; Heel Life tries replaceable transports in order (undocumented JSON endpoint, then RSS) so the unofficial API can be swapped without touching the importer.
- The app never shows demo events: when no source has a usable snapshot the feed is `unavailable` and empty; fixtures live only in src/test, so fake data can never mix with real listings.
- User state goes through `UserStateStorage` (localStorage today) so authenticated persistence can replace it without UI changes.
- Visual styling uses the aero utilities in `src/styles.css` (aero-btn, aero-panel, aero-solid, bubble); components don't hardcode colors.
- Club chats live in Supabase and are reached only through server functions using a hashed anonymous device token; tables have no public policies so members-only chats can't be read directly.
- The Discover filters live in FilterSidebar (hover/tap-reveal from the left edge) so the swipe card keeps the full height; filter state stays in the Discover route.
- Calendar export is client-side RFC 5545 in src/modules/plan/ics.ts from local plan/saved state; no server or subscription feed, because user state is device-local.
- Signed-in users' whole UserState is one RLS-owned jsonb row (user_app_state) synced by CloudSync (account replaces device state on load, debounced saves); profiles.onboarded_at gates the 5-card onboarding, because it keeps UserStateStorage's shape unchanged.
- Discover lifecycle is owned by SwipeDeck (idle→dragging→details or exiting→settling→entering); pin the entire visible event snapshot across feed refreshes, record its captured feedback exactly once on transitionend (with a fallback), and wait for ranking to remove it before selecting a new card, so no stale runner-up flashes. Details use that snapshot and never record feedback.
- The Discover map uses Leaflet with OpenStreetMap tiles (no key) and a reviewed building-level venue table in src/modules/map/venues.ts; pins are always labelled approximate and unmatched/online events stay in a separate list, because sources rarely give coordinates.

- Photon messaging runs in the separate long-lived `agent/` process. Its bearer-authenticated server routes and service-only database RPCs own account linking and reminder consent. Preserve claim → final check → provider submission → acknowledgement; provider timeouts are unknown and never automatically resent. Event replies use deterministic lookup over imported listings, with no AI provider.
