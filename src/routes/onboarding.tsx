import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { PulseEvent, RankedEvent } from "@/shared/types";
import { TOPICS, topicLabel } from "@/shared/taxonomy";
import { eventsQuery } from "@/modules/ingestion/events.functions";
import { SwipeDeck } from "@/modules/discovery/SwipeDeck";
import { EventDetail } from "@/modules/discovery/EventDetail";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { useAuth } from "@/modules/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { AeroButton, PageTitle, Panel } from "@/components/aero";
import { StatePanel } from "@/components/StatePanel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Make campus feel like yours — PulseMatch" },
      { name: "description", content: "Pick your interests and swipe a few UNC events to tune your feed." },
      { property: "og:title", content: "Make campus feel like yours — PulseMatch" },
      { property: "og:description", content: "Pick your interests and swipe a few UNC events to tune your feed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

const COUNT = 5;

const INTENTS = [
  { id: "meet-people", label: "Meeting people" },
  { id: "hobbies", label: "Trying new hobbies" },
  { id: "curiosity", label: "Following my curiosity" },
  { id: "study-break", label: "Taking a study break" },
];

const YEARS = ["First year", "Sophomore", "Junior", "Senior", "Grad student", "Prefer not to say"];

/** Five upcoming events from as many different topics as possible. */
function pickDiverse(events: PulseEvent[], skip: Set<string>): PulseEvent[] {
  const now = Date.now();
  const seen = new Set<string>();
  const out: PulseEvent[] = [];
  const pool = events.filter((e) => !skip.has(e.id) && new Date(e.startsAt).getTime() > now);
  for (const e of pool) {
    const k = e.topics?.[0] ?? e.categories[0]?.toLowerCase() ?? e.source;
    if (!seen.has(k)) { seen.add(k); out.push(e); }
    if (out.length === COUNT) return out;
  }
  for (const e of pool) { if (out.length === COUNT) break; if (!out.includes(e)) out.push(e); }
  return out;
}

type Step = "intent" | "interests" | "background" | "cards";
const STEPS: Step[] = ["intent", "interests", "background", "cards"];

function Onboarding() {
  const feed = useQuery(eventsQuery);
  const { state, recordSwipe, undoLast, setOnboarding } = useUserState();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("intent");
  const [intent, setIntent] = useState<string | undefined>();
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [major, setMajor] = useState("");
  const [year, setYear] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<PulseEvent | null>(null);
  const cards = useRef<PulseEvent[] | null>(null);
  if (!cards.current && feed.data) cards.current = pickDiverse(feed.data.events, new Set(state.swipes.map((s) => s.eventId)));

  const swiped = new Set(state.swipes.map((s) => s.eventId));
  const remaining: RankedEvent[] = useMemo(
    () => (cards.current ?? []).filter((e) => !swiped.has(e.id)).map((event) => ({ event, score: 0, reason: null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.swipes, feed.data],
  );
  const done = (cards.current?.length ?? 0) - remaining.length;
  const stepIndex = STEPS.indexOf(step);

  /** Persist answers first; only mark onboarding complete after the writes succeed. */
  async function finish() {
    setSaving(true);
    setOnboarding({
      interests: [...interests],
      completedAt: new Date().toISOString(),
      ...(intent ? { intent } : {}),
      ...(major.trim() ? { major: major.trim() } : {}),
      ...(year ? { year } : {}),
    });
    if (user) {
      const { error } = await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id);
      if (error) {
        setSaving(false);
        return; // stay on the page; the account page offers "Redo taste cards" to retry
      }
    }
    navigate({ to: "/" });
  }

  const toggleInterest = (id: string) =>
    setInterests((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <PageTitle title="Make campus feel like yours" subtitle="A few quick picks, then five cards. You can change all of this later." />
      <div className="flex justify-center gap-2" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <span key={s} className={i <= stepIndex ? "size-3 rounded-full bg-primary" : "size-3 rounded-full bg-card"} />
        ))}
      </div>

      {step === "intent" && (
        <Panel className="space-y-4 p-6">
          <h2 className="font-display text-xl font-extrabold text-navy">What would you like more of?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {INTENTS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setIntent(o.id)}
                aria-pressed={intent === o.id}
                className={cn("aero-btn rounded-2xl px-4 py-3 text-sm font-bold", intent === o.id ? "aero-aqua" : "aero-pearl")}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <button type="button" onClick={() => setStep("interests")} className="text-sm font-bold text-muted-foreground underline">Skip</button>
            <AeroButton tone="grass" onClick={() => setStep("interests")} disabled={!intent}>Next</AeroButton>
          </div>
        </Panel>
      )}

      {step === "interests" && (
        <Panel className="space-y-4 p-6">
          <h2 className="font-display text-xl font-extrabold text-navy">Find people who share your interests</h2>
          <p className="text-sm text-muted-foreground">Pick a few — these shape your very first recommendations.</p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleInterest(t.id)}
                aria-pressed={interests.has(t.id)}
                className={cn("aero-btn rounded-full px-3 py-1.5 text-xs font-bold", interests.has(t.id) ? "aero-aqua" : "aero-pearl")}
              >
                {topicLabel(t.id)}
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <button type="button" onClick={() => setStep("background")} className="text-sm font-bold text-muted-foreground underline">Skip</button>
            <AeroButton tone="grass" onClick={() => setStep("background")} disabled={interests.size === 0}>Next</AeroButton>
          </div>
        </Panel>
      )}

      {step === "background" && (
        <Panel className="space-y-4 p-6">
          <h2 className="font-display text-xl font-extrabold text-navy">A little context (totally optional)</h2>
          <p className="text-sm text-muted-foreground">Used only to surface things like major-related events when you ask. Never a filter.</p>
          <input
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            placeholder="Major (or undecided)"
            maxLength={60}
            className="w-full rounded-2xl border border-border bg-card/70 px-4 py-2.5 text-sm font-semibold text-navy placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-carolina"
          />
          <div className="flex flex-wrap gap-2">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(year === y ? undefined : y)}
                aria-pressed={year === y}
                className={cn("aero-btn rounded-full px-3 py-1.5 text-xs font-bold", year === y ? "aero-aqua" : "aero-pearl")}
              >
                {y}
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <button type="button" onClick={() => setStep("cards")} className="text-sm font-bold text-muted-foreground underline">Skip</button>
            <AeroButton tone="grass" onClick={() => setStep("cards")}>Next</AeroButton>
          </div>
        </Panel>
      )}

      {step === "cards" && (
        <>
          {feed.isLoading ? (
            <StatePanel icon={<Loader2 className="size-6 animate-spin" />} title="Finding events…" />
          ) : !cards.current?.length ? (
            <Panel className="space-y-3 p-6 text-center">
              <Sparkles className="mx-auto size-6 text-primary" />
              <h2 className="font-display text-xl font-extrabold text-navy">Your next favorite hobby could start with one event</h2>
              <p className="text-sm text-muted-foreground">No events to swipe right now, but your interests are saved and your feed is already tuned.</p>
              <AeroButton tone="grass" disabled={saving} onClick={finish}>Start discovering</AeroButton>
            </Panel>
          ) : remaining.length ? (
            <>
              <p className="text-center text-sm font-semibold text-muted-foreground">Last step: swipe right on what sounds fun ({done} of {cards.current.length}).</p>
              <SwipeDeck ranked={remaining} onSwipe={(e, d) => recordSwipe(e, d)} onUndo={undoLast} canUndo={done > 0} onDetails={setDetail} />
              <button type="button" disabled={saving} onClick={finish} className="mx-auto block text-sm font-bold text-muted-foreground underline">Skip for now</button>
            </>
          ) : (
            <Panel className="space-y-3 p-6 text-center">
              <h2 className="font-display text-xl font-extrabold text-navy">You're all set</h2>
              <p className="text-sm text-muted-foreground">Your feed now leans toward what you picked and liked. It keeps learning with every swipe.</p>
              <AeroButton tone="grass" disabled={saving} onClick={finish}>Start discovering</AeroButton>
            </Panel>
          )}
        </>
      )}
      {detail && <EventDetail event={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
