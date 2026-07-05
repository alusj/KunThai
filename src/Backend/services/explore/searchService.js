import supabase from "../../lib/supabaseClient";
import { recordExploreSearchInterests } from "./advertService";
import { isMissingColumn, isMissingTable } from "./errors";

const RECENT_SEARCHES_KEY = "explore-recent-searches";
const POST_KEYS = ["explore-posts-feed", "explore-posts-connections", "explore-posts-swip"];

function readJsonArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readCachedPosts() {
  const posts = POST_KEYS.flatMap(readJsonArray);
  return Array.from(new Map(posts.filter((post) => post?.id).map((post) => [post.id, post])).values());
}

function matches(value, query) {
  return String(value || "").toLowerCase().includes(query);
}

function escapeSearchValue(value) {
  return String(value || "").replace(/[%_,]/g, "\\$&");
}

function toPostResult(post) {
  const isVideo = Boolean(post.video_url);
  return {
    id: post.id,
    type: isVideo ? "swip" : "feed",
    title: post.author_name || "Profile",
    subtitle: post.body || (isVideo ? "Swip video" : "Explore post"),
    username: post.author_username || "",
    avatarUrl: post.author_avatar_url || "",
    postId: post.id,
    userId: post.user_id || "",
    raw: post,
  };
}

function getHashtagResults(posts, query) {
  const tags = new Map();

  posts.forEach((post) => {
    const inlineTags = String(post.body || "").match(/#[a-z0-9_]+/gi) || [];
    [...inlineTags, ...(post.hashtags || []).map((tag) => `#${tag}`)].forEach((tag) => {
      const normalized = tag.toLowerCase();
      if (!normalized.includes(query.replace("#", "")) && !normalized.includes(query)) return;
      const current = tags.get(normalized) || { tag: normalized, count: 0, postId: post.id, targetType: post.video_url ? "swip" : "feed" };
      tags.set(normalized, { ...current, count: current.count + 1 });
    });
  });

  return Array.from(tags.values()).map((item) => ({
    id: item.tag,
    type: "hashtag",
    title: item.tag,
    subtitle: `${item.count} post${item.count === 1 ? "" : "s"}`,
    query: item.tag,
    postId: item.postId,
    targetType: item.targetType,
  }));
}

async function searchPeople(query) {
  const safeQuery = escapeSearchValue(query.replace(/^@/, ""));
  const matchFilter = `display_name.ilike.%${safeQuery}%,username.ilike.%${safeQuery}%,bio.ilike.%${safeQuery}%`;
  let { data, error } = await supabase
    .from("explore_profiles")
    .select("user_id, display_name, username, avatar_url, bio, account_type, verified")
    .is("deactivated_at", null)
    .or(matchFilter)
    .limit(12);

  if (error && isMissingColumn(error, "deactivated_at")) {
    ({ data, error } = await supabase
      .from("explore_profiles")
      .select("user_id, display_name, username, avatar_url, bio, account_type, verified")
      .or(matchFilter)
      .limit(12));
  }

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  return (data || []).map((profile) => ({
    id: profile.user_id,
    type: "people",
    title: profile.display_name || "Profile",
    subtitle: profile.bio || `@${profile.username || "user"}`,
    username: profile.username || "",
    avatarUrl: profile.avatar_url || "",
    userId: profile.user_id,
    accountType: profile.account_type || "personal",
    verified: Boolean(profile.verified),
  }));
}

export function readRecentSearches() {
  return readJsonArray(RECENT_SEARCHES_KEY).slice(0, 8);
}

export function saveRecentSearch(query) {
  const value = String(query || "").trim();
  if (!value) return readRecentSearches();

  const next = [value, ...readRecentSearches().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 8);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}

export function removeRecentSearch(query) {
  const value = String(query || "").trim().toLowerCase();
  if (!value) return readRecentSearches();

  const next = readRecentSearches().filter((item) => item.toLowerCase() !== value);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

export function getSuggestedSearches() {
  const posts = readCachedPosts();
  const tags = getHashtagResults(posts, "").slice(0, 4).map((item) => item.title);
  return Array.from(new Set([...tags, "videos", "friends", "education", "marketplace"])).slice(0, 8);
}

export async function searchExplore(query, filter = "all") {
  const value = String(query || "").trim().toLowerCase();
  if (!value) return [];
  const normalizedValue = value.replace(/^[@#]/, "");
  // Only approved broad categories are stored as bounded interest aggregates;
  // the raw search phrase is never sent to advertising analytics.
  recordExploreSearchInterests(normalizedValue);

  const posts = readCachedPosts();
  const postResults = posts
    .filter((post) => {
      const haystack = [
        post.body,
        post.author_name,
        post.author_username,
        ...(post.hashtags || []),
        ...(post.mentions || []),
      ].join(" ");
      return matches(haystack, value) || matches(haystack, normalizedValue);
    })
    .map(toPostResult);

  const hashtagResults = getHashtagResults(posts, value);
  const mentionResults = value.startsWith("@") ? await searchPeople(normalizedValue) : [];
  const peopleResults = filter === "feed" || filter === "swip" || filter === "hashtag" ? [] : await searchPeople(normalizedValue);
  const mergedPeople = Array.from(new Map([...mentionResults, ...peopleResults].map((item) => [item.id, item])).values());

  return [...postResults, ...mergedPeople, ...hashtagResults].filter((item) => {
    if (filter === "all") return true;
    return item.type === filter;
  });
}
