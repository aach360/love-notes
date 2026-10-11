import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck, CalendarPlus, CalendarCheck, LocateFixed, MapPin, Navigation, Search, Wifi } from "lucide-react";
import { toast } from "sonner";
import type { DateFilter, PulseEvent } from "@/shared/types";
import { formatEventDate } from "@/shared/time";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { EventDetail } from "@/modules/discovery/EventDetail";
import { cn } from "@/lib/utils";
import { directionsUrl, resolvePlace, type ResolvedPlace } from "./venues";
import type { Bounds, VenueGroup } from "./LeafletMap";

const LeafletMap = lazy(() => import("./LeafletMap"));

interface Props {
  events: PulseEvent[];
  date: DateFilter;
  onDate: (d: DateFilter) => void;
}

type Located = { event: PulseEvent; place: ResolvedPlace };
const inBounds = (p: ResolvedPlace, b: Bounds) => p.lat <= b.n && p.lat >= b.s && p.lng <= b.e && p.lng >= b.w;

export function MapView({ events, date, onDate }: Props) {
  const { state, saveEvent, removeSaved, togglePlan } = useUserState();
  const [freeOnly, setFreeOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [area, setArea] = useState<Bounds | null>(null);
  const [pending, setPending] = useState<Bounds | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; nonce: number } | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState<PulseEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const { located, online, unresolved } = useMemo(() => {
    const located: Located[] = [], online: PulseEvent[] = [], unresolved: PulseEvent[] = [];
    for (const e of events) {
      if (freeOnly && e.costAmount !== 0) continue;
      const r = resolvePlace(e);
      if (r.kind === "place") located.push({ event: e, place: r.place });
      else (r.kind === "online" ? online : unresolved).push(e);
    }
    return { located, online, unresolved };
  }, [events, freeOnly]);

  const groups = useMemo<VenueGroup[]>(() => {
    const m = new Map<string, VenueGroup>();
    for (const l of located) {
      const g = m.get(l.place.key);
      if (g) g.count++; else m.set(l.place.key, { place: l.place, count: 1 });
    }
    return [...m.values()];
  }, [located]);

  const visible = useMemo(() => {
    const inArea = area ? located.filter((l) => inBounds(l.place, area)) : located;
    return selected ? [...inArea.filter((l) => l.place.key === selected), ...inArea.filter((l) => l.place.key !== selected)] : inArea;
  }, [located, area, selected]);

  useEffect(() => {
    if (selected) listRef.current?.querySelector(`[data-venue="${selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  /** First tap highlights the marker; tapping an already-highlighted venue opens the details. */
  const pickEvent = (l: Located) => {
    if (selected === l.place.key) { setDetail(l.event); return; }
    setSelected(l.place.key);
    setFocus({ lat: l.place.lat, lng: l.place.lng, nonce: Date.now() });
  };
  const nearMe = () => {
    if (!("geolocation" in navigator)) { toast("Location isn't available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const c = { lat: p.coords.latitude, lng: p.coords.longitude }; setMe(c); setFocus({ ...c, zoom: 16, nonce: Date.now() }); },
      () => toast("Location permission was declined — the map still shows all of campus."),
      { timeout: 8000 },
    );
  };

  const isSaved = (id: string) => state.saved.some((s) => s.eventId === id);
  const inPlan = (id: string) => state.plan.some((p) => p.eventId === id);

  const chips: { label: string; on: boolean; act: () => void }[] = [
    { label: "Today", on: date === "today", act: () => onDate(date === "today" ? "any" : "today") },
    { label: "This weekend", on: date === "weekend", act: () => onDate(date === "weekend" ? "any" : "weekend") },
    { label: "Free", on: freeOnly, act: () => setFreeOnly((v) => !v) },
  ];

  const row = (e: PulseEvent, place: ResolvedPlace | null) => (
    <li key={e.id} data-venue={place?.key} className={cn("map-row", place && place.key === selected && "is-selected")}>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => (place ? pickEvent({ event: e, place }) : setDetail(e))}>
        <p className="line-clamp-2 text-sm font-semibold text-navy">{e.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatEventDate(e)}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{e.location ?? "Location not listed"}</span>
        </p>
        {place && <p className="mt-0.5 text-[11px] text-muted-foreground/80">Pin placed at {place.name} (approximate)</p>}
      </button>
      <div className="flex shrink-0 flex-col gap-1">
        <button type="button" className="map-icon-btn" aria-label={isSaved(e.id) ? `Unsave ${e.title}` : `Save ${e.title}`} aria-pressed={isSaved(e.id)} onClick={() => (isSaved(e.id) ? removeSaved(e.id) : saveEvent(e))}>
          {isSaved(e.id) ? <BookmarkCheck className="size-4 text-primary" /> : <Bookmark className="size-4" />}
        </button>
        <button type="button" className="map-icon-btn" aria-label={inPlan(e.id) ? `Remove ${e.title} from plan` : `Add ${e.title} to plan`} aria-pressed={inPlan(e.id)} onClick={() => togglePlan(e)}>
          {inPlan(e.id) ? <CalendarCheck className="size-4 text-primary" /> : <CalendarPlus className="size-4" />}
        </button>
        {place && (
          <a className="map-icon-btn" href={directionsUrl(place)} target="_blank" rel="noreferrer" aria-label={`Directions to ${place.name}`}>
            <Navigation className="size-4" />
          </a>
        )}
      </div>
    </li>
  );

  const list = (
    <div ref={listRef} className="space-y-4">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold text-navy">{visible.length} on the map{area ? " in this area" : ""}</h2>
        {(area || selected) && (
          <button className="text-xs font-semibold text-primary" onClick={() => { setArea(null); setSelected(null); }}>Show all</button>
        )}
      </div>
      {visible.length === 0 && <p className="px-1 text-sm text-muted-foreground">No mapped events match. Try another day or zoom out.</p>}
      <ul className="space-y-2">{visible.map((l) => row(l.event, l.place))}</ul>
      {(online.length > 0 || unresolved.length > 0) && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm font-semibold text-navy">
            <Wifi className="size-4" aria-hidden /> Online or location not mapped ({online.length + unresolved.length})
          </summary>
          <ul className="mt-2 space-y-2">{[...online, ...unresolved].map((e) => row(e, null))}</ul>
        </details>
      )}
    </div>
  );

  const fallback = (
    <div className="map-shell flex size-full flex-col items-center justify-center gap-2 p-6 text-center">
      <MapPin className="size-6 text-primary" aria-hidden />
      <p className="font-semibold text-navy">{failed ? "The map couldn't load" : "Loading map…"}</p>
      {failed && <p className="text-sm text-muted-foreground">Every event is still listed below.</p>}
    </div>
  );

  return (
    <section aria-label="Event map" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button key={c.label} type="button" aria-pressed={c.on} onClick={c.act} className={cn("map-chip", c.on && "is-on")}>{c.label}</button>
        ))}
        <button type="button" onClick={nearMe} className="map-chip ml-auto"><LocateFixed className="size-4" aria-hidden /> Near me</button>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="map-shell relative h-[58dvh] overflow-hidden md:h-[68dvh]">
          {failed ? fallback : (
            <ClientOnly fallback={fallback}>
              <Suspense fallback={fallback}>
                <LeafletMap
                  groups={groups}
                  selectedKey={selected}
                  onSelect={(k) => { setSelected(k); setSheetOpen(true); }}
                  onMoved={setPending}
                  onFail={() => setFailed(true)}
                  focus={focus}
                  me={me}
                />
              </Suspense>
            </ClientOnly>
          )}
          {pending && !failed && (
            <button type="button" className="map-chip is-on absolute left-1/2 top-3 z-[500] -translate-x-1/2 shadow-lg" onClick={() => { setArea(pending); setPending(null); setSheetOpen(true); }}>
              <Search className="size-4" aria-hidden /> Search this area
            </button>
          )}
        </div>
        <aside className="map-shell hidden max-h-[68dvh] overflow-y-auto p-3 md:block">{list}</aside>
      </div>

      {/* Mobile: list as a bottom sheet that snaps between peek and expanded. */}
      <div className={cn("map-sheet md:hidden", sheetOpen && "is-open")}>
        <button
          type="button"
          className="flex w-full flex-col items-center gap-1 pb-2 pt-2"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((v) => !v)}
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).dataset["y"] = String(e.clientY); }}
          onPointerUp={(e) => {
            const y0 = Number((e.currentTarget as HTMLElement).dataset["y"] ?? e.clientY);
            if (Math.abs(e.clientY - y0) > 30) { e.preventDefault(); setSheetOpen(e.clientY < y0); }
          }}
        >
          <span className="h-1 w-10 rounded-full bg-navy/20" aria-hidden />
          <span className="text-xs font-semibold text-navy">{sheetOpen ? "Hide list" : `${visible.length} events — show list`}</span>
        </button>
        <div hidden={!sheetOpen} className="max-h-[55dvh] overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+6rem)]">{list}</div>
      </div>

      <EventDetail event={detail} onClose={() => setDetail(null)} />
    </section>
  );
}
