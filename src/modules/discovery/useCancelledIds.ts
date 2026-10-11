import { useQuery } from "@tanstack/react-query";
import { eventsQuery } from "@/modules/ingestion/events.functions";

/** IDs the live sources currently mark cancelled, so saved/planned copies can be flagged. */
export function useCancelledIds(): Set<string> {
  const { data } = useQuery(eventsQuery);
  return new Set(data?.cancelledIds ?? []);
}
