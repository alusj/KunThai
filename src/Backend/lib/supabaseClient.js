import { createClient } from "@supabase/supabase-js";

import { createReadRetryingFetch } from "../services/networkService";
import { captureOAuthReturn } from "../services/oauthReturnService";
import { isRetryableSupabaseRead } from "./supabaseReadRequests";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
}

// Grab a social sign-in return URL (?code / ?error) before supabase-js reads
// and swallows it, so Login can explain a failed sign-in.
captureOAuthReturn();

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
  global: {
    // Reads wait out a lost connection and retry by themselves, so no screen
    // has to show its own "no internet" state or clear what it already loaded;
    // the global network toast is the one offline notice. Writes still fail
    // at once. The browser fetch is looked up per call so tests can stub it.
    fetch: createReadRetryingFetch((...args) => fetch(...args), { isRead: isRetryableSupabaseRead }),
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
async function validatedUser(jwt) {
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
}

// One server check per session token, shared by everyone who asks.
//
// supabase-js runs every getUser() behind one auth lock, network call
// included, so the dozen screens/services that ask "who is signed in?" while a
// dashboard opens queued up one after another: ~15 sequential /auth/v1/user
// round trips (5-7 s) before Explore could even start loading its feed.
// Callers now share the in-flight check and reuse its answer briefly. A new
// token (refresh, sign-in, account switch) or any auth change (USER_UPDATED
// after updateUser, SIGNED_OUT, ...) starts a fresh check.
const USER_CHECK_REUSE_MS = 30 * 1000;
let sharedUserCheck = null;

supabase.auth.onAuthStateChange((event) => {
  if (event !== "INITIAL_SESSION") sharedUserCheck = null;
});

supabase.auth.getUser = async (jwt) => {
  if (jwt) return validatedUser(jwt);

  const { data } = await supabase.auth.getSession().catch(() => ({ data: null }));
  const token = data?.session?.access_token || "";
  if (!token) return validatedUser();

  const reusable = sharedUserCheck
    && sharedUserCheck.token === token
    && Date.now() - sharedUserCheck.startedAt < USER_CHECK_REUSE_MS;
  if (reusable) return sharedUserCheck.promise;

  const entry = { token, startedAt: Date.now(), promise: validatedUser() };
  sharedUserCheck = entry;
  // Only a confirmed user is reused; a failed check is retried by the next caller.
  entry.promise.then((result) => {
    if (!result?.data?.user?.id && sharedUserCheck === entry) sharedUserCheck = null;
  });
  return entry.promise;
};

export default supabase;
