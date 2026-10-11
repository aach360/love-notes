import type { PulseEvent } from "@/shared/types";
import music from "@/assets/demo-music.jpg";
import fair from "@/assets/demo-fair.jpg";

/**
 * Shared fixture dataset — every branch can develop against this.
 * Clearly labeled DEMO; dates are relative to `now` so they never expire.
 */
export function buildDemoEvents(now = new Date()): PulseEvent[] {
  const at = (dayOffset: number, hour: number, durH = 2) => {
    const s = new Date(now);
    s.setUTCDate(s.getUTCDate() + dayOffset);
    s.setUTCHours(hour + 4, 0, 0, 0); // hour is roughly Eastern
    const e = new Date(s.getTime() + durH * 3600_000);
    return { startsAt: s.toISOString(), endsAt: e.toISOString() };
  };
  const base = {
    timezone: "America/New_York",
    status: "scheduled" as const,
    lastFetchedAt: now.toISOString(),
    isDemo: true,
    source: "demo" as const,
    eligibility: null,
  };
  const rows: Array<Omit<PulseEvent, keyof typeof base | "id" | "sourceUrl" | "startsAt" | "endsAt"> & { t: ReturnType<typeof at> }> = [
    { sourceEventId: "d1", title: "Acoustic Night on Polk Place", description: "Student singer-songwriters under the string lights.", location: "Polk Place", organizer: "Carolina Union Activities Board", imageUrl: music, categories: ["Arts"], tags: ["live music", "outdoors"], costAmount: 0, costText: "Free", t: at(0, 19) },
    { sourceEventId: "d2", title: "Fall Club Fair", description: "Meet 200+ student orgs. Snacks while supplies last.", location: "The Pit", organizer: "Student Life", imageUrl: fair, categories: ["Social"], tags: ["free food", "clubs"], costAmount: null, costText: null, t: at(1, 11, 4) },
    { sourceEventId: "d3", title: "Intro to Machine Learning Workshop", description: "Hands-on Python notebook session. Bring a laptop.", location: "Sitterson Hall 014", organizer: "UNC CS Club", imageUrl: null, categories: ["Learning"], tags: ["tech", "workshop"], costAmount: 0, costText: "Free", t: at(1, 18) },
    { sourceEventId: "d4", title: "Jazz Ensemble Fall Concert", description: "The UNC Jazz Band performs big-band standards.", location: "Moeser Auditorium, Hill Hall", organizer: "Department of Music", imageUrl: music, categories: ["Arts"], tags: ["live music", "concert"], costAmount: 10, costText: "$10 general, students free with ID", t: at(2, 19, 1.5) },
    { sourceEventId: "d5", title: "Saturday Service Build", description: "Help build affordable housing in Orange County.", location: "Weaver's Grove", organizer: "UNC Habitat for Humanity", imageUrl: fair, categories: ["Service"], tags: ["volunteering", "outdoors"], costAmount: 0, costText: "Free", t: at(3, 9, 4) },
    { sourceEventId: "d6", title: "Diwali Night Celebration", description: "Dance performances, lights, and dinner.", location: "Great Hall, Carolina Union", organizer: "Sangam", imageUrl: fair, categories: ["Cultural"], tags: ["free food", "dance"], costAmount: 5, costText: "$5", t: at(3, 18, 3) },
    { sourceEventId: "d7", title: "Board Game Night", description: "Hundreds of games, all skill levels welcome.", location: "Union Underground", organizer: "Tabletop Club", imageUrl: null, categories: ["Social"], tags: ["games"], costAmount: null, costText: null, t: at(0, 20) },
    { sourceEventId: "d8", title: "Open Mic Poetry", description: "Read your work or just listen.", location: "Davis Library Lobby", organizer: "Ink Collective", imageUrl: music, categories: ["Arts"], tags: ["poetry", "live music"], costAmount: 0, costText: "Free", t: at(4, 19) },
    { sourceEventId: "d9", title: "Women's Soccer vs. Duke", description: "Pack the stands at Dorrance Field.", location: "Dorrance Field", organizer: "Carolina Athletics", imageUrl: fair, categories: ["Athletics"], tags: ["sports", "outdoors"], costAmount: null, costText: null, t: at(2, 17) },
    { sourceEventId: "d10", title: "Mindful Morning Meditation", description: "Guided 30-minute session.", location: "Campus Y", organizer: "Campus Y", imageUrl: null, categories: ["Spirituality"], tags: ["wellness"], costAmount: 0, costText: "Free", t: at(1, 8, 0.5) },
    { sourceEventId: "d11", title: "Startup Pitch Night", description: "Student founders pitch to local investors.", location: "Kenan-Flagler, Koury Auditorium", organizer: "CEO Club", imageUrl: fair, categories: ["Learning"], tags: ["tech", "entrepreneurship", "free food"], costAmount: null, costText: null, t: at(5, 18) },
    { sourceEventId: "d12", title: "Late Night Swim & Glow", description: "Glow sticks, music, open pool.", location: "Koury Natatorium", organizer: "Campus Rec", imageUrl: null, categories: ["Athletics"], tags: ["sports", "live music"], costAmount: 0, costText: "Free with OneCard", t: at(4, 21) },
  ];
  return rows.map(({ t, ...r }) => ({
    ...base,
    ...r,
    id: `demo:${r.sourceEventId}`,
    sourceUrl: null,
    ...t,
  }));
}
