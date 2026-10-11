import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Camera, MessageCircle, Plus, Star, Users } from "lucide-react";
import { AeroButton, PageTitle, Panel } from "@/components/aero";
import { StatePanel } from "@/components/StatePanel";
import { createClub, joinClub, listClubs } from "@/modules/clubs/clubs.functions";
import { useClubDevice } from "@/modules/clubs/useClubDevice";

const clubsQuery = queryOptions({ queryKey: ["clubs"], queryFn: () => listClubs() });

export const Route = createFileRoute("/clubs/")({
  head: () => ({
    meta: [
      { title: "Clubs — PulseMatch" },
      { name: "description", content: "Star your UNC clubs and chat with members in one place instead of scattered group chats." },
      { property: "og:title", content: "Clubs — PulseMatch" },
      { property: "og:description", content: "One home for every club chat at UNC." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClubsPage,
});

function ClubsPage() {
  const clubs = useQuery(clubsQuery);
  const { device, memberships, toggleStar, setDisplayName, refreshMemberships } = useClubDevice();
  const navigate = useNavigate();
  const create = useServerFn(createClub);
  const join = useServerFn(joinClub);
  const [mode, setMode] = useState<"none" | "join" | "create">("none");
  const [code, setCode] = useState("");
  const [clubName, setClubName] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const memberOf = new Set(memberships.map((m) => m.clubId));
  const list = [...(clubs.data ?? [])].sort((a, b) => {
    const score = (id: string) => (memberOf.has(id) ? 2 : 0) + (device?.starred.includes(id) ? 1 : 0);
    return score(b.id) - score(a.id);
  });

  const name = device?.displayName ?? "";
  async function submit() {
    if (!device) return;
    if (!name.trim()) return setErr("Pick a display name first.");
    setBusy(true);
    setErr(null);
    try {
      if (mode === "join") {
        const r = await join({ data: { code, displayName: name, deviceToken: device.deviceToken } });
        if (!r.ok) return setErr(r.error);
        await refreshMemberships();
        navigate({ to: "/clubs/$clubId", params: { clubId: r.membership.clubId } });
      } else {
        const m = await create({ data: { name: clubName, description: desc || null, displayName: name, deviceToken: device.deviceToken } });
        await refreshMemberships();
        navigate({ to: "/clubs/$clubId", params: { clubId: m.clubId } });
      }
    } catch {
      setErr("Something went wrong. Check the details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle title="Clubs" subtitle="Star the clubs you follow. Members chat here instead of scattered group chats." />
      <Link to="/scan" className="aero-btn aero-pearl inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold">
        <Camera className="size-4" /> Scan a poster or club photo
      </Link>

      <Panel className="mb-4 p-4">
        <div className="aero-solid rounded-2xl p-3">
          <label className="text-xs font-bold text-navy" htmlFor="dn">Your display name</label>
          <input
            id="dn"
            value={name}
            maxLength={40}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Jordan (no sign-up needed)"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <AeroButton tone={mode === "join" ? "grass" : "aqua"} className="px-4 py-1.5 text-sm" onClick={() => setMode(mode === "join" ? "none" : "join")}>
              <Users className="size-4" /> Join with code
            </AeroButton>
            <AeroButton tone={mode === "create" ? "grass" : "pearl"} className="px-4 py-1.5 text-sm" onClick={() => setMode(mode === "create" ? "none" : "create")}>
              <Plus className="size-4" /> Start a club chat
            </AeroButton>
          </div>
          {mode === "join" && (
            <div className="mt-3 flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="6-letter code" className="flex-1 rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm uppercase" />
              <AeroButton tone="grass" disabled={busy || code.length !== 6} className="px-4 py-1.5 text-sm" onClick={submit}>Join</AeroButton>
            </div>
          )}
          {mode === "create" && (
            <div className="mt-3 grid gap-2">
              <input value={clubName} onChange={(e) => setClubName(e.target.value)} maxLength={80} placeholder="Club name (match its Heel Life or calendar organizer name to see its events)" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={2} placeholder="What's the club about? (optional)" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              <AeroButton tone="grass" disabled={busy || clubName.trim().length < 2} className="justify-self-start px-4 py-1.5 text-sm" onClick={submit}>Create & get join code</AeroButton>
            </div>
          )}
          {err && <p className="mt-2 text-xs font-bold text-destructive">{err}</p>}
        </div>
      </Panel>

      {clubs.isLoading ? null : list.length === 0 ? (
        <StatePanel tone="aqua" icon={<Users className="size-6" />} title="No clubs yet">
          <p>Be the first — start a chat for your club and share the join code.</p>
        </StatePanel>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((c) => {
            const starred = !!device?.starred.includes(c.id);
            const member = memberOf.has(c.id);
            return (
              <li key={c.id}>
                <Panel className="p-2">
                  <div className="aero-solid flex items-start gap-3 rounded-2xl p-3">
                    <button
                      onClick={() => toggleStar(c.id)}
                      aria-label={starred ? `Unstar ${c.name}` : `Star ${c.name}`}
                      aria-pressed={starred}
                      className={`aero-btn ${starred ? "aero-grass" : "aero-pearl"} inline-flex size-9 shrink-0 items-center justify-center rounded-full`}
                    >
                      <Star className={`size-4 ${starred ? "fill-current" : ""}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-navy">{c.name}</h3>
                      {c.description && <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>}
                      <p className="mt-1 text-xs font-semibold text-navy/70">
                        {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                        {member && <span className="ml-2 rounded-full bg-grass px-2 py-0.5 text-[10px] text-grass-foreground">You're a member</span>}
                      </p>
                    </div>
                    {member && (
                      <Link to="/clubs/$clubId" params={{ clubId: c.id }} className="aero-btn aero-aqua inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold">
                        <MessageCircle className="size-4" /> Chat
                      </Link>
                    )}
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
