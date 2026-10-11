import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  ready: boolean;
  signOut: () => Promise<void>;
}

// Keep one context identity across hot reloads so consumers stay attached to the mounted provider.
const g = globalThis as { __pulseAuthCtx?: React.Context<AuthCtx> };
const Ctx = (g.__pulseAuthCtx ??= createContext<AuthCtx>({ user: null, ready: false, signOut: async () => {} }));

/** Optional sign-in. Signed-out visitors keep the anonymous on-device session. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      setUser(session?.user ?? null);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data: d }) => {
      setUser(d.session?.user ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await qc.cancelQueries();
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ user, ready, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
