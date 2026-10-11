import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AlertTriangle, BellRing, CalendarDays, ExternalLink, Volume2, X } from "lucide-react";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { getPlan, planNarration } from "@/modules/plan/plan";
import { generatePlanAudio } from "@/modules/plan/audio.functions";
import { StatePanel } from "@/components/StatePanel";
import { AeroButton, OrbIcon, PageTitle, Panel } from "@/components/aero";
import { Switch } from "@/components/ui/switch";
import { sourceLabel } from "@/modules/discovery/sourceLabel";
import { useCancelledIds } from "@/modules/discovery/useCancelledIds";
import { formatDayHeading, formatTime, nyDateKey } from "@/shared/time";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "My plan — PulseMatch" },
      { name: "description", content: "Your chosen UNC events in time order, with overlap warnings and a listenable itinerary." },
      { property: "og:title", content: "My plan — PulseMatch" },
      { property: "og:description", content: "Your campus event itinerary." },
    ],
  }),
  component: Plan,
});

function Plan() {
  const { state, hydrated, togglePlan, setRemindersOptIn } = useUserState();
  const cancelled = useCancelledIds();
  const plan = useMemo(() => getPlan(state.plan), [state.plan]);
  const narration = useMemo(() => planNarration(state.plan), [state.plan]);
  const audioFn = useServerFn(generatePlanAudio);
  const [audio, setAudio] = useState<{ state: "idle" | "loading" | "ok" | "unconfigured" | "error"; src?: string; msg?: string }>({ state: "idle" });

  const listen = async () => {
    setAudio({ state: "loading" });
    try {
      const r = await audioFn({ data: { text: narration } });
      if (r.status === "ok") setAudio({ state: "ok", src: `data:${r.mime};base64,${r.audioBase64}` });
      else if (r.status === "unconfigured") setAudio({ state: "unconfigured" });
      else setAudio({ state: "error", msg: r.message });
    } catch (e) {
      setAudio({ state: "error", msg: (e as Error).message });
    }
  };

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
      <PageTitle title="Plan" subtitle="In time order. Travel time between venues isn't included." />
      <Link to="/calendar" className="aero-btn aero-pearl inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold">
        <CalendarDays className="size-4" /> Calendar view &amp; add to phone
      </Link>
      {plan.length === 0 ? (
        <StatePanel icon={<CalendarDays className="size-6" />} title="Your plan is empty">
          <p>Add events from your saved list.</p>
          <Link to="/saved" className="aero-btn aero-aqua mt-4 inline-flex rounded-full px-4 py-2 text-sm font-bold">Go to Saved</Link>
        </StatePanel>
      ) : (
        <div className="space-y-5">
          <Panel className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <AeroButton tone="grass" onClick={listen} disabled={audio.state === "loading"}>
                <Volume2 className="size-4" /> {audio.state === "loading" ? "Preparing…" : "Listen to my plan"}
              </AeroButton>
              {audio.state === "ok" && <audio controls autoPlay src={audio.src} className="h-9" />}
            </div>
            {(audio.state === "unconfigured" || audio.state === "error") && (
              <div className="mt-3 rounded-2xl bg-secondary p-3 text-sm">
                <p className="font-bold text-navy">{audio.state === "unconfigured" ? "Voice playback isn't set up yet." : "Couldn't create audio right now."} Here's your itinerary as text:</p>
                <p className="mt-1 text-foreground/80">{narration}</p>
              </div>
            )}
          </Panel>

          {days.map((d) => (
            <section key={d.key}>
              <h2 className="mb-2 text-lg font-bold text-navy drop-shadow-[0_1px_0_oklch(1_0_0/0.8)]">{formatDayHeading(d.items[0]!.event.startsAt)}</h2>
              <ol className="space-y-2">
                {d.items.map(({ event: e, overlapsWith }) => (
                  <li key={e.id}>
                    <Panel className="flex items-start gap-3 p-3">
                      <div className="aero-btn aero-aqua w-20 shrink-0 rounded-2xl px-2 py-2 text-center text-xs font-bold">
                        {e.allDay ? "All day" : formatTime(e.startsAt)}
                        {e.endsAt && !e.allDay && <div className="opacity-90">– {formatTime(e.endsAt)}</div>}
                      </div>
                      <div className="aero-solid min-w-0 flex-1 rounded-2xl p-3">
                        <h3 className="font-bold text-navy">{e.title}</h3>
                        {e.location && <p className="text-xs font-semibold text-muted-foreground">{e.location}</p>}
                        {cancelled.has(e.id) && <p className="mt-1 text-xs font-bold text-destructive">Cancelled by the organizer</p>}
                        {overlapsWith.length > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-bold text-destructive">
                            <AlertTriangle className="size-3.5" /> Overlaps with {overlapsWith.length} other event{overlapsWith.length > 1 ? "s" : ""}
                          </p>
                        )}
                        {e.sourceUrl && (
                          <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary">
                            Register on {sourceLabel(e)} <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      <button onClick={() => togglePlan(e)} aria-label={`Remove ${e.title} from plan`} className="rounded-full p-1 text-muted-foreground hover:bg-card">
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

      <Panel className="mt-6 flex items-center gap-3 p-4">
        <OrbIcon tone="pearl"><BellRing className="size-4" /></OrbIcon>
        <div className="flex-1">
          <p className="text-sm font-bold text-navy">Event reminders</p>
          <p className="text-xs text-muted-foreground">
            {state.prefs.remindersOptIn ? "Your preference is saved. Reminder delivery isn't connected yet, so nothing will be sent." : "Off. Reminders are opt-in."}
          </p>
        </div>
        <Switch checked={state.prefs.remindersOptIn} onCheckedChange={setRemindersOptIn} aria-label="Opt in to reminders" />
      </Panel>
    </div>
  );
}
