import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

/** listEventVectors(): 64-dim semantic vectors for current live events (embeds a bounded batch of missing ones). */
export const listEventVectors = createServerFn({ method: "GET" }).handler(async () => {
  const { getFeed } = await import("@/modules/ingestion/importer");
  const { vectorsFor } = await import("./embeddings.server");
  const feed = await getFeed();
  return vectorsFor(feed.events);
});

export const eventVectorsQuery = queryOptions({
  queryKey: ["event-vectors"],
  queryFn: () => listEventVectors(),
  staleTime: 10 * 60 * 1000,
  // Keep filling in vectors while some are missing (bounded per call server-side).
  refetchInterval: (q) => (q.state.data?.status === "partial" ? 20_000 : false),
  retry: false,
});
