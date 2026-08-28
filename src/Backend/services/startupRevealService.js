export function isStartupDestinationReady({
  authLoading = true,
  guestSession = false,
  hasUser = false,
  onboardingChecked = false,
  onboardingLoading = false,
  twoFactorChallengeRequired = null,
  twoFactorPassed = false,
} = {}) {
  if (authLoading) return false;

  // Once auth has definitively resolved without a session, Login is the real
  // destination. Before that point it must stay hidden behind the launch mark.
  if (!hasUser) return true;

  // Guests have no onboarding or 2FA gate. The dashboard-shaped Suspense shell
  // is a valid first frame while its chunk finishes locally.
  if (guestSession) return true;

  if (!onboardingChecked || onboardingLoading) return false;
  if (twoFactorChallengeRequired === null) return false;

  // A real challenge is itself a stable destination and must remain usable.
  if (twoFactorChallengeRequired) return true;
  if (!twoFactorPassed) return false;

  // Onboarding is eagerly loaded. A completed account may reveal its matching
  // dashboard skeleton immediately; cached content replaces it as soon as the
  // chunk mounts, without holding the brand splash over the wait.
  return true;
}
