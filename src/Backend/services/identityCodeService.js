const USER_ID_PREFIX = "KTU";

function compactIdentity(value = "") {
  return String(value).replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function formatPublicUserIdBody(body = "") {
  const compact = compactIdentity(body);
  if (!compact) return "";

  if (compact.length >= 12) {
    return `${USER_ID_PREFIX}-${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(-4)}`;
  }

  return `${USER_ID_PREFIX}-${compact}`;
}

function hashIdentity(value = "") {
  let hash = 2166136261;
  const input = String(value || "kunthai");

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0");
}

export function getKunThaiPublicUserId(profile = {}) {
  const existing = compactIdentity(profile.publicUserId || profile.public_user_id || profile.kunThaiId || profile.kunthai_id);
  if (existing) {
    const body = existing.startsWith(USER_ID_PREFIX) ? existing.slice(USER_ID_PREFIX.length) : existing;
    return formatPublicUserIdBody(body);
  }

  const userId = compactIdentity(profile.userId || profile.user_id || profile.id);
  if (userId.length >= 12) {
    return formatPublicUserIdBody(userId);
  }

  const username = compactIdentity(profile.username || profile.handle);
  const name = compactIdentity(profile.displayName || profile.display_name || profile.fullName || profile.full_name);
  const seed = userId || username || name || "KUNTHAI";
  return formatPublicUserIdBody(hashIdentity(seed));
}

export function normalizeKunThaiPublicId(value = "") {
  const compact = compactIdentity(value);
  if (!compact) return "";

  if (compact.startsWith(USER_ID_PREFIX)) {
    const body = compact.slice(USER_ID_PREFIX.length);
    return body ? formatPublicUserIdBody(body) : "";
  }

  return compact.length >= 4 ? formatPublicUserIdBody(compact) : compact;
}
