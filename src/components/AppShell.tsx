import { Link } from "@tanstack/react-router";
import { UserRound, Bot, CalendarDays, Heart, Sparkles, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useUserState } from "@/modules/recommendations/UserStateProvider";

const NAV = [
  { to: "/", label: "Discover", icon: Sparkles },
  { to: "/saved", label: "Saved", icon: Heart },
  { to: "/plan", label: "Plan", icon: CalendarDays },
  { to: "/clubs", label: "Clubs", icon: Users },
  { to: "/assistant", label: "Assistant", icon: Bot },
] as const;

const BUBBLES = [
  { l: "8%", s: 28, d: "26s", delay: "0s", drift: "24px" },
  { l: "84%", s: 36, d: "30s", delay: "8s", drift: "-28px" },
  { l: "62%", s: 14, d: "22s", delay: "14s", drift: "-12px" },
];

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="sky-water absolute inset-0" />
      <div className="water-line absolute inset-x-0 bottom-0 h-[38vh]" />
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="bubble"
          style={{ left: b.l, width: b.s, height: b.s, ["--dur" as string]: b.d, ["--delay" as string]: b.delay, ["--drift" as string]: b.drift }}
        />
      ))}
    </div>
  );
}

function AccountButton() {
  const { user, ready } = useAuth();
  if (!ready) return <span className="w-16" aria-hidden />;
  return (
    <Link to="/auth" className="aero-btn aero-pearl inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold">
      <UserRound className="size-4" />
      {user ? "Account" : "Sign in"}
    </Link>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="aero-btn aero-grass inline-flex size-9 items-center justify-center rounded-full font-display text-lg font-black">P</span>
      <span className="font-display text-xl font-bold text-navy">PulseMatch</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { state } = useUserState();
  const counts: Record<string, number> = { "/saved": state.saved.length, "/plan": state.plan.length };
  return (
    <div className="relative min-h-dvh">
      <Ambient />
      <header className="sticky top-3 z-30 px-3">
        <div className="floating-nav mx-auto flex h-14 max-w-4xl items-center justify-between rounded-full px-3 pl-4">
          <Logo />
          <nav className="hidden gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to !== "/clubs" }}
                className="nav-link rounded-full px-3.5 py-1.5 text-sm font-bold text-navy/70 hover:text-navy"
                activeProps={{ className: "nav-active text-navy" }}
              >
                {n.label}
                {!!counts[n.to] && <span key={counts[n.to]} className="count-bump ml-1 rounded-full bg-grass px-1.5 text-[10px] text-grass-foreground">{counts[n.to]}</span>}
              </Link>
            ))}
          </nav>
          <AccountButton />
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-5 md:pb-10">
        <main className="min-w-0">{children}</main>
      </div>

      <nav aria-label="Main" className="floating-nav fixed inset-x-3 bottom-3 z-40 rounded-full md:hidden">
        <ul className="grid grid-cols-5 p-1.5">
          {NAV.map((n) => (
            <li key={n.to}>
              <Link
                to={n.to}
                activeOptions={{ exact: n.to !== "/clubs" }}
                className="relative flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-bold text-navy/65"
                activeProps={{ className: "nav-active text-navy" }}
              >
                <n.icon className="size-5" aria-hidden />
                {n.label}
                {!!counts[n.to] && (
                  <span key={counts[n.to]} className="count-bump absolute right-3 top-0.5 rounded-full bg-grass px-1.5 text-[10px] text-grass-foreground">{counts[n.to]}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
