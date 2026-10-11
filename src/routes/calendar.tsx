import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { PulseEvent } from "@/shared/types";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { useCancelledIds } from "@/modules/discovery/useCancelledIds";
import { buildIcs, downloadIcs } from "@/modules/plan/ics";
import { AeroButton, PageTitle, Panel } from "@/components/aero";
import { formatEventDate, formatTime, nyDateKey } from "@/shared/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — PulseMatch" },
      { name: "description", content: "See your planned and saved UNC events on a monthly calendar and add them to your phone." },
      { property: "og:title", content: "Calendar — PulseMatch" },
      { property: "og:description", content: "Your UNC events on a calendar, ready to add to your phone." },
    ],
  }),
  component: CalendarPage,
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(Date.UTC(year, month, 1 - first.getUTCDay()));
  return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

function CalendarPage() {
  const { state, hydrated } = useUserState();
  const cancelled = useCancelledIds();
  const todayKey = nyDateKey(new Date());
  const [ym, setYm] = useState(() => ({ y: Number(todayKey.slice(0, 4)), m: Number(todayKey.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(todayKey);

  const items = useMemo(() => {
    const planIds = new Set(state.plan.map((p) => p.eventId));
    const map = new Map<string, { event: PulseEvent; planned: boolean }>();
    for (const p of state.plan) map.set(p.eventId, { event: p.event, planned: true });
    for (const s of state.saved) if (!map.has(s.eventId)) map.set(s.eventId, { event: s.event, planned: planIds.has(s.eventId) });
    return [...map.values()].sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  }, [state.plan, state.saved]);

  const byDay = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const it of items) {
      const k = nyDateKey(it.event.startsAt);
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return m;
  }, [items]);

  const days = monthGrid(ym.y, ym.m);
  const monthLabel = new Date(Date.UTC(ym.y, ym.m, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const shift = (d: number) => setYm(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));
  const dayItems = byDay.get(selected) ?? [];

  const download = (events: PulseEvent[], name: string) => downloadIcs(name, buildIcs(events, { cancelledIds: cancelled }));

  return (
    <div className="space-y-4">
      <PageTitle title="Calendar" subtitle="Your planned and saved events. Download them to add to your phone's calendar." />
      <div className="flex flex-wrap gap-2">
        <AeroButton disabled={!state.plan.length} onClick={() => download(state.plan.map((p) => p.event), "pulsematch-plan.ics")}>
          <Download className="size-4" /> Add my plan to phone
        </AeroButton>
        <AeroButton tone="pearl" disabled={!items.length} onClick={() => download(items.map((i) => i.event), "pulsematch-saved.ics")}>
          <Download className="size-4" /> Plan + saved
        </AeroButton>
      </div>
      <p className="text-xs text-muted-foreground">On iPhone, open the downloaded file and tap "Add All". On Android, open it with Google Calendar. Adding to your calendar doesn't register you — use each event's page for that.</p>

      <Panel className="p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="aero-btn aero-pearl rounded-full p-2"><ChevronLeft className="size-4" /></button>
          <h2 className="font-display text-lg font-extrabold text-navy">{monthLabel}</h2>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="aero-btn aero-pearl rounded-full p-2"><ChevronRight className="size-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase text-muted-foreground">
          {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((k) => {
            const inMonth = Number(k.slice(5, 7)) - 1 === ym.m;
            const its = hydrated ? (byDay.get(k) ?? []) : [];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelected(k)}
                aria-pressed={selected === k}
                aria-label={`${k}: ${its.length} event${its.length === 1 ? "" : "s"}`}
                className={cn(
                  "flex min-h-14 flex-col items-start rounded-xl p-1 text-left text-xs transition-colors sm:min-h-20",
                  inMonth ? "bg-card/60" : "bg-card/20 text-muted-foreground",
                  selected === k && "ring-2 ring-primary",
                  k === todayKey && "font-extrabold text-primary",
                )}
              >
                <span>{Number(k.slice(8))}</span>
                <span className="mt-auto flex w-full flex-col gap-0.5">
                  {its.slice(0, 2).map((it) => (
                    <span key={it.event.id} className={cn("hidden truncate rounded px-1 text-[10px] sm:block", it.planned ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>{it.event.title}</span>
                  ))}
                  {its.length > 0 && (
                    <span className="flex gap-0.5 sm:hidden">
                      {its.slice(0, 3).map((it) => <span key={it.event.id} className={cn("size-1.5 rounded-full", it.planned ? "bg-primary" : "bg-grass")} />)}
                    </span>
                  )}
                  {its.length > 2 && <span className="hidden text-[10px] text-muted-foreground sm:block">+{its.length - 2} more</span>}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-primary" /> In plan</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-grass" /> Saved</span>
        </p>
      </Panel>

      <Panel className="space-y-2 p-4">
        <h3 className="font-bold text-navy">{new Date(`${selected}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</h3>
        {!dayItems.length && <p className="text-sm text-muted-foreground">Nothing saved for this day.</p>}
        {dayItems.map(({ event, planned }) => (
          <div key={event.id} className="flex items-center gap-3 rounded-2xl bg-card/60 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-navy">{event.title}{cancelled.has(event.id) && <span className="ml-2 text-xs text-destructive">Cancelled by the organizer</span>}</p>
              <p className="truncate text-xs text-muted-foreground">{event.allDay ? formatEventDate(event) : formatTime(event.startsAt)}{event.location ? ` · ${event.location}` : ""}{planned ? " · In plan" : " · Saved"}</p>
            </div>
            <button type="button" onClick={() => download([event], "pulsematch-event.ics")} aria-label={`Add ${event.title} to phone calendar`} className="aero-btn aero-pearl shrink-0 rounded-full p-2">
              <CalendarPlus className="size-4" />
            </button>
          </div>
        ))}
      </Panel>
    </div>
  );
}
