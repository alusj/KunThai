import { useEffect, useState } from "react";

import supabase from "../lib/supabaseClient";
import { fetchExploreProfileStats } from "../services/exploreService";
import { EXPLORE_FOLLOW_CHANGED_EVENT } from "./useExploreFollows";

export function useExploreFollowStats(userId) {
  const [stats, setStats] = useState({ feed: 0, swip: 0, followers: 0, following: 0, suggested: 0 });
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let channel = null;

    async function load() {
      if (!userId) {
        setStats({ feed: 0, swip: 0, followers: 0, following: 0, suggested: 0 });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const nextStats = await fetchExploreProfileStats(userId);
        if (active) setStats(nextStats);
      } catch (err) {
        if (active) setError(err.message || "Unable to load profile stats.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    function handleFollowChanged() {
      load();
    }

    window.addEventListener(EXPLORE_FOLLOW_CHANGED_EVENT, handleFollowChanged);

    if (userId) {
      channel = supabase
        .channel(`explore-profile-stats-${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "explore_follows" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "explore_posts", filter: `user_id=eq.${userId}` }, load)
        .subscribe();
    }

    return () => {
      active = false;
      window.removeEventListener(EXPLORE_FOLLOW_CHANGED_EVENT, handleFollowChanged);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [userId]);

  return { ...stats, loading, error };
}
