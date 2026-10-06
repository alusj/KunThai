// Native "Sign in with Apple" for the iOS app.
//
// iOS shows Apple's system sheet (Face ID / passcode) through the
// KunThaiAppleSignIn plugin in ios/App/App/AppleSignInPlugin.swift, then the
// identity token is exchanged with supabase.auth.signInWithIdToken. Supabase
// accepts it because `app.kunthai.mobile` is one of the Apple client IDs in
// the Apple provider settings. No Apple secret is involved on this path.
//
// Android and the web keep the existing browser OAuth flow (Services ID
// `app.kunthai.auth`), and so does an older iOS build without the plugin.

import { Capacitor, registerPlugin } from "@capacitor/core";

import supabase from "../lib/supabaseClient";
import { appleNameMetadataPatch } from "./providerNames";

const KunThaiAppleSignIn = registerPlugin("KunThaiAppleSignIn");

// The iOS app's own client ID (its bundle ID). Never changes.
export const APPLE_NATIVE_CLIENT_ID = "app.kunthai.mobile";

export function canUseNativeAppleSignIn() {
  try {
    return Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("KunThaiAppleSignIn");
  } catch {
    return false;
  }
}

function randomNonce(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isAppleCancel(error) {
  return error?.code === "cancelled";
}

// Apple puts the hashed nonce in the identity token; Supabase hashes the raw
// nonce we send and compares, so a captured token cannot be replayed.
// Resolves { status: "success" } or { status: "cancelled" }; throws on failure.
export async function signInWithNativeApple() {
  const rawNonce = randomNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  let credential;
  try {
    credential = await KunThaiAppleSignIn.authorize({ nonce: hashedNonce });
  } catch (error) {
    if (isAppleCancel(error)) return { status: "cancelled" };
    throw error;
  }

  if (!credential?.identityToken) {
    throw new Error("Apple did not return a sign-in token. Please try again.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  if (!data?.session) throw new Error("Session was not established after sign-in. Please try again.");

  // Apple shares the name only on the first authorization and it is not in
  // the token, so keep it for onboarding. Never overwrites an existing name;
  // a failure here must not undo a successful sign-in.
  const patch = appleNameMetadataPatch(data.user?.user_metadata, credential);
  if (patch) {
    await supabase.auth.updateUser({ data: patch }).catch(() => {});
  }

  return { status: "success" };
}

// Account deletion: Apple must be told to revoke KunThai's tokens. The person
// confirms with the Apple sheet, which yields a one-time authorization code
// that /api/apple-revoke exchanges and revokes server-side.
// Resolves { status: "cancelled" } or { status: "confirmed", authorizationCode }.
export async function confirmAppleForAccountDeletion() {
  let credential;
  try {
    credential = await KunThaiAppleSignIn.authorize({ nonce: await sha256Hex(randomNonce()) });
  } catch (error) {
    if (isAppleCancel(error)) return { status: "cancelled" };
    throw error;
  }
  if (!credential?.authorizationCode) {
    throw new Error("Apple did not confirm the request. Please try again.");
  }
  return { status: "confirmed", authorizationCode: credential.authorizationCode };
}
