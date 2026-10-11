import { CalendarDays, ExternalLink, MapPin, Users, Ticket } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PulseEvent } from "@/shared/types";
import { formatEventDate } from "@/shared/time";
import { topicLabel } from "@/shared/taxonomy";
import { Chip } from "@/components/aero";
import { EventImage } from "./EventImage";
import { sourceLabel } from "./sourceLabel";
import type { ReactNode } from "react";

export function EventDetail({ event, onClose, actions }: { event: PulseEvent | null; onClose: () => void; actions?: ReactNode }) {
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="aero-panel max-h-[90dvh] overflow-y-auto rounded-[2rem] border-0 p-0 sm:max-w-lg">
        {event && (
          <>
            <div className="relative aspect-video overflow-hidden rounded-t-[2rem]">
              <EventImage event={event} />
              <div className="gloss absolute inset-0" />
            </div>
            <div className="aero-solid space-y-3 p-5">
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
              <div className="flex flex-wrap gap-2 pt-1">
                {actions}
                {event.sourceUrl ? (
                  <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="aero-btn aero-pearl inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold">
                    View on {sourceLabel(event)} <ExternalLink className="size-4" />
                  </a>
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground">Demo event — no source page.</span>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
