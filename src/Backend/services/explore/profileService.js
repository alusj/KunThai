import supabase from "../../lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "./errors";
import { uploadMediaDataUrl } from "./mediaService";
import { buildExploreProfileFromUser, getMetadataAvatar, writeStoredProfile } from "./profileStorage";
import { normalizeSocialLinks } from "./socialLinks";

function toAppProfile(row, fallback = {}) {
  return {
    userId: row?.user_id || fallback.userId || "",
    displayName: row?.display_name || fallback.displayName || "Profile",
    username: row?.username || fallback.username || "",
    email: fallback.email || "",
    phone: fallback.phone || "",
    dateOfBirth: fallback.dateOfBirth || "",
    accountType: row?.account_type || fallback.accountType || "personal",
    avatarUrl: row?.avatar_url || fallback.avatarUrl || "",
    bio: row?.bio || fallback.bio || "",
    socialLinks: normalizeSocialLinks(row?.social_links || fallback.socialLinks),
    verified: Boolean(row?.verified || fallback.verified),
  };
}

async function getAuthUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return user;
}

async function upsertExploreProfile(userId, profile) {
  const payload = {
    user_id: userId,
    display_name: profile.displayName,
    username: profile.username,
    avatar_url: profile.avatarUrl,
    bio: profile.bio || "",
    social_links: normalizeSocialLinks(profile.socialLinks),
    account_type: profile.accountType || "personal",
    updated_at: new Date().toISOString(),
  };

  let { data, error } = await supabase.from("explore_profiles").upsert(payload, { onConflict: "user_id" }).select().maybeSingle();

  if (error && isMissingColumn(error, "social_links")) {
    const { social_links: _socialLinks, ...fallbackPayload } = payload;
    const fallback = await supabase.from("explore_profiles").upsert(fallbackPayload, { onConflict: "user_id" }).select().maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingTable(error)) {
      return null;
    }
    throw error;
  }

  return data;
}

function updateLocalAuthorCache(userId, authorPatch) {
  ["explore-posts-feed", "explore-posts-connections", "explore-posts-swip"].forEach((key) => {
    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(items)) {
        localStorage.setItem(key, JSON.stringify(items.map((post) => (post.user_id === userId ? { ...post, ...authorPatch } : post))));
      }
    } catch {
      // Ignore invalid local caches.
    }
  });
}

export async function fetchExploreProfile(userId) {
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase.from("explore_profiles").select("*").eq("user_id", userId).maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return null;
    }
    throw error;
  }

  if (!data) return null;

  const profile = toAppProfile(data);
  writeStoredProfile(profile.userId, profile);
  return profile;
}

export async function getCurrentUserProfile() {
  const user = await getAuthUser();

  if (!user) {
    return null;
  }

  const fallback = buildExploreProfileFromUser(user);
  const stored = await fetchExploreProfile(user.id).catch(() => null);
  const profile = stored || fallback;

  return {
    id: user.id,
    name: profile.displayName,
    username: profile.username,
    avatar_url: profile.avatarUrl,
  };
}

export async function updateExploreProfile(patch) {
  const user = await getAuthUser();

  if (!user) {
    throw new Error("No active session.");
  }

  const current = user.user_metadata || {};
  const currentProfile = buildExploreProfileFromUser(user);
  let avatarUrl = patch.avatarUrl ?? getMetadataAvatar(current) ?? "";
  let avatarWarning = "";

  if (patch.avatarUrl?.startsWith?.("data:")) {
    try {
      avatarUrl = await uploadMediaDataUrl(patch.avatarUrl, "profile", user.id);
    } catch (error) {
      avatarUrl = patch.avatarUrl;
      avatarWarning = error.message || "Profile image is saved locally until storage is ready.";
    }
  }

  const nextProfile = {
    ...currentProfile,
    ...patch,
    avatarUrl,
  };

  const authData = {
    ...current,
    display_name: nextProfile.displayName,
    full_name: nextProfile.displayName,
    username: nextProfile.username,
    contact_email: nextProfile.email,
    phone_number: nextProfile.phone,
    date_of_birth: nextProfile.dateOfBirth,
    account_type: nextProfile.accountType,
    bio: nextProfile.bio || "",
    social_links: normalizeSocialLinks(nextProfile.socialLinks),
    avatar_url: avatarUrl?.startsWith?.("data:") ? getMetadataAvatar(current) : avatarUrl,
    picture: avatarUrl?.startsWith?.("data:") ? current.picture || "" : avatarUrl || current.picture || "",
  };

  const { data, error } = await supabase.auth.updateUser({ data: authData });

  if (error) {
    throw error;
  }

  const updated = {
    ...nextProfile,
    userId: user.id,
    displayName: authData.display_name || user.email || "",
    username: authData.username || user.email?.split("@")[0] || "",
    avatarUrl: avatarUrl || getMetadataAvatar(data.user?.user_metadata || authData),
    socialLinks: normalizeSocialLinks(authData.social_links),
    avatarWarning,
  };

  await upsertExploreProfile(user.id, updated);

  const authorPatch = {
    author_name: updated.displayName,
    author_username: updated.username,
    author_avatar_url: updated.avatarUrl,
  };

  const { error: postError } = await supabase.from("explore_posts").update(authorPatch).eq("user_id", user.id);

  if (postError && !isMissingTable(postError)) {
    throw postError;
  }

  writeStoredProfile(user.id, updated);
  updateLocalAuthorCache(user.id, authorPatch);
  window.dispatchEvent(new CustomEvent("explore-profile-updated", { detail: { userId: user.id, ...authorPatch } }));

  return updated;
}
