import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, CalendarDays, ExternalLink, X } from "lucide-react";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { getPlan } from "@/modules/plan/plan";
import { PhotonPanel } from "@/modules/assistant/messaging/PhotonPanel";
import { StatePanel } from "@/components/StatePanel";
import { PageTitle, Panel } from "@/components/aero";
import { sourceLabel } from "@/modules/discovery/sourceLabel";
import { useCancelledIds } from "@/modules/discovery/useCancelledIds";
import { formatDayHeading, formatTime, nyDateKey } from "@/shared/time";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "My plan — UNCover" },
      {
        name: "description",
        content: "Your chosen UNC events in time order, with overlap warnings.",
      },
      { property: "og:title", content: "My plan — UNCover" },
      { property: "og:description", content: "Your campus event itinerary." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Plan,
});

function Plan() {
  const { state, hydrated, togglePlan } = useUserState();
  const cancelled = useCancelledIds();
  const plan = useMemo(() => getPlan(state.plan), [state.plan]);
  const days: { key: string; items: typeof plan }[] = [];
  for (const p of plan) {
    const k = nyDateKey(p.event.startsAt);
    const d = days.at(-1);
    if (d?.key === k) d.items.push(p);
    else days.push({ key: k, items: [p] });
  }

  if (!hydrated) return null;
  return (
    <div>
      <PageTitle
        title="Plan"
        subtitle="In time order. Travel time between venues isn't included."
      />
      <Link
        to="/calendar"
        className="aero-btn aero-pearl inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"
      >
        <CalendarDays className="size-4" /> Calendar view &amp; add to phone
      </Link>
      {plan.length === 0 ? (
        <StatePanel icon={<CalendarDays className="size-6" />} title="Your plan is empty">
          <p>Add events from your saved list.</p>
          <Link
            to="/saved"
            className="aero-btn aero-aqua mt-4 inline-flex rounded-full px-4 py-2 text-sm font-bold"
          >
            Go to Saved
          </Link>
        </StatePanel>
      ) : (
        <div className="space-y-5">
          {days.map((d) => (
            <section key={d.key}>
              <h2 className="mb-2 text-lg font-bold text-navy drop-shadow-[0_1px_0_oklch(1_0_0/0.8)]">
                {formatDayHeading(d.items[0]!.event.startsAt)}
              </h2>
              <ol className="space-y-2">
                {d.items.map(({ event: e, overlapsWith }) => (
                  <li key={e.id}>
                    <Panel className="flex items-start gap-3 p-3">
                      <div className="aero-btn aero-aqua w-20 shrink-0 rounded-2xl px-2 py-2 text-center text-xs font-bold">
                        {e.allDay ? "All day" : formatTime(e.startsAt)}
                        {e.endsAt && !e.allDay && (
                          <div className="opacity-90">– {formatTime(e.endsAt)}</div>
                        )}
                      </div>
                      <div className="aero-solid min-w-0 flex-1 rounded-2xl p-3">
                        <h3 className="font-bold text-navy">{e.title}</h3>
                        {e.location && (
                          <p className="text-xs font-semibold text-muted-foreground">
                            {e.location}
                          </p>
                        )}
                        {cancelled.has(e.id) && (
                          <p className="mt-1 text-xs font-bold text-destructive">
                            Cancelled by the organizer
                          </p>
                        )}
                        {overlapsWith.length > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-bold text-destructive">
                            <AlertTriangle className="size-3.5" /> Overlaps with{" "}
                            {overlapsWith.length} other event{overlapsWith.length > 1 ? "s" : ""}
                          </p>
                        )}
                        {e.sourceUrl && (
                          <a
                            href={e.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary"
                          >
                            Register on {sourceLabel(e)} <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      <button
                        onClick={() => togglePlan(e)}
                        aria-label={`Remove ${e.title} from plan`}
                        className="rounded-full p-1 text-muted-foreground hover:bg-card"
                      >
                        <X className="size-4" />
                      </button>
                    </Panel>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      <PhotonPanel />
    </div>
  );
}
