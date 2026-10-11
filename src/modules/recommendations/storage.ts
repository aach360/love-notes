import type { PlanItem, SavedEvent, Swipe, UserPreferences } from "@/shared/types";
import { emptyPreferences } from "./ranking";

export interface UserState {
  version: 1;
  swipes: Swipe[];
  saved: SavedEvent[];
  plan: PlanItem[];
  prefs: UserPreferences;
}

export const emptyUserState = (): UserState => ({
  version: 1,
  swipes: [],
  saved: [],
  plan: [],
  prefs: emptyPreferences(),
});

/**
 * Storage adapter. Default = anonymous local demo session (localStorage).
 * An authenticated implementation (database + RLS) can implement the same interface.
 */
export interface UserStateStorage {
  load(): UserState;
  save(state: UserState): void;
  clear(): void;
}

/** Fill defaults and remove retired model state (swipes, saved events and plan are kept). */
export function normalizeUserState(parsed: UserState | null | undefined): UserState {
  if (!parsed || parsed.version !== 1) return emptyUserState();
  const prefs = { ...emptyPreferences(), ...parsed.prefs };
  delete (prefs as UserPreferences & { bandit?: unknown }).bandit;
  // Drop any legacy demo events saved before demo data was removed.
  const real = <T extends { event: { isDemo?: boolean } }>(xs: T[] | undefined) =>
    (xs ?? []).filter((x) => !x.event?.isDemo);
  return {
    ...emptyUserState(),
    ...parsed,
    saved: real(parsed.saved),
    plan: real(parsed.plan),
    prefs,
  };
}

const KEY = "pulsematch:v1";

export function createLocalStorage(
  ls: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = typeof window !== "undefined"
    ? window.localStorage
    : null,
): UserStateStorage {
  return {
    load() {
      try {
        const raw = ls?.getItem(KEY);
        if (!raw) return emptyUserState();
        return normalizeUserState(JSON.parse(raw) as UserState);
      } catch {
        return emptyUserState();
      }
    },
    save(state) {
      try {
        ls?.setItem(KEY, JSON.stringify(state));
      } catch {
        /* quota — ignore */
      }
    },
    clear() {
      ls?.removeItem(KEY);
    },
  };
}
