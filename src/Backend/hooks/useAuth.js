// backend/hooks/useAuth.js
import { useEffect, useRef, useState } from "react";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";

import supabase from "../lib/supabaseClient";
import { clearExploreMessageCache } from "../services/explore/messageService";
import { clearTransientSessionNavigation, readSessionContinuity, rememberSocialAccount, vaultSessionSnapshot } from "../services/sessionService";

function isBrokenJwtUser(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("user from sub claim in jwt does not exist");
}

async function clearBrokenSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Session is already unusable; clearing local storage below is enough.
  }

  try {
    Object.keys(localStorage).forEach((key) => {
      const k = key.toLowerCase();
      if (k.includes("supabase") || k.includes("sb-") || k.includes("kuntai") || k.includes("kunthai")) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // localStorage can be unavailable (private mode); safe to ignore.
  }
}

// How long the app waits for supabase-js to restore the session before it
// falls back to the copy saved on this device. Offline with an expired
// access token, supabase-js holds its auth lock while it keeps retrying the
// token refresh, so without this an offline launch could wait a long time.
const SAVED_SESSION_FALLBACK_MS = 2500;

// The signed-in user from the session supabase-js saved on this device, read
// without the auth lock or the network. Only used to show cached screens
// offline; every server request still sends (and validates) the real token.
function readSavedSessionUser() {
  try {
    const key = supabase.auth.storageKey;
    if (!key || typeof localStorage === "undefined") return null;
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    const user = saved?.user || saved?.currentSession?.user || null;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

function isConnectionProblem(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error) return false;
  if (isAuthRetryableFetchError(error)) return true;
  return /fetch|network|load failed|timed out|offline/i.test(String(error?.message || error));
}

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const activeUserIdRef = useRef("");

  useEffect(() => {
    let active = true;

    async function loadAuth() {
      // Offline (or a stuck token refresh): show the saved account's cached
      // screens instead of an endless loader, while the real check finishes.
      const fallbackTimer = window.setTimeout(() => {
        if (!active) return;
        const savedUser = readSavedSessionUser();
        if (!savedUser) return;
        activeUserIdRef.current = savedUser.id;
        setUser((current) => current || savedUser);
        setLoading(false);
      }, SAVED_SESSION_FALLBACK_MS);

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        window.clearTimeout(fallbackTimer);
        const sessionUser = sessionData?.session?.user || null;

        if (!sessionUser) {
          // A refresh that failed only because there is no connection keeps
          // the saved account signed in; it refreshes once back online.
          const savedUser = isConnectionProblem(sessionError) ? readSavedSessionUser() : null;
          if (savedUser) {
            activeUserIdRef.current = savedUser.id;
            setUser((current) => (current?.id === savedUser.id ? current : savedUser));
            return;
          }
          setUser(null);
          return;
        }

        // Trust the locally stored session immediately so boot is instant;
        // the server-side validation below runs in the background and only
        // signs out when the stored session turns out to be broken.
        rememberSocialAccount(sessionUser);
        vaultSessionSnapshot(sessionData.session);
        if (readSessionContinuity() !== (sessionUser.id || "")) {
          clearTransientSessionNavigation();
        }
        activeUserIdRef.current = sessionUser.id || "";
        setUser(sessionUser);

        supabase.auth
          .getUser()
          .then(async ({ data: userData, error: userError }) => {
            if (!active) return;

            if (userError || !userData?.user) {
              if (isBrokenJwtUser(userError)) {
                await clearBrokenSession();
              }

              activeUserIdRef.current = "";
              setUser(null);
              return;
            }

            const nextUser = userData.user;
            activeUserIdRef.current = nextUser.id || "";
            // Keep the same object when nothing changed so downstream hooks
            // (onboarding check) do not re-run and re-show loading states.
            setUser((current) =>
              current && current.id === nextUser.id && current.updated_at === nextUser.updated_at
                ? current
                : nextUser,
            );
          })
          .catch(() => {});
      } catch (error) {
        window.clearTimeout(fallbackTimer);
        const savedUser = isConnectionProblem(error) ? readSavedSessionUser() : null;
        activeUserIdRef.current = savedUser?.id || "";
        setUser(savedUser);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAuth();

    // Keep this callback synchronous: supabase-js holds its auth lock while
    // notifying listeners, so awaiting another auth call (getUser, signOut)
    // here deadlocks every pending auth request (e.g. updateUser during
    // onboarding). The session already carries the verified user.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id || "";
      const accountChanged = Boolean(activeUserIdRef.current && activeUserIdRef.current !== nextUserId);

      if (event === "SIGNED_OUT" || accountChanged) {
        clearExploreMessageCache();
      }

      if (!session?.user) {
        // Offline with an expired token the initial session comes back empty
        // although the account is still saved on this device: that is not a
        // sign-out, so loadAuth's saved-session fallback decides instead.
        if (event === "INITIAL_SESSION" && readSavedSessionUser()) return;
        activeUserIdRef.current = "";
        setUser(null);
        setLoading(false);
        return;
      }

      rememberSocialAccount(session.user);
      // Synchronous localStorage write only — safe inside the auth lock.
      vaultSessionSnapshot(session);
      if (event === "SIGNED_IN" && readSessionContinuity() !== nextUserId) {
        clearTransientSessionNavigation();
      }
      activeUserIdRef.current = session.user.id || "";
      setUser((current) =>
        current && current.id === session.user.id && current.updated_at === session.user.updated_at
          ? current
          : session.user,
      );
      setLoading(false);
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  return { user, loading };
};
