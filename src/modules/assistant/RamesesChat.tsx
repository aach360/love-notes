import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { ExternalLink, Minus, Send, X } from "lucide-react";
import { eventsQuery } from "@/modules/ingestion/events.functions";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { formatEventDate } from "@/shared/time";
import { cn } from "@/lib/utils";
import { useAssistantChat } from "./AssistantChatProvider";
import rameses from "@/assets/tarheel-foot.png";

const SUGGESTIONS = ["What's happening this weekend?", "Find me something free", "Any events with free food today?"];

/**
 * Corner chat bubble: the Tar Heel foot peeks from the bottom-right edge.
 * Hover/tap reveals a greeting bubble; clicking opens the chat panel.
 * Uses the exact same askAssistant logic and shared conversation as the Assistant tab.
 * Hidden on the Assistant tab itself.
 */
export function RamesesChat() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: feed } = useQuery(eventsQuery);
  const { log, ask } = useAssistantChat();
  const { state, saveEvent } = useUserState();

  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [q, setQ] = useState("");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverCapable = useRef(false);

  useEffect(() => {
    hoverCapable.current = window.matchMedia("(hover: hover)").matches;
  }, []);

  // Auto-scroll to newest message.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [log, typing, open]);

  // Focus input when the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes the panel from anywhere (document-level, so it works
  // regardless of which element inside holds focus).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (typeTimer.current) clearTimeout(typeTimer.current);
    },
    [],
  );

  if (pathname.startsWith("/assistant")) return null;

  const enter = () => {
    if (!hoverCapable.current || open) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHovered(true);
  };
  const leave = () => {
    if (!hoverCapable.current || open) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), 400);
  };

  const openPanel = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
    setHovered(false);
  };
  const closePanel = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const send = (question: string) => {
    const text = question.trim();
    if (!text || !feed || typing) return;
    setQ("");
    setTyping(true);
    // Brief beat so the typing indicator reads as Rameses "thinking".
    typeTimer.current = setTimeout(() => {
      ask(text, feed.events);
      setTyping(false);
    }, 450);
  };

  const savedIds = new Set(state.saved.map((s) => s.eventId));
  const shown = hovered && !open;

  return (
    <div
      className="rameses-chat fixed bottom-0 right-2 z-40 flex flex-col items-end"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) closePanel();
      }}
    >
      {/* Greeting bubble with suggested prompts */}
      {shown && (
        <div className="rameses-bubble aero-panel mb-2 w-64 rounded-3xl rounded-br-md p-3" role="group" aria-label="Rameses suggestions">
          <button type="button" onClick={openPanel} className="block w-full text-left text-sm font-bold text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carolina rounded-xl">
            Need help finding an event? Ask me!
          </button>
          <div className="mt-2 flex flex-col gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  openPanel();
                  send(s);
                }}
                className="aero-btn aero-pearl rounded-full px-3 py-1.5 text-left text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carolina"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Ask Rameses"
          className="rameses-panel aero-panel mb-2 flex h-[min(30rem,calc(100dvh-9rem))] w-[min(22.5rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-3xl max-sm:fixed max-sm:inset-x-2 max-sm:bottom-2 max-sm:h-[55dvh] max-sm:w-auto"
        >
          <div className="flex shrink-0 items-center gap-2 bg-navy px-3 py-2.5 text-navy-foreground">
            <img src={rameses} alt="" className="size-8 rounded-full bg-white/90 object-contain p-0.5" />
            <p className="font-display flex-1 text-sm font-extrabold">Ask Rameses</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Minimize chat" className="rounded-full p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carolina">
              <Minus className="size-4" />
            </button>
            <button type="button" onClick={closePanel} aria-label="Close chat" className="rounded-full p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carolina">
              <X className="size-4" />
            </button>
          </div>

          <div ref={listRef} aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {log.length === 0 && !typing && (
              <div className="aero-solid max-w-[90%] rounded-3xl rounded-bl-md p-3">
                <p className="text-sm font-semibold text-navy">Hey! I can help you find events, plan your week, or track down free food. What's up?</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="aero-btn aero-pearl rounded-full px-2.5 py-1 text-[11px] font-bold">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {log.map((m, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-end">
                  <p className="aero-btn aero-aqua max-w-[85%] rounded-3xl rounded-br-md px-3 py-1.5 text-sm font-semibold">{m.q}</p>
                </div>
                <div className="aero-solid max-w-[92%] rounded-3xl rounded-bl-md p-3">
                  <p className="text-sm font-semibold text-navy">{m.a.text}</p>
                  {m.a.events.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {m.a.events.map((e) => (
                        <li key={e.id} className="rounded-2xl bg-secondary p-2.5 text-sm">
                          <p className="text-xs font-bold text-navy">
                            {e.title}
                            {e.isDemo && " (demo)"}
                          </p>
                          <p className="text-[11px] font-semibold text-muted-foreground">
                            {formatEventDate(e)}
                            {e.location ? ` · ${e.location}` : ""}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={savedIds.has(e.id)}
                              onClick={() => {
                                const full = feed?.events.find((f) => f.id === e.id);
                                if (full) saveEvent(full);
                              }}
                              className="aero-btn aero-aqua rounded-full px-2.5 py-0.5 text-[11px] font-bold disabled:opacity-50"
                            >
                              {savedIds.has(e.id) ? "Saved" : "Save"}
                            </button>
                            {e.sourceUrl && (
                              <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[11px] font-bold text-primary">
                                Source <ExternalLink className="size-3" />
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="aero-solid inline-flex gap-1 rounded-3xl rounded-bl-md px-4 py-3" aria-label="Rameses is typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(q);
            }}
            className="flex shrink-0 items-end gap-2 border-t border-border/40 p-2"
          >
            <textarea
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(q);
                }
              }}
              placeholder="Ask about events…"
              aria-label="Message Rameses"
              rows={1}
              maxLength={300}
              className="min-w-0 flex-1 resize-none rounded-2xl bg-secondary px-3 py-2 text-sm font-semibold text-navy placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-carolina"
            />
            <button type="submit" aria-label="Send" className="aero-btn aero-aqua rounded-full p-2.5">
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}

      {/* Peeking mascot trigger */}
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close Ask Rameses chat" : "Open Ask Rameses chat"}
        onClick={() => (open ? closePanel() : openPanel())}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) closePanel();
        }}
        className={cn(
          "rameses-chat-peek h-24 w-24 overflow-hidden rounded-t-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-carolina",
          open && "pointer-events-none opacity-0",
        )}
      >
        <img
          src={rameses}
          alt=""
          width={640}
          height={544}
          className={cn("rameses-img h-24 w-24 -scale-x-100 object-contain object-top drop-shadow-lg", hovered || open ? "rameses-up" : "rameses-down")}
        />
      </button>
    </div>
  );
}
