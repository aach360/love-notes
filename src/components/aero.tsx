import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "aqua" | "grass" | "rose" | "pearl";
const toneClass: Record<Tone, string> = { aqua: "aero-aqua", grass: "aero-grass", rose: "aero-rose", pearl: "aero-pearl" };

export function AeroButton({ tone = "aqua", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      {...p}
      className={cn(
        "aero-btn inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/50 disabled:opacity-50",
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
    <header className="mb-4">
      <h1 className="text-2xl font-bold text-navy drop-shadow-[0_1px_0_oklch(1_0_0/0.8)] md:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm font-semibold text-navy/75">{subtitle}</p>}
    </header>
  );
}
