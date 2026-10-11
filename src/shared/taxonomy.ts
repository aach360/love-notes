/**
 * PulseMatch interest taxonomy — the single, versioned vocabulary shared by
 * event classification, onboarding, and recommendation explanations.
 *
 * Dimensions are kept separate on purpose:
 * - TOPICS: what the event is about (neuroscience, tennis, live music…)
 * - FORMATS: what you do there (workshop, lecture, performance, pickup game…)
 * - BENEFITS: perks (free food, giveaways, academic credit)
 * Constraints (cost, eligibility, registration) stay source facts on the event
 * and never become interests.
 *
 * Bump TAXONOMY_VERSION whenever IDs, labels or synonyms change — cached
 * classifications key on it and are recomputed after a change.
 */

export const TAXONOMY_VERSION = "tax-v1";

export interface TopicDef {
  id: string;
  label: string;
  /** Lowercase phrases that map to this topic. First match wins; evidence = matched phrase in source text. */
  synonyms: string[];
}

export const TOPICS: TopicDef[] = [
  { id: "neuroscience", label: "Neuroscience", synonyms: ["neuroscience", "brain", "neural", "brain-computer", "cognitive science", "eeg", "bci"] },
  { id: "computer-science", label: "Computer science & coding", synonyms: ["computer science", "coding", "programming", "hackathon", "software", "web development", "app development", "leetcode", "cybersecurity", "machine learning", "artificial intelligence", " ai ", "data science"] },
  { id: "entrepreneurship", label: "Entrepreneurship & startups", synonyms: ["entrepreneur", "startup", "start-up", "pitch competition", "venture", "business plan", "innovation"] },
  { id: "live-music", label: "Live music", synonyms: ["live music", "concert", "band", "orchestra", "choir", "jazz", "open mic", "a cappella", "acapella", "recital", "dj"] },
  { id: "visual-arts", label: "Visual arts", synonyms: ["art exhibit", "exhibition", "gallery", "painting", "sculpture", "drawing", "photography", "printmaking", "art history", "museum"] },
  { id: "theater-dance", label: "Theater & dance", synonyms: ["theater", "theatre", "play", "musical", "dance", "ballet", "choreography", "improv", "comedy show", "stand-up"] },
  { id: "film", label: "Film & screenings", synonyms: ["film", "movie", "screening", "cinema", "documentary"] },
  { id: "books-writing", label: "Books & writing", synonyms: ["book", "reading", "poetry", "writing", "author", "literary", "novel", "fiction"] },
  { id: "basketball", label: "Basketball", synonyms: ["basketball", "hoops", "march madness", "final four"] },
  { id: "football", label: "Football", synonyms: ["football", "tailgate", "gridiron"] },
  { id: "soccer", label: "Soccer", synonyms: ["soccer", "futbol", "fútbol"] },
  { id: "tennis", label: "Tennis", synonyms: ["tennis", "pickleball"] },
  { id: "running-fitness", label: "Running & fitness", synonyms: ["5k", "run", "running", "marathon", "yoga", "fitness", "workout", "zumba", "climbing", "hiking"] },
  { id: "intramural-sports", label: "Intramural & pickup sports", synonyms: ["intramural", "pickup", "pick-up game", "rec league", "dodgeball", "kickball", "ultimate frisbee", "volleyball"] },
  { id: "gaming", label: "Games & esports", synonyms: ["board game", "card game", "tabletop", "chess", "poker", "trivia", "esports", "video game", "gaming", "smash bros", "dungeons", "d&d", "bingo"] },
  { id: "outdoors", label: "Outdoors & nature", synonyms: ["hike", "nature", "garden", "bird", "stargazing", "astronomy", "planetarium", "camping", "outdoor"] },
  { id: "science", label: "Science & research", synonyms: ["research", "science", "biology", "chemistry", "physics", "lab ", "laboratory", "symposium", "stem"] },
  { id: "health-wellness", label: "Health & wellness", synonyms: ["health", "wellness", "mental health", "meditation", "mindfulness", "self-care", "nutrition", "blood drive", "flu shot"] },
  { id: "career", label: "Career & networking", synonyms: ["career", "job fair", "internship", "resume", "résumé", "networking", "interview", "recruiter", "employer"] },
  { id: "academics", label: "Classes & academic skills", synonyms: ["study", "tutoring", "workshop", "citation", "research skills", "academic", "exam prep", "library"] },
  { id: "culture-identity", label: "Culture & identity", synonyms: ["cultural", "heritage", "latinx", "latino", "latina", "asian", "black", "african", "indigenous", "lgbtq", "queer", "pride", "diwali", "lunar new year", "holi", "international"] },
  { id: "faith", label: "Faith & spirituality", synonyms: ["worship", "bible", "church", "ministry", "prayer", "faith", "spiritual", "mass", "shabbat", "jummah", "meditation circle"] },
  { id: "volunteering", label: "Service & volunteering", synonyms: ["volunteer", "service", "community service", "fundraiser", "charity", "donation drive", "civic", "blood drive"] },
  { id: "politics-society", label: "Politics & society", synonyms: ["politic", "election", "debate", "policy", "government", "activism", "social justice", "voting"] },
  { id: "food", label: "Food & cooking", synonyms: ["cooking", "baking", "food tasting", "potluck", "cookout", "bbq", "food festival"] },
  { id: "crafts-diy", label: "Crafts & DIY", synonyms: ["craft", "knitting", "crochet", "diy", "painting night", "pottery", "make and take", "paint night"] },
  { id: "greek-life", label: "Greek life", synonyms: ["fraternity", "sorority", "greek life", "rush", "phi ", "sigma", "kappa", "delta"] },
  { id: "social", label: "Social & meeting people", synonyms: ["mixer", "social", "meet and greet", "meetup", "hangout", "welcome back", "block party", "carnival", "festival"] },
  { id: "media-journalism", label: "Media & journalism", synonyms: ["journalism", "newspaper", "podcast", "radio", "broadcast", "magazine"] },
  { id: "environment", label: "Environment & sustainability", synonyms: ["sustainability", "climate", "environment", "recycling", "clean-up", "cleanup", "gardening", "compost"] },
];

