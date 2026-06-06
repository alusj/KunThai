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

function mergeMarketplaceProfile(authProfile, row) {
  if (!row) return authProfile;

  return {
    ...authProfile,
    displayName: authProfile.displayName || row.business_name || "UrMall seller",
    email: row.email || authProfile.email,
    phone: row.phone || authProfile.phone,
    city: row.city || authProfile.city,
    country: row.country || authProfile.country,
    address: row.address || authProfile.address,
    avatarUrl: row.logo_url || authProfile.avatarUrl,
    bio: row.description || authProfile.bio,
    accountType: "business",
    primarySurface: "marketplace",
  };
}

function mergeTransportOperatorProfile(authProfile, row) {
  if (!row) return authProfile;

  return {
    ...authProfile,
    displayName: row.full_name || authProfile.displayName || "Transport operator",
    phone: row.phone || authProfile.phone,
    city: row.city || authProfile.city,
    accountType: "operator",
    primarySurface: "transport",
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

async function fetchStoredMarketplaceBusiness(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("marketplace_businesses")
    .select("id, business_name, description, country, city, address, phone, email, logo_url, updated_at, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }

  return data || null;
}

async function fetchStoredTransportOperator(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("transport_operators")
    .select("id, full_name, phone, city, profile_completed_at, updated_at, created_at")
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

async function readReturningProfiles(userId) {
  const [exploreProfile, marketplaceBusiness, transportOperator] = await Promise.all([
    fetchStoredExploreProfile(userId).catch((error) => {
      console.warn("[KunThai onboarding] Unable to read stored Explore profile.", error);
      return null;
    }),
    fetchStoredMarketplaceBusiness(userId).catch((error) => {
      console.warn("[KunThai onboarding] Unable to read stored UrMall profile.", error);
      return null;
    }),
    fetchStoredTransportOperator(userId).catch((error) => {
      console.warn("[KunThai onboarding] Unable to read stored transport profile.", error);
      return null;
    }),
  ]);

  return { exploreProfile, marketplaceBusiness, transportOperator };
}

function chooseReturningProfile(authProfile, records) {
  const exploreProfile = hasUsableReturningProfile(records.exploreProfile)
    ? {
        ...mergeExploreProfile(authProfile, records.exploreProfile),
        primarySurface: authProfile.primarySurface || DEFAULT_NAV,
      }
    : null;
  const marketplaceProfile = hasUsableReturningProfile(records.marketplaceBusiness)
    ? mergeMarketplaceProfile(authProfile, records.marketplaceBusiness)
    : null;
  const transportProfile = hasUsableReturningProfile(records.transportOperator)
    ? mergeTransportOperatorProfile(authProfile, records.transportOperator)
    : null;

  if (authProfile.primarySurface === "transport" && transportProfile) return transportProfile;
  if (authProfile.primarySurface === "marketplace" && marketplaceProfile) return marketplaceProfile;
  if (authProfile.primarySurface === "explore" && exploreProfile) return exploreProfile;

  return exploreProfile || transportProfile || marketplaceProfile || null;
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
  if (authProfile.onboardingComplete) {
    return authProfile;
  }

  const returningRecords = await readReturningProfiles(user.id);
  const matchedReturningProfile = chooseReturningProfile(authProfile, returningRecords);

  if (matchedReturningProfile) {
    const returningProfile = {
      ...matchedReturningProfile,
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

  if (hasExplicitOnboardingState(user)) {
    return authProfile;
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
