import type { Json } from "@/integrations/supabase/types";
import type {
  PhotonConnection,
  PhotonContact,
  PhotonDelivery,
  PhotonInbound,
  PhotonJob,
  PulseEvent,
} from "@/shared/types";
import { sha256 } from "@/modules/clubs/clubs.server";
import { formatEventDate, isEligibleForDiscover } from "@/shared/time";

import { checked, messagingDb } from "./database.server";
import {
  canRemind,
  HELP,
  isAgentOnline,
  isReminderDue,
  parseCommand,
  reminderTime,
} from "./domain";

/** Read durable snapshots without the Discover response cache before reminder decisions. */
async function latestEvents(): Promise<PulseEvent[]> {
  const db = await messagingDb();
  const rows = checked(await db.from("event_snapshots").select("events,fetched_at,complete")) ?? [];
  const now = new Date();
  const events = new Map<string, PulseEvent>();
  for (const row of rows) {
    if (
      !row.complete ||
      !row.fetched_at ||
      now.getTime() - Date.parse(row.fetched_at) >= 8 * 24 * 60 * 60 * 1000 ||
      !Array.isArray(row.events)
    )
      continue;
    // These records are written only by the existing server-side normalized importer.
    for (const event of row.events as unknown as PulseEvent[]) {
      if (
        event &&
        typeof event.id === "string" &&
        typeof event.startsAt === "string" &&
        isEligibleForDiscover(event, now) &&
        !event.isDemo
      )
        events.set(event.id, event);
    }
  }
  return [...events.values()];
}
function reminderBody(e: PulseEvent): string {
  return `Reminder: ${e.title} — ${formatEventDate(e)} Eastern${e.location ? `\n${e.location}` : ""}.\nLatest imported listing${e.sourceUrl ? `: ${e.sourceUrl}` : "."}\nReply STOP to stop texts.`;
}

export function configuration() {
  const projectId = process.env["PHOTON_PROJECT_ID"];
  const botAddress = process.env["PHOTON_BOT_ADDRESS"] || null;
  const configured = Boolean(
    projectId &&
    process.env["PHOTON_AGENT_TOKEN"] &&
    process.env["SUPABASE_URL"] &&
    process.env["SUPABASE_SERVICE_ROLE_KEY"],
  );
  return { projectId, botAddress, configured };
}
export function requireProject(project: string) {
  const config = configuration();
  if (!config.configured) throw new Error("Photon is unconfigured");
  if (project !== config.projectId) throw new Error("Wrong Photon project");
}

export async function connection(userId: string | null): Promise<PhotonConnection> {
  const config = configuration();
  if (!config.configured)
    return {
      status: "unconfigured",
      botAddress: config.botAddress,
      link: null,
      unknownDeliveries: 0,
    };
  try {
    const db = await messagingDb();
    const health = checked(
      await db
        .from("photon_health")
        .select("heartbeat_at")
        .eq("project_id", config.projectId!)
        .maybeSingle(),
    );
    let contact: PhotonContact | null = null;
    if (userId) {
      const rows = checked(
        await db
          .from("photon_contacts")
          .select("*")
          .eq("project_id", config.projectId!)
          .or(`user_id.eq.${userId},pending_user_id.eq.${userId}`),
      );
      contact =
        rows?.find((c) => c.user_id === userId) ??
        rows?.find((c) => c.pending_until && Date.parse(c.pending_until) > Date.now()) ??
        null;
    }
    let unknownDeliveries = 0;
    if (contact) {
      const result = await db
        .from("photon_outbox")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .eq("state", "unknown");
      checked(result);
      unknownDeliveries = result.count ?? 0;
    }
    return {
      status: isAgentOnline(health?.heartbeat_at ?? null) ? "online" : "offline",
      botAddress: config.botAddress,
      link: contact
        ? {
            id: contact.id,
            sender: contact.sender,
            pending: contact.user_id !== userId,
            remindersEnabled: contact.reminders_enabled,
            leadMinutes: contact.lead_minutes,
            suppressed: contact.suppressed,
          }
        : null,
      unknownDeliveries,
    };
  } catch {
    return {
      status: "unavailable",
      botAddress: config.botAddress,
      link: null,
      unknownDeliveries: 0,
    };
  }
}

