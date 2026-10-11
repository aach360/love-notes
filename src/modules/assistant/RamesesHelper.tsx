import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, X } from "lucide-react";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { askRameses } from "./assistant.functions";
import { EventDetail } from "@/modules/discovery/EventDetail";
import { formatEventDate } from "@/shared/time";
import type { PulseEvent } from "@/shared/types";

export function RamesesHelper() {
  const { state, saveEvent, togglePlan } = useUserState();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<PulseEvent | null>(null);
  const [messages, setMessages] = useState<
    { role: "user" | "model"; text: string; events?: PulseEvent[] }[]
  >([]);
  const ask = useServerFn(askRameses);
  const input = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);
  async function submit(text: string) {
    if (busy || !text.trim()) return;
    setQuestion("");
    setBusy(true);
    const history = messages.slice(-8).map(({ role, text }) => ({ role, text }));
    setMessages((old) => [...old, { role: "user", text }]);
    try {
      const reply = await ask({ data: { question: text, history } });
      setMessages((old) => [...old, { role: "model", text: reply.text, events: reply.events }]);
    } catch {
      setMessages((old) => [
        ...old,
        { role: "model", text: "Couldn’t reach the helper. Please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="rameses-helper fixed bottom-20 right-3 z-40 flex flex-col items-end md:bottom-0">
        {open && (
          <section
            aria-label="Chat with Rameses"
            className="aero-panel mb-1 flex h-[min(30rem,65dvh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          >
            <header className="flex items-center justify-between border-b border-border p-3">
              <div>
                <h2 className="font-bold text-navy">Rameses</h2>
                <p className="text-xs text-muted-foreground">
                  Your UNC helper · AI can make mistakes
                </p>
              </div>
              <button
                aria-label="Close Rameses chat"
                className="flex size-11 items-center justify-center rounded-full text-navy"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-live="polite">
              <p className="text-sm text-navy">
                Hey, Tar Heel! Need an event or a hand with UNCitall?
              </p>
              {!messages.length && (
                <div className="flex flex-wrap gap-2">
                  {["What’s happening today?", "How do I join a club?"].map((text) => (
                    <button
                      key={text}
                      onClick={() => void submit(text)}
                      disabled={busy}
                      className="aero-control rounded-xl p-2 text-xs text-navy"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`rounded-2xl p-3 text-sm text-navy ${message.role === "user" ? "ml-5 bg-secondary" : "mr-3 bg-card/80"}`}
                >
                  <p className="mb-1 text-[10px] font-bold">
                    {message.role === "user" ? "You" : "Rameses"}
                  </p>
                  <p className="whitespace-pre-wrap">{message.text}</p>
                  {message.events?.map((event) => {
                    const saved = state.saved.some((item) => item.eventId === event.id);
                    const planned = state.plan.some((item) => item.eventId === event.id);
                    return (
                      <div key={event.id} className="mt-2 rounded-xl border border-border p-2">
                        <button onClick={() => setDetail(event)} className="w-full text-left">
                          <span className="block font-bold">{event.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatEventDate(event)}
                          </span>
                        </button>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            onClick={() => saveEvent(event)}
                            disabled={saved}
                            className="aero-control min-h-11 rounded-xl px-3 text-xs font-bold disabled:opacity-60"
                          >
                            {saved ? "Saved ✓" : "Save"}
                          </button>
                          <button
                            onClick={() => togglePlan(event)}
                            aria-pressed={planned}
                            className="aero-btn aero-aqua min-h-11 rounded-xl px-3 text-xs font-bold"
                          >
                            {planned ? "In calendar ✓" : "Add to calendar"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {busy && (
                <p role="status" className="text-sm text-muted-foreground">
                  Rameses is thinking…
                </p>
              )}
              <div ref={bottom} />
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit(question);
              }}
              className="flex gap-2 border-t border-border p-3"
            >
              <input
                ref={input}
                aria-label="Ask Rameses"
                maxLength={1000}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask Rameses…"
                className="min-w-0 flex-1 rounded-full border border-border bg-background px-3 text-sm"
              />
              <button
                disabled={busy || !question.trim()}
                aria-label="Send question"
                className="aero-btn aero-aqua flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </form>
          </section>
        )}
        <button
          aria-label={open ? "Hide Rameses helper" : "Chat with Rameses"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`rameses-launcher block h-24 w-24 transition-transform duration-300 focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${open ? "translate-y-0" : "translate-y-12 hover:translate-y-0"}`}
        >
          <img
            src="/images/rameses-helper.png"
            alt=""
            className="h-full w-full object-contain [image-rendering:pixelated]"
          />
        </button>
      </div>
      <EventDetail event={detail} onClose={() => setDetail(null)} />
    </>
  );
}
