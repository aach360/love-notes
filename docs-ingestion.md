# Event ingestion

Sources (registry in `src/modules/ingestion/importer.ts`), each an isolated `SourceAdapter`:

| Source | Transport | Key | Status |
|---|---|---|---|
| `heellife` | `https://heellife.unc.edu/events.rss` | none | live-tested |
| `unc-calendar` | Localist `calendar.unc.edu/api/2/events` (paged, 1.1 s between pages, cap 10 pages) | none | live-tested |
| `carrboro` | Carrboro Community Events iCalendar | none | live-tested |
| `ticketmaster` | Discovery API v2, postal 27514, 15 mi | `TICKETMASTER_API_KEY` | fixture-tested only; `unconfigured` without key |

The Heel Life `/api/discovery` JSON endpoint is excluded by robots.txt and is no longer used. Official JSON needs campus-issued Anthology Engage credentials (not obtained). Event IDs stay `heellife:<id>` on any transport.

Behaviour: 30-day window; 15-min cache per server instance with coalesced refreshes; each source independent; a failed source serves its last good snapshot (marked stale) for up to 6 h; expiry rechecked on every read; cancelled events removed and reported in `cancelledIds` so Saved/Plan flag them; demo events only when every source fails and nothing usable remains.

Contract changes (`src/shared/types.ts`): new `EventSource` values, optional `sourceOccurrenceId`, `allDay`, `hosts`, `sourceStatus` on `PulseEvent`; `EventFeed.origin` is now `"live" | "demo"` plus `sources` and `cancelledIds`. All-day events keep NY midnight → next midnight (exclusive). `hasEnded` no longer invents a 1 h duration: with no end time an event is hidden only after its start day.

Known limits: Localist start-date queries can miss multi-day events that began before today; Carrboro RRULEs aren't expanded (reported as a warning); cross-source duplicates are not merged; listing counts are not unique-event counts.

## Additional sources (Oct 2026)
Implemented: Ackland and Morehead (shared The Events Calendar adapter, `tribe.ts`), UNC Libraries and Orange County Countywide + Animal Services (`ics-feeds.ts`; Orange County dedupes across category feeds by `orange-county:UID`).
Researched only, not built: Duke and NC State (need a regional/distance preference first), Cat's Cradle (listing pagination not validated). Disabled pending publisher access: NC Botanical Garden, UNC Music, Chapel Hill Public Library.
Cross-source duplicates (e.g. Ackland vs UNC Calendar) are not merged yet.
