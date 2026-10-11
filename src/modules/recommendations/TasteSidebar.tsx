import { useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import { useUserState } from "./UserStateProvider";
import { keyLabel } from "./ranking";
import { cn } from "@/lib/utils";

/** Small personal status pill on Discover; expands to show what UNCitall has learned. */
export function TasteSidebar({ className }: { className?: string }) {
  const { state, reset } = useUserState();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const top = Object.entries(state.prefs.weights)
    .filter(([k, w]) => w > 0 && (state.prefs.likeCounts[k] ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const likes = state.swipes.filter((s) => s.direction === "like").length;
  return (
    <div ref={container} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full bg-card px-2 py-1.5 sm:gap-1.5 sm:px-3 text-xs font-bold text-navy shadow-float backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Sparkles className="hidden size-3.5 text-primary sm:block" />
        <span className="sm:hidden">
          {state.swipes.length ? `${state.swipes.length} swiped` : "Pulse"}
        </span>
        <span className="hidden sm:inline">
          {state.swipes.length ? `${state.swipes.length} swiped · ${likes} saved` : "Your pulse"}
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="taste-panel fixed inset-x-3 top-36 z-20 max-h-[min(18rem,calc(100dvh-14rem))] overflow-y-auto md:absolute md:inset-x-auto md:top-full md:right-0 md:mt-2 md:w-64 rounded-2xl bg-popover p-4 text-sm shadow-float">
          <p className="font-bold text-navy">You've been into</p>
          <p className="mt-1 text-foreground/75">
            {top.length
              ? top.map(([k]) => keyLabel(k)).join(" · ")
              : "Save a few events and your favorite kinds will show up here."}
          </p>
          <div className="mt-3 flex items-center justify-between text-xs font-bold">
            {state.swipes.length > 0 && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive"
                onClick={() => confirm("Reset swipes, saved events and plan?") && reset()}
              >
                <RotateCcw className="size-3" /> Start over
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
