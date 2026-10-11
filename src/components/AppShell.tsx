import { Link } from "@tanstack/react-router";
import { UserRound, Bot, CalendarDays, Heart, Sparkles, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { Logo as Brand } from "@/components/Logo";

const NAV = [
  { to: "/", label: "Discover", icon: Sparkles },
  { to: "/saved", label: "Saved", icon: Heart },
  { to: "/plan", label: "Plan", icon: CalendarDays },
  { to: "/clubs", label: "Clubs", icon: Users },
  { to: "/assistant", label: "Assistant", icon: Bot },
] as const;

const BUBBLES = [
  { l: "10%", s: 22, d: "34s", delay: "0s", drift: "18px" },
  { l: "82%", s: 30, d: "40s", delay: "12s", drift: "-20px" },
  { l: "55%", s: 14, d: "30s", delay: "22s", drift: "-10px" },
];

const CLOUDS = [
  { t: "8%", l: "-8%", w: "46%", h: "12%", dur: "110s", delay: "0s" },
];

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="aero-sky absolute inset-0" />
      <div className="aero-sheen absolute inset-0" />
      {CLOUDS.map((c, i) => (
        <span
          key={i}
          className="aero-cloud"
          style={{
            top: c.t,
            left: c.l,
            width: c.w,
            height: c.h,
            ["--dur" as string]: c.dur,
            ["--delay" as string]: c.delay,
          }}
        />
      ))}
      <div className="water-line absolute inset-x-0 bottom-0 h-[30vh]" />
      <div className="aero-hill" />
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
    <Link to="/auth" className="aero-btn aero-pearl inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold">
      <UserRound className="size-4" />
      {user ? "Account" : "Sign in"}
    </Link>
  );
}

function Logo() {
  return (
    <Link to="/" aria-label="UNCover home" className="flex min-h-11 items-center rounded-full pr-2">
      <Brand />
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
        <div className="floating-nav mx-auto flex h-16 max-w-4xl items-center justify-between gap-2 rounded-full px-3 pl-4">
          <Logo />
          <nav className="hidden gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to !== "/clubs" }}
                className="nav-link inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-sm font-semibold text-navy/70 hover:text-navy"
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

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-6 md:px-6 md:pb-10">
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
