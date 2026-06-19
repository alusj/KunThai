// backend/hooks/useAuth.js
// Custom hook to track authentication state

import { useEffect, useRef, useState } from "react";
import supabase from "../lib/supabaseClient";
import { clearExploreMessageCache } from "../services/explore/messageService";
import { clearTransientSessionNavigation, rememberSocialAccount } from "../services/sessionService";

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const activeUserIdRef = useRef("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) {
        rememberSocialAccount(data.session.user);
        clearTransientSessionNavigation();
      }
      activeUserIdRef.current = data?.session?.user?.id || "";
      setUser(data?.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const nextUserId = session?.user?.id || "";
        const accountChanged = Boolean(activeUserIdRef.current && activeUserIdRef.current !== nextUserId);
        if (event === "SIGNED_OUT" || accountChanged) {
          clearExploreMessageCache();
        }
        if (session?.user) {
          rememberSocialAccount(session.user);
          clearTransientSessionNavigation();
        }
        activeUserIdRef.current = nextUserId;
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return { user, loading };
};
