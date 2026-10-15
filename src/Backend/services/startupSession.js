// Decides, before auth has finished restoring, whether this device is likely
// signed in. Used only to pick the first screen: a device with no stored
// session goes straight to Login instead of flashing the signed-in Explore
// skeleton for a frame. The real auth result still decides what stays.

const SESSION_KEY_PATTERN = /^sb-.+-auth-token$/;

function storedValueLooksLikeSession(value) {
  if (!value) return false;
  return value.includes("access_token") || value.includes("refresh_token");
}

// An OAuth / email-link return is a sign-in in progress.
export function urlCarriesSignIn(locationLike) {
  const search = String(locationLike?.search || "");
  const hash = String(locationLike?.hash || "");
  return /[?&](code|token_hash)=/.test(search) || /(access_token|refresh_token)=/.test(hash);
}

export function hasStoredSession(storage) {
  try {
    if (!storage) return false;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && SESSION_KEY_PATTERN.test(key) && storedValueLooksLikeSession(storage.getItem(key))) {
        return true;
      }
    }
  } catch {
    // Storage blocked: assume a session may exist so signed-in users never
    // see the login screen flash instead.
    return true;
  }
  return false;
}

export function isLikelySignedIn({ storage, location } = {}) {
  return hasStoredSession(storage) || urlCarriesSignIn(location);
}
