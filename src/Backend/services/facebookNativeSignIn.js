// Native "Continue with Facebook" for the iOS and Android apps.
//
// The KunThaiFacebookLogin plugin (ios/App/App/FacebookLoginPlugin.swift,
// android/.../KunThaiFacebookLoginPlugin.java) uses the Facebook SDK, which
// signs in through the Facebook app or the person's existing Facebook session:
// one confirmation, no Facebook password page. The SDK returns
//   - an OIDC authentication token (iOS Limited Login, e.g. when the phone
//     does not allow tracking), which Supabase takes directly through
//     signInWithIdToken, and/or
//   - a classic access token (the Facebook app switch), which the
//     facebook-native-signin edge function checks with Facebook and turns into
//     a one-time token redeemed with verifyOtp.
//
// The web, and an older app build without the plugin, keep the browser OAuth
// flow. So does a failure here that the browser flow can fix (see
// shouldFallBackToWeb).

import { Capacitor, registerPlugin } from "@capacitor/core";

import supabase from "../lib/supabaseClient";
import { sha256Hex } from "./appleNativeSignIn";

const KunThaiFacebookLogin = registerPlugin("KunThaiFacebookLogin");

export function canUseNativeFacebookSignIn() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("KunThaiFacebookLogin");
  } catch {
    return false;
  }
}

function randomNonce(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class FacebookNativeError extends Error {
  constructor(message, code, { fallBackToWeb = false } = {}) {
    super(message);
    this.code = code;
    this.fallBackToWeb = fallBackToWeb;
  }
}

// Errors the browser sign-in can still fix: Facebook kept the email back (the
// web flow asks again with auth_type=rerequest), an account the one-time token
// cannot reach, or the SDK not being set up on this build.
export function shouldFallBackToWeb(error) {
  return Boolean(error?.fallBackToWeb);
}

async function signInWithAuthenticationToken(token, rawNonce) {
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "facebook", token, nonce: rawNonce });
  if (error) throw error;
  if (!data?.session) throw new Error("Session was not established after sign-in. Please try again.");
}

async function signInWithAccessToken(accessToken) {
  const { data, error } = await supabase.functions.invoke("facebook-native-signin", { body: { accessToken } });
  if (error) {
    let body = null;
    try {
      body = await error.context?.json?.();
    } catch {
      body = null;
    }
    const code = body?.code || "server_error";
    throw new FacebookNativeError(body?.message || "Facebook sign-in could not be completed. Please try again.", code, {
      fallBackToWeb: code === "facebook_no_email" || code === "account_without_email",
    });
  }
  if (!data?.tokenHash) throw new Error("Facebook sign-in could not be completed. Please try again.");

  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.tokenHash,
    type: data.type || "magiclink",
  });
  if (verifyError) throw verifyError;
  if (!verified?.session) throw new Error("Session was not established after sign-in. Please try again.");
}

// Resolves { status: "success" } or { status: "cancelled" }; throws on failure
// (error.fallBackToWeb marks the ones the browser flow should retry).
export async function signInWithNativeFacebook() {
  const rawNonce = randomNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  let result;
  try {
    result = await KunThaiFacebookLogin.login({ nonce: hashedNonce, permissions: ["public_profile", "email"] });
  } catch (error) {
    if (error?.code === "cancelled") return { status: "cancelled" };
    if (error?.code === "in_progress") throw error;
    // SDK not configured on this build, Facebook app errors and the like: the
    // browser sign-in still works.
    throw new FacebookNativeError(error?.message || "Facebook sign-in failed.", error?.code || "failed", {
      fallBackToWeb: true,
    });
  }

  const authenticationToken = result?.authenticationToken || "";
  const accessToken = result?.accessToken || "";

  if (authenticationToken) {
    try {
      await signInWithAuthenticationToken(authenticationToken, rawNonce);
      return { status: "success" };
    } catch (error) {
      // Supabase only accepts some Facebook OIDC tokens (iOS Limited Login);
      // a classic access token, when there is one, still works.
      if (!accessToken) throw error;
    }
  }

  if (accessToken) {
    await signInWithAccessToken(accessToken);
    return { status: "success" };
  }

  throw new FacebookNativeError("Facebook did not return a sign-in token.", "no_token", { fallBackToWeb: true });
}
