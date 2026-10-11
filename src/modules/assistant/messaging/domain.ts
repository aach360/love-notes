import type { PhotonCommand, PulseEvent } from "@/shared/types";
import { isEligibleForDiscover } from "@/shared/time";

export const HELP = `Text a question about UNC events, or use:
link CODE — connect your account, then confirm in the app
plan — your saved plan
reminders on / off — 30-minute plan reminders by default
remind EVENT_ID 30 — an individual reminder (15, 30 or 60 minutes)
cancel EVENT_ID — cancel an event reminder
STOP — stop all texts; START — resume replies
join CODE YourName — join a club
CODE message — post to a club; alerts on / off — club alerts
Other texts stay private with the bot.`;

export function parseCommand(text: string): PhotonCommand {
  const value = text.trim();
  const simple: Record<string, PhotonCommand["command"]> = {
    help: "help",
    "?": "help",
    plan: "plan",
    stop: "stop",
    start: "start",
    "reminders on": "reminders_on",
    "reminders off": "reminders_off",
    "alerts on": "alerts_on",
    "alerts off": "alerts_off",
  };
  const command = simple[value.toLowerCase().replace(/\s+/g, " ")];
  if (command) return { command } as PhotonCommand;
  let m = /^link\s+([A-Z0-9]{16})$/i.exec(value);
  if (m) return { command: "link", code: m[1]!.toUpperCase() };
  m = /^remind\s+(\S+)\s+(15|30|60)$/i.exec(value);
  if (m) return { command: "remind", eventId: m[1]!, leadMinutes: Number(m[2]) };
  m = /^cancel\s+(\S+)$/i.exec(value);
  if (m) return { command: "cancel", eventId: m[1]! };
  m = /^join\s+([A-Z0-9]{6})\s+(.{1,40})$/i.exec(value);
  if (m) return { command: "join", clubCode: m[1]!.toUpperCase(), displayName: m[2]!.trim() };
  m = /^([A-Z0-9]{6})\s+(.+)$/s.exec(value);
  if (m) return { command: "club", clubCode: m[1]!.toUpperCase(), clubBody: m[2]! };
  return { command: "ask", question: value.replace(/^ask\s+/i, "") };
}

export function reminderTime(event: PulseEvent, minutes: number): number | null {
  if (![15, 30, 60].includes(minutes) || event.isDemo || event.allDay) return null;
  const start = Date.parse(event.startsAt);
  return Number.isFinite(start) ? start - minutes * 60_000 : null;
}

export function canRemind(event: PulseEvent, now = new Date()): boolean {
  const fetched = Date.parse(event.lastFetchedAt);
  return (
    !event.isDemo &&
    !event.allDay &&
    isEligibleForDiscover(event, now) &&
    Date.parse(event.startsAt) > now.getTime() &&
    Number.isFinite(fetched) &&
    now.getTime() - fetched < 8 * 24 * 60 * 60 * 1000
  );
}

export function isReminderDue(event: PulseEvent, minutes: number, now = new Date()): boolean {
  const due = reminderTime(event, minutes);
  return (
    due !== null &&
    canRemind(event, now) &&
    due <= now.getTime() &&
    now.getTime() - due <= 5 * 60_000
  );
}

export function isAgentOnline(at: string | null, now = Date.now()): boolean {
  const age = at ? now - Date.parse(at) : Infinity;
  return Number.isFinite(age) && age >= 0 && age < 90_000;
}
