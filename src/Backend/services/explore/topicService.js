import supabase from "../../lib/supabaseClient";
import {
  EXPLORE_TOPIC_CATALOG,
  normalizeExploreTopicSlug,
} from "../../../data/exploreTopics";
import { isMissingTable } from "./errors";

const STORAGE_PREFIX = "kunthai.explore.topic-follows.v1";

function topicStorageKey(userId = "guest") {
  return `${STORAGE_PREFIX}.${userId || "guest"}`;
}

function readLocalFollows(userId) {
  try {
    const value = JSON.parse(localStorage.getItem(topicStorageKey(userId)) || "[]");
    return Array.isArray(value) ? value.map(normalizeExploreTopicSlug).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeLocalFollows(userId, slugs) {
  try {
    localStorage.setItem(topicStorageKey(userId), JSON.stringify(slugs));
  } catch {
    // Private browsing or full storage must not block onboarding or Settings.
  }
}

async function resolveUserId(userId = "") {
  if (userId) return userId;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || "";
}

function normalizeTopicRows(rows = []) {
  return rows.map((topic) => ({
    slug: normalizeExploreTopicSlug(topic.slug),
    name: topic.name,
    category: topic.category,
    description: topic.description || "",
    starter: Boolean(topic.starter),
  }));
}

export async function fetchExploreTopics() {
  const { data, error } = await supabase
    .from("explore_topics")
    .select("slug, name, category, description, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!error && data?.length) {
    const starters = new Set(EXPLORE_TOPIC_CATALOG.filter((topic) => topic.starter).map((topic) => topic.slug));
    return normalizeTopicRows(data).map((topic) => ({ ...topic, starter: starters.has(topic.slug) }));
  }

  if (error && !isMissingTable(error) && import.meta.env.DEV) {
    console.warn("[Explore topics] Using the bundled topic catalog.", error);
  }

  return EXPLORE_TOPIC_CATALOG;
}

export async function fetchUserTopicFollows(userId = "") {
  const resolvedUserId = await resolveUserId(userId);
  if (!resolvedUserId) return readLocalFollows("guest");
  const localTopics = readLocalFollows(resolvedUserId);

  const { data, error } = await supabase
    .from("explore_user_topic_follows")
    .select("topic_slug")
    .eq("user_id", resolvedUserId)
    .order("followed_at", { ascending: true });

  if (!error) {
    const topics = (data || []).map((row) => normalizeExploreTopicSlug(row.topic_slug)).filter(Boolean);
    if (!topics.length && localTopics.length) {
      await saveUserTopicFollows(localTopics, { source: "settings", userId: resolvedUserId });
      return localTopics;
    }
    writeLocalFollows(resolvedUserId, topics);
    return topics;
  }

  if (!isMissingTable(error) && import.meta.env.DEV) {
    console.warn("[Explore topics] Reading locally saved topic choices.", error);
  }
  return localTopics;
}

export async function saveUserTopicFollows(slugs = [], { source = "settings", userId = "" } = {}) {
  const resolvedUserId = await resolveUserId(userId);
  const normalized = Array.from(new Set(slugs.map(normalizeExploreTopicSlug).filter(Boolean)));
  writeLocalFollows(resolvedUserId || "guest", normalized);

  if (!resolvedUserId) return { topics: normalized, synced: false };

  const { error } = await supabase.rpc("set_explore_topic_follows", {
    p_topics: normalized,
    p_source: source === "onboarding" ? "onboarding" : "settings",
  });

  if (error) {
    if (!isMissingTable(error) && import.meta.env.DEV) {
      console.warn("[Explore topics] Topic choices were saved on this device only.", error);
    }
    return { topics: normalized, synced: false };
  }

  return { topics: normalized, synced: true };
}
