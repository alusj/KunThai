export const PROFILE_IDENTITY_TYPE = "profile";
export const SPACE_IDENTITY_TYPE = "space";

export function getIdentityKey(identityOrType, id = "") {
  if (typeof identityOrType === "string" && id) {
    return `${identityOrType}:${id}`;
  }

  if (typeof identityOrType === "string" && identityOrType.includes(":")) {
    return identityOrType;
  }

  const identity = identityOrType || {};
  const type = identity.identityType || identity.actorType || (identity.spaceId || identity.target_space_id ? SPACE_IDENTITY_TYPE : PROFILE_IDENTITY_TYPE);
  const value =
    identity.identityId ||
    identity.actorId ||
    identity.spaceId ||
    identity.target_space_id ||
    identity.userId ||
    identity.user_id ||
    identity.id ||
    "";

  return value ? `${type}:${value}` : "";
}

export function normalizeIdentityTarget(target, fallbackType = PROFILE_IDENTITY_TYPE) {
  if (!target) {
    return { type: fallbackType, id: "", key: "" };
  }

  if (typeof target === "string") {
    if (target.includes(":")) {
      const [type, ...rest] = target.split(":");
      const id = rest.join(":");
      return { type: type || fallbackType, id, key: id ? `${type || fallbackType}:${id}` : "" };
    }

    return { type: fallbackType, id: target, key: target ? `${fallbackType}:${target}` : "" };
  }

  const type = target.identityType || target.actorType || target.targetType || (target.spaceId || target.target_space_id ? SPACE_IDENTITY_TYPE : fallbackType);
  const id =
    target.identityId ||
    target.actorId ||
    target.spaceId ||
    target.target_space_id ||
    target.userId ||
    target.user_id ||
    target.id ||
    "";

  return { type, id, key: id ? `${type}:${id}` : "" };
}

export function getProfileIdentity(profile = {}) {
  return normalizeIdentityTarget(profile, PROFILE_IDENTITY_TYPE);
}

export function getPostIdentity(post = {}) {
  const actorType = post.actor_type || post.actorType || (post.space_id || post.spaceId ? SPACE_IDENTITY_TYPE : PROFILE_IDENTITY_TYPE);
  const actorId = actorType === SPACE_IDENTITY_TYPE
    ? post.space_id || post.spaceId || post.actor_id || post.actorId
    : post.actor_id || post.actorId || post.user_id || post.userId;

  return normalizeIdentityTarget({ identityType: actorType, identityId: actorId }, PROFILE_IDENTITY_TYPE);
}

export function isSpaceIdentity(identity = {}) {
  return normalizeIdentityTarget(identity).type === SPACE_IDENTITY_TYPE;
}

export function postMatchesIdentity(post = {}, identity = {}) {
  const normalized = normalizeIdentityTarget(identity);
  if (!normalized.id) return false;

  const postIdentity = getPostIdentity(post);
  return postIdentity.key === normalized.key;
}

export function buildProfileIdentity(userId = "") {
  return normalizeIdentityTarget({ identityType: PROFILE_IDENTITY_TYPE, identityId: userId }, PROFILE_IDENTITY_TYPE);
}

export function buildSpaceIdentity(spaceId = "") {
  return normalizeIdentityTarget({ identityType: SPACE_IDENTITY_TYPE, identityId: spaceId }, SPACE_IDENTITY_TYPE);
}
