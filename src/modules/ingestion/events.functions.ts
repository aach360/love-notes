import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

/**
 * listEvents(): EventFeed — upcoming, deduped, non-ended events (cached server-side).
 */
export const listEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { getFeed } = await import("./importer");
  return getFeed();
});

export const eventsQuery = queryOptions({
  queryKey: ["events"],
  queryFn: () => listEvents(),
  staleTime: 5 * 60 * 1000,
});

/**
 * refreshImport({ token }) — PROTECTED manual re-import. Authorized server-side
 * against ADMIN_IMPORT_TOKEN. If that secret isn't set, the operation is disabled.
 */
export const refreshImport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const expected = process.env["ADMIN_IMPORT_TOKEN"];
    if (!expected) return { ok: false as const, error: "Admin import is not configured on this server." };
    if (data.token !== expected) return { ok: false as const, error: "Not authorized." };
    const { forceImport } = await import("./importer");
    return { ok: true as const, result: await forceImport() };
  });
