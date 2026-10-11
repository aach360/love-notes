import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MessageCircle, Plus, Star, Users, Search, ChevronRight } from "lucide-react";
import { AeroButton, PageTitle, Panel } from "@/components/aero";
import { StatePanel } from "@/components/StatePanel";
import { createClub, joinClub, listClubs } from "@/modules/clubs/clubs.functions";
import { useClubDevice } from "@/modules/clubs/useClubDevice";

const clubsQuery = queryOptions({ queryKey: ["clubs"], queryFn: () => listClubs() });

export const Route = createFileRoute("/clubs/")({
  head: () => ({
    meta: [
      { title: "Clubs — UNCitall" },
      {
        name: "description",
        content:
          "Star your UNC clubs and chat with members in one place instead of scattered group chats.",
      },
      { property: "og:title", content: "Clubs — UNCitall" },
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
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [code, setCode] = useState("");
  const [clubName, setClubName] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const memberOf = new Set(memberships.map((m) => m.clubId));
  const list = [...(clubs.data ?? [])].sort((a, b) => {
    const score = (id: string) =>
      (memberOf.has(id) ? 2 : 0) + (device?.starred.includes(id) ? 1 : 0);
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
        const r = await join({
          data: { code, displayName: name, deviceToken: device.deviceToken },
        });
        if (!r.ok) return setErr(r.error);
        await refreshMemberships();
        navigate({ to: "/clubs/$clubId", params: { clubId: r.membership.clubId } });
      } else {
        const m = await create({
          data: {
            name: clubName,
            description: desc || null,
            displayName: name,
            deviceToken: device.deviceToken,
          },
        });
        await refreshMemberships();
        navigate({ to: "/clubs/$clubId", params: { clubId: m.clubId } });
      }
    } catch {
      setErr("Something went wrong. Check the details and try again.");
    } finally {
      setBusy(false);
    }
  }

  const visible = list.filter(
    (club) =>
      (tab === "all" || memberOf.has(club.id)) &&
      `${club.name} ${club.description ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <PageTitle title="Clubs" subtitle="Find your people. Jump into a conversation." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="aero-control inline-flex rounded-full p-1"
          role="group"
          aria-label="Club lists"
        >
          {(["mine", "all"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={`min-h-11 rounded-full px-4 text-sm font-bold ${tab === value ? "aero-btn aero-aqua" : "text-navy"}`}
            >
              {value === "mine" ? "My clubs" : "Browse clubs"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <AeroButton
            onClick={() => {
              setMode(mode === "join" ? "none" : "join");
              setErr(null);
            }}
          >
            <Users className="size-4" /> Join a club
          </AeroButton>
          <AeroButton
            tone="pearl"
            onClick={() => {
              setMode(mode === "create" ? "none" : "create");
              setErr(null);
            }}
          >
            <Plus className="size-4" /> Create club
          </AeroButton>
        </div>
      </div>

      {mode !== "none" && (
        <Panel className="p-4 sm:p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="grid gap-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-navy">
                {mode === "join" ? "Join with an invite code" : "Start your club"}
              </h2>
              <button
                type="button"
                onClick={() => setMode("none")}
                className="min-h-11 px-3 text-sm text-muted-foreground"
              >
                Cancel
              </button>
            </div>
            <label className="grid gap-1 text-sm font-semibold text-navy">
              Your name in chat
              <input
                value={name}
                required
                maxLength={40}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Jordan"
                className="rounded-xl border border-border bg-background px-3 py-3"
              />
            </label>
            {mode === "join" ? (
              <label className="grid gap-1 text-sm font-semibold text-navy">
                Invite code
                <input
                  value={code}
                  required
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  maxLength={6}
                  placeholder="ABC123"
                  className="rounded-xl border border-border bg-background px-3 py-3 font-mono uppercase"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  Ask a club member for their six-character code.
                </span>
              </label>
            ) : (
              <>
                <label className="grid gap-1 text-sm font-semibold text-navy">
                  Club name
                  <input
                    value={clubName}
                    required
                    minLength={2}
                    maxLength={80}
                    onChange={(e) => setClubName(e.target.value)}
                    placeholder="Your club’s name"
                    className="rounded-xl border border-border bg-background px-3 py-3"
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-navy">
                  Description (optional)
                  <textarea
                    value={desc}
                    maxLength={500}
                    rows={2}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="What brings your club together?"
                    className="rounded-xl border border-border bg-background px-3 py-3"
                  />
                </label>
              </>
            )}
            {err && (
              <p role="alert" className="text-sm text-destructive">
                {err}
              </p>
            )}
            <AeroButton
              type="submit"
              disabled={
                busy ||
                !name.trim() ||
                (mode === "join" ? code.length !== 6 : clubName.trim().length < 2)
              }
              className="justify-self-start"
            >
              {busy ? "Please wait…" : mode === "join" ? "Join & open chat" : "Create & open chat"}
            </AeroButton>
          </form>
        </Panel>
      )}

      <label className="aero-control flex items-center gap-2 rounded-2xl px-4 text-muted-foreground">
        <Search className="size-4" />
        <input
          aria-label="Search clubs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "mine" ? "Search your clubs" : "Search all clubs"}
          className="min-h-12 w-full bg-transparent text-sm text-navy outline-none"
        />
      </label>
      {clubs.isLoading ? (
        <p role="status" className="text-sm text-navy">
          Loading clubs…
        </p>
      ) : clubs.isError ? (
        <StatePanel icon={<Users className="size-6" />} title="Could not load clubs">
          <button onClick={() => void clubs.refetch()} className="underline">
            Try again
          </button>
        </StatePanel>
      ) : visible.length === 0 ? (
        <StatePanel
          tone="aqua"
          icon={<Users className="size-6" />}
          title={
            search
              ? "No matching clubs"
              : tab === "mine"
                ? "Your clubs will appear here"
                : "No clubs yet"
          }
        >
          <p>
            {search
              ? "Try another name or clear your search."
              : "Join with an invite code, or create a club and invite your friends."}
          </p>
          {tab === "mine" && !search && (
            <button
              onClick={() => setTab("all")}
              className="mt-3 min-h-11 font-bold text-primary underline"
            >
              Browse clubs
            </button>
          )}
        </StatePanel>
      ) : (
        <ul className="aero-panel divide-y divide-border overflow-hidden rounded-3xl">
          {visible.map((c) => {
            const starred = !!device?.starred.includes(c.id);
            const member = memberOf.has(c.id);
            return (
              <li key={c.id} className="flex items-center gap-3 p-4">
                <span className="aero-control flex size-12 shrink-0 items-center justify-center rounded-2xl text-navy">
                  <MessageCircle className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  {member ? (
                    <Link
                      to="/clubs/$clubId"
                      params={{ clubId: c.id }}
                      className="font-bold text-navy hover:underline"
                    >
                      {c.name}
                    </Link>
                  ) : (
                    <h3 className="font-bold text-navy">{c.name}</h3>
                  )}
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                    {c.description ? ` · ${c.description}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => toggleStar(c.id)}
                  aria-label={starred ? `Unstar ${c.name}` : `Star ${c.name}`}
                  aria-pressed={starred}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-navy hover:bg-card"
                >
                  <Star className={`size-4 ${starred ? "fill-current" : ""}`} />
                </button>
                {member ? (
                  <Link
                    to="/clubs/$clubId"
                    params={{ clubId: c.id }}
                    aria-label={`Open ${c.name} chat`}
                    className="aero-btn aero-aqua inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold"
                  >
                    Chat <ChevronRight className="size-4" />
                  </Link>
                ) : (
                  <button
                    onClick={() => {
                      setMode("join");
                      setErr(null);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="aero-control min-h-11 rounded-full px-3 text-sm font-bold text-navy"
                  >
                    Join
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
