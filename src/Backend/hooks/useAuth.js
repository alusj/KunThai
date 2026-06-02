// backend/hooks/useAuth.js
// Custom hook to track authentication state

import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { clearTransientSessionNavigation } from "../services/sessionService";

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) clearTransientSessionNavigation();
      setUser(data?.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_, session) => {
        if (session?.user) clearTransientSessionNavigation();
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return { user, loading };
};
