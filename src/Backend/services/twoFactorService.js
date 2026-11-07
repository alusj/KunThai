import supabase from "../lib/supabaseClient";

// Two-step verification built on Supabase MFA with authenticator-app (TOTP)
// factors. Enrollment lives in Explore settings; the login challenge gate in
// App.jsx blocks the workspace until the session reaches AAL2.

function firstVerifiedTotpFactor(factors) {
  const all = factors?.totp || factors?.all || [];
  return all.find((factor) => factor.status === "verified") || null;
}

export async function getTwoFactorState() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message || "Unable to load two-step verification status.");

  const verifiedFactor = firstVerifiedTotpFactor(data);
  const pendingFactor = (data?.totp || []).find((factor) => factor.status === "unverified") || null;
  return {
    enabled: Boolean(verifiedFactor),
    factorId: verifiedFactor?.id || "",
    pendingFactorId: pendingFactor?.id || "",
  };
}

export async function startTotpEnrollment() {
  // Stale unverified factors block re-enrollment, so clear them first.
  // listFactors().totp holds verified factors only; unverified ones (a setup
  // that was cancelled) are only in .all.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.all || []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => {});
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `KunThai ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw new Error(error.message || "Unable to start two-step verification setup.");

  return {
    factorId: data.id,
    qrCode: data.totp?.qr_code || "",
    secret: data.totp?.secret || "",
    uri: data.totp?.uri || "",
  };
}

export async function confirmTotpEnrollment(factorId, code) {
  const cleanCode = String(code || "").replace(/\D/g, "");
  if (cleanCode.length < 6) throw new Error("Enter the 6-digit code from your authenticator app.");

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw new Error(challengeError.message || "Unable to verify the authenticator code.");

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: cleanCode,
  });
  if (verifyError) throw new Error("That code did not match. Check your authenticator app and try again.");

  return true;
}

export async function disableTwoFactor(factorId) {
  const targetId = factorId || (await getTwoFactorState()).factorId;
  if (!targetId) return true;
  const { error } = await supabase.auth.mfa.unenroll({ factorId: targetId });
  if (error) throw new Error(error.message || "Unable to turn off two-step verification.");
  return true;
}

// True when the signed-in account has 2FA enabled but this session has not yet
// passed the authenticator challenge.
export async function isTwoFactorChallengeRequired() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return false;
  return data?.currentLevel === "aal1" && data?.nextLevel === "aal2";
}

// Like isTwoFactorChallengeRequired, but tells "could not check" (no
// connection, session not restored yet) apart from "not required".
export async function checkTwoFactorChallenge() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return { checked: false, required: false };
  return { checked: true, required: data?.currentLevel === "aal1" && data?.nextLevel === "aal2" };
}

export async function verifyTwoFactorLogin(code) {
  const state = await getTwoFactorState();
  if (!state.factorId) throw new Error("Two-step verification is not enabled on this account.");
  await confirmTotpEnrollment(state.factorId, code);
  return true;
}

// ---- Backup codes (migration 20261104150000) --------------------------------
// 10 one-time codes shown once when two-step is set up: the way back in for
// someone who loses their authenticator app, with or without an email on the
// account. The database keeps only hashes and limits wrong guesses.

/** New backup codes (replacing old ones). Needs a session that passed two-step. */
export async function generateBackupCodes() {
  const { data, error } = await supabase.rpc("kunthai_generate_mfa_backup_codes");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** How many unused backup codes the account has. */
export async function getBackupCodeCount() {
  const { data, error } = await supabase.rpc("kunthai_mfa_backup_code_count");
  if (error) return null;
  return Number(data) || 0;
}

/** "ABCDE-12345" for anything typed with or without the dash, spaces or case. */
export function formatBackupCode(value = "") {
  const clean = String(value).replace(/[^0-9a-z]/gi, "").toUpperCase().slice(0, 10);
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

/**
 * Use a backup code on the two-step screen. A right code turns two-step off
 * for the account (so the person can sign in and set it up again); returns
 * false for a wrong code. Throws KT_MFA_TOO_MANY_ATTEMPTS after 5 wrong
 * codes in an hour.
 */
export async function recoverWithBackupCode(code) {
  const { data, error } = await supabase.rpc("kunthai_recover_mfa_with_backup_code", { p_code: formatBackupCode(code) });
  if (error) throw error;
  if (data !== true) return false;
  // The session still lists the removed authenticator until it is refreshed.
  await supabase.auth.refreshSession().catch(() => null);
  return true;
}
