import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "aqua" | "grass" | "rose" | "pearl";
const toneClass: Record<Tone, string> = { aqua: "aero-aqua", grass: "aero-grass", rose: "aero-rose", pearl: "aero-pearl" };

export function AeroButton({ tone = "aqua", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      {...p}
      className={cn(
        "aero-btn inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/50 disabled:opacity-50",
        toneClass[tone],
        className,
      )}
    />
  );
}

/** Round glossy "orb" button for primary actions (like / pass). */
export function OrbButton({ tone = "aqua", className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; children: ReactNode }) {
  return (
    <button
      {...p}
      className={cn(
        "aero-btn inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/60",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Dimensional icon badge: glossy sphere behind an icon. */
export function OrbIcon({ tone = "aqua", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("aero-btn inline-flex size-9 shrink-0 items-center justify-center rounded-full", toneClass[tone], className)}>
      {children}
    </span>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("aero-panel rounded-3xl", className)}>{children}</div>;
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-primary/25 bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground", className)}>
      {children}
    </span>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6 space-y-2">
      <h1 className="text-2xl font-semibold leading-tight text-navy md:text-3xl">{title}</h1>
      {subtitle && <p className="text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
    </header>
  );
}
