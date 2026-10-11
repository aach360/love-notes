import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bot, ExternalLink, Send, MessageCircle } from "lucide-react";
import { eventsQuery } from "@/modules/ingestion/events.functions";
import { useAssistantChat } from "@/modules/assistant/AssistantChatProvider";
import { photonStatus } from "@/modules/assistant/photon";
import { AeroButton, OrbIcon, PageTitle, Panel } from "@/components/aero";
import { formatEventDate } from "@/shared/time";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Assistant — PulseMatch" },
      { name: "description", content: "Ask what's happening at UNC — answers come from real listed events with links." },
      { property: "og:title", content: "Assistant — PulseMatch" },
      { property: "og:description", content: "Ask about UNC campus events." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: Assistant,
});

const SUGGESTIONS = ["What's happening tomorrow?", "Find free events this weekend", "Any events with free food today?", "Live music this week"];

function Assistant() {
  const { data: feed } = useSuspenseQuery(eventsQuery);
  const [q, setQ] = useState("");
  // Shared with the corner Rameses widget — same conversation everywhere.
  const { log, ask: askShared } = useAssistantChat();
  const ask = (question: string) => {
    if (!question.trim()) return;
    askShared(question, feed.events);
    setQ("");
  };

  return (
    <div className="flex flex-col">
      <PageTitle title="Assistant" subtitle="Answers only from listed events, always with links." />
      <div className="space-y-3">
        {log.length === 0 && (
          <Panel className="p-5">
            <div className="flex items-center gap-3">
              <OrbIcon><Bot className="size-5" /></OrbIcon>
              <p className="text-sm font-semibold text-navy">Ask me about upcoming campus events.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <AeroButton key={s} tone="pearl" className="text-xs" onClick={() => ask(s)}>{s}</AeroButton>
              ))}
            </div>
          </Panel>
        )}
        {log.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <p className="aero-btn aero-aqua max-w-[80%] rounded-3xl rounded-br-md px-4 py-2 text-sm font-semibold">{m.q}</p>
            </div>
            <Panel className="aero-solid max-w-[92%] rounded-bl-md p-4">
              <p className="text-sm font-semibold text-navy">{m.a.text}</p>
              <ul className="mt-2 space-y-2">
                {m.a.events.map((e) => (
                  <li key={e.id} className="rounded-2xl bg-secondary p-3 text-sm">
                    <p className="font-bold text-navy">{e.title}{e.isDemo && " (demo)"}</p>
                    <p className="text-xs font-semibold text-muted-foreground">{formatEventDate(e)}{e.location ? ` · ${e.location}` : ""}</p>
                    {e.sourceUrl && (
                      <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary">
                        Source <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="aero-panel sticky bottom-24 mt-5 flex gap-2 rounded-full p-1.5 md:bottom-4"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What's happening this weekend?"
          aria-label="Ask about events"
          maxLength={300}
          className="min-w-0 flex-1 rounded-full bg-transparent px-4 text-sm font-semibold text-navy placeholder:text-muted-foreground focus:outline-none"
        />
        <AeroButton type="submit" aria-label="Ask"><Send className="size-4" /></AeroButton>
      </form>

      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-navy/70">
        <MessageCircle className="size-3.5" /> Text-message delivery: {photonStatus() === "ready" ? "available" : "not set up yet"}
      </p>
    </div>
  );
}
