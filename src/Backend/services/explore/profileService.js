import supabase from "../../lib/supabaseClient";
import { isMissingColumn, isMissingTable, isUniqueViolation } from "./errors";
import {
  escapeLikePattern,
  isInlineImageUrl,
  resolveProfileDisplayName,
  sameUsername,
  validateUsername,
} from "./profilePostsModel";
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
    deactivatedAt: row?.deactivated_at || fallback.deactivatedAt || "",
    updatedAt: row?.updated_at || fallback.updatedAt || "",
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

// A personal post by this account (not one it published as a Space).
export function isPersonalPostOf(post = {}, userId = "") {
  return Boolean(userId) && post?.user_id === userId && post?.actor_type !== "space" && !post?.space_id;
}

function updateLocalAuthorCache(userId, authorPatch) {
  ["explore-posts-feed", "explore-posts-connections", "explore-posts-swip"].forEach((key) => {
    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(items)) {
        localStorage.setItem(key, JSON.stringify(items.map((post) => (isPersonalPostOf(post, userId) ? { ...post, ...authorPatch } : post))));
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

  // Guests browse anonymously and must never appear in profile directories
  // or suggestions, so no explore profile row is created for them.
  if (user.is_anonymous) {
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

  let row = await upsertExploreProfile(user.id, fallback).catch((error) => (isUniqueViolation(error) ? "taken" : null));
  if (row === "taken") {
    // The generated username belongs to someone else (usernames are unique
    // ignoring case): keep it recognisable with a short suffix.
    fallback.username = `${String(fallback.username || "user").slice(0, 24)}_${user.id.replace(/-/g, "").slice(0, 5)}`;
    row = await upsertExploreProfile(user.id, fallback).catch(() => null);
  }
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

export class ProfileSaveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProfileSaveError";
    this.code = code;
  }
}

async function usernameTakenByOther(userId, username) {
  const { data, error } = await supabase
    .from("explore_profiles")
    .select("user_id")
    .ilike("username", escapeLikePattern(username))
    .neq("user_id", userId)
    .limit(1);

  if (error) {
    if (isMissingTable(error)) return false;
    throw error;
  }
  return Boolean(data?.length);
}

// Uploads a newly chosen image. A failed upload never stores the inline data:
// URL: the previous image is kept and the failure is reported to the caller.
async function resolveProfileImage(nextValue, previousValue, type, userId) {
  if (!isInlineImageUrl(nextValue)) {
    return { url: nextValue, failed: false };
  }

  try {
    const url = await uploadMediaDataUrl(nextValue, type, userId);
    if (!url || isInlineImageUrl(url)) throw new Error("Upload returned no address.");
    return { url, failed: false };
  } catch {
    return { url: isInlineImageUrl(previousValue) ? "" : previousValue || "", failed: true };
  }
}

async function readStoredProfileRow(userId) {
  try {
    const { data } = await supabase
      .from("explore_profiles")
      .select("username, avatar_url, cover_url")
      .eq("user_id", userId)
      .maybeSingle();
    return data || {};
  } catch {
    return {};
  }
}

export async function updateExploreProfile(patch) {
  const user = await getAuthUser();

  if (!user) {
    throw new Error("No active session.");
  }

  const current = user.user_metadata || {};
  const currentProfile = buildExploreProfileFromUser(user);
  const storedRow = await readStoredProfileRow(user.id);

  const previousAvatar = storedRow.avatar_url || getMetadataAvatar(current) || "";
  const previousCover = storedRow.cover_url || getMetadataCover(current) || "preset:gradient";
  const avatar = await resolveProfileImage(patch.avatarUrl ?? previousAvatar, previousAvatar, "profile", user.id);
  const cover = await resolveProfileImage(patch.coverUrl ?? previousCover, previousCover, "profile-cover", user.id);
  const avatarUrl = avatar.url || "";
  const coverUrl = cover.url || "preset:gradient";

  const nextProfile = {
    ...currentProfile,
    ...patch,
    avatarUrl,
    coverUrl,
  };

  // Usernames are checked only when changed, so an older handle that predates
  // the rules can still be kept.
  const username = String(nextProfile.username || "").trim();
  const previousUsername = storedRow.username ?? currentProfile.username ?? "";
  if (!username || !sameUsername(username, previousUsername)) {
    const reason = validateUsername(username);
    if (reason) {
      throw new ProfileSaveError(`username-${reason}`, "Usernames are 3-30 letters, numbers, dots or underscores, and cannot start with a dot.");
    }
    if (await usernameTakenByOther(user.id, username)) {
      throw new ProfileSaveError("username-taken", "That username is taken. Try another one.");
    }
  }

  // A display name is required; it falls back to the username, never to an email.
  const displayName = resolveProfileDisplayName(nextProfile.displayName, username);
  if (!displayName) {
    throw new ProfileSaveError("display-name-required", "Add a display name before saving.");
  }

  const updated = {
    ...nextProfile,
    userId: user.id,
    displayName,
    username,
    email: String(nextProfile.email || "").trim(),
    address: String(nextProfile.address || "").trim(),
    avatarUrl,
    coverUrl,
    socialLinks: normalizeSocialLinks(nextProfile.socialLinks),
    avatarUploadFailed: avatar.failed,
    coverUploadFailed: cover.failed,
  };

  // Save the public profile first: a taken username stops the save before the
  // account details change.
  let savedRow = null;
  try {
    savedRow = await upsertExploreProfile(user.id, updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ProfileSaveError("username-taken", "That username is taken. Try another one.");
    }
    throw error;
  }
  if (savedRow?.updated_at) updated.updatedAt = savedRow.updated_at;

  const authData = {
    ...current,
    display_name: updated.displayName,
    full_name: updated.displayName,
    username: updated.username,
    contact_email: updated.email,
    phone_number: updated.phone,
    date_of_birth: updated.dateOfBirth,
    address: updated.address,
    account_type: updated.accountType,
    bio: updated.bio || "",
    social_links: updated.socialLinks,
    avatar_url: avatarUrl,
    cover_url: coverUrl,
    picture: avatarUrl || current.picture || "",
  };

  const { error } = await supabase.auth.updateUser({ data: authData });

  if (error) {
    throw error;
  }

  const authorPatch = {
    author_name: updated.displayName,
    author_username: updated.username,
    author_avatar_url: updated.avatarUrl,
  };

  // Only personal posts carry the personal name: posts published as a Space
  // keep the Space's name and picture.
  const { error: postError } = await supabase
    .from("explore_posts")
    .update(authorPatch)
    .eq("user_id", user.id)
    .neq("actor_type", "space");

  if (postError && !isMissingTable(postError) && !isMissingColumn(postError, "actor_type")) {
    throw postError;
  }

  writeStoredProfile(user.id, updated);
  updateLocalAuthorCache(user.id, authorPatch);
  window.dispatchEvent(new CustomEvent("explore-profile-updated", { detail: { userId: user.id, ...authorPatch } }));

  return updated;
}
