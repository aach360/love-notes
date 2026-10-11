import { MapPin, Users, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PulseEvent, RankedEvent } from "@/shared/types";
import { DISPLAY_TZ } from "@/shared/types";
import { formatEventDate } from "@/shared/time";
import { topicLabel } from "@/shared/taxonomy";
import { EventImage } from "./EventImage";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** At most `max` chips; synonyms like "Spirituality" / "Faith & spirituality" merge into one. */
export function cardChips(e: PulseEvent, max = 2): string[] {
  const out: string[] = [];
  const seen: string[] = [];
  const add = (label: string) => {
    const n = norm(label);
    if (!n) return;
    const words = n.split(" ").filter((w) => w.length > 3);
    if (
      seen.some(
        (s) =>
          s === n || s.includes(n) || n.includes(s) || words.some((w) => s.split(" ").includes(w)),
      )
    )
      return;
    seen.push(n);
    out.push(label);
  };
  for (const t of e.topics ?? []) add(topicLabel(t));
  if (e.costText) add(e.costText);
  else if (e.tags.includes("free food")) add("Free food");
  for (const c of e.categories) add(c);
  return out.slice(0, max);
}

function dateTab(e: PulseEvent) {
  const d = new Date(e.startsAt);
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TZ, ...o }).format(d);
  return {
    month: f({ month: "short" }).toUpperCase(),
    day: f({ day: "numeric" }),
    wd: f({ weekday: "short" }),
  };
}

export function EventCard({ ranked, onDetails }: { ranked: RankedEvent; onDetails: () => void }) {
  const e = ranked.event;
  const tab = dateTab(e);
  const when =
    formatEventDate(e).replace(/^[A-Za-z]{3},?\s+[A-Za-z]{3}\s+\d+,?\s*(·\s*)?/, "") ||
    formatEventDate(e);
  return (
    <article className="postcard flex h-full flex-col overflow-hidden rounded-[2rem]">
      <div className="relative min-h-0 flex-1">
        <EventImage event={e} eager />
        <div
          className="absolute left-3 top-3 flex flex-col items-center rounded-2xl bg-card px-2.5 py-1.5 leading-none text-navy shadow-float backdrop-blur-md"
          aria-label={formatEventDate(e)}
        >
          <span className="text-[10px] font-black tracking-widest text-primary">{tab.month}</span>
          <span className="font-display text-2xl font-black">{tab.day}</span>
          <span className="text-[10px] font-bold text-muted-foreground">{tab.wd}</span>
        </div>
        {ranked.reason && (
          <span className="absolute right-3 top-3 max-w-[60%] truncate rounded-full bg-card px-3 py-1 text-xs font-bold text-navy backdrop-blur-md">
            {ranked.reason}
          </span>
        )}
      </div>
      <div className="space-y-2 px-5 pb-4 pt-3">
        <h2 className="line-clamp-2 font-display text-xl font-bold leading-tight text-navy">
          {e.title}
        </h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-foreground/75">
          <span className="text-primary">{when}</span>
          {e.location && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{e.location}</span>
            </span>
          )}
          {!e.location && e.organizer && (
            <span className="flex min-w-0 items-center gap-1">
              <Users className="size-3.5 shrink-0" />
              <span className="truncate">{e.organizer}</span>
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {cardChips(e).map((c) => (
            <span
              key={c}
              className="max-w-full truncate rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground"
            >
              {c}
            </span>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="touch"
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={onDetails}
            className="ml-auto shrink-0 text-xs font-bold text-primary"
          >
            <ChevronUp /> Details
          </Button>
        </div>
      </div>
    </article>
  );
}
