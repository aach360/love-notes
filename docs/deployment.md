# Deploy UNCitall

## Netlify website

Import `aach360/love-notes`, branch `main`, into the existing Netlify team. `netlify.toml` uses the official TanStack Start adapter and publishes `dist/client`, including server functions. Local `bun run build` keeps the Node server output; `bun run build --mode netlify` produces Netlify output.

Set public `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (and project id if used) for builds. Set private server variables in Netlify, never in Git: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, optional `GEMINI_MODEL`, `PHOTON_PROJECT_ID`, `PHOTON_AGENT_TOKEN`, `PHOTON_BOT_ADDRESS`, `ADMIN_IMPORT_TOKEN`, and `CRON_SECRET`. Existing keys live in ignored local files. Do not deploy a static-only copy: auth, clubs, Gemini, and the agent endpoints need server functions.

After publishing, update Supabase's Site URL and allowed `/auth` redirect to the exact HTTPS site origin, retaining localhost for development. Google OAuth remains unavailable until its client credentials are configured. Test signup confirmation on the deployed URL.

## Always-on Photon worker

Netlify request functions cannot host the agent's continuous Spectrum stream. Run a separate worker on an always-on container host. Build from the repository root with `docker build -f agent/Dockerfile -t uncitall-photon .`. Mount persistent storage at `/data/photon` so the delivery journal survives restarts. Start only one worker for this journal; configure restart-on-failure and keep the disk across deploys.

Supply `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `PHOTON_AGENT_TOKEN`, and `PULSEMATCH_URL` (the Netlify HTTPS origin) as runtime secrets. The token must match the website. Never bake `.env` files into the image. Worker hosting remains to be selected; no paid plan is provisioned by these files.

Verify the agent heartbeat, HELP reply, and the two-person checklist in `hackathon-demo.md` after deploying. The provider timeout protocol must remain unchanged.

## Current deployment

Website published at https://uncitall.netlify.app (Netlify project `057c8f98-56a7-49f9-aa78-87804e9e339a`). Server environment is configured and the Supabase Site URL and exact `/auth` callback are saved. This is a manual CLI deployment; GitHub continuous deployment is not connected. The existing Netlify GitHub connection only exposes the user’s fork. The local Photon agent now points to the Netlify origin. It still requires this computer to stay running, a separate always-on worker host, and a real two-person test.
