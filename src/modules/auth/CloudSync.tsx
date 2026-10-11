import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { createLocalStorage, normalizeUserState, type UserState } from "@/modules/recommendations/storage";
import { useAuth } from "./AuthProvider";

/**
 * When signed in, the account's saved state replaces the on-device one (or, for a
 * brand-new account, the device state is uploaded). Changes are saved back, debounced.
 *
 * Safety rules:
 * - A failed read is NOT an empty account: we never overwrite cloud data after a read error.
 * - Debounced saves only fire for the state that is still current (no stale overwrites).
 * - Save failures surface as a toast instead of failing silently.
 * - Signing out restores the device's own local state so one account's preferences
 *   never leak into the signed-out session (or the next account on this device).
 */
export function CloudSync() {
  const { user } = useAuth();
  const { state, hydrated, replaceState } = useUserState();
  const loadedFor = useRef<string | null>(null);
  /** The newest state we intend to persist; a timer that fires for anything older is dropped. */
  const pending = useRef<UserState | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      if (loadedFor.current) {
        // Signed out: fall back to this device's own state.
        loadedFor.current = null;
        pending.current = null;
        replaceState(createLocalStorage().load());
      }
      return;
    }
    if (loadedFor.current === user.id) return;
    let cancelled = false;
    (async () => {
      const [{ data: row, error: readErr }, { data: profile }] = await Promise.all([
        supabase.from("user_app_state").select("state").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("onboarded_at").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (readErr) {
        // Don't touch local or cloud state — a failed read is not an empty account.
        console.error("Cloud state read failed:", readErr.message);
        toast.error("Couldn't load your saved picks. Your device copy is unchanged.");
        return;
      }
      if (row?.state) {
        replaceState(normalizeUserState(row.state as unknown as UserState));
      } else {
        const { error } = await supabase.from("user_app_state").upsert({ user_id: user.id, state: state as unknown as Json });
        if (error) {
          console.error("Cloud state upload failed:", error.message);
          toast.error("Couldn't save your picks to your account yet.");
          return;
        }
      }
      loadedFor.current = user.id;
      if (!profile?.onboarded_at) navigate({ to: "/onboarding" });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, hydrated]);

  useEffect(() => {
    if (!user || loadedFor.current !== user.id) return;
    pending.current = state;
    const snapshot = state;
    const t = setTimeout(() => {
      // A newer change arrived after this timer was set — skip the stale write.
      if (pending.current !== snapshot) return;
      void supabase
        .from("user_app_state")
        .upsert({ user_id: user.id, state: snapshot as unknown as Json, updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) {
            console.error("Cloud state save failed:", error.message);
            toast.error("Your latest changes couldn't be saved to your account.");
          }
        });
    }, 800);
    return () => clearTimeout(t);
  }, [state, user]);

  return null;
}
