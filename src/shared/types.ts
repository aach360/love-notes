/**
 * UNCitall shared data contract. SINGLE SOURCE OF TRUTH for models.
 * Owned jointly — changes require a heads-up to all four branches (see TEAM.md).
 *
 * Convention: `T | null` means "the source did not tell us" — never invent a value.
 */

/** "heellife-json" is retained for old saved snapshots only; the default Heel Life transport is RSS. */
export type EventSource =
  | "heellife-json"
  | "heellife-rss"
  | "unc-calendar"
  | "carrboro"
  | "ticketmaster"
  | "ackland"
  | "morehead"
  | "unc-libraries"
  | "orange-county"
  | "demo"
  | "submission";

/** Registry ID for a live source (Heel Life JSON/RSS are transports of one source). */
export type SourceId =
  | "heellife"
  | "unc-calendar"
  | "carrboro"
  | "ticketmaster"
  | "ackland"
  | "morehead"
  | "unc-libraries"
  | "orange-county";

export type EventStatus = "scheduled" | "cancelled" | "unknown";

export interface PulseEvent {
  /** Stable app ID: `${source-family}:${sourceEventId}` e.g. "heellife:12634707". Required. */
  id: string;
  /** Which adapter produced this record. Required. */
  source: EventSource;
  /** ID within the source system. Required. Dedupe key = family(source) + sourceEventId. */
  sourceEventId: string;
  /** Original public event page (registration lives there). Nullable. */
  sourceUrl: string | null;
  title: string;
  /** Plain text, HTML already stripped. Nullable. */
  description: string | null;
  /** ISO 8601 with offset. Required. */
  startsAt: string;
  /** ISO 8601 with offset. Nullable. */
  endsAt: string | null;
  /** IANA zone used for display. Always "America/New_York" for UNC sources. */
  timezone: string;
  location: string | null;
  organizer: string | null;
  imageUrl: string | null;
  /** Coarse, filterable buckets (e.g. "Arts"). */
  categories: string[];
  /** Finer descriptors, lower-case (e.g. "free food", "films, music, & performing arts"). */
  tags: string[];
  /** Admission cost in USD. 0 = confirmed free. null = unknown. */
  costAmount: number | null;
  costText: string | null;
  /** e.g. "UNC students only". Nullable. */
  eligibility: string | null;
  status: EventStatus;
  /** ISO timestamp of the import that produced this record. */
  lastFetchedAt: string;
  /** True only for fixture/demo data. Demo and real events are never mixed in one feed. */
  isDemo: boolean;
  /** Occurrence ID for recurring sources (Localist instance, ICS RECURRENCE-ID). Null/absent = single occurrence. */
  sourceOccurrenceId?: string | null;
  /** True = date-only listing. startsAt/endsAt then hold America/New_York midnights (end exclusive), not a meeting time. */
  allDay?: boolean | null;
  /** Every host the source lists (organizer = primary). */
  hosts?: string[];
  /** Raw source status string, kept for audit. */
  sourceStatus?: string | null;
  /** Classified interests from the shared taxonomy (see shared/taxonomy.ts). Generated labels, not source facts. */
  topics?: string[];
  formats?: string[];
  benefits?: string[];
  /** topic id → exact source passage supporting it. */
  topicEvidence?: Record<string, string>;
  taxonomyVersion?: string;
}

export type SwipeDirection = "like" | "pass";

export interface Swipe {
  eventId: string;
  direction: SwipeDirection;
  /** ISO timestamp */
  at: string;
  /** Snapshot kept so the recommender can learn from events after they leave the live feed. */
  event?: PulseEvent;
}

export interface SavedEvent {
  eventId: string;
  savedAt: string;
  /** Snapshot so Saved/Plan still render if the event drops out of the feed. */
  event: PulseEvent;
}

export interface PlanItem {
  eventId: string;
  addedAt: string;
  event: PulseEvent;
}

export interface UserPreferences {
  /** key = "cat:<category>" | "tag:<tag>", value = learned weight */
  weights: Record<string, number>;
  /** Count of LIKES per key — used only for honest "Because you liked…" explanations. */
  likeCounts: Record<string, number>;
  remindersOptIn: boolean;
  /** Onboarding answers. Interests are taxonomy topic IDs used as an explicit cold-start prior. */
  onboarding?: OnboardingProfile;
}

export interface OnboardingProfile {
  /** e.g. "meet-people" | "hobbies" | "curiosity" | "study-break" */
  intent?: string;
  interests: string[];
  /** Optional context only — never a hard filter. "undecided" / "prefer-not-to-say" allowed. */
  major?: string;
  year?: string;
  completedAt?: string;
}

