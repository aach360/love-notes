import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Club, ClubMembership, ClubMessage } from "@/shared/types";
import { admin, newJoinCode, sha256 } from "./clubs.server";

const token = z.string().min(20).max(100);
const name = z.string().trim().min(1).max(40);

async function memberFor(clubId: string, deviceToken: string) {
  const db = await admin();
  const hash = await sha256(deviceToken);
  const { data } = await db.from("club_members").select("id, display_name").eq("club_id", clubId).eq("device_token_hash", hash).maybeSingle();
  return data;
}

export const listClubs = createServerFn({ method: "GET" }).handler(async (): Promise<Club[]> => {
  const db = await admin();
  const { data: clubs, error } = await db.from("clubs").select("id, name, description, created_at").order("name");
  if (error) throw new Error("Could not load clubs");
  const { data: members } = await db.from("club_members").select("club_id");
  const counts = new Map<string, number>();
  for (const m of members ?? []) counts.set(m.club_id, (counts.get(m.club_id) ?? 0) + 1);
  return (clubs ?? []).map((c) => ({ id: c.id, name: c.name, description: c.description, createdAt: c.created_at, memberCount: counts.get(c.id) ?? 0 }));
});

export const createClub = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(500).nullable(), displayName: name, deviceToken: token }).parse(d),
  )
  .handler(async ({ data }): Promise<ClubMembership> => {
    const db = await admin();
    const code = newJoinCode();
    const { data: club, error } = await db.from("clubs").insert({ name: data.name, description: data.description || null, join_code: code }).select("id").single();
    if (error || !club) throw new Error("Could not create club");
    const { data: m, error: e2 } = await db
      .from("club_members")
      .insert({ club_id: club.id, display_name: data.displayName, device_token_hash: await sha256(data.deviceToken) })
      .select("id")
      .single();
    if (e2 || !m) throw new Error("Could not add you to the club");
    return { clubId: club.id, memberId: m.id, displayName: data.displayName, joinCode: code };
  });

export const joinClub = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().toUpperCase().length(6), displayName: name, deviceToken: token }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; membership: ClubMembership } | { ok: false; error: string }> => {
    const db = await admin();
    const { data: club } = await db.from("clubs").select("id, join_code").eq("join_code", data.code).maybeSingle();
    if (!club) return { ok: false, error: "That join code doesn't match any club." };
    const existing = await memberFor(club.id, data.deviceToken);
    if (existing) return { ok: true, membership: { clubId: club.id, memberId: existing.id, displayName: existing.display_name, joinCode: club.join_code } };
    const { data: m, error } = await db
      .from("club_members")
      .insert({ club_id: club.id, display_name: data.displayName, device_token_hash: await sha256(data.deviceToken) })
      .select("id")
      .single();
    if (error || !m) return { ok: false, error: "Could not join right now." };
    return { ok: true, membership: { clubId: club.id, memberId: m.id, displayName: data.displayName, joinCode: club.join_code } };
  });

/** Which clubs is this device a member of? */
export const myMemberships = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ deviceToken: token }).parse(d))
  .handler(async ({ data }): Promise<ClubMembership[]> => {
    const db = await admin();
    const { data: rows } = await db
      .from("club_members")
      .select("id, club_id, display_name, clubs(join_code)")
      .eq("device_token_hash", await sha256(data.deviceToken));
    return (rows ?? []).map((r) => ({
      clubId: r.club_id,
      memberId: r.id,
      displayName: r.display_name,
      joinCode: (r.clubs as { join_code: string } | null)?.join_code ?? "",
    }));
  });

export const leaveClub = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ clubId: z.string().uuid(), deviceToken: token }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    await db.from("club_members").delete().eq("club_id", data.clubId).eq("device_token_hash", await sha256(data.deviceToken));
    return { ok: true };
  });

export const listMessages = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ clubId: z.string().uuid(), deviceToken: token }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; messages: ClubMessage[] } | { ok: false; error: string }> => {
    const me = await memberFor(data.clubId, data.deviceToken);
    if (!me) return { ok: false, error: "Join this club to read its chat." };
    const db = await admin();
    const { data: rows } = await db
      .from("club_messages")
      .select("id, club_id, member_id, author_name, body, source, created_at")
      .eq("club_id", data.clubId)
      .order("created_at", { ascending: false })
      .limit(200);
    return {
      ok: true,
      messages: (rows ?? []).reverse().map((r) => ({
        id: r.id,
        clubId: r.club_id,
        authorName: r.author_name,
        body: r.body,
        source: r.source === "imessage" ? "imessage" : "web",
        createdAt: r.created_at,
        mine: r.member_id === me.id,
      })),
    };
  });

export const postMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ clubId: z.string().uuid(), deviceToken: token, body: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const me = await memberFor(data.clubId, data.deviceToken);
    if (!me) return { ok: false as const, error: "Join this club to post." };
    const db = await admin();
    const { error } = await db.from("club_messages").insert({ club_id: data.clubId, member_id: me.id, author_name: me.display_name, body: data.body, source: "web" });
    if (error) return { ok: false as const, error: "Message didn't send. Try again." };
    return { ok: true as const };
  });
