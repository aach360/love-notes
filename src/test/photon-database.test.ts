// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
const project = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const user2 = "33333333-3333-4333-8333-333333333333";
let db: PGlite;
let seq = 0;
const receive = async (command: string, extra: Record<string, unknown> = {}) => {
  const p = {
    projectId: project,
    messageId: `msg-${++seq}`,
    sender: "student@example.test",
    spaceId: "any;-;student@example.test",
    lineAddress: "+15550000000",
    command,
    reply: "Reply",
    ...extra,
  };
  return db.query<{ photon_receive: boolean }>("select photon_receive($1::jsonb)", [
    JSON.stringify(p),
  ]);
};
const account = (action: string, value: Record<string, unknown> = {}, id = user) =>
  db.query("select photon_account($1,$2,$3::jsonb)", [id, action, JSON.stringify(value)]);
const contact = async () =>
  (
    await db.query<{
      id: string;
      user_id: string | null;
      reminders_enabled: boolean;
      suppressed: boolean;
    }>("select * from photon_contacts limit 1")
  ).rows[0]!;
const link = async () => {
  await account("code", { hash: "code" });
  await receive("link", { codeHash: "code" });
  await account("confirm", { contactId: (await contact()).id });
  await db.exec("delete from photon_outbox");
};
const claim = async () =>
  (
    await db.query<{ id: string; lease_token: string; state: string }>(
      "select * from photon_claim($1)",
      [project],
    )
  ).rows[0];
const delivery = async (id: string, lease: string, action: string) =>
  (
    await db.query<{ photon_delivery: boolean }>("select photon_delivery($1,$2,$3,$4)", [
      id,
      lease,
      action,
      action === "sent" ? "provider-id" : null,
    ])
  ).rows[0]!.photon_delivery;