export interface FormatDef {
  id: string;
  label: string;
  synonyms: string[];
}

export const FORMATS: FormatDef[] = [
  { id: "workshop", label: "Workshop", synonyms: ["workshop", "hands-on", "training", "bootcamp", "tutorial"] },
  { id: "lecture", label: "Lecture & talks", synonyms: ["lecture", "talk", "seminar", "panel", "keynote", "colloquium", "discussion"] },
  { id: "performance", label: "Performance", synonyms: ["performance", "concert", "recital", "show", "production", "showcase"] },
  { id: "game-watch", label: "Game & watch party", synonyms: ["game", "match", "vs.", " vs ", "watch party", "tailgate"] },
  { id: "play-sport", label: "Play a sport", synonyms: ["pickup", "intramural", "open gym", "drop-in", "practice", "tryout", "5k", "run "] },
  { id: "social-mixer", label: "Social & mixer", synonyms: ["mixer", "social", "party", "hangout", "meetup", "carnival", "festival", "celebration"] },
  { id: "exhibit", label: "Exhibit & tour", synonyms: ["exhibit", "exhibition", "gallery", "tour", "open house"] },
  { id: "meeting", label: "Club meeting", synonyms: ["meeting", "gbm", "general body", "info session", "interest meeting"] },
  { id: "ceremony", label: "Ceremony & worship", synonyms: ["ceremony", "worship", "service", "mass", "vigil", "graduation"] },
  { id: "fair", label: "Fair & tabling", synonyms: ["fair", "expo", "tabling", "involvement"] },
];

export interface BenefitDef {
  id: string;
  label: string;
  synonyms: string[];
}

export const BENEFITS: BenefitDef[] = [
  { id: "free-food", label: "Free food", synonyms: ["free food", "free pizza", "free lunch", "free dinner", "free breakfast", "snacks provided", "food provided", "free snacks", "refreshments"] },
  { id: "free-stuff", label: "Giveaways & free stuff", synonyms: ["giveaway", "free t-shirt", "free shirt", "swag", "free merch", "prizes", "raffle"] },
  { id: "free-entry", label: "Free admission", synonyms: ["free admission", "free entry", "free and open", "no cost", "free to attend"] },
  { id: "credit", label: "Academic or program credit", synonyms: ["credit", "cce credit", "service hours", "extra credit"] },
];

const topicById = new Map(TOPICS.map((t) => [t.id, t]));
const formatById = new Map(FORMATS.map((f) => [f.id, f]));
const benefitById = new Map(BENEFITS.map((b) => [b.id, b]));

export const topicLabel = (id: string) => topicById.get(id)?.label ?? id;
export const formatLabel = (id: string) => formatById.get(id)?.label ?? id;
export const benefitLabel = (id: string) => benefitById.get(id)?.label ?? id;
export const isTopicId = (id: string) => topicById.has(id);

/** Canonical topic for a raw phrase, if any synonym matches exactly. */
export function canonicalTopic(phrase: string): string | null {
  const p = phrase.trim().toLowerCase();
  if (!p) return null;
  for (const t of TOPICS) if (t.id === p || t.label.toLowerCase() === p || t.synonyms.includes(p)) return t.id;
  return null;
}
