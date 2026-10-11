import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { eventsQuery } from "@/modules/ingestion/events.functions";
import { eventVectorsQuery } from "@/modules/recommendations/embeddings.functions";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { getRecommendations, keyLabel } from "@/modules/recommendations/ranking";
import { ensureBandit } from "@/modules/recommendations/bandit";
import { REC_CONFIG } from "@/modules/recommendations/config";
import { PageTitle, Panel } from "@/components/aero";

export const Route = createFileRoute("/lab")({
  head: () => ({
    meta: [
      { title: "Recommendation lab (developer view) — PulseMatch" },
      { name: "description", content: "Developer/demo diagnostics for PulseMatch's hybrid recommender." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Recommendation lab — PulseMatch" },
      { property: "og:description", content: "Developer/demo diagnostics for PulseMatch's hybrid recommender." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: Lab,
});

const f = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(3);

function Lab() {
  const { data: feed } = useSuspenseQuery(eventsQuery);
  const { data: vec, isLoading } = useQuery(eventVectorsQuery);
  const { state, hydrated } = useUserState();
  const ranked = useMemo(
    () =>
      getRecommendations({
        events: feed.events,
        swipes: state.swipes,
        prefs: state.prefs,
        filters: { date: "any", category: null, confirmedFreeOnly: false },
        vectors: vec?.vectors ?? {},
        planIds: state.plan.map((p) => p.eventId),
      }).slice(0, 12),
    [feed.events, state, vec?.vectors],
  );
  const bandit = ensureBandit(state.prefs.bandit);
  const interests = Object.entries(state.prefs.weights)
    .filter(([k]) => (state.prefs.likeCounts[k] ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const likes = state.swipes.filter((s) => s.direction === "like").length;
  const exp = state.swipes.filter((s) => s.exploratory);
  const expLikes = exp.filter((s) => s.direction === "like").length;
  const semCount = Object.keys(vec?.vectors ?? {}).length;

  return (
    <div className="space-y-4">
      <PageTitle title="Recommendation lab" subtitle="Developer/demo view. Scores are ranking scores from a simple online linear model, not probabilities." />
      <Panel className="grid gap-3 p-5 text-sm sm:grid-cols-2">
        <div>
          <p className="font-bold text-navy">Mode</p>
          <p>
            {isLoading ? "Loading embeddings…" : vec?.status === "ok" || vec?.status === "partial" ? `Semantic (${vec.model}, ${semCount} vectors${vec.missing ? `, ${vec.missing} pending` : ""})` : `Tag fallback — embeddings ${vec?.status ?? "unavailable"}`}
          </p>
          {vec?.error && <p className="text-xs text-destructive">{vec.error}</p>}
        </div>
        <div>
          <p className="font-bold text-navy">Interactions</p>
          <p>{hydrated ? `${state.swipes.length} swipes (${likes} likes) · bandit updates: ${bandit.n} · ${REC_CONFIG.featureVersion}` : "…"}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="font-bold text-navy">Strongest learned interests</p>
          <p>{interests.length ? interests.map(([k, w]) => `${keyLabel(k)} (${w})`).join(" · ") : "None yet — swipe right on a few events."}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="font-bold text-navy">Exploration ("Something new to try", ~{Math.round(REC_CONFIG.exploration.rate * 100)}% of cards)</p>
          <p>{exp.length ? `${exp.length} exploratory cards swiped: ${expLikes} liked, ${exp.length - expLikes} passed (like rate ${Math.round((expLikes / exp.length) * 100)}% vs ${state.swipes.length - exp.length ? Math.round(((likes - expLikes) / (state.swipes.length - exp.length)) * 100) : 0}% for regular cards).` : "No exploratory cards swiped yet."}</p>
          <p className="text-xs text-muted-foreground">Raw counts only — too little data to say whether exploration improves engagement or retention.</p>
        </div>
      </Panel>
      <Panel className="overflow-x-auto p-3">
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-1">#</th><th className="p-1">Event</th><th className="p-1">Vector</th><th className="p-1">Semantic</th><th className="p-1">Predicted</th><th className="p-1">Explore (σ)</th><th className="p-1">Time</th><th className="p-1">MMR −</th><th className="p-1">Score</th><th className="p-1">Explore slot</th><th className="p-1">Reasons</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => {
              const b = r.breakdown!;
              return (
                <tr key={r.event.id} className="border-t border-border/40 align-top">
                  <td className="p-1">{i + 1}</td>
                  <td className="max-w-48 truncate p-1 font-semibold">{r.event.title}</td>
                  <td className="p-1">{b.mode}</td>
                  <td className="p-1">{f(b.semantic)}</td>
                  <td className="p-1">{f(b.predicted)}</td>
                  <td className="p-1">{f(b.exploration)} ({b.uncertainty.toFixed(2)})</td>
                  <td className="p-1">{f(b.time)}</td>
                  <td className="p-1">{b.diversityPenalty.toFixed(3)}</td>
                  <td className="p-1 font-bold">{r.score.toFixed(3)}</td>
                  <td className="p-1">{b.exploratory ? "yes" : "—"}</td>
                  <td className="p-1">{b.reasons.join("; ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
