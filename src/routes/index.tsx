import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { Heart, Sparkles, Waves } from "lucide-react";
import { eventsQuery } from "@/modules/ingestion/events.functions";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { getRecommendations } from "@/modules/recommendations/ranking";
import { SwipeDeck } from "@/modules/discovery/SwipeDeck";
import { FilterSidebar } from "@/modules/discovery/FilterSidebar";
import { StatePanel } from "@/components/StatePanel";
import { AeroButton } from "@/components/aero";
import { TasteSidebar } from "@/modules/recommendations/TasteSidebar";
import type { EventFilters } from "@/shared/types";
import { MapView } from "@/modules/map/MapView";
import { isEligibleForDiscover, matchesDateFilter } from "@/shared/time";
import { LayoutGrid, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UNCitall — What's happening at UNC" },
      {
        name: "description",
        content: "Swipe through real UNC Chapel Hill events, save favorites, and build your plan.",
      },
      { property: "og:title", content: "UNCitall — What's happening at UNC" },
      {
        property: "og:description",
        content: "Swipe through real UNC Chapel Hill events, save favorites, and build your plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: Discover,
});

const DEFAULT_FILTERS: EventFilters = { date: "any", category: null, confirmedFreeOnly: false };

function Discover() {
  const { data: feed } = useSuspenseQuery(eventsQuery);
  const { state, hydrated, recordSwipe, undoLast } = useUserState();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const categories = useMemo(
    () => Array.from(new Set(feed.events.flatMap((e) => e.categories))).sort(),
    [feed.events],
  );
  // Freeze the visible card across background updates (feed refreshes); it changes only after a swipe.
  const frozen = useRef<string | null>(null);
  const planIds = useMemo(() => state.plan.map((p) => p.eventId), [state.plan]);
  const ranked = useMemo(() => {
    const swiped = new Set(state.swipes.map((s) => s.eventId));
    const keep = frozen.current && !swiped.has(frozen.current) ? frozen.current : null;
    const r = getRecommendations({
      events: feed.events,
      swipes: state.swipes,
      prefs: state.prefs,
      filters,
      planIds,
      frozenId: keep,
    });
    frozen.current = r[0]?.event.id ?? null;
    return r;
  }, [feed.events, state.swipes, state.prefs, filters, planIds]);
  const filteredTotal = ranked.length;
  // Undo: pin the undone card back on top and let the deck slide it in from where it left.
  const [returning, setReturning] = useState<{ id: string; dir: "like" | "pass" } | null>(null);
  const undo = () => {
    const last = state.swipes[state.swipes.length - 1];
    if (last) {
      frozen.current = last.eventId;
      setReturning({ id: last.eventId, dir: last.direction });
    }
    undoLast();
  };
  const clearReturning = useCallback(() => setReturning(null), []);
  const [view, setView] = useState<"cards" | "map">("cards");
  const mapEvents = useMemo(
    () =>
      feed.events.filter(
        (e) =>
          isEligibleForDiscover(e) &&
          matchesDateFilter(e, filters.date) &&
          (!filters.category || e.categories.includes(filters.category)),
      ),
    [feed.events, filters.date, filters.category],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Discover view" className="view-switch">
          {(
            [
              ["cards", "Cards", LayoutGrid],
              ["map", "Map", MapIcon],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("view-switch-btn", view === v && "is-on")}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <TasteSidebar />
      </div>
      <FilterSidebar
        value={filters}
        onChange={setFilters}
        onClear={() => setFilters(DEFAULT_FILTERS)}
        categories={categories}
      />

      {view === "map" ? (
        <MapView
          events={mapEvents}
          date={filters.date}
          onDate={(date) => setFilters((f) => ({ ...f, date }))}
        />
      ) : !hydrated ? (
        <StatePanel icon={<Waves className="size-6 animate-pulse" />} title="Loading events…" />
      ) : feed.events.length === 0 ? (
        <StatePanel icon={<Waves className="size-6" />} title="No upcoming events">
          {feed.origin === "unavailable"
            ? "Campus calendars haven't been imported yet — they refresh automatically twice a week."
            : "Check back soon."}
        </StatePanel>
      ) : filteredTotal === 0 ? (
        state.swipes.length > 0 && filters === DEFAULT_FILTERS ? (
          <StatePanel
            tone="grass"
            icon={<Sparkles className="size-6" />}
            title="You've seen everything!"
          >
            <p>
              You swiped through every upcoming event. Check your saved list or come back later.
            </p>
            <AeroButton className="mt-4" onClick={undo}>
              Undo last swipe
            </AeroButton>
          </StatePanel>
        ) : (
          <StatePanel icon={<Heart className="size-6" />} title="Nothing matches these filters">
            <p>Try another date or event type to see more upcoming events.</p>
            <AeroButton tone="pearl" className="mt-4" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear filters
            </AeroButton>
          </StatePanel>
        )
      ) : (
        <SwipeDeck
          ranked={ranked}
          onSwipe={(e, d) => recordSwipe(e, d)}
          onUndo={undo}
          canUndo={state.swipes.length > 0}
          returning={returning}
          onReturned={clearReturning}
        />
      )}
    </div>
  );
}
