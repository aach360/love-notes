import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OnboardingProfile, PulseEvent, SwipeDirection } from "@/shared/types";
import { applySwipe } from "./ranking";
import { banditFeatures, ensureBandit, updateBandit } from "./bandit";
import { createLocalStorage, emptyUserState, type UserState, type UserStateStorage } from "./storage";

interface Ctx {
  state: UserState;
  hydrated: boolean;
  /** recordSwipe(event, direction, features?): like also saves the event. `features` = the vector used when the card was shown. */
  recordSwipe: (event: PulseEvent, dir: SwipeDirection, features?: number[], exploratory?: boolean) => void;
  undoLast: () => void;
  removeSaved: (eventId: string) => void;
  /** Save an event without a swipe (e.g. from the assistant chat). No bandit reward. */
  saveEvent: (event: PulseEvent) => void;
  togglePlan: (event: PulseEvent) => void;
  setRemindersOptIn: (v: boolean) => void;
  /** Store onboarding answers; interests become an explicit cold-start prior on topic weights. */
  setOnboarding: (p: OnboardingProfile) => void;
  reset: () => void;
  /** Swap in state loaded from the signed-in account. */
  replaceState: (s: UserState) => void;
}

// Keep one context identity across hot reloads; a re-created context orphans consumers from the mounted provider.
const g = globalThis as { __pulseUserStateCtx?: React.Context<Ctx | null> };
const UserStateContext = (g.__pulseUserStateCtx ??= createContext<Ctx | null>(null));

export function UserStateProvider({ children, storage }: { children: ReactNode; storage?: UserStateStorage }) {
  const store = useRef<UserStateStorage | null>(storage ?? null);
  const [state, setState] = useState<UserState>(emptyUserState);
  const [hydrated, setHydrated] = useState(false);
  const history = useRef<UserState[]>([]);

  useEffect(() => {
    store.current ??= createLocalStorage();
    setState(store.current.load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) store.current?.save(state);
  }, [state, hydrated]);

  const update = useCallback((fn: (s: UserState) => UserState) => {
    setState((s) => {
      history.current = [...history.current.slice(-19), s];
      return fn(s);
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      state,
      hydrated,
      recordSwipe: (event, dir, features, exploratory) =>
        update((s) => {
          const now = new Date().toISOString();
          // One explicit swipe = one bandit reward. The auto-save of a like is not a second reward,
          // and a repeat swipe on the same event doesn't update the model again.
          const first = !s.swipes.some((x) => x.eventId === event.id);
          const x = features ?? banditFeatures(event, null, new Date());
          const bandit = first ? updateBandit(ensureBandit(s.prefs.bandit), x, dir === "like" ? 1 : 0) : ensureBandit(s.prefs.bandit);
          return {
            ...s,
            // Snapshot the event so the recommender can keep learning from it after it leaves the feed.
            swipes: [...s.swipes.filter((x) => x.eventId !== event.id), { eventId: event.id, direction: dir, at: now, event, ...(exploratory ? { exploratory: true } : {}) }],
            prefs: { ...applySwipe(s.prefs, event, dir), bandit },
            saved:
              dir === "like" && !s.saved.some((x) => x.eventId === event.id)
                ? [...s.saved, { eventId: event.id, savedAt: now, event }]
                : s.saved,
          };
        }),
      undoLast: () => {
        const prev = history.current.pop();
        if (prev) setState(prev);
      },
      saveEvent: (event) =>
        update((s) =>
          s.saved.some((x) => x.eventId === event.id)
            ? s
            : { ...s, saved: [...s.saved, { eventId: event.id, savedAt: new Date().toISOString(), event }] },
        ),
      removeSaved: (id) =>
        update((s) => ({ ...s, saved: s.saved.filter((x) => x.eventId !== id), plan: s.plan.filter((x) => x.eventId !== id) })),
      togglePlan: (event) =>
        update((s) =>
          s.plan.some((p) => p.eventId === event.id)
            ? { ...s, plan: s.plan.filter((p) => p.eventId !== event.id) }
            : { ...s, plan: [...s.plan, { eventId: event.id, addedAt: new Date().toISOString(), event }] },
        ),
      setRemindersOptIn: (v) => update((s) => ({ ...s, prefs: { ...s.prefs, remindersOptIn: v } })),
      setOnboarding: (p) =>
        update((s) => {
          // Explicit cold-start prior: chosen interests get a starting weight. This is NOT
          // fabricated swipe history — no swipes are written and the bandit count stays put.
          const weights = { ...s.prefs.weights };
          for (const id of p.interests) weights[`topic:${id}`] = Math.max(weights[`topic:${id}`] ?? 0, 1.5);
          return { ...s, prefs: { ...s.prefs, weights, onboarding: p } };
        }),
      reset: () => update(() => emptyUserState()),
      replaceState: (next) => { history.current = []; setState(next); },
    }),
    [state, hydrated, update],
  );

  return <UserStateContext.Provider value={value}>{children}</UserStateContext.Provider>;
}

export function useUserState() {
  const ctx = useContext(UserStateContext);
  if (!ctx) throw new Error("useUserState must be used inside UserStateProvider");
  return ctx;
}
