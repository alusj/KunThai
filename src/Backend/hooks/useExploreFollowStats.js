import { useEffect, useMemo, useState } from "react";

import supabase from "../lib/supabaseClient";
import { fetchExploreProfileStats, normalizeIdentityTarget } from "../services/exploreService";
import { EXPLORE_FOLLOW_CHANGED_EVENT } from "./useExploreFollows";

const STATS_MEMORY = new Map();
const STATS_MEMORY_TTL = 120_000;

export function useExploreFollowStats(userId) {
  const identity = useMemo(() => normalizeIdentityTarget(userId || ""), [userId]);
  const statsKey = identity.key || "";
  const cached = statsKey ? STATS_MEMORY.get(statsKey) : null;
  const [stats, setStats] = useState(() => cached?.stats || null);
  const [loading, setLoading] = useState(() => Boolean(statsKey && !cached?.stats));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let channel = null;

    async function load() {
      if (!identity.id) {
        setStats(null);
        setLoading(false);
        return;
      }

      try {
        const currentCache = STATS_MEMORY.get(statsKey);
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
        const nextStats = await fetchExploreProfileStats(identity);
        if (active) {
          setStats(nextStats);
          STATS_MEMORY.set(statsKey, { stats: nextStats, savedAt: Date.now() });
        }
      } catch (err) {
        if (active) setError(err.message || "Unable to load profile stats.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    function handleFollowChanged() {
      STATS_MEMORY.delete(statsKey);
      load();
    }

    window.addEventListener(EXPLORE_FOLLOW_CHANGED_EVENT, handleFollowChanged);

    if (identity.id) {
      channel = supabase
        .channel(`explore-profile-stats-${statsKey}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "explore_follows" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "explore_identity_connections" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "explore_space_members" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "explore_posts" }, load)
        .subscribe();
    }

    return () => {
      active = false;
      window.removeEventListener(EXPLORE_FOLLOW_CHANGED_EVENT, handleFollowChanged);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [identity, statsKey]);

  return { stats, loading, error };
}
