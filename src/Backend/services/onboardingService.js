import supabase from "../lib/supabaseClient";

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
    email: metadata.contact_email ?? user?.email ?? "",
    phone: metadata.phone_number ?? user?.phone ?? "",
    avatarUrl: metadata.avatar_url ?? metadata.picture ?? "",
    provider,
    providerName,
    accountType: metadata.account_type ?? "personal",
    interests: normalizeArray(metadata.interests),
    primarySurface: metadata.primary_surface ?? DEFAULT_NAV,
    onboardingComplete: Boolean(metadata.onboarding_complete),
    onboardingStep: Number(metadata.onboarding_step ?? 1),
  };
}

export async function getOnboardingProfile() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    return null;
  }

  return buildProfileFromUser(user);
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
    contact_email: patch.email ?? current.email,
    phone_number: patch.phone ?? current.phone,
    avatar_url: patch.avatarUrl ?? current.avatarUrl,
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

  return buildProfileFromUser(data.user);
}

export async function markOnboardingComplete(profile) {
  return updateOnboardingProfile({
    ...profile,
    onboardingComplete: true,
    onboardingStep: 4,
  });
}
