import {
  PROFILE_IDENTITY_TYPE,
  normalizeIdentityTarget,
} from "./identityService.js";

export function normalizeBlockedIdentityValues(values = []) {
  const identities = new Map();
  Array.from(values || []).forEach((value) => {
    const identity = normalizeIdentityTarget(value);
    if (!identity.id) return;
    identities.set(identity.key, identity);
  });
  return Array.from(identities.values());
}

export function getBlockedIdentityStorageKeys(target) {
  const identity = normalizeIdentityTarget(target);
  if (!identity.id) return [];
  return identity.type === PROFILE_IDENTITY_TYPE
    ? [identity.id, identity.key]
    : [identity.key];
}

