import { CalendarDays, ExternalLink, MapPin, Users, Ticket } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PulseEvent } from "@/shared/types";
import { formatEventDate } from "@/shared/time";
import { topicLabel } from "@/shared/taxonomy";
import { Chip } from "@/components/aero";
import { EventImage } from "./EventImage";
import { sourceLabel } from "./sourceLabel";
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function EventDetail({ event, onClose, actions, sheet = false, restoreFocus }: { event: PulseEvent | null; onClose: () => void; actions?: ReactNode; sheet?: boolean; restoreFocus?: () => void }) {
  // Swipe down (from the top of the scroll) closes the sheet; otherwise it scrolls normally.
  const drag = useRef<{ y: number; x: number; dy: number; active: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (!sheet || !t) return;
    drag.current = { y: t.clientY, x: t.clientX, dy: 0, active: e.currentTarget.scrollTop <= 0 };
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const d = drag.current, t = e.touches[0];
    if (!d || !t || !d.active) return;
    const dy = t.clientY - d.y, dx = Math.abs(t.clientX - d.x);
    if (dy <= 0 || dx > dy) { d.dy = 0; e.currentTarget.style.transform = ""; return; }
    d.dy = dy;
    e.currentTarget.setAttribute("data-dragging", "");
    e.currentTarget.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.removeAttribute("data-dragging");
    if (d && d.dy > 90) { onClose(); return; }
    e.currentTarget.style.transform = "";
  };
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} onCloseAutoFocus={restoreFocus ? (e) => { e.preventDefault(); restoreFocus(); } : undefined} className={`${sheet ? "event-detail-sheet " : ""}aero-panel max-h-[90dvh] overflow-y-auto overscroll-contain rounded-[2rem] border-0 p-0 sm:max-w-lg`}>
        {event && (
          <>
            {sheet && <div className="sheet-grip" aria-hidden />}
            <div className="relative aspect-video overflow-hidden rounded-t-[2rem]">
              <EventImage key={`${event.id}:${event.imageUrl}`} event={event} eager />
              <div className="gloss absolute inset-0" />
            </div>
            <div className="aero-solid mx-auto w-full space-y-3 p-5 text-left sm:p-6">
              <DialogTitle className="text-2xl font-bold text-navy">{event.title}</DialogTitle>
              <DialogDescription asChild>
                <ul className="space-y-1 text-sm font-semibold text-foreground/80">
                  <li className="flex gap-2"><CalendarDays className="size-4 text-primary" />{formatEventDate(event)} (Eastern)</li>
                  {event.location && <li className="flex gap-2"><MapPin className="size-4 text-primary" />{event.location}</li>}
                  {event.organizer && <li className="flex gap-2"><Users className="size-4 text-primary" />{event.organizer}</li>}
                  <li className="flex gap-2"><Ticket className="size-4 text-primary" />{event.costText ?? "Cost not listed — check the event page"}</li>
                </ul>
              </DialogDescription>
              <div className="flex flex-wrap gap-1.5">
                {(event.topics ?? []).map((t) => <Chip key={t} className="border-primary/40 bg-primary/10">{topicLabel(t)}</Chip>)}
                {[...event.categories, ...event.tags].slice(0, 10).map((t) => <Chip key={t}>{t}</Chip>)}
              </div>
              {event.topicEvidence && Object.keys(event.topicEvidence).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-bold text-primary">Why these topics?</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground/80">
                    {Object.entries(event.topicEvidence).map(([topic, snippet]) => (
                      <li key={topic}><span className="font-bold">{topicLabel(topic)}:</span> “{snippet}”</li>
                    ))}
                  </ul>
                </details>
              )}
              {event.aiSummary && (
                <div className="rounded-2xl bg-secondary p-3 text-sm">
                  <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">AI summary · may miss details</p>
                  <p>{event.aiSummary}</p>
                  {event.sourceUrl && <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-bold text-primary underline">Check the original listing</a>}
                </div>
              )}
              {event.description && <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">{event.description}</p>}
              <p className="text-xs text-muted-foreground">Saving an event doesn't register you. Register or RSVP on the original event page.</p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {actions}
                {event.sourceUrl ? (
                  <Button asChild variant="dock" size="touch">
                    <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer">
                      Register / RSVP · {sourceLabel(event)} <ExternalLink />
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground">No original event page was listed.</span>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
