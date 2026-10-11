import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { PulseEvent } from "@/shared/types";
import { askAssistant, type AssistantAnswer } from "./assistant";

export interface ChatTurn {
  q: string;
  a: AssistantAnswer;
}

interface AssistantChatCtx {
  log: ChatTurn[];
  ask: (question: string, events: PulseEvent[]) => void;
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
  const ask = useCallback((question: string, events: PulseEvent[]) => {
    const q = question.trim();
    if (!q) return;
    setLog((l) => [...l, { q, a: askAssistant(q, events) }]);
  }, []);
  const clear = useCallback(() => setLog([]), []);
  const value = useMemo(() => ({ log, ask, clear }), [log, ask, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistantChat() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssistantChat must be used inside AssistantChatProvider");
  return ctx;
}
