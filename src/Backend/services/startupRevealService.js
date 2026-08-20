export function isStartupDestinationReady({
  activePageReady = false,
  authLoading = true,
  guestSession = false,
  hasUser = false,
  onboardingChecked = false,
  onboardingComplete = false,
  onboardingLoading = false,
  twoFactorChallengeRequired = null,
  twoFactorPassed = false,
} = {}) {
  if (authLoading) return false;

  // Once auth has definitively resolved without a session, Login is the real
  // destination. Before that point it must stay hidden behind the launch mark.
  if (!hasUser) return true;

  // Guests have no onboarding or 2FA gate, but their dashboard chunk should be
  // available before the launch layer leaves.
  if (guestSession) return activePageReady;

  if (!onboardingChecked || onboardingLoading) return false;
  if (twoFactorChallengeRequired === null) return false;

  // A real challenge is itself a stable destination and must remain usable.
  if (twoFactorChallengeRequired) return true;
  if (!twoFactorPassed) return false;

  // Onboarding is eagerly loaded. Completed accounts additionally wait for the
  // chosen dashboard chunk so the intro never collapses onto a skeleton.
  return onboardingComplete ? activePageReady : true;
}
