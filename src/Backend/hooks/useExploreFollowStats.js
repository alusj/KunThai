import { useEffect, useState } from "react";

import supabase from "../lib/supabaseClient";
import { fetchExploreProfileStats } from "../services/exploreService";
import { EXPLORE_FOLLOW_CHANGED_EVENT } from "./useExploreFollows";

const STATS_MEMORY = new Map();
const STATS_MEMORY_TTL = 120_000;

export function useExploreFollowStats(userId) {
  const cached = userId ? STATS_MEMORY.get(userId) : null;
  const [stats, setStats] = useState(() => cached?.stats || null);
  const [loading, setLoading] = useState(() => Boolean(userId && !cached?.stats));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let channel = null;

    async function load() {
      if (!userId) {
        setStats(null);
        setLoading(false);
        return;
      }

      try {
        const currentCache = STATS_MEMORY.get(userId);
        const hasCachedStats = Boolean(currentCache?.stats);
        const fresh = currentCache?.stats && Date.now() - currentCache.savedAt < STATS_MEMORY_TTL;

        if (currentCache?.stats) {
          setStats(currentCache.stats);
          setLoading(false);
        }

        if (fresh) {
          return;
        }

        if (!hasCachedStats) {
          setLoading(true);
        }
        setError("");
        const nextStats = await fetchExploreProfileStats(userId);
        if (active) {
          setStats(nextStats);
          STATS_MEMORY.set(userId, { stats: nextStats, savedAt: Date.now() });
        }
      } catch (err) {
        if (active) setError(err.message || "Unable to load profile stats.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    function handleFollowChanged() {
      STATS_MEMORY.delete(userId);
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

  return { stats, loading, error };
}
