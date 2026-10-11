import { createFileRoute } from "@tanstack/react-router";
import { admin, checkAgentAuth } from "@/modules/clubs/clubs.server";
import { getFeed } from "@/modules/ingestion/importer";
import { formatEventDate } from "@/shared/time";

/**
 * Polled by the Spectrum agent. Returns texts to deliver:
 *  - club messages posted since `since` (mirrored to phone members, excluding the author)
 *  - event alerts for opted-in members whose club name matches an upcoming event's organizer
 * Alerts are recorded as handed to the agent so each is only handed over once.
 */
export const Route = createFileRoute("/api/public/agent/outbox")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = checkAgentAuth(request);
        if (denied) return denied;
        const sinceParam = new URL(request.url).searchParams.get("since");
        const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? sinceParam : new Date(Date.now() - 60_000).toISOString();
        const db = await admin();
        const now = new Date().toISOString();

        const { data: phones } = await db.from("club_members").select("id, club_id, phone, alerts_opt_in, clubs(name)").not("phone", "is", null);
        const out: { to: string; text: string }[] = [];
        if (!phones?.length) return Response.json({ cursor: now, messages: out });

        const clubIds = [...new Set(phones.map((p) => p.club_id))];
        const { data: msgs } = await db
          .from("club_messages")
          .select("club_id, member_id, author_name, body, created_at")
          .in("club_id", clubIds)
          .gt("created_at", since)
          .lte("created_at", now)
          .order("created_at");
        for (const m of msgs ?? []) {
          for (const p of phones) {
            if (p.club_id !== m.club_id || p.id === m.member_id) continue;
            const club = (p.clubs as { name: string } | null)?.name ?? "club";
            out.push({ to: p.phone!, text: `[${club}] ${m.author_name}: ${m.body}` });
          }
        }

        const opted = phones.filter((p) => p.alerts_opt_in);
        if (opted.length) {
          const feed = await getFeed();
          if (feed.origin !== "demo") {
            const { data: sent } = await db.from("agent_alerts_sent").select("member_id, event_id").in("member_id", opted.map((p) => p.id));
            const done = new Set((sent ?? []).map((s) => `${s.member_id}|${s.event_id}`));
            const record: { member_id: string; event_id: string }[] = [];
            for (const p of opted) {
              const club = (p.clubs as { name: string } | null)?.name?.toLowerCase();
              if (!club) continue;
              for (const e of feed.events) {
                if (!e.organizer?.toLowerCase().includes(club) || done.has(`${p.id}|${e.id}`)) continue;
                out.push({ to: p.phone!, text: `New from ${e.organizer}: ${e.title} — ${formatEventDate(e)}${e.sourceUrl ? `\n${e.sourceUrl}` : ""}` });
                record.push({ member_id: p.id, event_id: e.id });
              }
            }
            if (record.length) await db.from("agent_alerts_sent").upsert(record, { onConflict: "member_id,event_id" });
          }
        }
        return Response.json({ cursor: now, messages: out });
      },
    },
  },
});