const job = async (kind = "reply", plan = false) => {
  const c = await contact();
  return db.query(
    "insert into photon_outbox(dedupe_key,contact_id,kind,body,expires_at,event_id,event_start,lead_minutes,plan_derived) values($1,$2,$3,'test',now()+interval '5 minutes',$4,now()+interval '30 minutes',30,$5)",
    [`test-${++seq}`, c.id, kind, kind === "reminder" ? "event:1" : null, plan],
  );
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create table auth.users(id uuid primary key);
 create table public.clubs(id uuid primary key default gen_random_uuid(),name text,join_code text);
 create table public.club_members(id uuid primary key default gen_random_uuid(),club_id uuid references clubs(id),phone text,display_name text,alerts_opt_in boolean default false,joined_at timestamptz default now(),unique(club_id,phone));
 create table public.club_messages(id uuid primary key default gen_random_uuid(),club_id uuid,member_id uuid,author_name text,body text,source text,created_at timestamptz default now());
 create table public.user_app_state(user_id uuid primary key,state jsonb);
 `);
  await db.exec(
    readFileSync(
      new URL("../../supabase/migrations/20261010000000_photon_messaging.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query("insert into auth.users values($1),($2)", [user, user2]);
}, 30_000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  seq = 0;
  await db.exec(
    "truncate photon_contacts, photon_link_codes, photon_inbox, photon_outbox, photon_reminders, photon_health, user_app_state, club_messages, club_members, clubs cascade",
  );
});

describe("Photon transactions", () => {
  it("rejects expired codes and requires confirmation from the correct account", async () => {
    await account("code", { hash: "expired" });
    await db.exec("update photon_link_codes set expires_at=now()-interval '1 second'");
    await receive("link", { codeHash: "expired" });
    expect((await contact()).user_id).toBeNull();
    await account("code", { hash: "fresh" });
    await receive("link", { codeHash: "fresh" });
    await expect(account("confirm", { contactId: (await contact()).id }, user2)).rejects.toThrow();
    await account("confirm", { contactId: (await contact()).id });
    expect((await contact()).user_id).toBe(user);
    expect((await contact()).reminders_enabled).toBe(false);
    expect((await db.query("select * from photon_link_codes")).rows).toHaveLength(0);
  });
  it("consumes a link code only once, even with competing submissions", async () => {
    await account("code", { hash: "one" });
    await Promise.all([
      receive("link", { codeHash: "one", sender: "a@test.example" }),
      receive("link", { codeHash: "one", sender: "b@test.example" }),
    ]);
    expect(
      (await db.query("select * from photon_contacts where pending_user_id is not null")).rows,
    ).toHaveLength(1);
  });
  it("blocks personal commands for an unlinked sender", async () => {
    await receive("reminders_on");
    expect((await contact()).reminders_enabled).toBe(false);
    const replies = await db.query<{ body: string }>("select body from photon_outbox");
    expect(replies.rows[0]?.body).toContain("Connect and confirm");
  });
  it("deduplicates mutations and replies in the same transaction", async () => {
    await db.exec("insert into clubs(name,join_code) values('Club','ABC123')");
    await receive("join", { clubCode: "ABC123", displayName: "Student" });
    const input = { messageId: "repeat", command: "club", clubCode: "ABC123", clubBody: "Once" };
    await receive("club", input);
    await receive("club", input);
    expect((await db.query("select * from club_messages")).rows).toHaveLength(1);
    expect(
      (await db.query("select * from photon_outbox where dedupe_key like '%repeat'")).rows,
    ).toHaveLength(1);
  });
  it("STOP cancels queued work, suppresses club messages, and START does not restore reminders", async () => {
    await link();
    await account("preferences", { enabled: true, leadMinutes: 30 });
    await job();
    await receive("stop");
    expect((await contact()).suppressed).toBe(true);
    expect(await claim()).toBeUndefined();
    await receive("start");
    expect((await contact()).suppressed).toBe(false);
    expect((await contact()).reminders_enabled).toBe(false);
  });
  it("concurrent polls lease once and acknowledgement requires the matching lease", async () => {
    await receive("help");
    const claims = await Promise.all([claim(), claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const c = claims.find(Boolean)!;
    expect(await delivery(c.id, user, "sending")).toBe(false);
    expect(await delivery(c.id, c.lease_token, "sending")).toBe(true);
    expect(await delivery(c.id, c.lease_token, "sent")).toBe(true);
    expect(await delivery(c.id, c.lease_token, "sent")).toBe(true);
    expect(await claim()).toBeUndefined();
  });
  it("rechecks plan removal and opt-out after a lease is acquired", async () => {
    await link();
    await account("preferences", { enabled: true, leadMinutes: 30 });
    await db.query("insert into user_app_state values($1,$2)", [
      user,
      JSON.stringify({ plan: [{ eventId: "event:1" }] }),
    ]);
    await job("reminder", true);
    const c = (await claim())!;
    await db.exec("update user_app_state set state='{\"plan\":[]}'");
    expect(await delivery(c.id, c.lease_token, "sending")).toBe(false);
    await receive("stop");
    expect(await delivery(c.id, c.lease_token, "sending")).toBe(false);
  });
  it("disconnect cancels pending messages and removes reminder subscriptions", async () => {
    await link();
    await receive("remind", { eventId: "event:1", leadMinutes: 30 });
    await job();
    await account("disconnect");
    expect((await contact()).user_id).toBeNull();
    expect((await db.query("select * from photon_reminders")).rows).toHaveLength(0);
    expect(await claim()).toBeUndefined();
  });
  it("marks interrupted sends unknown instead of resending on restart", async () => {
    await receive("help");
    const c = (await claim())!;
    await delivery(c.id, c.lease_token, "sending");
    await db.exec("update photon_outbox set lease_until=now()-interval '1 second'");
    expect(await claim()).toBeUndefined();
    expect(
      (await db.query<{ state: string }>("select state from photon_outbox")).rows[0]?.state,
    ).toBe("unknown");
  });
  it("recovers a lease that expired before submission", async () => {
    await receive("help");
    const first = (await claim())!;
    await db.exec("update photon_outbox set lease_until=now()-interval '1 second'");
    const second = (await claim())!;
    expect(second.id).toBe(first.id);
    expect(second.lease_token).not.toBe(first.lease_token);
  });
  it("keeps storage and mutation RPCs inaccessible to browser roles", async () => {
    const q = await db.query<{ can_read: boolean; can_execute: boolean }>(
      "select has_table_privilege('authenticated','photon_contacts','SELECT') can_read,has_function_privilege('anon','photon_receive(jsonb)','EXECUTE') can_execute",
    );
    expect(q.rows[0]).toEqual({ can_read: false, can_execute: false });
  });
});
