import supabase from "../../lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "./errors";
import { uploadMediaDataUrl } from "./mediaService";
import { buildExploreProfileFromUser, getMetadataAvatar, getMetadataCover, writeStoredProfile } from "./profileStorage";
import { normalizeSocialLinks } from "./socialLinks";

function toAppProfile(row, fallback = {}) {
  return {
    userId: row?.user_id || fallback.userId || "",
    displayName: row?.display_name || fallback.displayName || "Profile",
    username: row?.username || fallback.username || "",
    email: row?.contact_email || fallback.email || "",
    phone: fallback.phone || "",
    dateOfBirth: fallback.dateOfBirth || "",
    address: row?.address || fallback.address || "",
    accountType: row?.account_type || fallback.accountType || "personal",
    avatarUrl: row?.avatar_url || fallback.avatarUrl || "",
    coverUrl: row?.cover_url || fallback.coverUrl || "preset:gradient",
    bio: row?.bio || fallback.bio || "",
    socialLinks: normalizeSocialLinks(row?.social_links || fallback.socialLinks),
    verified: Boolean(row?.verified || fallback.verified),
  };
}

function getReadableProfileName(profile = {}, user = {}) {
  const displayName = String(profile.displayName || "").trim();
  const username = String(profile.username || "").trim();
  const email = String(profile.email || user?.email || "").trim();

  if (displayName && displayName.toLowerCase() !== "profile") return displayName;
  if (username && username.toLowerCase() !== "user") return username;
  if (email) return email.split("@")[0] || email;
  return "User";
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
    contact_email: profile.email || "",
    address: profile.address || "",
    avatar_url: profile.avatarUrl,
    cover_url: profile.coverUrl || "preset:gradient",
    bio: profile.bio || "",
    social_links: normalizeSocialLinks(profile.socialLinks),
    account_type: profile.accountType || "personal",
    updated_at: new Date().toISOString(),
  };

  let nextPayload = payload;
  let data = null;
  let error = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await supabase.from("explore_profiles").upsert(nextPayload, { onConflict: "user_id" }).select().maybeSingle();
    data = result.data;
    error = result.error;

    if (!error) {
      break;
    }

    const missingOptionalColumn = ["social_links", "contact_email", "address", "cover_url"].find((column) => isMissingColumn(error, column));
    if (!missingOptionalColumn) {
      break;
    }

    const { [missingOptionalColumn]: _removed, ...fallbackPayload } = nextPayload;
    nextPayload = fallbackPayload;
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

export async function ensureExploreProfile(user) {
  if (!user?.id) {
    return null;
  }

  const existing = await fetchExploreProfile(user.id).catch(() => null);
  if (existing) {
    return existing;
  }

  const fallback = {
    ...buildExploreProfileFromUser(user),
    userId: user.id,
  };

  const row = await upsertExploreProfile(user.id, fallback).catch(() => null);
  const profile = row ? toAppProfile(row, fallback) : fallback;
  writeStoredProfile(user.id, profile);
  return profile;
}

export async function getCurrentUserProfile() {
  const user = await getAuthUser();

  if (!user) {
    return null;
  }

  const fallback = buildExploreProfileFromUser(user);
  const stored = await ensureExploreProfile(user).catch(() => null);
  const profile = stored || fallback;

  return {
    id: user.id,
    name: getReadableProfileName(profile, user),
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
  let coverUrl = patch.coverUrl ?? getMetadataCover(current) ?? "preset:gradient";
  let avatarWarning = "";
  let coverWarning = "";

  if (patch.avatarUrl?.startsWith?.("data:")) {
    try {
      avatarUrl = await uploadMediaDataUrl(patch.avatarUrl, "profile", user.id);
    } catch (error) {
      avatarUrl = patch.avatarUrl;
      avatarWarning = error.message || "Profile image is saved locally until storage is ready.";
    }
  }

  if (patch.coverUrl?.startsWith?.("data:")) {
    try {
      coverUrl = await uploadMediaDataUrl(patch.coverUrl, "profile-cover", user.id);
    } catch (error) {
      coverUrl = patch.coverUrl;
      coverWarning = error.message || "Cover image is saved locally until storage is ready.";
    }
  }

  const nextProfile = {
    ...currentProfile,
    ...patch,
    avatarUrl,
    coverUrl,
  };

  const authData = {
    ...current,
    display_name: nextProfile.displayName,
    full_name: nextProfile.displayName,
    username: nextProfile.username,
    contact_email: nextProfile.email,
    phone_number: nextProfile.phone,
    date_of_birth: nextProfile.dateOfBirth,
    address: nextProfile.address || "",
    account_type: nextProfile.accountType,
    bio: nextProfile.bio || "",
    social_links: normalizeSocialLinks(nextProfile.socialLinks),
    avatar_url: avatarUrl?.startsWith?.("data:") ? getMetadataAvatar(current) : avatarUrl,
    cover_url: coverUrl?.startsWith?.("data:") ? getMetadataCover(current) : coverUrl,
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
    email: authData.contact_email || user.email || "",
    address: authData.address || "",
    avatarUrl: avatarUrl || getMetadataAvatar(data.user?.user_metadata || authData),
    coverUrl: coverUrl || getMetadataCover(data.user?.user_metadata || authData) || "preset:gradient",
    socialLinks: normalizeSocialLinks(authData.social_links),
    avatarWarning: avatarWarning || coverWarning,
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
