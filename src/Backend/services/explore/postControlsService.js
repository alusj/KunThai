// Network side of Advanced Post Controls: finding accounts to exclude,
// loading a published post's settings, saving edits, and filling repost
// previews that must be read live from their original.
//
// Every read goes through RLS, so an excluded account can never load the
// post, its comments or its counts, whatever path it uses. See
// supabase/migrations/20261104120000_explore_advanced_post_controls.sql.

import supabase from "../../lib/supabaseClient";
import { getKunThaiPublicUserId, normalizeKunThaiPublicId } from "../identityCodeService";
import { EXPLORE_CACHE_EVENT, getPostsStorageKey } from "./cacheService";
import {
  fillLiveReposts,
  isLiveRepost,
  normalizeExcludedAccounts,
  normalizePostControls,
  postControlColumns,
  postControlsOf,
} from "./postControls";

const PROFILE_FIELDS = "user_id, display_name, username, avatar_url, deactivated_at";
const KUNTHAI_ID_PATTERN = /^\s*KTU[\s-]?[A-Z0-9]/i;

function escapeLike(value = "") {
  return String(value).replace(/[\\%_,()]/g, (char) => `\\${char}`);
}

function profileToAccount(profile = {}) {
  return {
    id: profile.user_id,
    name: profile.display_name || profile.username || "",
    username: profile.username || "",
    avatarUrl: profile.avatar_url || "",
    kunthaiId: getKunThaiPublicUserId({ user_id: profile.user_id }),
    unavailable: Boolean(profile.deactivated_at),
  };
}

/**
 * Accounts matching a name, @username or KunThai ID (12 at most). Only public
 * profile fields are returned. Deactivated accounts are left out of search.
 */
export async function searchAccountsToExclude(query = "", { signal, ownerId = "" } = {}) {
  const value = String(query || "").trim().replace(/^@/, "");
  if (value.length < 2) return [];

  if (KUNTHAI_ID_PATTERN.test(value)) {
    const { data, error } = await supabase.rpc("lookup_kunthai_account_by_public_id", {
      input_public_id: normalizeKunThaiPublicId(value) || value,
    });
    if (signal?.aborted) return [];
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : data ? [data] : []).filter((row) => row?.user_id && row.user_id !== ownerId);
    return rows.map((row) => ({
      id: row.user_id,
      name: row.full_name || row.username || "",
      username: row.username || "",
      avatarUrl: row.avatar_url || "",
      kunthaiId: row.public_id || getKunThaiPublicUserId({ user_id: row.user_id }),
      unavailable: false,
    }));
  }

  const safe = escapeLike(value);
  let request = supabase
    .from("explore_profiles")
    .select(PROFILE_FIELDS)
    .is("deactivated_at", null)
    .or(`display_name.ilike.%${safe}%,username.ilike.%${safe}%`)
    .order("username", { ascending: true })
    .limit(12);
  if (signal && typeof request.abortSignal === "function") request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return (data || []).filter((profile) => profile.user_id && profile.user_id !== ownerId).map(profileToAccount);
}

/** The accounts a published post excludes (owner only; RLS returns nothing to anyone else). */
export async function fetchPostExclusions(postId) {
  const { data, error } = await supabase
    .from("explore_post_exclusions")
    .select("excluded_user_id")
    .eq("post_id", postId)
    .limit(200);
  if (error) throw error;
  const ids = (data || []).map((row) => row.excluded_user_id).filter(Boolean);
  if (!ids.length) return [];

  const { data: profiles, error: profileError } = await supabase.from("explore_profiles").select(PROFILE_FIELDS).in("user_id", ids);
  if (profileError) throw profileError;
  const byId = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
  // An account with no profile left (deleted) still shows, marked unavailable,
  // so the owner can see and remove it.
  return ids.map((id) => (byId.has(id) ? profileToAccount(byId.get(id)) : { id, name: "", username: "", avatarUrl: "", kunthaiId: getKunThaiPublicUserId({ user_id: id }), unavailable: true }));
}

/** A published post's full settings, for the owner's "Post settings" sheet. */
export async function loadPublishedPostControls(post) {
  const excludedAccounts = await fetchPostExclusions(post.id);
  return normalizePostControls({ ...postControlsOf(post), excludedAccounts });
}

/**
 * Save edited settings on a published post. The flags and the exclusion list
 * are written by one update, so they change together; the server applies
 * them at once on every read path. Caches on this device are refreshed.
 */
export async function savePublishedPostControls(postId, controls) {
  const normalized = normalizePostControls(controls);
  const { data, error } = await supabase
    .from("explore_posts")
    .update(postControlColumns(normalized, { always: true }))
    .eq("id", postId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This post can't be changed.");
  updatePostInAllCaches(postId, data);
  return data;
}

const CONTROL_FIELDS = ["comments_disabled", "comments_hidden", "comments_followers_only", "likes_disabled", "like_count_hidden", "reposts_disabled", "has_exclusions", "likes_count", "comments_count", "media_meta"];

/** Patch a post in every stored feed and tell open feeds to merge it. */
export function updatePostInAllCaches(postId, row = {}) {
  const patch = {};
  for (const field of CONTROL_FIELDS) if (row[field] !== undefined) patch[field] = row[field];
  // media_meta.postControls (from the ranked feeds) must not outvote the new columns.
  if (patch.media_meta?.postControls) {
    const { postControls: _stale, ...rest } = patch.media_meta;
    patch.media_meta = rest;
  }
  ["feed", "connections", "swip"].forEach((scope) => {
    const key = getPostsStorageKey(scope);
    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(items) && items.some((post) => post?.id === postId)) {
        localStorage.setItem(key, JSON.stringify(items.map((post) => (post?.id === postId ? { ...post, ...patch } : post))));
      }
    } catch {
      // A broken cache entry is replaced on the next feed load.
    }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { postId, type: "update-post", patch } }));
  }
}

/**
 * Reposts whose copy was removed (the original excludes someone) read their
 * preview from the original, in one query per page. RLS decides: an original
 * this viewer may not see reads "unavailable".
 */
export async function hydrateLiveReposts(posts = []) {
  const list = Array.isArray(posts) ? posts : [];
  const ids = Array.from(new Set(list.filter(isLiveRepost).map((post) => (post.media_meta || post.mediaMeta).repost.sourcePostId)));
  if (!ids.length) return list;
  try {
    const { data, error } = await supabase
      .from("explore_posts")
      .select("id, user_id, author_name, author_username, author_avatar_url, body, image_url, video_url, video_trim_start, video_trim_end, audio_url, audio_duration_seconds, created_at")
      .in("id", ids);
    if (error) throw error;
    return fillLiveReposts(list, new Map((data || []).map((row) => [row.id, row])));
  } catch {
    return fillLiveReposts(list, new Map());
  }
}

export { normalizeExcludedAccounts };
