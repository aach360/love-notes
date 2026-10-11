import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarPlus, CalendarCheck, Heart, Trash2 } from "lucide-react";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { EventDetail } from "@/modules/discovery/EventDetail";
import { EventImage } from "@/modules/discovery/EventImage";
import { StatePanel } from "@/components/StatePanel";
import { AeroButton, PageTitle, Panel } from "@/components/aero";
import { formatEventDate, hasEnded } from "@/shared/time";
import { useCancelledIds } from "@/modules/discovery/useCancelledIds";
import type { PulseEvent } from "@/shared/types";

export const Route = createFileRoute("/saved")({
  head: () => ({
    meta: [
      { title: "Saved events — PulseMatch" },
      { name: "description", content: "Events you've saved on PulseMatch. Add them to your plan or open the original page to register." },
      { property: "og:title", content: "Saved events — PulseMatch" },
      { property: "og:description", content: "Your saved UNC campus events." },
    ],
  }),
  component: Saved,
});

function Saved() {
  const { state, hydrated, removeSaved, togglePlan } = useUserState();
  const [detail, setDetail] = useState<PulseEvent | null>(null);
  const cancelled = useCancelledIds();
  const saved = [...state.saved].sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  const inPlan = (id: string) => state.plan.some((p) => p.eventId === id);

  return (
    <div>
      <PageTitle title="Saved" subtitle="Saving doesn't register you — use the event page to RSVP." />
      {!hydrated ? null : saved.length === 0 ? (
        <StatePanel tone="grass" icon={<Heart className="size-6" />} title="No saved events yet">
          <p>Swipe right on events you like.</p>
          <Link to="/" className="aero-btn aero-aqua mt-4 inline-flex rounded-full px-4 py-2 text-sm font-bold">Discover events</Link>
        </StatePanel>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {saved.map(({ event: e }) => (
            <li key={e.id}>
              <Panel className="flex gap-3 p-2">
                <button onClick={() => setDetail(e)} className="relative size-24 shrink-0 overflow-hidden rounded-2xl" aria-label={`Details for ${e.title}`}>
                  <EventImage event={e} />
                  <span className="gloss absolute inset-0" />
                </button>
                <div className="aero-solid flex min-w-0 flex-1 flex-col rounded-2xl p-3">
                  <button onClick={() => setDetail(e)} className="text-left">
                    <h3 className="line-clamp-2 text-sm font-bold text-navy">{e.title}</h3>
                    <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{formatEventDate(e)}</p>
                    {cancelled.has(e.id) && <p className="text-xs font-bold text-destructive">Cancelled by the organizer</p>}
                    {hasEnded(e) && <p className="text-xs font-bold text-destructive">This event has ended</p>}
                  </button>
                  <div className="mt-auto flex gap-2 pt-2">
                    <AeroButton tone={inPlan(e.id) ? "grass" : "aqua"} className="px-3 py-1 text-xs" onClick={() => togglePlan(e)}>
                      {inPlan(e.id) ? <><CalendarCheck className="size-4" /> In plan</> : <><CalendarPlus className="size-4" /> Add to plan</>}
                    </AeroButton>
                    <AeroButton tone="pearl" className="px-3 py-1 text-xs" aria-label={`Remove ${e.title}`} onClick={() => removeSaved(e.id)}>
                      <Trash2 className="size-4" />
                    </AeroButton>
                  </div>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <EventDetail event={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
