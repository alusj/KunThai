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
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.totp || []) {
    if (factor.status === "unverified") {
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

export async function verifyTwoFactorLogin(code) {
  const state = await getTwoFactorState();
  if (!state.factorId) throw new Error("Two-step verification is not enabled on this account.");
  await confirmTotpEnrollment(state.factorId, code);
  return true;
}
