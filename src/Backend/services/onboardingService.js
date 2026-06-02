import supabase from "../lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "./explore/errors";
import { readStoredProfile, writeStoredProfile } from "./explore/profileStorage";
import { normalizeSocialLinks } from "./explore/socialLinks";

const DEFAULT_NAV = "explore";

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function buildProfileFromUser(user) {
  const metadata = user?.user_metadata ?? {};
  const provider = user?.app_metadata?.provider ?? "email";
  const providerName =
    provider === "google"
      ? "Google"
      : provider === "facebook"
        ? "Facebook"
        : provider === "email"
          ? "Email"
          : provider === "phone"
            ? "Phone"
            : provider;

  return {
    firstName: metadata.first_name ?? "",
    middleName: metadata.middle_name ?? "",
    lastName: metadata.last_name ?? "",
    displayName: metadata.display_name ?? metadata.full_name ?? "",
    dateOfBirth: metadata.date_of_birth ?? "",
    username: metadata.username ?? "",
    city: metadata.city ?? "",
    country: metadata.country ?? "",
    address: metadata.address ?? "",
    email: metadata.contact_email ?? user?.email ?? "",
    phone: metadata.phone_number ?? user?.phone ?? "",
    avatarUrl: metadata.avatar_url ?? metadata.picture ?? "",
    bio: metadata.bio ?? "",
    socialLinks: normalizeSocialLinks(metadata.social_links),
    provider,
    providerName,
    accountType: metadata.account_type ?? "personal",
    interests: normalizeArray(metadata.interests),
    primarySurface: metadata.primary_surface ?? DEFAULT_NAV,
    onboardingComplete: Boolean(metadata.onboarding_complete),
    onboardingStep: Number(metadata.onboarding_step ?? 1),
  };
}

function hasExplicitOnboardingState(user) {
  const metadata = user?.user_metadata ?? {};
  return Object.prototype.hasOwnProperty.call(metadata, "onboarding_complete") ||
    Object.prototype.hasOwnProperty.call(metadata, "onboarding_step");
}

function hasUsableReturningProfile(profile = {}) {
  const displayName = String(profile.displayName || profile.display_name || "").trim();
  const username = String(profile.username || "").trim();
  const email = String(profile.email || profile.contact_email || "").trim();

  return Boolean(
    (displayName && displayName.toLowerCase() !== "profile") ||
      (username && username.toLowerCase() !== "user") ||
      email,
  );
}

function mergeExploreProfile(authProfile, row) {
  if (!row) return authProfile;

  return {
    ...authProfile,
    displayName: row.display_name || authProfile.displayName,
    username: row.username || authProfile.username,
    email: row.contact_email || authProfile.email,
    address: row.address || authProfile.address,
    avatarUrl: row.avatar_url || authProfile.avatarUrl,
    bio: row.bio || authProfile.bio,
    socialLinks: normalizeSocialLinks(row.social_links || authProfile.socialLinks),
    accountType: row.account_type || authProfile.accountType,
  };
}

async function fetchStoredExploreProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("explore_profiles")
    .select("user_id, display_name, username, contact_email, address, avatar_url, bio, social_links, account_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

async function syncReturningOnboardingMetadata(profile) {
  const { error } = await supabase.auth.updateUser({
    data: {
      display_name: profile.displayName,
      full_name: profile.displayName,
      username: profile.username,
      contact_email: profile.email,
      address: profile.address,
      avatar_url: profile.avatarUrl,
      bio: profile.bio,
      social_links: normalizeSocialLinks(profile.socialLinks),
      account_type: profile.accountType || "personal",
      primary_surface: profile.primarySurface || DEFAULT_NAV,
      onboarding_complete: true,
      onboarding_step: 4,
    },
  });

  if (error) {
    console.warn("[KunThai onboarding] Unable to sync returning profile metadata.", error);
  }
}

export async function getOnboardingProfile(sessionUser = null) {
  let user = sessionUser;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    user = data?.user || user;
  } catch (error) {
    if (!user) throw error;
  }

  if (!user) {
    return null;
  }

  const authProfile = buildProfileFromUser(user);
  if (authProfile.onboardingComplete || hasExplicitOnboardingState(user)) {
    return authProfile;
  }

  let storedProfile = null;
  try {
    storedProfile = await fetchStoredExploreProfile(user.id);
  } catch (error) {
    console.warn("[KunThai onboarding] Unable to read stored Explore profile.", error);
  }
  if (hasUsableReturningProfile(storedProfile)) {
    const returningProfile = {
      ...mergeExploreProfile(authProfile, storedProfile),
      onboardingComplete: true,
      onboardingStep: 4,
    };
    writeStoredProfile(user.id, {
      userId: user.id,
      displayName: returningProfile.displayName,
      username: returningProfile.username,
      email: returningProfile.email,
      address: returningProfile.address,
      accountType: returningProfile.accountType,
      avatarUrl: returningProfile.avatarUrl,
      bio: returningProfile.bio,
      socialLinks: returningProfile.socialLinks,
    });
    syncReturningOnboardingMetadata(returningProfile);
    return returningProfile;
  }

  const cachedProfile = readStoredProfile(user.id);
  if (hasUsableReturningProfile(cachedProfile)) {
    return {
      ...authProfile,
      ...cachedProfile,
      onboardingComplete: true,
      onboardingStep: 4,
    };
  }

  return authProfile;
}

