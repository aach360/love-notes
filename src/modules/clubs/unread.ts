const KEY = "uncitall:club-read:";
export function readTime(clubId: string, deviceToken: string): string {
  const key = KEY + deviceToken + ":" + clubId;
  try {
    const stored = localStorage.getItem(key);
    if (stored && Number.isFinite(Date.parse(stored))) return stored;
    const now = new Date().toISOString();
    localStorage.setItem(key, now);
    return now;
  } catch {
    return new Date().toISOString();
  }
}
export function markClubRead(clubId: string, deviceToken: string, timestamp: string) {
  try {
    const previous = readTime(clubId, deviceToken);
    if (timestamp > previous) localStorage.setItem(KEY + deviceToken + ":" + clubId, timestamp);
  } catch {
    /* Storage can be disabled. */
  }
}
