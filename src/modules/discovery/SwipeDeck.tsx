import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Heart, X, Undo2 } from "lucide-react";
import type { PulseEvent, RankedEvent, SwipeDirection } from "@/shared/types";
import { OrbButton } from "@/components/aero";
import { cn } from "@/lib/utils";
import { EventCard } from "./EventCard";

const THRESHOLD = 110;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Card lifecycle: idle → dragging → exiting → (record + select next) → entering → idle.
 * While exiting, the captured card is rendered — never ranked[0] — and nothing behind it shows a
 * real event, so the user never sees a runner-up that the re-rank then replaces.
 */
type Phase = "idle" | "dragging" | "exiting" | "entering";

export function SwipeDeck({
  ranked,
  onSwipe,
  onUndo,
  canUndo,
  onDetails,
  returning,
  onReturned,
}: {
  ranked: RankedEvent[];
  onSwipe: (e: PulseEvent, d: SwipeDirection) => void;
  onUndo: () => void;
  canUndo: boolean;
  onDetails: (e: PulseEvent) => void;
  /** Card restored by undo: slides back in from the side it left. */
  returning?: { id: string; dir: SwipeDirection } | null;
  onReturned?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [exit, setExit] = useState<{ card: RankedEvent; dir: SwipeDirection } | null>(null);
  const [dx, setDx] = useState(0);
  const [returnFrom, setReturnFrom] = useState<number | null>(null);
  const [ripple, setRipple] = useState<{ k: number; dir: SwipeDirection } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const busy = useRef(false);
  const active = exit?.card ?? ranked[0];

  // Warm the cache for the likely next images so the entering card doesn't pop.
  useEffect(() => {
    for (const r of ranked.slice(1, 4)) if (r.event.imageUrl) new Image().src = r.event.imageUrl;
  }, [ranked]);

  const finish = useCallback(() => {
    if (!exit) return;
    const { card, dir } = exit;
    setExit(null);
    setDx(0);
    onSwipe(card.event, dir); // recorded exactly once, here
    if (prefersReducedMotion()) {
      setPhase("idle");
      busy.current = false;
    } else setPhase("entering");
  }, [exit, onSwipe]);

  const commit = useCallback(
    (dir: SwipeDirection) => {
      const top = ranked[0];
      if (!top || busy.current) return;
      busy.current = true;
      setRipple({ k: Date.now(), dir });
      setExit({ card: top, dir });
      setPhase("exiting");
    },
    [ranked],
  );

  // Reduced motion: no transition will fire, so finish on the next commit.
  useEffect(() => {
    if (phase === "exiting" && prefersReducedMotion()) finish();
  }, [phase, finish]);

  // Undo: place the restored card off-screen on the side it left, then glide it back.
  useLayoutEffect(() => {
    if (!returning || !ranked[0] || ranked[0].event.id !== returning.id || busy.current) return;
    onReturned?.();
    if (prefersReducedMotion()) return;
    setReturnFrom(returning.dir === "like" ? 520 : -520);
    requestAnimationFrame(() => requestAnimationFrame(() => setReturnFrom(null)));
  }, [returning, ranked, onReturned]);

  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (ev.repeat || t.closest("input, textarea, [role=dialog]")) return;
      if (ev.key === "ArrowRight") commit("like");
      else if (ev.key === "ArrowLeft") commit("pass");
      else if (ev.key === "Enter" && ranked[0] && t === document.body) onDetails(ranked[0].event);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [commit, onDetails, ranked]);

  if (!active) return null;

  const exiting = phase === "exiting" && exit;
  const x = exiting ? (exit.dir === "like" ? 560 : -520) : returnFrom ?? dx;
  const y = exiting && exit.dir === "like" ? -120 : 0;
  const rot = Math.max(-14, Math.min(14, x / 24));
  const likeOpacity = Math.min(1, Math.max(0, x / THRESHOLD));
  const passOpacity = Math.min(1, Math.max(0, -x / THRESHOLD));
  const noTransition = phase === "dragging" || returnFrom !== null;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[min(calc(100dvh_-_360px),620px)] min-h-[360px] md:h-[min(calc(100dvh_-_240px),620px)] w-full max-w-md" aria-live="polite">
        {/* Abstract backplates only — never a real event that may be replaced. */}
        <div aria-hidden className="backplate absolute inset-x-6 bottom-[-14px] top-6 rounded-[2rem]" />
        <div aria-hidden className="backplate absolute inset-x-3 bottom-[-7px] top-3 rounded-[2rem]" />
        <div
          key={active.event.id}
          role="group"
          aria-label={`${active.event.title}. Right arrow to save, left arrow to pass.`}
          className={cn(
            "absolute inset-0 touch-pan-y cursor-grab active:cursor-grabbing",
            phase === "entering" && "animate-card-enter",
            x > 40 && "glow-like",
          )}
          style={{
            transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`,
            opacity: exiting && exit.dir === "pass" ? 0 : 1,
            transition: noTransition ? "none" : exiting ? "transform 280ms cubic-bezier(.4,0,.8,.6), opacity 280ms ease-in" : "transform 320ms cubic-bezier(.2,.9,.3,1.15)",
          }}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && e.propertyName === "transform" && phase === "exiting") finish();
          }}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && phase === "entering") {
              setPhase("idle");
              busy.current = false;
            }
          }}
          onPointerDown={(e) => {
            if (busy.current) return;
            start.current = { x: e.clientX, y: e.clientY };
            setPhase("dragging");
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => start.current && setDx(e.clientX - start.current.x)}
          onPointerUp={() => {
            if (!start.current) return;
            start.current = null;
            setPhase("idle");
            if (dx > THRESHOLD) commit("like");
            else if (dx < -THRESHOLD) commit("pass");
            else setDx(0);
          }}
          onPointerCancel={() => {
            start.current = null;
            setPhase("idle");
            setDx(0);
          }}
        >
          <EventCard ranked={active} onDetails={() => onDetails(active.event)} />
          <span style={{ opacity: likeOpacity }} className="aero-btn aero-grass pointer-events-none absolute left-6 top-24 -rotate-12 rounded-2xl px-4 py-2 text-2xl font-black">SAVE</span>
          <span style={{ opacity: passOpacity }} className="aero-btn aero-rose pointer-events-none absolute right-6 top-24 rotate-12 rounded-2xl px-4 py-2 text-2xl font-black">PASS</span>
        </div>
      </div>

      <div className="relative mt-5 flex items-center gap-5 rounded-full px-4 py-2">
        {ripple && <span key={ripple.k} aria-hidden className={cn("dock-ripple", ripple.dir === "like" ? "dock-ripple-like" : "dock-ripple-pass")} />}
        {ripple?.dir === "like" && <span key={`f${ripple.k}`} aria-hidden className="save-fly" />}
        <OrbButton tone="rose" className="press size-16" aria-label="Pass (left arrow)" onClick={() => commit("pass")}>
          <X className="size-8" strokeWidth={3} />
        </OrbButton>
        <OrbButton tone="pearl" className="press size-11" aria-label="Undo last swipe" disabled={!canUndo || phase !== "idle"} onClick={onUndo}>
          <Undo2 className="size-5" />
        </OrbButton>
        <OrbButton tone="grass" className="press size-16" aria-label="Save (right arrow)" onClick={() => commit("like")}>
          <Heart className="size-8" strokeWidth={3} fill="currentColor" />
        </OrbButton>
      </div>
      <p className="mt-2 hidden text-xs font-bold text-navy/60 md:block">← pass · → save</p>
    </div>
  );
}
