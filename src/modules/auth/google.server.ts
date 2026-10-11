/** Verify direct Supabase OAuth before letting the browser leave the app. */
export async function checkGoogleOAuth(
  supabaseUrl: string | undefined,
  publicKey: string | undefined,
  callbackUrl: string,
  request: typeof fetch = fetch,
) {
  if (!supabaseUrl || !publicKey) {
    return { ok: false, error: "Sign-in isn't configured yet. Please try again later." };
  }
  try {
    const url = new URL("/auth/v1/authorize", supabaseUrl);
    url.searchParams.set("provider", "google");
    url.searchParams.set("redirect_to", callbackUrl);
    const response = await request(url, {
      headers: { apikey: publicKey },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    const location = response.headers.get("location");
    if ([302, 303, 307, 308].includes(response.status) && location) {
      const destination = new URL(location);
      if (destination.protocol === "https:" && destination.hostname === "accounts.google.com") {
        return { ok: true, error: null };
      }
      return {
        ok: false,
        error: "Google sign-in isn't configured for this app yet. Please use email.",
      };
    }
    return {
      ok: false,
      error: "Google sign-in isn't configured for this app yet. Please use email.",
    };
  } catch {
    return { ok: false, error: "Couldn't reach Google sign-in. Try again or use email." };
  }
}
