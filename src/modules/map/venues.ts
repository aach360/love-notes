import type { PulseEvent } from "@/shared/types";

/** UNC Chapel Hill (Polk Place) — default map center. */
export const UNC_CENTER: [number, number] = [35.9105, -79.0505];

/**
 * Reviewed venue lookup. Coordinates are building-level (the building's footprint, not a room),
 * so every match is labelled "approximate" in the UI. Aliases are matched as lowercase substrings,
 * longest alias first, so "Moeser Auditorium, Hill Hall" resolves to Hill Hall.
 */
const VENUES: { key: string; name: string; lat: number; lng: number; aliases: string[] }[] = [
  { key: "ackland", name: "Ackland Art Museum", lat: 35.9124, lng: -79.054, aliases: ["ackland"] },
  { key: "hanes", name: "Hanes Art Center", lat: 35.9118, lng: -79.0546, aliases: ["hanes art", "hanes 2", "hanes 1"] },
  { key: "hsl", name: "Health Sciences Library", lat: 35.9077, lng: -79.0528, aliases: ["health sciences library"] },
  { key: "wilson-lib", name: "Wilson Library", lat: 35.9093, lng: -79.0496, aliases: ["wilson library", "pleasants room"] },
  { key: "davis", name: "Davis Library", lat: 35.9108, lng: -79.048, aliases: ["davis library", "library data services"] },
  { key: "hill", name: "Hill Hall", lat: 35.9128, lng: -79.0526, aliases: ["hill hall", "moeser auditorium"] },
  { key: "memorial", name: "Memorial Hall", lat: 35.9115, lng: -79.0516, aliases: ["memorial hall"] },
  { key: "person", name: "Person Hall", lat: 35.9126, lng: -79.0521, aliases: ["person hall"] },
  { key: "love", name: "Love House", lat: 35.9142, lng: -79.0476, aliases: ["love house"] },
  { key: "morehead", name: "Morehead Planetarium", lat: 35.9139, lng: -79.0504, aliases: ["morehead planetarium"] },
  { key: "stone", name: "Stone Center", lat: 35.9097, lng: -79.0481, aliases: ["sonja haynes stone", "stone center"] },
  { key: "woollen", name: "Woollen Gymnasium", lat: 35.9068, lng: -79.0465, aliases: ["woollen"] },
  { key: "kenan-music", name: "Kenan Music Building", lat: 35.9118, lng: -79.0533, aliases: ["kenan music"] },
  { key: "union", name: "Carolina Union", lat: 35.9101, lng: -79.048, aliases: ["carolina union", "frank porter graham student union", "student union", "gsu-", "toy lounge"] },
  { key: "pit", name: "The Pit", lat: 35.9103, lng: -79.0487, aliases: ["the pit"] },
  { key: "greenlaw", name: "Greenlaw Hall", lat: 35.9105, lng: -79.051, aliases: ["greenlaw"] },
  { key: "hyde", name: "Hyde Hall", lat: 35.9128, lng: -79.051, aliases: ["hyde hall"] },
  { key: "gardner", name: "Gardner Hall", lat: 35.9096, lng: -79.0516, aliases: ["gardner"] },
  { key: "phillips", name: "Phillips Hall", lat: 35.9108, lng: -79.0525, aliases: ["phillips hall"] },
  { key: "carroll", name: "Carroll Hall", lat: 35.9118, lng: -79.0484, aliases: ["carroll hall"] },
  { key: "fedex", name: "FedEx Global Education Center", lat: 35.9052, lng: -79.0491, aliases: ["fedex global"] },
  { key: "dey", name: "Dey Hall", lat: 35.9112, lng: -79.0504, aliases: ["dey hall"] },
  { key: "marsico", name: "Marsico Hall", lat: 35.9045, lng: -79.0533, aliases: ["marsico"] },
  { key: "mej", name: "Mary Ellen Jones Building", lat: 35.9049, lng: -79.0526, aliases: ["mary ellen jones"] },
  { key: "brinkhous", name: "Brinkhous-Bullitt Building", lat: 35.9055, lng: -79.0525, aliases: ["brinkhous"] },
  { key: "swain", name: "Swain Hall", lat: 35.9126, lng: -79.0524, aliases: ["swain hall"] },
  { key: "cda", name: "Center for Dramatic Art", lat: 35.9078, lng: -79.0466, aliases: ["kenan theatre", "center for dramatic art", "paul green theatre"] },
  { key: "chase", name: "Chase Dining Hall", lat: 35.9063, lng: -79.0449, aliases: ["chase dining"] },
  { key: "wilson-hall", name: "Wilson Hall", lat: 35.9092, lng: -79.0473, aliases: ["wilson hall"] },
  { key: "junction", name: "Innovate Carolina Junction", lat: 35.9142, lng: -79.0543, aliases: ["innovate carolina junction"] },
  { key: "wesley", name: "Wesley Building", lat: 35.9129, lng: -79.0574, aliases: ["wesley building"] },
  { key: "sasb", name: "Student & Academic Services Bldg", lat: 35.9053, lng: -79.0453, aliases: ["sasb"] },
  { key: "drakeford", name: "Drakeford Library Complex", lat: 35.9107, lng: -79.0745, aliases: ["drakeford library"] },
  { key: "carrboro-commons", name: "Carrboro Town Commons", lat: 35.9106, lng: -79.0753, aliases: ["town commons"] },
  { key: "ocas", name: "Orange County Animal Services", lat: 35.975, lng: -79.071, aliases: ["orange county animal services"] },
  { key: "uumc", name: "University United Methodist Church", lat: 35.9127, lng: -79.0538, aliases: ["university united methodist"] },
  { key: "holy-trinity", name: "Holy Trinity Lutheran Church", lat: 35.9171, lng: -79.0581, aliases: ["holy trinity lutheran"] },
];
const ALIASES = VENUES.flatMap((v) => v.aliases.map((a) => ({ a, v }))).sort((x, y) => y.a.length - x.a.length);

export interface ResolvedPlace {
  key: string;
  name: string;
  lat: number;
  lng: number;
  /** "venue" = reviewed building-level lookup (always approximate). */
  precision: "venue";
}

export type PlaceResult = { kind: "place"; place: ResolvedPlace } | { kind: "online" } | { kind: "unresolved" };

export function resolvePlace(e: Pick<PulseEvent, "location">): PlaceResult {
  const loc = e.location?.toLowerCase().trim();
  if (!loc) return { kind: "unresolved" };
  if (/^(online|virtual|zoom)\b/.test(loc)) return { kind: "online" };
  const hit = ALIASES.find(({ a }) => loc.includes(a));
  if (!hit) return { kind: "unresolved" };
  const { key, name, lat, lng } = hit.v;
  return { kind: "place", place: { key, name, lat, lng, precision: "venue" } };
}

export function directionsUrl(p: ResolvedPlace): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
}
