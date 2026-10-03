// Admin console lock client. Every decision is made by the database
// (supabase/migrations/20261003100000_admin_console_lock.sql): this module only
// calls it. While the console is locked, admin permission checks fail
// server-side, so the lock cannot be bypassed from the browser.
import supabase from "../Backend/lib/supabaseClient";

export { passcodeProblem, passcodeStrength } from "./consoleLockRules.js";

export const CONSOLE_IDLE_MS = 5 * 60 * 1000;
export const CONSOLE_WARNING_MS = 30 * 1000;
export const CONSOLE_HEARTBEAT_MS = 60 * 1000;
export const CONSOLE_CHANNEL = "kunthai-admin-console";

function unwrap(result, fallback) {
  if (result.error) throw new Error(result.error.message || fallback);
  return result.data;
}

export async function getConsoleStatus() {
  return unwrap(await supabase.rpc("admin_console_status"), "Unable to check the console lock.");
}

export async function setConsolePasscode(passcode) {
  return unwrap(await supabase.rpc("admin_set_console_passcode", { p_passcode: passcode }), "Unable to save the passcode.");
}

export async function unlockConsole(passcode) {
  return unwrap(await supabase.rpc("admin_unlock_console", { p_passcode: passcode }), "Unable to unlock the console.");
}

export async function consoleHeartbeat() {
  return unwrap(await supabase.rpc("admin_console_heartbeat"), "Unable to reach the console.");
}

export async function lockConsole() {
  try {
    await supabase.rpc("admin_lock_console");
  } catch {
    // Locking locally still hides everything; the server session also expires.
  }
}

// Confirms a 6-digit code from the admin's authenticator app. On success the
// Supabase session is refreshed with a fresh MFA timestamp, which the database
// requires for authenticator unlocks and passcode changes.
export async function verifyAuthenticatorCode(code) {
  const cleaned = String(code || "").replace(/\D/g, "");
  if (cleaned.length !== 6) throw new Error("Enter the 6-digit code from your authenticator app.");
  const factors = unwrap(await supabase.auth.mfa.listFactors(), "Unable to find your authenticator.");
  const factor = (factors?.totp || []).find((item) => item.status === "verified");
  if (!factor) throw new Error("No authenticator is set up on this account.");
  unwrap(await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: cleaned }), "That code did not work. Try the newest code.");
}

export async function unlockWithAuthenticator(code) {
  await verifyAuthenticatorCode(code);
  return unwrap(await supabase.rpc("admin_unlock_console_with_mfa"), "Unable to unlock the console.");
}
