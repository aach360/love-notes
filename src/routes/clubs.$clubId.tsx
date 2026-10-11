import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";
import { AeroButton, PageTitle, Panel } from "@/components/aero";
import { StatePanel } from "@/components/StatePanel";
import { leaveClub, listClubs, listMessages, postMessage } from "@/modules/clubs/clubs.functions";
import { useClubDevice } from "@/modules/clubs/useClubDevice";
import { eventsQuery } from "@/modules/ingestion/events.functions";
import { formatEventDate } from "@/shared/time";

export const Route = createFileRoute("/clubs/$clubId")({
  head: () => ({
    meta: [
      { title: "Club chat — PulseMatch" },
      { name: "description", content: "Members-only club chat on PulseMatch, also reachable over iMessage." },
      { property: "og:title", content: "Club chat — PulseMatch" },
      { property: "og:description", content: "Your club's chat, all in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClubChat,
});

function ClubChat() {
  const { clubId } = Route.useParams();
  const navigate = useNavigate();
  const { device, memberships, refreshMemberships } = useClubDevice();
  const clubs = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs() });
  const club = clubs.data?.find((c) => c.id === clubId);
  const me = memberships.find((m) => m.clubId === clubId);
  const fetchMsgs = useServerFn(listMessages);
  const send = useServerFn(postMessage);
  const leave = useServerFn(leaveClub);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = useQuery({
    queryKey: ["club-messages", clubId, device?.deviceToken],
    queryFn: () => fetchMsgs({ data: { clubId, deviceToken: device!.deviceToken } }),
    enabled: !!device && !!me,
    refetchInterval: 4000,
  });
  const messages = msgs.data?.ok ? msgs.data.messages : [];
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [messages.length]);

  const events = useQuery(eventsQuery);
  const clubEvents = club
    ? (events.data?.events ?? []).filter((e) => e.organizer && e.organizer.toLowerCase().includes(club.name.toLowerCase())).slice(0, 3)
    : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!device || !text.trim()) return;
    setErr(null);
    const r = await send({ data: { clubId, deviceToken: device.deviceToken, body: text } });
    if (!r.ok) return setErr(r.error);
    setText("");
    msgs.refetch();
  }

  if (!device || clubs.isLoading) return null;
  if (!club) return <StatePanel tone="rose" icon={<MessageSquare className="size-6" />} title="Club not found"><Link to="/clubs" className="underline">Back to clubs</Link></StatePanel>;
  if (!me)
    return (
      <StatePanel tone="aqua" icon={<MessageSquare className="size-6" />} title={`${club.name} chat is members-only`}>
        <p>Ask a member for the 6-letter join code, then enter it on the Clubs page.</p>
        <Link to="/clubs" className="aero-btn aero-aqua mt-4 inline-flex rounded-full px-4 py-2 text-sm font-bold">Back to clubs</Link>
      </StatePanel>
    );

  return (
    <div>
      <Link to="/clubs" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-navy"><ArrowLeft className="size-4" /> Clubs</Link>
      <PageTitle title={club.name} subtitle={`${club.memberCount} ${club.memberCount === 1 ? "member" : "members"} · you're chatting as ${me.displayName}`} />

      <Panel className="mb-3 p-3">
        <div className="aero-solid rounded-2xl p-3 text-xs text-navy">
          <p>
            Invite members with join code <span className="rounded bg-muted px-2 py-0.5 font-mono text-sm font-bold">{me.joinCode}</span>
          </p>
          <p className="mt-1 text-muted-foreground">
            Prefer texting? Members can text the PulseMatch iMessage agent <span className="font-mono">join {me.joinCode} YourName</span> to get this chat on their phone (once the agent is switched on).
          </p>
        </div>
      </Panel>

      {clubEvents.length > 0 && (
        <Panel className="mb-3 p-3">
          <div className="aero-solid rounded-2xl p-3">
            <h2 className="text-sm font-bold text-navy">Upcoming from {club.name}</h2>
            <ul className="mt-1 space-y-1 text-xs">
              {clubEvents.map((e) => (
                <li key={e.id}>
                  {e.sourceUrl ? <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="font-bold text-navy underline">{e.title}</a> : <span className="font-bold">{e.title}</span>} — {formatEventDate(e)}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      <Panel className="p-2">
        <div className="aero-solid flex h-[55dvh] flex-col rounded-2xl">
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && <p className="text-center text-sm text-muted-foreground">No messages yet — say hi.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "aero-btn aero-aqua" : "bg-muted text-foreground"}`}>
                  {!m.mine && <p className="text-[11px] font-bold opacity-80">{m.authorName}{m.source === "imessage" ? " · via iMessage" : ""}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="mt-0.5 text-[10px] opacity-70">{new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form onSubmit={submit} className="flex gap-2 border-t border-border p-2">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Message the club…" aria-label="Message" className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm" />
            <AeroButton type="submit" tone="grass" className="px-4 py-2" aria-label="Send" disabled={!text.trim()}><Send className="size-4" /></AeroButton>
          </form>
          {err && <p className="px-3 pb-2 text-xs font-bold text-destructive">{err}</p>}
        </div>
      </Panel>

      <button
        className="mt-3 text-xs font-bold text-muted-foreground underline"
        onClick={async () => {
          await leave({ data: { clubId, deviceToken: device.deviceToken } });
          await refreshMemberships();
          navigate({ to: "/clubs" });
        }}
      >
        Leave this club
      </button>
    </div>
  );
}
