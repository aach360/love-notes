import { createServerFn } from "@tanstack/react-start";

export const checkGoogleSignIn = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequestUrl } = await import("@tanstack/react-start/server");
  const { checkGoogleOAuth } = await import("./google.server");
  const callback = new URL("/auth", getRequestUrl()).href;
  return checkGoogleOAuth(
    process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"],
    process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
    callback,
  );
});
