import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import { useUserState } from "./UserStateProvider";
import { keyLabel } from "./ranking";
import { cn } from "@/lib/utils";

/** Small personal status pill on Discover; expands to show what PulseMatch has learned. Scores live in /lab. */
export function TasteSidebar({ className }: { className?: string }) {
  const { state, reset } = useUserState();
  const [open, setOpen] = useState(false);
  const top = Object.entries(state.prefs.weights)
    .filter(([k, w]) => w > 0 && (state.prefs.likeCounts[k] ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const likes = state.swipes.filter((s) => s.direction === "like").length;
  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold text-navy shadow-float backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Sparkles className="size-3.5 text-primary" />
        {state.swipes.length ? `${state.swipes.length} swiped · ${likes} saved` : "Your pulse"}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="rameses-panel absolute right-0 z-20 mt-2 w-64 rounded-2xl bg-popover p-4 text-sm shadow-float">
          <p className="font-bold text-navy">You've been into</p>
          <p className="mt-1 text-foreground/75">{top.length ? top.map(([k]) => keyLabel(k)).join(" · ") : "Save a few events and your favorite kinds will show up here."}</p>
          <div className="mt-3 flex items-center justify-between text-xs font-bold">
            <Link to="/lab" className="text-primary hover:underline">Ranking details</Link>
            {state.swipes.length > 0 && (
              <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive" onClick={() => confirm("Reset swipes, saved events and plan?") && reset()}>
                <RotateCcw className="size-3" /> Start over
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
