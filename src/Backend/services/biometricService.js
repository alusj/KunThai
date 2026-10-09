import { Capacitor } from "@capacitor/core";

import { t as i18nText } from "../../i18n/index";

// Biometric unlock. In the iOS / Android app (bundled, served from
// capacitor://localhost, where WebAuthn can never work) it uses the system
// Face ID / Touch ID / fingerprint prompt through
// @aparajita/capacitor-biometric-auth. In a browser it keeps using a WebAuthn
// platform credential. The exported functions are the same on both.

const BIOMETRIC_KEY_PREFIX = "kuntai.biometric.";

// With biometric unlock on, KunThai asks again on launch and when it comes
// back after more than a minute in the background.
export const BIOMETRIC_RELOCK_AFTER_MS = 60 * 1000;

export function shouldRelockAfterBackground(hiddenAt, now = Date.now(), thresholdMs = BIOMETRIC_RELOCK_AFTER_MS) {
  const since = Number(hiddenAt) || 0;
  return since > 0 && now - since > thresholdMs;
}

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

function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let nativePluginPromise = null;
function loadNativeBiometricPlugin() {
  nativePluginPromise ??= import("@aparajita/capacitor-biometric-auth")
    .then((module) => module.BiometricAuth || null)
    .catch(() => null);
  return nativePluginPromise;
}

const NATIVE_CANCEL_CODES = new Set(["userCancel", "appCancel", "systemCancel", "userFallback"]);

function nativeErrorMessage(error, fallbackKey = "exploreNativeFix.biometricFailed") {
  const code = String(error?.code || "");
  if (NATIVE_CANCEL_CODES.has(code)) return i18nText("exploreNativeFix.biometricCancelled");
  if (code === "biometryLockout") return i18nText("exploreNativeFix.biometricLockedOut");
  if (code === "biometryNotEnrolled" || code === "passcodeNotSet" || code === "noDeviceCredential") {
    return i18nText("exploreNativeFix.biometricNotEnrolled");
  }
  if (code === "biometryNotAvailable") return i18nText("exploreNativeFix.biometricUnavailable");
  return i18nText(fallbackKey);
}

async function getNativeAvailability() {
  const plugin = await loadNativeBiometricPlugin();
  if (!plugin) return { available: false, reason: i18nText("exploreNativeFix.biometricCheckFailed") };
  try {
    const result = await plugin.checkBiometry();
    if (result?.isAvailable) return { available: true, reason: "" };
    const code = String(result?.code || "");
    return {
      available: false,
      reason: code === "biometryNotEnrolled" || code === "passcodeNotSet"
        ? i18nText("exploreNativeFix.biometricNotEnrolled")
        : i18nText("exploreNativeFix.biometricUnavailable"),
    };
  } catch {
    return { available: false, reason: i18nText("exploreNativeFix.biometricCheckFailed") };
  }
}

// Shows the system prompt. Device passcode is allowed as a fallback so a
// lockout never strands someone behind the KunThai lock screen.
async function authenticateNative(reasonKey) {
  const plugin = await loadNativeBiometricPlugin();
  if (!plugin) throw new Error(i18nText("exploreNativeFix.biometricCheckFailed"));
  try {
    await plugin.authenticate({
      reason: i18nText(reasonKey),
      cancelTitle: i18nText("exploreNativeFix.biometricCancel"),
      allowDeviceCredential: true,
      iosFallbackTitle: i18nText("exploreNativeFix.biometricUsePasscode"),
      androidTitle: i18nText("exploreNativeFix.biometricReason"),
      androidSubtitle: i18nText("exploreNativeFix.biometricAndroidSubtitle"),
      androidConfirmationRequired: false,
    });
  } catch (error) {
    throw new Error(nativeErrorMessage(error));
  }
}

function savePreference(userId, preference) {
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(preference));
  } catch {
    // Storage unavailable: the lock still works for this session.
  }
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
  if (isNativeApp()) return getNativeAvailability();
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

  if (isNativeApp()) {
    await authenticateNative("exploreNativeFix.biometricEnableReason");
    const preference = {
      enabled: true,
      enrolledAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      method: "native",
    };
    savePreference(userId, preference);
    return preference;
  }

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
  if (isNativeApp()) {
    if (!preference.enabled) throw new Error("Biometric unlock is not enabled on this device.");
    await authenticateNative("exploreNativeFix.biometricReason");
    const next = { ...preference, lastVerifiedAt: new Date().toISOString() };
    savePreference(userId, next);
    return next;
  }
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

