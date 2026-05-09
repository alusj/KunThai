import { PROFILE_STORAGE_PREFIX } from "./constants";
import { normalizeSocialLinks } from "./socialLinks";

const LAST_PROFILE_KEY = `${PROFILE_STORAGE_PREFIX}-last`;

function getProfileStorageKey(userId) {
  return `${PROFILE_STORAGE_PREFIX}-${userId}`;
}

export function readLastStoredProfile() {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_PROFILE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function readStoredProfile(userId) {
  if (!userId) {
    return readLastStoredProfile();
  }

  try {
    const value = JSON.parse(localStorage.getItem(getProfileStorageKey(userId)) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function writeStoredProfile(userId, profile) {
  if (!userId) {
    return;
  }

  const normalized = {
    ...profile,
    socialLinks: normalizeSocialLinks(profile?.socialLinks),
  };

  localStorage.setItem(getProfileStorageKey(userId), JSON.stringify(normalized));
  localStorage.setItem(LAST_PROFILE_KEY, JSON.stringify(normalized));
}

export function getMetadataAvatar(metadata = {}) {
  return (
    metadata.avatar_url ||
    metadata.picture ||
    metadata.avatarUrl ||
    metadata.photo_url ||
    metadata.photoURL ||
    metadata.image_url ||
    metadata.profile_image_url ||
    ""
  );
}

export function buildExploreProfileFromUser(user) {
  const metadata = user?.user_metadata || {};
  const cached = readStoredProfile(user?.id);
  const displayName = cached.displayName || metadata.display_name || metadata.full_name || metadata.name || user?.email || "";
  const username = cached.username || metadata.username || user?.email?.split("@")[0] || "";
  const avatarUrl = cached.avatarUrl || getMetadataAvatar(metadata) || "";

  return {
    userId: user?.id || "",
    displayName,
    username,
    email: metadata.contact_email || cached.email || user?.email || "",
    phone: metadata.phone_number || cached.phone || user?.phone || "",
    dateOfBirth: metadata.date_of_birth || cached.dateOfBirth || "",
    accountType: metadata.account_type || cached.accountType || "personal",
    avatarUrl,
    bio: cached.bio || metadata.bio || "",
    socialLinks: normalizeSocialLinks(cached.socialLinks || metadata.social_links),
  };
}
