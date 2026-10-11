import type { PulseEvent } from "@/shared/types";

/** Human name of the site that owns an event's page (for "View on …" links and attribution). */
export function sourceLabel(e: Pick<PulseEvent, "source">): string {
  switch (e.source) {
    case "heellife-json":
    case "heellife-rss":
      return "Heel Life";
    case "unc-calendar":
      return "UNC Calendar";
    case "carrboro":
      return "Carrboro calendar";
    case "ackland":
      return "Ackland Art Museum";
    case "morehead":
      return "Morehead Planetarium";
    case "unc-libraries":
      return "UNC Libraries calendar";
    case "orange-county":
      return "Orange County calendar";
    case "ticketmaster":
      return "Ticketmaster";
    default:
      return "event page";
  }
}
