// backend/hooks/useAuth.js
import { useEffect, useRef, useState } from "react";
import supabase from "../lib/supabaseClient";
import { clearExploreMessageCache } from "../services/explore/messageService";
import { clearTransientSessionNavigation, rememberSocialAccount } from "../services/sessionService";

const AUTH_BOOT_TIMEOUT_MS = 1500;

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

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const activeUserIdRef = useRef("");

  useEffect(() => {
    let active = true;

    const bootTimeout = window.setTimeout(() => {
      if (active) setLoading(false);
    }, AUTH_BOOT_TIMEOUT_MS);

    async function loadAuth() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData?.session?.user) {
          setUser(null);
          return;
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData?.user) {
          if (isBrokenJwtUser(userError)) {
            await clearBrokenSession();
          }

          activeUserIdRef.current = "";
          setUser(null);
          return;
        }

        rememberSocialAccount(userData.user);
        clearTransientSessionNavigation();
        activeUserIdRef.current = userData.user.id || "";
        setUser(userData.user);
      } catch {
        activeUserIdRef.current = "";
        setUser(null);
      } finally {
        window.clearTimeout(bootTimeout);
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
        activeUserIdRef.current = "";
        setUser(null);
        setLoading(false);
        return;
      }

      rememberSocialAccount(session.user);
      clearTransientSessionNavigation();
      activeUserIdRef.current = session.user.id || "";
      setUser(session.user);
      setLoading(false);
    });

    return () => {
      active = false;
      window.clearTimeout(bootTimeout);
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  return { user, loading };
};