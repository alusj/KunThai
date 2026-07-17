import { useEffect, useMemo, useState } from "react";

import supabase from "../lib/supabaseClient";
import { fetchExploreProfileStats, normalizeIdentityTarget } from "../services/exploreService";
import { EXPLORE_FOLLOW_CHANGED_EVENT } from "./useExploreFollows";

const STATS_MEMORY = new Map();
const STATS_MEMORY_TTL = 120_000;
const STATS_STORAGE_PREFIX = "kunthai.exploreStats:";

// Stats persist across reloads so the profile never flashes 0 while the fresh
// numbers load; stale values are replaced silently once the fetch resolves.
function readCachedStats(statsKey) {
  if (!statsKey) return null;
  const memory = STATS_MEMORY.get(statsKey);
  if (memory?.stats) return memory;

  try {
    const stored = JSON.parse(localStorage.getItem(`${STATS_STORAGE_PREFIX}${statsKey}`) || "null");
    if (stored?.stats) {
      STATS_MEMORY.set(statsKey, stored);
      return stored;
    }
  } catch {
    // Stored stats are an optimization only.
  }
  return null;
}

function writeCachedStats(statsKey, stats) {
  const entry = { stats, savedAt: Date.now() };
  STATS_MEMORY.set(statsKey, entry);
  try {
    localStorage.setItem(`${STATS_STORAGE_PREFIX}${statsKey}`, JSON.stringify(entry));
  } catch {
    // Storage may be full or unavailable; the in-memory cache still applies.
  }
}

export function useExploreFollowStats(userId) {
  const identity = useMemo(() => normalizeIdentityTarget(userId || ""), [userId]);
  const statsKey = identity.key || "";
  const cached = statsKey ? readCachedStats(statsKey) : null;
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
        const currentCache = readCachedStats(statsKey);
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
          writeCachedStats(statsKey, nextStats);
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
      try {
        localStorage.removeItem(`${STATS_STORAGE_PREFIX}${statsKey}`);
      } catch {
        // Storage cleanup is best-effort.
      }
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
