import { cn } from "@/lib/utils";

/**
 * UNCover logo: a "U" whose right arm folds open at the top, like a page corner
 * being lifted to reveal what's underneath. Single silhouette, reads at 16px.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="uc-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--logo-top)" />
          <stop offset="1" stopColor="var(--logo-bottom)" />
        </linearGradient>
        <linearGradient id="uc-fold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--logo-fold-a)" />
          <stop offset="1" stopColor="var(--logo-fold-b)" />
        </linearGradient>
      </defs>
      {/* U body; right arm stops short where the fold begins */}
      <path d="M5 4h6v13a5 5 0 0 0 10 0v-6h6v6a11 11 0 0 1-22 0z" fill="url(#uc-body)" />
      {/* folded flap: the corner of the right arm turned outward */}
      <path d="M21 11V4h6z" fill="url(#uc-fold)" />
      <path d="M21 11l6-7v7z" fill="var(--logo-top)" opacity=".35" />
      {/* gloss */}
      <path d="M6.2 5h3.6v11.5c0 1.6.4 3 1.2 4.1C8 19.5 6.2 17 6.2 14z" fill="white" opacity=".35" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-[1.15rem] font-semibold tracking-[-0.02em] text-navy">
        <span className="font-bold">UNC</span>over
      </span>
    </span>
  );
}