export async function accountAction(userId: string, action: string, value: Json = {}) {
  if (!configuration().configured) throw new Error("Photon is not configured yet.");
  const db = await messagingDb();
  checked(await db.rpc("photon_account", { p_user: userId, p_action: action, p_value: value }));
}
export async function createCode(userId: string) {
  const code = [...crypto.getRandomValues(new Uint8Array(8))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  await accountAction(userId, "code", { hash: await sha256(code) });
  return { code, expiresAt: new Date(Date.now() + 600_000).toISOString() };
}

export async function receive(input: PhotonInbound) {
  requireProject(input.projectId);
  const db = await messagingDb();
  // Avoid repeated event lookup work; SQL repeats the check transactionally for side effects.
  if (
    checked(
      await db
        .from("photon_inbox")
        .select("message_id")
        .eq("project_id", input.projectId)
        .eq("message_id", input.messageId)
        .maybeSingle(),
    )
  )
    return;
  const contact = checked(
    await db
      .from("photon_contacts")
      .select("*")
      .eq("project_id", input.projectId)
      .eq("sender", input.sender)
      .maybeSingle(),
  );
  const cmd = parseCommand(input.text);
  if (contact && !["stop", "start"].includes(cmd.command)) {
    const rate = await db
      .from("photon_inbox")
      .select("message_id", { count: "exact", head: true })
      .eq("contact_id", contact.id)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    checked(rate);
    if ((rate.count ?? 0) >= 30) return;
  }
  let payload: Record<string, Json> = { ...input, ...cmd };
  if (cmd.command === "link") payload["codeHash"] = await sha256(cmd.code);
  if (cmd.command === "help") payload["reply"] = HELP;
  if (cmd.command === "ask" && !contact?.suppressed) {
    const { searchEvents } = await import("./event-search");
    const answer = searchEvents(cmd.question.slice(0, 300), await latestEvents());
    payload["reply"] = [
      answer.text,
      ...answer.events
        .slice(0, 3)
        .map(
          (e) =>
            `${e.title} — ${formatEventDate(e)} Eastern${e.location ? ` · ${e.location}` : ""}\n${e.sourceUrl ?? ""}\nFor a reminder: remind ${e.id} 30`,
        ),
    ].join("\n\n");
  }
  if (cmd.command === "remind" && !contact?.suppressed) {
    const events = await latestEvents();
    const event = events.find((e) => e.id === cmd.eventId);
    const due = event ? reminderTime(event, cmd.leadMinutes) : null;
    if (!event || !canRemind(event) || due === null || due <= Date.now()) {
      payload = {
        ...input,
        command: "help",
        reply:
          "That event cannot be scheduled at that lead time. Choose a future timed event from the current listings and use remind EVENT_ID 15, 30 or 60.",
      };
    } else {
      const at = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(due);
      payload["reply"] =
        `Reminder saved for ${event.title}: ${at} Eastern. Reply cancel ${event.id} to cancel, or STOP to stop all texts.`;
    }
  }
  checked(await db.rpc("photon_receive", { p: payload }));
}

async function enqueue(job: Partial<PhotonJob>) {
  const db = await messagingDb();
  checked(
    await db
      .from("photon_outbox")
      .upsert(job, { onConflict: "dedupe_key", ignoreDuplicates: true }),
  );
}

/** Reconcile from durable state each poll. Never requests event publishers. */
async function queueReminders(contacts: PhotonContact[], events: PulseEvent[], now: Date) {
  const db = await messagingDb();
  for (const c of contacts.filter((c) => c.user_id && !c.suppressed)) {
    const overrides =
      checked(await db.from("photon_reminders").select("*").eq("contact_id", c.id)) ?? [];
    const state = checked(
      await db.from("user_app_state").select("state").eq("user_id", c.user_id!).maybeSingle(),
    );
    const plan = planIds(state?.state);
    const requests = new Map<string, { lead: number; plan: boolean }>();
    if (c.reminders_enabled)
      for (const id of plan) requests.set(id, { lead: c.lead_minutes, plan: true });
    for (const r of overrides) {
      if (r.active) requests.set(r.event_id, { lead: r.lead_minutes, plan: false });
      else requests.delete(r.event_id);
    }
    for (const [id, r] of requests) {
      const e = events.find((e) => e.id === id);
      if (!e || !isReminderDue(e, r.lead, now)) continue;
      await enqueue({
        dedupe_key: JSON.stringify(["reminder", c.id, id, new Date(e.startsAt).toISOString()]),
        contact_id: c.id,
        kind: "reminder",
        event_id: id,
        event_start: e.startsAt,
        lead_minutes: r.lead,
        plan_derived: r.plan,
        body: reminderBody(e),
        expires_at: new Date(
          Math.min(Date.parse(e.startsAt), reminderTime(e, r.lead)! + 5 * 60_000),
        ).toISOString(),
      });
    }
  }
}
function planIds(state: Json | undefined): string[] {
  if (!state || typeof state !== "object" || Array.isArray(state) || !Array.isArray(state["plan"]))
    return [];
  return state["plan"].flatMap((item) =>
    item && typeof item === "object" && !Array.isArray(item) && typeof item["eventId"] === "string"
      ? [item["eventId"]]
      : [],
  );
}

async function queueClubs(contacts: PhotonContact[], events: PulseEvent[], now: Date) {
  const db = await messagingDb();
  for (const c of contacts.filter((c) => !c.suppressed)) {
    const members =
      checked(
        await db
          .from("club_members")
          .select("id,club_id,joined_at,alerts_opt_in,clubs(name)")
          .eq("phone", c.sender),
      ) ?? [];
    for (const m of members) {
      const after = new Date(
        Math.max(Date.parse(c.created_at), Date.parse(m.joined_at), now.getTime() - 10 * 60_000),
      ).toISOString();
      const messages =
        checked(
          await db
            .from("club_messages")
            .select("id,member_id,author_name,body,created_at")
            .eq("club_id", m.club_id)
            .gt("created_at", after)
            .order("created_at")
            .limit(200),
        ) ?? [];
      const name = m.clubs?.name ?? "club";
      for (const msg of messages) {
        if (msg.member_id === m.id) continue;
        await enqueue({
          dedupe_key: `club:${c.id}:${msg.id}`,
          contact_id: c.id,
          kind: "club",
          body: `[${name}] ${msg.author_name}: ${msg.body}`,
          expires_at: new Date(Date.parse(msg.created_at) + 10 * 60_000).toISOString(),
        });
      }
      if (!m.alerts_opt_in) continue;
      for (const e of events.filter(
        (e) => canRemind(e, now) && e.organizer?.toLowerCase().includes(name.toLowerCase()),
      )) {
        await enqueue({
          dedupe_key: `alert:${c.id}:${e.id}`,
          contact_id: c.id,
          kind: "alert",
          event_id: e.id,
          event_start: e.startsAt,
          body: `New from ${e.organizer}: ${e.title} — ${formatEventDate(e)} Eastern${e.sourceUrl ? `\n${e.sourceUrl}` : ""}`,
          expires_at: new Date(
            Math.min(now.getTime() + 600_000, Date.parse(e.startsAt)),
          ).toISOString(),
        });
      }
    }
  }
}

export async function poll(projectId: string): Promise<PhotonDelivery | null> {
  requireProject(projectId);
  const db = await messagingDb();
  const contacts =
    checked(await db.from("photon_contacts").select("*").eq("project_id", projectId)) ?? [];
  const events = await latestEvents();
  await queueReminders(contacts, events, new Date());
  await queueClubs(contacts, events, new Date());
  const jobs = checked(await db.rpc("photon_claim", { p_project: projectId }));
  const job = jobs?.[0];
  if (!job?.lease_token) return null;
  const contact = contacts.find((c) => c.id === job.contact_id);
  if (!contact) return null;
  return {
    id: job.id,
    lease: job.lease_token,
    spaceId: contact.space_id,
    lineAddress: contact.line_address,
    body: job.body,
  };
}

/** Final gate immediately before provider submission. SQL rechecks link, consent and cloud plan. */
export async function delivery(
  projectId: string,
  id: string,
  lease: string,
  action: "sending" | "sent" | "unknown" | "cancelled",
  providerId?: string,
): Promise<boolean> {
  requireProject(projectId);
  const db = await messagingDb();
  const job = checked(await db.from("photon_outbox").select("*").eq("id", id).maybeSingle());
  if (!job) return false;
  const contact = checked(
    await db
      .from("photon_contacts")
      .select("*")
      .eq("id", job.contact_id)
      .eq("project_id", projectId)
      .maybeSingle(),
  );
  if (!contact) return false;
  let target = action;
  if (action === "sending" && job.event_id) {
    const events = await latestEvents();
    const event = events.find((e) => e.id === job.event_id);
    if (
      !event ||
      !canRemind(event) ||
      Date.parse(event.startsAt) !== Date.parse(job.event_start ?? "") ||
      (job.kind === "reminder" && !isReminderDue(event, job.lead_minutes ?? 30))
    )
      target = "cancelled";
    if (target === "sending" && event && job.kind === "reminder")
      checked(
        await db
          .from("photon_outbox")
          .update({ body: reminderBody(event) })
          .eq("id", id)
          .eq("lease_token", lease)
          .eq("state", "leased"),
      );
    if (job.kind === "alert") {
      const members = checked(
        await db
          .from("club_members")
          .select("alerts_opt_in,clubs(name)")
          .eq("phone", contact.sender),
      );
      if (
        !members?.some(
          (m) =>
            m.alerts_opt_in &&
            m.clubs?.name &&
            event?.organizer?.toLowerCase().includes(m.clubs.name.toLowerCase()),
        )
      )
        target = "cancelled";
    }
  }
  const result = checked(
    await db.rpc("photon_delivery", {
      p_id: id,
      p_lease: lease,
      p_action: target,
      ...(providerId ? { p_provider: providerId } : {}),
    }),
  );
  if (action === "sending" && !result)
    checked(await db.rpc("photon_delivery", { p_id: id, p_lease: lease, p_action: "cancelled" }));
  return result === true && target === action;
}

export async function preparedBody(id: string, lease: string): Promise<string | null> {
  const db = await messagingDb();
  return (
    checked(
      await db
        .from("photon_outbox")
        .select("body")
        .eq("id", id)
        .eq("lease_token", lease)
        .eq("state", "sending")
        .maybeSingle(),
    )?.body ?? null
  );
}
