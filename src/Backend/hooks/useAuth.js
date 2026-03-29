// backend/hooks/useAuth.js
// Custom hook to track authentication state

import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";

export const useAuth = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return { user };
};