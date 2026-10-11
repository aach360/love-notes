import type { PlanItem } from "@/shared/types";
import { formatDayHeading, formatTime } from "@/shared/time";

export interface PlanEntry extends PlanItem {
  overlapsWith: string[];
}

/** getPlan: chronological, with overlap flags. No travel-time assumptions. */
export function getPlan(items: PlanItem[]): PlanEntry[] {
  const sorted = [...items].sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  const span = (i: PlanItem) => {
    const s = new Date(i.event.startsAt).getTime();
    return [s, i.event.endsAt ? new Date(i.event.endsAt).getTime() : s] as const;
  };
  return sorted.map((item) => {
    const [s, e] = span(item);
    const overlapsWith = sorted
      .filter((o) => o.eventId !== item.eventId)
      .filter((o) => {
        if (item.event.allDay || o.event.allDay) return false;
        const [os, oe] = span(o);
        return s === os || (s < oe && os < e);
      })
      .map((o) => o.eventId);
    return { ...item, overlapsWith };
  });
}

/** Deterministic narration built ONLY from stored fields. */
export function planNarration(items: PlanItem[]): string {
  if (!items.length) return "Your plan is empty.";
  const lines = getPlan(items).map((p) => {
    const e = p.event;
    const where = e.location ? ` at ${e.location}` : "";
    return `${formatDayHeading(e.startsAt)}, ${e.allDay ? "all day" : formatTime(e.startsAt)}: ${e.title}${where}.`;
  });
  return `Here is your PulseMatch plan. ${lines.join(" ")}`;
}