export type DateFilter = "any" | "today" | "tomorrow" | "weekend" | "week";

export interface EventFilters {
  date: DateFilter;
  category: string | null;
  confirmedFreeOnly: boolean;
}

export type SourceRunStatus = "ok" | "error" | "unconfigured";

/** Per-source health for one refresh. A healthy empty source is status "ok" with eventCount 0. */
export interface SourceStatus {
  source: SourceId;
  status: SourceRunStatus;
  /** When the events being served were fetched (may be older than the last attempt if stale). */
  fetchedAt: string | null;
  eventCount: number;
  /** False when pagination was truncated or a later page failed. */
  complete: boolean;
  /** Serving a last-known-good snapshot because the latest attempt failed. */
  stale: boolean;
  /** Records skipped for missing identity/date fields. */
  skipped: number;
  /** Safe message, never contains credentials. */
  error: string | null;
}

export interface EventFeed {
  events: PulseEvent[];
  /** "live" = a usable source snapshot; otherwise the feed is empty and unavailable. */
  origin: "live" | "unavailable";
  fetchedAt: string | null;
  warnings: string[];
  sources: SourceStatus[];
  /** IDs the sources explicitly marked cancelled — lets Saved/Plan flag them. */
  cancelledIds: string[];
}

export interface RankedEvent {
  event: PulseEvent;
  score: number;
  /** Only present when backed by real like history. */
  reason: string | null;
}

export const DISPLAY_TZ = "America/New_York";

/* ---------------- Clubs (shared, server-persisted) ---------------- */

export interface Club {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

/** What this device knows about its own membership. Join code is only revealed to members. */
export interface ClubMembership {
  clubId: string;
  memberId: string;
  displayName: string;
  joinCode: string;
}

export type ChatSource = "web" | "imessage";

export interface ClubMessage {
  id: string;
  clubId: string;
  authorName: string;
  body: string;
  source: ChatSource;
  createdAt: string;
  /** True when this device wrote it. */
  mine: boolean;
}

/* ---------------- Photon messaging ---------------- */
export interface PhotonContact {
  id: string;
  project_id: string;
  sender: string;
  space_id: string;
  line_address: string;
  user_id: string | null;
  pending_user_id: string | null;
  pending_until: string | null;
  reminders_enabled: boolean;
  lead_minutes: number;
  suppressed: boolean;
  created_at: string;
  last_inbound_at: string;
}
export interface PhotonJob {
  club_id?: string | null;
  id: string;
  dedupe_key: string;
  contact_id: string;
  kind: "reply" | "club" | "alert" | "reminder";
  body: string;
  event_id: string | null;
  event_start: string | null;
  lead_minutes: number | null;
  plan_derived: boolean;
  state: "queued" | "leased" | "sending" | "sent" | "unknown" | "cancelled" | "failed";
  created_at: string;
  expires_at: string;
  lease_token: string | null;
  lease_until: string | null;
  provider_message_id: string | null;
  result_detail: string | null;
}
export interface PhotonReminder {
  contact_id: string;
  event_id: string;
  lead_minutes: number;
  active: boolean;
}
export interface PhotonConnection {
  status: "unconfigured" | "offline" | "online" | "unavailable";
  botAddress: string | null;
  link: {
    id: string;
    sender: string;
    pending: boolean;
    remindersEnabled: boolean;
    leadMinutes: number;
    suppressed: boolean;
  } | null;
  unknownDeliveries: number;
}
export interface PhotonInbound {
  projectId: string;
  messageId: string;
  sender: string;
  spaceId: string;
  lineAddress: string;
  text: string;
}
export interface PhotonDelivery {
  id: string;
  lease: string;
  spaceId: string;
  lineAddress: string;
  body: string;
}
export type PhotonCommand =
  | { command: "link"; code: string }
  | { command: "remind"; eventId: string; leadMinutes: number }
  | { command: "cancel"; eventId: string }
  | { command: "join"; clubCode: string; displayName: string }
  | { command: "club"; clubCode: string; clubBody: string }
  | { command: "ask"; question: string }
  | {
      command:
        | "help"
        | "plan"
        | "stop"
        | "start"
        | "reminders_on"
        | "reminders_off"
        | "alerts_on"
        | "alerts_off";
    };

export type PhotonAccountAction =
  | { action: "confirm"; contactId: string }
  | { action: "disconnect" }
  | { action: "preferences"; enabled: boolean; leadMinutes: 15 | 30 | 60 };
