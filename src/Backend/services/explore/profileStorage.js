import { PROFILE_STORAGE_PREFIX } from "./constants";

function getProfileStorageKey(userId) {
  return `${PROFILE_STORAGE_PREFIX}-${userId}`;
}

export function readStoredProfile(userId) {
  if (!userId) {
    return {};
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

  localStorage.setItem(getProfileStorageKey(userId), JSON.stringify(profile));
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
  const displayName = metadata.display_name || metadata.full_name || metadata.name || cached.displayName || user?.email || "KunThai User";
  const username = metadata.username || cached.username || user?.email?.split("@")[0] || "";
  const avatarUrl = getMetadataAvatar(metadata) || cached.avatarUrl || "";

  return {
    userId: user?.id || "",
    displayName,
    username,
    email: metadata.contact_email || cached.email || user?.email || "",
    phone: metadata.phone_number || cached.phone || user?.phone || "",
    dateOfBirth: metadata.date_of_birth || cached.dateOfBirth || "",
    accountType: metadata.account_type || cached.accountType || "personal",
    avatarUrl,
  };
}
