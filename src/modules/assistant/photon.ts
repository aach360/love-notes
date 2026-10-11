/**
 * Photon (Spectrum) integration boundary.
 * The iMessage agent runs as a separate process in /agent and talks to the site via
 * /api/public/agent/inbound and /api/public/agent/outbox, authorized by PHOTON_AGENT_TOKEN.
 * Until that secret is set, the endpoints answer 503 "unconfigured" — nothing is ever reported as sent.
 */
export function photonStatus(): "unconfigured" | "ready" {
  return process.env["PHOTON_AGENT_TOKEN"] ? "ready" : "unconfigured";
}
