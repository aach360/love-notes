import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { askAssistantAI } from "./assistant.functions";
import type { AssistantAnswer } from "./assistant";

export interface ChatTurn {
  q: string;
  a: AssistantAnswer;
}

interface AssistantChatCtx {
  log: ChatTurn[];
  /** True while Rameses is writing a reply. */
  pending: boolean;
  ask: (question: string) => void;
  clear: () => void;
}

// Keep one context identity across hot reloads; a re-created context orphans consumers from the mounted provider.
const g = globalThis as { __pulseAssistantChatCtx?: React.Context<AssistantChatCtx | null> };
const Ctx = (g.__pulseAssistantChatCtx ??= createContext<AssistantChatCtx | null>(null));

/**
 * Shared assistant conversation. The Assistant tab and the corner Rameses widget
 * read and write the same log, so a conversation follows you between them.
 */
export function AssistantChatProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const ask = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q || pending) return;
      setPending(true);
      askAssistantAI({ data: { question: q } })
        .then((a) => setLog((l) => [...l, { q, a }]))
        .catch(() =>
          setLog((l) => [
            ...l,
            {
              q,
              a: {
                text: "I couldn't reach my event notes just now. Try again in a second.",
                interpretation: "assistant unavailable",
                events: [],
                source: "local",
              },
            },
          ]),
        )
        .finally(() => setPending(false));
    },
    [pending],
  );
  const clear = useCallback(() => setLog([]), []);
  const value = useMemo(() => ({ log, pending, ask, clear }), [log, pending, ask, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistantChat() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssistantChat must be used inside AssistantChatProvider");
  return ctx;
}
