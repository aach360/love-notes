import { useState } from "react";
import type { PulseEvent } from "@/shared/types";
import { cn } from "@/lib/utils";

/** Abstract hue per category so image-less events get a distinct typographic card, not stock art. */
function hueFor(e: PulseEvent): number {
  const key = (e.topics?.[0] ?? e.categories[0] ?? e.title).toLowerCase();
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 360;
  return 180 + (h % 120); // stay in the blue/teal/green family
}

export function EventImage({ event, className }: { event: PulseEvent; className?: string; eager?: boolean }) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const hue = hueFor(event);
  const art = (
    <div
      className="typo-card absolute inset-0 flex items-end p-6"
      style={{ ["--h" as string]: hue }}
      aria-hidden
    >
      <span className="line-clamp-3 font-display text-3xl font-black leading-tight text-primary-foreground/90">{event.title}</span>
    </div>
  );
  if (!event.imageUrl || broken) return <div className={cn("relative size-full", className)}>{art}</div>;
  return (
    <div className={cn("relative size-full overflow-hidden bg-secondary", className)}>
      {!loaded && art}
      {/* Blurred fill + contained foreground: portraits and low-res flyers keep their subject instead of being cropped or stretched. */}
      <img src={event.imageUrl} alt="" aria-hidden draggable={false} className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-xl" />
      <img
        src={event.imageUrl}
        alt=""
        draggable={false}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setBroken(true)}
        className={cn("relative size-full select-none object-contain transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}
