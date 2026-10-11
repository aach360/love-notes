import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventVectorsQuery } from "@/modules/recommendations/embeddings.functions";
import { Heart, Sparkles, Waves } from "lucide-react";
import { eventsQuery } from "@/modules/ingestion/events.functions";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { getRecommendations } from "@/modules/recommendations/ranking";
import { SwipeDeck } from "@/modules/discovery/SwipeDeck";
import { FilterSidebar } from "@/modules/discovery/FilterSidebar";
import { EventDetail } from "@/modules/discovery/EventDetail";
import { StatePanel } from "@/components/StatePanel";
import { AeroButton } from "@/components/aero";
import { TasteSidebar } from "@/modules/recommendations/TasteSidebar";
import type { EventFilters, PulseEvent } from "@/shared/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PulseMatch — Discover UNC campus events" },
      { name: "description", content: "Swipe through real UNC Chapel Hill events, save favorites, and build your plan." },
      { property: "og:title", content: "PulseMatch — Discover UNC campus events" },
      { property: "og:description", content: "Swipe through real UNC Chapel Hill events, save favorites, and build your plan." },
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
  const [detail, setDetail] = useState<PulseEvent | null>(null);

  const categories = useMemo(() => Array.from(new Set(feed.events.flatMap((e) => e.categories))).sort(), [feed.events]);
  const { data: vec } = useQuery(eventVectorsQuery);
  // Freeze the visible card across background updates (e.g. vectors arriving); it changes only after a swipe.
  const frozen = useRef<string | null>(null);
  const planIds = useMemo(() => state.plan.map((p) => p.eventId), [state.plan]);
  const ranked = useMemo(() => {
    const swiped = new Set(state.swipes.map((s) => s.eventId));
    const keep = frozen.current && !swiped.has(frozen.current) ? frozen.current : null;
    const r = getRecommendations({ events: feed.events, swipes: state.swipes, prefs: state.prefs, filters, vectors: vec?.vectors ?? {}, planIds, frozenId: keep });
    frozen.current = r[0]?.event.id ?? null;
    return r;
  }, [feed.events, state.swipes, state.prefs, filters, vec?.vectors, planIds]);
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

  return (
    <div className="space-y-3">
      {feed.origin === "demo" && (
        <div className="aero-panel rounded-2xl px-4 py-2 text-xs font-bold text-navy">
          Showing demo events — none of the live calendars could be loaded right now.
        </div>
      )}
      <div className="flex justify-end"><TasteSidebar /></div>
      <FilterSidebar value={filters} onChange={setFilters} onClear={() => setFilters(DEFAULT_FILTERS)} categories={categories} />

      {!hydrated ? (
        <StatePanel icon={<Waves className="size-6 animate-pulse" />} title="Loading events…" />
      ) : feed.events.length === 0 ? (
        <StatePanel icon={<Waves className="size-6" />} title="No upcoming events">Check back soon.</StatePanel>
      ) : filteredTotal === 0 ? (
        state.swipes.length > 0 && filters === DEFAULT_FILTERS ? (
          <StatePanel tone="grass" icon={<Sparkles className="size-6" />} title="You've seen everything!">
            <p>You swiped through every upcoming event. Check your saved list or come back later.</p>
            <AeroButton className="mt-4" onClick={undo}>Undo last swipe</AeroButton>
          </StatePanel>
        ) : (
          <StatePanel icon={<Heart className="size-6" />} title="Nothing matches these filters">
            <p>Most calendars don't list prices, so only events marked free by their source count as confirmed free.</p>
            <AeroButton tone="pearl" className="mt-4" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</AeroButton>
          </StatePanel>
        )
      ) : (
        <SwipeDeck ranked={ranked} onSwipe={(e, d) => { const b = ranked.find((r) => r.event.id === e.id)?.breakdown; recordSwipe(e, d, b?.features, b?.exploratory); }} onUndo={undo} canUndo={state.swipes.length > 0} onDetails={setDetail} returning={returning} onReturned={clearReturning} />
      )}

      <EventDetail event={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
