import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "./errors";

const STORAGE_PREFIX = "kunthai.explore.savedHashtags";
const MAX_SUGGESTIONS = 24;

export function normalizeHashtag(value = "") {
  return String(value || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase()
    .slice(0, 50);
}

function storageKey(userId = "guest") {
  return `${STORAGE_PREFIX}.${userId || "guest"}`;
}

function readLocalHashtags(userId) {
  if (typeof window === "undefined") return [];
  try {
    const rows = JSON.parse(window.localStorage.getItem(storageKey(userId)) || "[]");
    return Array.isArray(rows) ? rows.filter((row) => normalizeHashtag(row?.tag)) : [];
  } catch {
    return [];
  }
}

function writeLocalHashtags(userId, rows) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(rows.slice(0, 60)));
  } catch {
    // Database persistence remains the source of truth when storage is full.
  }
}

function mergeHashtags(...collections) {
  const merged = new Map();
  collections.flat().forEach((row) => {
    const tag = normalizeHashtag(row?.tag);
    if (!tag) return;
    const current = merged.get(tag) || { tag, usageCount: 0, personalUsageCount: 0, saved: false, lastUsedAt: "" };
    merged.set(tag, {
      ...current,
      usageCount: Math.max(current.usageCount, Number(row.usage_count ?? row.usageCount) || 0),
      personalUsageCount: Math.max(current.personalUsageCount, Number(row.personal_usage_count ?? row.personalUsageCount) || 0),
      saved: current.saved || Boolean(row.saved),
      lastUsedAt: [current.lastUsedAt, row.last_used_at || row.lastUsedAt || ""].sort().at(-1),
    });
  });

  return [...merged.values()].sort((a, b) =>
    Number(b.saved) - Number(a.saved) ||
    b.personalUsageCount - a.personalUsageCount ||
    b.usageCount - a.usageCount ||
    String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)),
  );
}

export async function fetchHashtagSuggestions(userId = "") {
  const localRows = readLocalHashtags(userId).map((row) => ({ ...row, saved: true }));
  const [personalResult, globalResult] = await Promise.all([
    userId
      ? supabase.from("explore_user_hashtags").select("tag, usage_count, last_used_at").eq("user_id", userId).order("usage_count", { ascending: false }).limit(MAX_SUGGESTIONS)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("explore_hashtags").select("tag, usage_count, last_used_at").order("usage_count", { ascending: false }).limit(MAX_SUGGESTIONS),
  ]);

  const personalRows = personalResult.error && !isMissingTable(personalResult.error)
    ? []
    : (personalResult.data || []).map((row) => ({ ...row, saved: true, personal_usage_count: row.usage_count }));
  const globalRows = globalResult.error && !isMissingTable(globalResult.error) ? [] : (globalResult.data || []);

  return mergeHashtags(localRows, personalRows, globalRows).slice(0, MAX_SUGGESTIONS);
}

export async function recordHashtagUsage(hashtags = [], userId = "") {
  const normalized = [...new Set((hashtags || []).map(normalizeHashtag).filter(Boolean))];
  if (!normalized.length) return;

  const now = new Date().toISOString();
  const localRows = readLocalHashtags(userId);
  const localMap = new Map(localRows.map((row) => [normalizeHashtag(row.tag), row]));
  normalized.forEach((tag) => {
    const current = localMap.get(tag) || { tag, usageCount: 0, personalUsageCount: 0 };
    localMap.set(tag, {
      ...current,
      tag,
      saved: true,
      usageCount: (Number(current.usageCount) || 0) + 1,
      personalUsageCount: (Number(current.personalUsageCount) || 0) + 1,
      lastUsedAt: now,
    });
  });
  writeLocalHashtags(userId, mergeHashtags([...localMap.values()]));

  const { error } = await supabase.rpc("record_explore_hashtags", { p_hashtags: normalized });
  if (error && !isMissingTable(error) && error.code !== "PGRST202") {
    console.warn("[KunThai hashtags] Database sync deferred.", error);
  }
}

