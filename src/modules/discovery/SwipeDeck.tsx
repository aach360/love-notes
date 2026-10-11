import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Heart, X, Undo2, Check } from "lucide-react";
import type { PulseEvent, RankedEvent, SwipeDirection } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EventCard } from "./EventCard";
import { EventDetail } from "./EventDetail";

const THRESHOLD = 110;
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
type Phase = "idle" | "dragging" | "details" | "exiting" | "settling" | "entering";

export function SwipeDeck({
  ranked,
  onSwipe,
  onUndo,
  canUndo,
  returning,
  onReturned,
}: {
  ranked: RankedEvent[];
  onSwipe: (e: PulseEvent, d: SwipeDirection, card: RankedEvent) => void;
  onUndo: () => void;
  canUndo: boolean;
  returning?: { id: string; dir: SwipeDirection } | null;
  onReturned?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [active, setActive] = useState<RankedEvent | undefined>(ranked[0]);
  const [exit, setExit] = useState<{ card: RankedEvent; dir: SwipeDirection } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [returnFrom, setReturnFrom] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<SwipeDirection | "undo" | null>(null);
  const start = useRef<{
    x: number;
    y: number;
    intent: "horizontal" | "vertical" | null;
    pointer: number;
  } | null>(null);
  const busy = useRef(false);
  const recorded = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const focusBefore = useRef<HTMLElement | null>(null);

  // Keep a complete visible snapshot, not just an ID. Refreshes never replace its art or title.
  useLayoutEffect(() => {
    if (phase === "settling") {
      if (exit && ranked.some((r) => r.event.id === exit.card.event.id)) return;
      setActive(ranked[0]);
      setExit(null);
      setOffset({ x: 0, y: 0 });
      const reduced = prefersReducedMotion();
      setPhase(reduced || !ranked[0] ? "idle" : "entering");
      busy.current = !reduced && !!ranked[0];
    } else if (
      phase === "idle" &&
      (!active || !ranked.some((r) => r.event.id === active.event.id))
    ) {
      setActive(ranked[0]);
    }
  }, [ranked, phase, active, exit]);

  useEffect(() => {
    for (const r of ranked.slice(1, 4)) if (r.event.imageUrl) new Image().src = r.event.imageUrl;
  }, [ranked]);
  useEffect(() => {
    if (!confirmation) return;
    const timer = window.setTimeout(() => setConfirmation(null), 1000);
    return () => window.clearTimeout(timer);
  }, [confirmation]);

  const finish = useCallback(() => {
    if (!exit || recorded.current) return;
    recorded.current = true;
    setPhase("settling");
    setConfirmation(exit.dir);
    onSwipe(exit.card.event, exit.dir, exit.card);
  }, [exit, onSwipe]);
  const commit = useCallback(
    (dir: SwipeDirection) => {
      if (!active || busy.current) return;
      busy.current = true;
      recorded.current = false;
      start.current = null;
      setExit({ card: active, dir });
      setPhase("exiting");
    },
    [active],
  );

  // Transition-end is primary; the fallback also handles interrupted CSS/hidden tabs.
  useEffect(() => {
    if (phase !== "exiting") return;
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    const timer = window.setTimeout(finish, 380);
    return () => window.clearTimeout(timer);
  }, [phase, finish]);
  useEffect(() => {
    if (phase !== "entering") return;
    const timer = window.setTimeout(() => {
      busy.current = false;
      setPhase("idle");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useLayoutEffect(() => {
    const restored = ranked.find((r) => r.event.id === returning?.id);
    if (!returning || !restored || busy.current) return;
    setActive(restored);
    onReturned?.();
    if (prefersReducedMotion()) return;
    setReturnFrom(returning.dir === "like" ? 520 : -520);
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReturnFrom(null));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      setReturnFrom(null);
    };
  }, [returning, ranked, onReturned]);

  const openDetails = useCallback(() => {
    if (!active || busy.current) return;
    focusBefore.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    start.current = null;
    busy.current = true;
    setOffset({ x: 0, y: 0 });
    setPhase("details");
  }, [active]);
  const undo = useCallback(() => {
    if (!canUndo || busy.current) return;
    setConfirmation("undo");
    onUndo();
  }, [canUndo, onUndo]);
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const t = ev.target;
      if (
        !(t instanceof HTMLElement) ||
        ev.repeat ||
        busy.current ||
        t.closest("input, textarea, select, [role=dialog]")
      )
        return;
      if (ev.key === "ArrowRight") {
        ev.preventDefault();
        commit("like");
      } else if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        commit("pass");
      } else if (ev.key === "ArrowUp" || (ev.key === "Enter" && t === document.body)) {
        ev.preventDefault();
        openDetails();
      } else if (ev.key.toLowerCase() === "z" && !ev.metaKey && !ev.ctrlKey) {
        ev.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [commit, openDetails, undo]);

  if (!active) return null;
  const exiting = phase === "exiting" || phase === "settling";
  const x = exiting && exit ? (exit.dir === "like" ? 560 : -520) : (returnFrom ?? offset.x);
  const y = exiting && exit?.dir === "like" ? -120 : offset.y;
  const rot = Math.max(-14, Math.min(14, x / 24));
  const disabled = phase !== "idle";

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center">
      <div className="relative min-h-0 w-full max-w-md flex-1 md:max-h-[620px]">
        <div
          aria-hidden
          className="backplate absolute inset-x-6 bottom-[-14px] top-6 rounded-[2rem]"
        />
        <div
          aria-hidden
          className="backplate absolute inset-x-3 bottom-[-7px] top-3 rounded-[2rem]"
        />
        <div
          key={active.event.id}
          ref={cardRef}
          tabIndex={-1}
          role="group"
          aria-label={active.event.title}
          data-phase={phase}
          data-event-id={active.event.id}
          className={cn(
            "absolute inset-0 touch-none cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[2rem]",
            phase === "entering" && "animate-card-enter",
            x > 40 && "glow-like",
          )}
          style={{
            transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`,
            opacity: exiting && exit?.dir === "pass" ? 0 : 1,
            transition:
              phase === "dragging" || returnFrom !== null
                ? "none"
                : exiting
                  ? "transform 280ms cubic-bezier(.4,0,.8,.6), opacity 280ms ease-in"
                  : "transform 240ms cubic-bezier(.2,.9,.3,1)",
          }}
          onTransitionEnd={(e) => {
            if (
              e.target === e.currentTarget &&
              e.propertyName === "transform" &&
              phase === "exiting"
            )
              finish();
          }}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && phase === "entering") {
              setPhase("idle");
              busy.current = false;
            }
          }}
          onPointerDown={(e) => {
            if (
              busy.current ||
              e.button !== 0 ||
              !e.isPrimary ||
              (e.target instanceof Element && e.target.closest("button, a, summary, input"))
            )
              return;
            start.current = { x: e.clientX, y: e.clientY, intent: null, pointer: e.pointerId };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const s = start.current;
            if (!s || e.pointerId !== s.pointer) return;
            const dx = e.clientX - s.x,
              dy = e.clientY - s.y;
            if (!s.intent) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
              if (Math.abs(dx) > Math.abs(dy) * 1.25) s.intent = "horizontal";
              else if (Math.abs(dy) > Math.abs(dx) * 1.25) s.intent = "vertical";
              else return;
              setPhase("dragging");
            }
            setOffset(
              s.intent === "horizontal"
                ? { x: dx, y: 0 }
                : { x: 0, y: Math.max(-90, Math.min(25, dy * 0.45)) },
            );
          }}
          onPointerUp={(e) => {
            const s = start.current;
            if (!s || e.pointerId !== s.pointer) return;
            start.current = null;
            const dx = e.clientX - s.x,
              dy = e.clientY - s.y;
            if (s.intent === "horizontal" && Math.abs(dx) > THRESHOLD)
              commit(dx > 0 ? "like" : "pass");
            else if (s.intent === "vertical" && dy < -70) openDetails();
            else {
              setOffset({ x: 0, y: 0 });
              setPhase("idle");
            }
          }}
          onPointerCancel={() => {
            start.current = null;
            if (!busy.current) {
              setPhase("idle");
              setOffset({ x: 0, y: 0 });
            }
          }}
        >
          <EventCard ranked={active} onDetails={openDetails} />
          <span
            style={{ opacity: Math.min(1, Math.max(0, x / THRESHOLD)) }}
            className="swipe-stamp pointer-events-none absolute left-6 top-24 -rotate-12 text-like"
          >
            SAVE
          </span>
          <span
            style={{ opacity: Math.min(1, Math.max(0, -x / THRESHOLD)) }}
            className="swipe-stamp pointer-events-none absolute right-6 top-24 rotate-12 text-destructive"
          >
            PASS
          </span>
        </div>
      </div>
      <div
        className="action-dock relative mt-5 hidden items-center md:flex gap-2 p-2"
        role="group"
        aria-label="Event actions"
      >
        <Button
          variant="dockQuiet"
          size="touch"
          aria-label="Undo last swipe"
          title="Undo last swipe (Z)"
          disabled={!canUndo || disabled}
          onClick={undo}
        >
          <Undo2 />
        </Button>
        <span className="h-6 w-px bg-border" aria-hidden />
        <Button
          variant="dock"
          size="touch"
          aria-label="Pass (left arrow)"
          title="Pass (left arrow)"
          disabled={disabled}
          onClick={() => commit("pass")}
        >
          <X className="text-destructive" />
        </Button>
        <Button
          variant="dockSave"
          size="touch"
          className="min-w-24 font-bold"
          aria-label="Save (right arrow)"
          title="Save (right arrow)"
          disabled={disabled}
          onClick={() => commit("like")}
        >
          {confirmation === "like" ? (
            <Check className="text-like" />
          ) : (
            <Heart className="text-like" />
          )}{" "}
          Save
        </Button>
      </div>
      <div
        role="status"
        className="sr-only md:not-sr-only md:h-6 md:pt-1 md:text-xs md:font-bold md:text-navy"
      >
        {confirmation === "like"
          ? "Saved"
          : confirmation === "pass"
            ? "Passed"
            : confirmation === "undo"
              ? "Restored"
              : ""}
      </div>
      <EventDetail
        event={phase === "details" ? active.event : null}
        sheet
        onClose={() => {
          busy.current = false;
          setPhase("idle");
        }}
        restoreFocus={() => {
          const el = focusBefore.current;
          if (el?.isConnected && el !== document.body) el.focus();
          else cardRef.current?.focus();
        }}
      />
    </div>
  );
}
