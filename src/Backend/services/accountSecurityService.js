import supabase from "../lib/supabaseClient";
import { signOutOtherDevices } from "./sessionService";
import { reauthenticationChannel } from "./accountSecurityRules.js";

export { MIN_PASSWORD_LENGTH, reauthenticationChannel, validateNewPassword } from "./accountSecurityRules.js";

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function getPasswordChangeChannel() {
  const { data } = await supabase.auth.getUser();
  return reauthenticationChannel(data?.user);
}

// Step 1: send a one-time code to the account's email or phone, confirming
// that the person holding this session still controls the account.
export async function sendPasswordChangeCode() {
  const { error } = await supabase.auth.reauthenticate();
  if (error) throw error;
}

// Step 2: set the new password with that code.
export async function changeAccountPassword({ password, code = "" }) {
  const nonce = String(code || "").trim();
  const { error } = await supabase.auth.updateUser(nonce ? { password, nonce } : { password });
  if (!error) return;
  const message = String(error.message || "");
  if (/nonce|otp|expired|invalid.*code|reauthenticat/i.test(`${error.code || ""} ${message}`)) {
    throw codedError("bad_code", "That code is wrong or expired.");
  }
  if (/same.*password|different from the old/i.test(message)) {
    throw codedError("same_as_current", "Choose a new password.");
  }
  if (/weak|pwned|leaked|characters/i.test(message)) {
    throw codedError("weak", "Choose a stronger password.");
  }
  throw error;
}

export { signOutOtherDevices };