export async function updateOnboardingProfile(patch) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("No active session.");
  }

  const current = buildProfileFromUser(user);
  const nextData = {
    first_name: patch.firstName ?? current.firstName,
    middle_name: patch.middleName ?? current.middleName,
    last_name: patch.lastName ?? current.lastName,
    display_name: patch.displayName ?? current.displayName,
    full_name: patch.displayName ?? current.displayName,
    date_of_birth: patch.dateOfBirth ?? current.dateOfBirth,
    username: patch.username ?? current.username,
    city: patch.city ?? current.city,
    country: patch.country ?? current.country,
    address: patch.address ?? current.address,
    contact_email: patch.email ?? current.email,
    phone_number: patch.phone ?? current.phone,
    avatar_url: patch.avatarUrl ?? current.avatarUrl,
    bio: patch.bio ?? current.bio,
    social_links: normalizeSocialLinks(patch.socialLinks ?? current.socialLinks),
    account_type: patch.accountType ?? current.accountType,
    interests: patch.interests ?? current.interests,
    primary_surface: patch.primarySurface ?? current.primarySurface,
    onboarding_complete: patch.onboardingComplete ?? current.onboardingComplete,
    onboarding_step: patch.onboardingStep ?? current.onboardingStep,
  };

  const { data, error } = await supabase.auth.updateUser({
    data: nextData,
  });

  if (error) {
    throw error;
  }

  const profile = buildProfileFromUser(data.user);
  writeStoredProfile(user.id, {
    userId: user.id,
    displayName: profile.displayName,
    username: profile.username,
    email: profile.email,
    phone: profile.phone,
    dateOfBirth: profile.dateOfBirth,
    address: profile.address,
    accountType: profile.accountType,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    socialLinks: profile.socialLinks,
  });

  const exploreProfilePayload = {
    user_id: user.id,
    display_name: profile.displayName,
    username: profile.username,
    contact_email: profile.email,
    address: profile.address,
    avatar_url: profile.avatarUrl,
    bio: profile.bio || "",
    social_links: normalizeSocialLinks(profile.socialLinks),
    account_type: profile.accountType || "personal",
    updated_at: new Date().toISOString(),
  };

  let { error: profileError } = await supabase.from("explore_profiles").upsert(exploreProfilePayload, { onConflict: "user_id" });

  let nextExploreProfilePayload = exploreProfilePayload;

  for (let attempt = 0; profileError && attempt < 3; attempt += 1) {
    const missingOptionalColumn = ["social_links", "contact_email", "address"].find((column) => isMissingColumn(profileError, column));
    if (!missingOptionalColumn) {
      break;
    }

    const { [missingOptionalColumn]: _removed, ...fallbackPayload } = nextExploreProfilePayload;
    nextExploreProfilePayload = fallbackPayload;
    const fallback = await supabase.from("explore_profiles").upsert(nextExploreProfilePayload, { onConflict: "user_id" });
    profileError = fallback.error;
  }

  if (profileError && !isMissingTable(profileError)) {
    throw profileError;
  }

  return profile;
}

export async function markOnboardingComplete(profile) {
  return updateOnboardingProfile({
    ...profile,
    onboardingComplete: true,
    onboardingStep: 4,
  });
}
