import supabase from "../../lib/supabaseClient";
import { recordExploreSearchInterests } from "./advertService";
import { isMissingColumn, isMissingTable } from "./errors";
import { rankPostsForIntent } from "../ai/exploreAiModels";

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

// Spaces (business, community, school… accounts) by name, handle or bio.
// Only active Spaces are readable (RLS), and Spaces the person blocked are
// left out, the same as Space discovery.
async function searchSpaces(query) {
  const safeQuery = escapeSearchValue(query.replace(/^@/, ""));
  const { data, error } = await supabase
    .from("explore_spaces")
    .select("id, owner_user_id, name, slug, bio, avatar_url, category, verified")
    .eq("status", "active")
    .or(`name.ilike.%${safeQuery}%,slug.ilike.%${safeQuery}%,bio.ilike.%${safeQuery}%`)
    .limit(8);

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  if (!data?.length) return [];

  let blocked = new Set();
  const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  if (authData?.user?.id) {
    const { data: blocks } = await supabase
      .from("explore_identity_blocks")
      .select("target_space_id")
      .eq("blocker_user_id", authData.user.id)
      .eq("target_type", "space");
    blocked = new Set((blocks || []).map((row) => row.target_space_id).filter(Boolean));
  }

  return data
    .filter((space) => !blocked.has(space.id))
    .map((space) => ({
      id: `space:${space.id}`,
      type: "space",
      title: space.name || "Space",
      subtitle: space.bio || (space.slug ? `@${space.slug}` : "Space"),
      username: space.slug || "",
      avatarUrl: space.avatar_url || "",
      userId: space.owner_user_id || "",
      ownerUserId: space.owner_user_id || "",
      spaceId: space.id,
      identityType: "space",
      identityId: space.id,
      actorType: "space",
      actorId: space.id,
      accountType: "space",
      verified: Boolean(space.verified),
    }));
}

// People suggestions for @mention autocomplete. An empty query returns the
// people the user follows (fallback: recently active profiles) so suggestions
// appear as soon as "@" is typed.
export async function searchExplorePeople(query = "") {
  const value = String(query || "").trim().replace(/^@/, "");
  if (value) return searchPeople(value);

  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  let profileIds = [];
  if (user?.id) {
    const { data } = await supabase
      .from("explore_follows")
      .select("following_id")
      .eq("follower_id", user.id)
      .limit(12);
    profileIds = (data || []).map((row) => row.following_id).filter(Boolean);
  }

  let query_ = supabase
    .from("explore_profiles")
    .select("user_id, display_name, username, avatar_url, bio, account_type, verified")
    .limit(12);
  query_ = profileIds.length ? query_.in("user_id", profileIds) : query_.order("updated_at", { ascending: false });

  let { data, error } = await query_;
  if (error && isMissingColumn(error, "updated_at")) {
    ({ data, error } = await supabase
      .from("explore_profiles")
      .select("user_id, display_name, username, avatar_url, bio, account_type, verified")
      .limit(12));
  }
  if (error) return [];

  return (data || [])
    .filter((profile) => profile.user_id !== user?.id)
    .map((profile) => ({
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
  // A failed Space lookup must never hide the other results.
  const spaceResults = filter === "all" || filter === "space" ? await searchSpaces(normalizedValue).catch(() => []) : [];

  return [...spaceResults, ...mergedPeople, ...postResults, ...hashtagResults].filter((item) => {
    if (filter === "all") return true;
    return item.type === filter;
  });
}

/**
 * Search Explore from a KAI search intent.
 *
 * The model only rewrote the person's words into terms ({ keywords, hashtags,
 * topicSlugs, filter }); every result still comes from the same sources as
 * ordinary search — the cached feed posts and the explore_profiles directory —
 * so nothing shown here can be invented. Ranking favours posts matching more
 * terms; interests only break ties when the person asked for personal picks.
 */
export async function searchExploreWithIntent(intent, { interestSlugs = [] } = {}) {
  const filter = intent?.filter || "all";
  const posts = readCachedPosts();

  const postResults = filter === "people" || filter === "hashtag"
    ? []
    : rankPostsForIntent(posts, intent, interestSlugs)
        .filter((post) => filter === "all" || (filter === "swip" ? Boolean(post.video_url) : !post.video_url))
        .map(toPostResult);

  const hashtagResults = filter === "all" || filter === "hashtag"
    ? Array.from(
        new Map(
          intent.hashtags
            .flatMap((tag) => getHashtagResults(posts, `#${tag}`))
            .map((item) => [item.id, item]),
        ).values(),
      )
    : [];

  // At most two directory lookups, whatever the model returned, so an AI
  // search never costs more database round trips than a couple of keystrokes.
  let peopleResults = [];
  if (filter === "all" || filter === "people") {
    const lookups = await Promise.all(
      intent.keywords.slice(0, 2).map((keyword) => searchPeople(keyword).catch(() => [])),
    );
    peopleResults = Array.from(new Map(lookups.flat().map((item) => [item.id, item])).values());
  }

  return [...postResults, ...peopleResults, ...hashtagResults];
}
