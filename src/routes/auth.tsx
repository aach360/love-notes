import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { checkGoogleSignIn } from "@/modules/auth/auth.functions";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AeroButton, PageTitle, Panel } from "@/components/aero";
import { useAuth } from "@/modules/auth/AuthProvider";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — UNCitall" },
      {
        name: "description",
        content: "Sign in to keep your UNC event picks, saved events and plan on every device.",
      },
      { property: "og:title", content: "Sign in — UNCitall" },
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
  const checkGoogle = useServerFn(checkGoogleSignIn);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verifying = useRef(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const tokenHash = url.searchParams.get("token_hash");
    if (tokenHash && url.searchParams.get("type") === "email" && !verifying.current) {
      verifying.current = true;
      setBusy(true);
      window.history.replaceState(null, "", "/auth");
      void supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: "email" })
        .then(({ error }) => {
          if (error)
            setErr(
              "This confirmation link has expired or was already used. Sign in, or request a new confirmation below.",
            );
          else {
            setMsg("Email confirmed. You’re ready to discover events.");
            void navigate({ to: "/" });
          }
        })
        .catch(() => setErr("Couldn’t confirm your email. Please try again."))
        .finally(() => setBusy(false));
      return;
    }
    const params = new URLSearchParams(window.location.hash.slice(1));
    const error = params.get("error_description");
    if (error) {
      setErr(error);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [navigate]);

  async function google() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const readiness = await checkGoogle();
      if (!readiness.ok) {
        setErr(readiness.error);
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: new URL("/auth", window.location.origin).href },
      });
      if (error) setErr(error.message);
    } catch {
      setErr("Couldn't start Google sign-in. Try again or use email.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: new URL("/auth", window.location.origin).href },
        });
        if (error) setErr(error.message);
        else if (data.session) await navigate({ to: "/" });
        else setMsg("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setErr(error.message);
        else await navigate({ to: "/" });
      }
    } catch {
      setErr("Couldn't reach sign-in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <PageTitle
          title="Your account"
          subtitle={`Signed in as ${user.email ?? "you"}. Your picks, saved events and plan sync to this account.`}
        />
        <Panel className="flex flex-wrap gap-2 p-4">
          <AeroButton onClick={() => navigate({ to: "/onboarding" })}>Redo taste cards</AeroButton>
          <AeroButton
            tone="pearl"
            onClick={async () => {
              await signOut();
              navigate({ to: "/" });
            }}
          >
            Sign out
          </AeroButton>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageTitle
        title={mode === "in" ? "Sign in" : "Create account"}
        subtitle="Optional — sign in to keep your picks and plan on every device."
      />
      <Panel className="space-y-4 p-5">
        <AeroButton className="w-full justify-center" onClick={google} disabled={busy}>
          Continue with Google
        </AeroButton>
        <div className="text-center text-xs text-muted-foreground">or use email</div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            aria-label="Email"
            required
            autoComplete="email"
            placeholder="you@unc.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-border bg-card/70 px-4 py-2.5"
          />
          <input
            type="password"
            aria-label="Password"
            required
            minLength={8}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-border bg-card/70 px-4 py-2.5"
          />
          {err && (
            <p role="alert" className="text-sm text-destructive">
              {err}
            </p>
          )}
          {msg && <p className="text-sm font-bold text-navy">{msg}</p>}
          <AeroButton type="submit" tone="grass" disabled={busy} className="w-full justify-center">
            {mode === "in" ? "Sign in" : "Create account"}
          </AeroButton>
        </form>
        <button
          type="button"
          disabled={busy || !email.trim()}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            setMsg(null);
            try {
              const { error } = await supabase.auth.resend({
                type: "signup",
                email: email.trim(),
                options: { emailRedirectTo: new URL("/auth", window.location.origin).href },
              });
              if (error) setErr(error.message);
              else
                setMsg(
                  "If this account needs confirmation, a fresh link is on its way. Open the newest email.",
                );
            } catch {
              setErr("Couldn’t resend confirmation. Try again.");
            } finally {
              setBusy(false);
            }
          }}
          className="min-h-11 text-sm font-semibold text-primary disabled:opacity-50"
        >
          Resend confirmation email
        </button>
        <button
          type="button"
          disabled={busy}
          className="w-full text-sm font-bold text-primary underline"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setErr(null);
            setMsg(null);
          }}
        >
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </Panel>
    </div>
  );
}
