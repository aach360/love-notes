// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("bridges verified web members to club texts and checks membership again before sending", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as 'select null::uuid';`);
    await db.exec(readFileSync(new URL("../../supabase/bootstrap.sql", import.meta.url), "utf8"));
    const user = "11111111-1111-4111-8111-111111111111";
    const stranger = "22222222-2222-4222-8222-222222222222";
    await db.query(
      "insert into auth.users values($1,'member@example.test','{}'),($2,'stranger@example.test','{}')",
      [user, stranger],
    );
    const club = (
      await db.query<{ id: string }>(
        "insert into clubs(name,join_code) values('Test club','ABC123') returning id",
      )
    ).rows[0]!.id;
    const member = (
      await db.query<{ id: string }>(
        "insert into club_members(club_id,display_name,device_token_hash) values($1,'Web member','device-proof') returning id",
        [club],
      )
    ).rows[0]!.id;
    const contact = (
      await db.query<{ id: string }>(
        "insert into photon_contacts(project_id,sender,space_id,line_address,user_id) values('project','sender@example.test','dm','shared',$1) returning id",
        [user],
      )
    ).rows[0]!.id;
    const connect = (id: string, proof: string, enabled: boolean) =>
      db.query("select photon_club_link($1,$2,$3,$4)", [id, club, proof, enabled]);
    await expect(connect(stranger, "device-proof", true)).rejects.toThrow();
    await expect(connect(user, "wrong-device", true)).rejects.toThrow();
    await connect(user, "device-proof", true);
    await db.query("select photon_receive($1)", [
      JSON.stringify({
        projectId: "project",
        messageId: "message-1",
        sender: "sender@example.test",
        spaceId: "dm",
        lineAddress: "shared",
        command: "club",
        clubCode: "ABC123",
        clubBody: "From iMessage",
      }),
    ]);
    const messages = await db.query<{ member_id: string; source: string; body: string }>(
      "select member_id,source,body from club_messages",
    );
    expect(messages.rows).toEqual([
      { member_id: member, source: "imessage", body: "From iMessage" },
    ]);
    await db.exec("delete from photon_outbox");
    await db.query(
      "insert into photon_outbox(dedupe_key,contact_id,kind,club_id,body,expires_at) values('club-test',$1,'club',$2,'From web',now()+interval '5 minutes')",
      [contact, club],
    );
    const job = (
      await db.query<{ id: string; lease_token: string }>("select * from photon_claim('project')")
    ).rows[0]!;
    await connect(user, "device-proof", false);
    const gate = await db.query<{ photon_delivery: boolean }>(
      "select photon_delivery($1,$2,'sending')",
      [job.id, job.lease_token],
    );
    expect(gate.rows[0]!.photon_delivery).toBe(false);
    expect((await db.query("select * from club_messages")).rows).toHaveLength(1);
    expect(
      (
        await db.query<{ permitted: boolean }>(
          "select has_function_privilege('authenticated','photon_club_link(uuid,uuid,text,boolean)','EXECUTE') permitted",
        )
      ).rows[0]!.permitted,
    ).toBe(false);
  } finally {
    await db.close();
  }
}, 30000);
