import supabase from "../../lib/supabaseClient";

// Shared click behavior for inline @mention / #hashtag tokens in posts and
// comments: hashtags open live results, mentions open the profile directly.

const mentionProfileCache = new Map();

async function resolveMentionProfile(username) {
  const key = String(username || "").toLowerCase();
  if (!key) return null;
  if (mentionProfileCache.has(key)) {
    return mentionProfileCache.get(key);
  }

  const { data, error } = await supabase
    .from("explore_profiles")
    .select("user_id, display_name, username, avatar_url, account_type")
    .ilike("username", key)
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  mentionProfileCache.set(key, data || null);
  return data || null;
}

export function openHashtagContent(tag) {
  window.dispatchEvent(new CustomEvent("explore-search-query", { detail: { query: `#${tag}` } }));
}

// Opens the mentioned user's profile immediately; falls back to a prefilled
// search when the username has no exact profile match.
export async function openMentionContent(username) {
  const profile = await resolveMentionProfile(username).catch(() => null);

  if (profile?.user_id) {
    window.dispatchEvent(new CustomEvent("kuntai-open-profile", {
      detail: {
        userId: profile.user_id,
        displayName: profile.display_name || "",
        username: profile.username || username,
        avatarUrl: profile.avatar_url || "",
      },
    }));
    return;
  }

  window.dispatchEvent(new CustomEvent("explore-search-query", { detail: { query: `@${username}` } }));
}
