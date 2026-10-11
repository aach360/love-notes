import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, checkAgentAuth, normalizePhone } from "@/modules/clubs/clubs.server";
import { askAssistant } from "@/modules/assistant/assistant";
import { getFeed } from "@/modules/ingestion/importer";

const Body = z.object({ from: z.string().min(3).max(64), text: z.string().min(1).max(2000) });

const HELP =
  "PulseMatch commands:\n• join CODE YourName — join a club chat\n• ask <question> — e.g. ask what's on tonight\n• alerts on / alerts off — club event alerts\n• CODE your message — post to a specific club\nAnything else posts to your most recent club.";

/** Called by the Spectrum agent for every incoming iMessage. Returns the reply text (or null). */
export const Route = createFileRoute("/api/public/agent/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkAgentAuth(request);
        if (denied) return denied;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
        const phone = normalizePhone(parsed.data.from);
        const text = parsed.data.text.trim();
        const db = await admin();

        const join = /^join\s+([A-Za-z0-9]{6})\s+(.{1,40})$/i.exec(text);
        if (join) {
          const { data: club } = await db.from("clubs").select("id, name").eq("join_code", join[1]!.toUpperCase()).maybeSingle();
          if (!club) return Response.json({ reply: "That join code doesn't match any club." });
          const { error } = await db
            .from("club_members")
            .upsert({ club_id: club.id, phone, display_name: join[2]!.trim(), joined_at: new Date().toISOString() }, { onConflict: "club_id,phone" });
          if (error) return Response.json({ reply: "Couldn't join right now — try again." });
          return Response.json({ reply: `You're in ${club.name}'s chat. Text here to post; you'll get new messages from the website too. Reply "alerts on" for event alerts.` });
        }

        if (/^(help|\?)$/i.test(text)) return Response.json({ reply: HELP });

        const alerts = /^alerts\s+(on|off)$/i.exec(text);
        if (alerts) {
          const on = alerts[1]!.toLowerCase() === "on";
          const { data } = await db.from("club_members").update({ alerts_opt_in: on }).eq("phone", phone).select("id");
          if (!data?.length) return Response.json({ reply: "Join a club first: join CODE YourName" });
          return Response.json({ reply: on ? "Event alerts on for your clubs." : "Event alerts off." });
        }

        const ask = /^ask\s+(.+)$/is.exec(text);
        if (ask) {
          const feed = await getFeed();
          const a = askAssistant(ask[1]!, feed.events);
          const lines = a.events.slice(0, 3).map((e) => `• ${e.title}${e.sourceUrl ? ` ${e.sourceUrl}` : ""}`);
          const demo = feed.origin === "demo" ? "\n(Demo events — live listings unavailable.)" : "";
          return Response.json({ reply: [a.text, ...lines].join("\n") + demo });
        }

        // Post into a club chat.
        const { data: mine } = await db
          .from("club_members")
          .select("id, club_id, display_name, joined_at, clubs(join_code, name)")
          .eq("phone", phone)
          .order("joined_at", { ascending: false });
        if (!mine?.length) return Response.json({ reply: `Hi! ${HELP}` });
        const prefixed = /^([A-Za-z0-9]{6})\s+(.+)$/s.exec(text);
        let target = mine[0]!;
        let body = text;
        if (prefixed) {
          const hit = mine.find((m) => (m.clubs as { join_code: string } | null)?.join_code === prefixed[1]!.toUpperCase());
          if (hit) {
            target = hit;
            body = prefixed[2]!;
          }
        }
        const { error } = await db.from("club_messages").insert({ club_id: target.club_id, member_id: target.id, author_name: target.display_name, body: body.slice(0, 2000), source: "imessage" });
        if (error) return Response.json({ reply: "Message didn't post — try again." });
        return Response.json({ reply: null });
      },
    },
  },
});
