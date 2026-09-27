// Does a stored Explore / UrMall / UrRide record show this is a returning
// account (so onboarding is skipped)? Records that do not exist arrive as
// `null` — a default parameter does not cover null, and dereferencing it used
// to throw, which left brand-new accounts (e.g. a first Facebook sign-in)
// stuck on the startup loader while the onboarding check retried forever.
export function hasUsableReturningProfile(profile) {
  if (!profile || typeof profile !== "object") return false;

  const displayName = String(profile.displayName || profile.display_name || "").trim();
  const businessName = String(profile.businessName || profile.business_name || profile.name || "").trim();
  const fullName = String(profile.fullName || profile.full_name || "").trim();
  const username = String(profile.username || "").trim();
  const email = String(profile.email || profile.contact_email || "").trim();

  return Boolean(
    (displayName && displayName.toLowerCase() !== "profile") ||
      businessName ||
      fullName ||
      (username && username.toLowerCase() !== "user") ||
      email,
  );
}
