// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("initializes a fresh backend with accounts, clubs, snapshots and protected Photon state", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as 'select null::uuid';
    `);
    await db.exec(readFileSync(new URL("../../supabase/bootstrap.sql", import.meta.url), "utf8"));
    const tables = await db.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname='public'",
    );
    for (const name of [
      "profiles",
      "user_app_state",
      "clubs",
      "club_messages",
      "event_snapshots",
      "photon_contacts",
      "photon_outbox",
    ]) {
      expect(tables.rows.find((row) => row.tablename === name)?.rowsecurity).toBe(true);
    }
    await db.exec(
      "insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'test@example.com', '{}'::jsonb)",
    );
    expect((await db.query("select * from profiles")).rows).toHaveLength(1);
  } finally {
    await db.close();
  }
}, 30000);
