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
- External event sources are independent `SourceAdapter`s aggregated in parallel (see docs-ingestion.md); the undocumented Heel Life JSON endpoint is not registered — Heel Life uses RSS.
- User state goes through `UserStateStorage` (localStorage today) so authenticated persistence can replace it without UI changes.
- Provider keys (Gemini, ElevenLabs, admin token) are read only inside server function handlers; unconfigured integrations return an explicit "unconfigured" status, never fake success.
- Visual styling uses the aero utilities in `src/styles.css` (aero-btn, aero-panel, aero-solid, bubble); components don't hardcode colors.
- Club chats live in Lovable Cloud and are reached only through server functions using a hashed anonymous device token; tables have no public policies so members-only chats can't be read directly.
- The Photon Spectrum iMessage agent runs as a separate long-lived process in `agent/` and calls `/api/public/agent/*` with a bearer token, because Spectrum's message stream can't run in edge workers.
- The Discover filters live in FilterSidebar (hover/tap-reveal from the left edge) so the swipe card keeps the full height; filter state stays in the Discover route.
- AI enrichment runs only inside the admin refresh request (bounded count/concurrency/time) and feed reads apply cached results, because edge runtimes may kill detached background work.
- Calendar export is client-side RFC 5545 in src/modules/plan/ics.ts from local plan/saved state; no server or subscription feed, because user state is device-local.
- Poster scanning sends a browser-downscaled image to a server function that reads it with Gemini (strict JSON, visible text only) and matches the feed/clubs by token overlap; nothing is stored, because photos may contain people.
- Signed-in users' whole UserState is one RLS-owned jsonb row (user_app_state) synced by CloudSync (account replaces device state on load, debounced saves); profiles.onboarded_at gates the 5-card onboarding, because it keeps UserStateStorage's shape unchanged.
- Exploration is a slot policy layered on the LinUCB+MMR order in engine.ts (no second recommender); picked cards drop their UCB bonus so exploration is not double-counted, and swipes record `exploratory` for diagnostics.
- Discover card lifecycle is owned by SwipeDeck (idle→dragging→exiting→entering); the exiting card is captured and feedback is recorded on transitionend, and only abstract backplates render behind it, so a runner-up is never shown and then replaced.
