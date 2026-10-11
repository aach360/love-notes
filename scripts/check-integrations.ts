import { checkGoogleOAuth } from "../src/modules/auth/google.server";

const present = (key: string) => Boolean(process.env[key]?.trim());
const groups = {
  "Supabase browser sign-in": ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"],
  "Supabase server storage": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  "Manual event import": ["ADMIN_IMPORT_TOKEN"],
  "Scheduled event refresh": ["CRON_SECRET"],
  "Photon website": ["PHOTON_PROJECT_ID", "PHOTON_AGENT_TOKEN", "PHOTON_BOT_ADDRESS"],
  "Optional Ticketmaster events": ["TICKETMASTER_API_KEY"],
};
for (const [name, keys] of Object.entries(groups)) {
  const missing = keys.filter((key) => !present(key));
  console.log(
    `${name}: ${missing.length ? `missing ${missing.join(", ")}` : "keys present (not a live verification)"}`,
  );
}
const agentPath = new URL("../agent/.env", import.meta.url);
const file = Bun.file(agentPath);
if (!(await file.exists())) {
  console.log("Photon agent: agent/.env is missing; copy agent/.env.example and configure it.");
} else {
  const values = Object.fromEntries(
    (await file.text())
      .split("\n")
      .filter((line) => !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index).trim(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
  const missing = [
    "SPECTRUM_PROJECT_ID",
    "SPECTRUM_PROJECT_SECRET",
    "PULSEMATCH_URL",
    "PHOTON_AGENT_TOKEN",
  ].filter((key) => !values[key]);
  console.log(`Photon agent: ${missing.length ? `missing ${missing.join(", ")}` : "keys present"}`);
  if (
    !missing.length &&
    (values["SPECTRUM_PROJECT_ID"] !== process.env["PHOTON_PROJECT_ID"] ||
      values["PHOTON_AGENT_TOKEN"] !== process.env["PHOTON_AGENT_TOKEN"])
  ) {
    console.log("Photon agent: project or bearer token does not match the website.");
  }
}
if (process.argv.includes("--online")) {
  const status = await checkGoogleOAuth(
    process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"],
    process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
    "http://localhost:8080/auth",
  );
  console.log(`Direct Google OAuth: ${status.ok ? "configured" : status.error}`);
}
