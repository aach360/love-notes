import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AeroButton, PageTitle, Panel } from "@/components/aero";
import { useAuth } from "@/modules/auth/AuthProvider";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PulseMatch" },
      { name: "description", content: "Sign in to keep your UNC event picks, saved events and plan on every device." },
      { property: "og:title", content: "Sign in — PulseMatch" },
      { property: "og:description", content: "Keep your picks and plan across devices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && mode === "in" && busy) navigate({ to: "/" });
  }, [user, mode, busy, navigate]);

  async function google() {
    setErr(null);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) setErr(r.error.message ?? "Google sign-in failed.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    if (mode === "up") {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      setBusy(false);
      if (error) setErr(error.message);
      else setMsg("Check your email to confirm your account, then sign in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setBusy(false);
        setErr(error.message);
      }
    }
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <PageTitle title="Your account" subtitle={`Signed in as ${user.email ?? "you"}. Your picks, saved events and plan sync to this account.`} />
        <Panel className="flex flex-wrap gap-2 p-4">
          <AeroButton onClick={() => navigate({ to: "/onboarding" })}>Redo taste cards</AeroButton>
          <AeroButton tone="pearl" onClick={async () => { await signOut(); navigate({ to: "/" }); }}>Sign out</AeroButton>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageTitle title={mode === "in" ? "Sign in" : "Create account"} subtitle="Optional — sign in to keep your picks and plan on every device." />
      <Panel className="space-y-4 p-5">
        <AeroButton className="w-full justify-center" onClick={google}>Continue with Google</AeroButton>
        <div className="text-center text-xs text-muted-foreground">or use email</div>
        <form onSubmit={submit} className="space-y-3">
          <input type="email" required autoComplete="email" placeholder="you@unc.edu" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-2xl border border-border bg-card/70 px-4 py-2.5" />
          <input type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-2xl border border-border bg-card/70 px-4 py-2.5" />
          {err && <p className="text-sm text-destructive">{err}</p>}
          {msg && <p className="text-sm font-bold text-navy">{msg}</p>}
          <AeroButton type="submit" tone="grass" disabled={busy} className="w-full justify-center">{mode === "in" ? "Sign in" : "Create account"}</AeroButton>
        </form>
        <button type="button" className="w-full text-sm font-bold text-primary underline" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); setMsg(null); }}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </Panel>
    </div>
  );
}
