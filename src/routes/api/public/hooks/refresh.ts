import { createFileRoute } from "@tanstack/react-router";
import { nyDateKey } from "@/shared/time";

/**
 * Scheduled twice-weekly event refresh: Monday & Thursday 04:00 America/New_York.
 * pg_cron calls this at 08:00 and 09:00 UTC on Mon/Thu (covering EDT and EST);
 * this handler picks the correct one by checking the current New York wall clock,
 * so the local refresh time never drifts with daylight-saving changes.
 *
 * The bearer token is the project's publishable key — a stray-traffic filter, not
 * an authentication boundary. The work here is idempotent (slot key) and safe to
 * trigger: it only refreshes public event listings.
 */
export const Route = createFileRoute("/api/public/hooks/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const expected = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!token || !expected || token !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const now = new Date();
        const dateKey = nyDateKey(now); // YYYY-MM-DD in America/New_York
        const [y, m, d] = dateKey.split("-").map(Number);
        const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        const hour = Number(
          new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now),
        );

        // Only Monday (1) and Thursday (4), during the 04:00 hour in New York.
        if ((weekday !== 1 && weekday !== 4) || hour !== 4) {
          return Response.json({ ok: true, skipped: "not the scheduled local slot", nyTime: `${dateKey} ${hour}:00` });
        }

        const slotKey = `${dateKey}:04:00:America/New_York`;
        const { claimRefreshSlot, finishRefreshSlot } = await import("@/modules/ingestion/snapshot-store");
        const claimed = await claimRefreshSlot(slotKey);
        if (!claimed) {
          return Response.json({ ok: true, skipped: "slot already ran", slot: slotKey });
        }

        const { forceImport } = await import("@/modules/ingestion/importer");
        const result = await forceImport();
        await finishRefreshSlot(slotKey, { origin: result.origin, total: result.total });
        return Response.json({ ok: true, slot: slotKey, origin: result.origin, total: result.total });
      },
    },
  },
});
