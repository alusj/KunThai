const BIOMETRIC_KEY_PREFIX = "kuntai.biometric.";

function getStorageKey(userId = "") {
  return `${BIOMETRIC_KEY_PREFIX}${String(userId || "guest")}`;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  new Uint8Array(bytes).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value = "") {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function createChallenge() {
  return window.crypto.getRandomValues(new Uint8Array(32));
}

function getWebAuthnError(error, fallback) {
  if (error?.name === "NotAllowedError") return "Biometric confirmation was cancelled or timed out.";
  if (error?.name === "InvalidStateError") return "Biometric unlock is already registered on this device.";
  if (error?.name === "SecurityError") return "Biometrics require a secure KunThai connection.";
  return error?.message || fallback;
}

export function readBiometricPreference(userId = "") {
  if (typeof window === "undefined" || !userId) return { enabled: false };
  try {
    const saved = JSON.parse(window.localStorage.getItem(getStorageKey(userId)) || "null");
    return saved && typeof saved === "object" ? saved : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

export async function getBiometricAvailability() {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return { available: false, reason: "Biometrics require a secure connection." };
  }
  if (!("PublicKeyCredential" in window) || !window.navigator?.credentials) {
    return { available: false, reason: "This browser does not provide biometric verification." };
  }

  try {
    const checker = window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
    const available = typeof checker === "function" ? await checker.call(window.PublicKeyCredential) : true;
    return {
      available,
      reason: available ? "" : "No device biometric or secure screen lock is available.",
    };
  } catch {
    return { available: false, reason: "KunThai could not check this device's biometric support." };
  }
}

export async function enableBiometricUnlock({ displayName = "KunThai user", userId = "" } = {}) {
  if (!userId) throw new Error("Sign in before enabling biometric unlock.");
  const availability = await getBiometricAvailability();
  if (!availability.available) throw new Error(availability.reason);

  try {
    const credential = await window.navigator.credentials.create({
      publicKey: {
        attestation: "none",
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required",
        },
        challenge: createChallenge(),
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" },
        ],
        rp: { name: "KunThai" },
        timeout: 60_000,
        user: {
          displayName: String(displayName || "KunThai user").slice(0, 64),
          id: new TextEncoder().encode(userId).slice(0, 64),
          name: `kunthai-${userId.slice(0, 12)}`,
        },
      },
    });

    if (!credential?.rawId) throw new Error("This device did not create a biometric credential.");
    const preference = {
      credentialId: bytesToBase64Url(credential.rawId),
      enabled: true,
      enrolledAt: new Date().toISOString(),
      lastVerifiedAt: "",
    };
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(preference));
    return preference;
  } catch (error) {
    throw new Error(getWebAuthnError(error, "Unable to enable biometric unlock."));
  }
}

export async function verifyBiometricUnlock(userId = "") {
  const preference = readBiometricPreference(userId);
  if (!preference.enabled || !preference.credentialId) {
    throw new Error("Biometric unlock is not enabled on this device.");
  }

  try {
    const credential = await window.navigator.credentials.get({
      publicKey: {
        allowCredentials: [{ id: base64UrlToBytes(preference.credentialId), type: "public-key" }],
        challenge: createChallenge(),
        timeout: 60_000,
        userVerification: "required",
      },
    });

    if (!credential?.rawId || bytesToBase64Url(credential.rawId) !== preference.credentialId) {
      throw new Error("The biometric credential did not match this KunThai account.");
    }

    const next = { ...preference, lastVerifiedAt: new Date().toISOString() };
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(next));
    return next;
  } catch (error) {
    throw new Error(getWebAuthnError(error, "Biometric confirmation failed."));
  }
}

export function disableBiometricUnlock(userId = "") {
  if (typeof window !== "undefined" && userId) {
    window.localStorage.removeItem(getStorageKey(userId));
  }
  return { enabled: false };
}

