/** Browser-only club state: anonymous device token, display name, starred clubs. */
const KEY = "pulsematch:clubs:v1";

interface DeviceClubState {
  deviceToken: string;
  displayName: string;
  starred: string[];
}

export function loadDevice(): DeviceClubState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<DeviceClubState>;
      if (typeof s.deviceToken === "string" && s.deviceToken.length >= 20) {
        return { deviceToken: s.deviceToken, displayName: s.displayName ?? "", starred: Array.isArray(s.starred) ? s.starred : [] };
      }
    }
  } catch {
    /* fall through */
  }
  const fresh = { deviceToken: crypto.randomUUID() + crypto.randomUUID(), displayName: "", starred: [] };
  saveDevice(fresh);
  return fresh;
}

export function saveDevice(s: DeviceClubState) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
