import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    // PKCE is required so OAuth returns an authorization `code` we can exchange
    // for a session on native (Capacitor) via the custom-scheme deep link.
    // On the web, `detectSessionInUrl` still exchanges the code automatically,
    // so the existing browser flow is preserved.
    flowType: "pkce",
  },
});

// Offline resilience for "who am I" checks.
//
// `auth.getUser()` validates the token against the server, so it makes a
// network request — which fails whenever the device is offline. Dozens of
// gate helpers across the app treat that failure as "not signed in" and throw
// a "Sign in to continue" style error, so a user who IS signed in was being
// told to sign in the moment their connection dropped.
//
// We wrap getUser so it falls back to the locally cached session (read with no
// network) whenever the live check can't run or comes back empty. Real data
// queries still send the JWT and are validated server-side under RLS, so this
// only affects the local identity check — an invalid/expired token still fails
// at the actual query. When there is genuinely no session, the user is null and
// the normal sign-in prompts still fire.
const nativeGetUser = supabase.auth.getUser.bind(supabase.auth);
async function cachedSessionUser() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
  } catch {
    return null;
  }
}
// True only for connection faults — never for a real auth rejection. We fall
// back to the cached session on a network fault, but let genuine sign-outs
// (invalid/expired token the server rejected) surface as before.
function looksLikeNetworkFault(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const text = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
  return /failed to fetch|networkerror|network request failed|network error|load failed|fetch failed|err_/.test(text);
}
supabase.auth.getUser = async (jwt) => {
  // Offline: skip the network validation and trust the cached session.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { data: { user: await cachedSessionUser() }, error: null };
  }
  const result = await nativeGetUser(jwt).catch((error) => ({ data: { user: null }, error }));
  if (result?.data?.user?.id) return result;
  // Only a network fault falls back to the cached session; a real auth
  // rejection passes through so genuine sign-outs still work.
  if (looksLikeNetworkFault(result?.error)) {
    const cachedUser = await cachedSessionUser();
    if (cachedUser?.id) return { data: { user: cachedUser }, error: null };
  }
  return result;
};

export default supabase;
