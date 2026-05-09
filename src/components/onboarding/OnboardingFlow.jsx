import { useMemo, useState } from "react";

import { markOnboardingComplete, updateOnboardingProfile } from "../../Backend/services/onboardingService";
import WelcomeStep from "./WelcomeStep";
import ProfileStep from "./ProfileStep";
import InterestsStep from "./InterestsStep";
import ReadyStep from "./ReadyStep";

function splitDisplayName(displayName = "") {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    lastName: parts.length > 1 ? parts[parts.length - 1] : "",
  };
}

function normalizeProfile(profile) {
  const displayName = profile?.displayName ?? "";
  const nameParts = splitDisplayName(displayName);

  return {
    firstName: profile?.firstName || nameParts.firstName,
    middleName: profile?.middleName || nameParts.middleName,
    lastName: profile?.lastName || nameParts.lastName,
    displayName,
    dateOfBirth: profile?.dateOfBirth ?? "",
    username: profile?.username ?? "",
    city: profile?.city ?? "",
    country: profile?.country ?? "",
    address: profile?.address ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    avatarUrl: profile?.avatarUrl ?? "",
    socialLinks: profile?.socialLinks ?? [],
    provider: profile?.provider ?? "email",
    providerName: profile?.providerName ?? "Email",
    accountType: profile?.accountType ?? "personal",
    interests: profile?.interests ?? [],
    primarySurface: profile?.primarySurface ?? "explore",
  };
}

export default function OnboardingFlow({ profile, onComplete }) {
  const [step, setStep] = useState(Math.min(Math.max(profile?.onboardingStep ?? 1, 1), 4));
  const [values, setValues] = useState(() => normalizeProfile(profile));
  const [saving, setSaving] = useState(false);

  const safeValues = useMemo(() => normalizeProfile(values), [values]);

  const updateField = (field, value) => {
    setValues((current) =>
      typeof field === "object"
        ? {
            ...current,
            ...field,
          }
        : {
            ...current,
            [field]: value,
          },
    );
  };

  const toggleInterest = (interest) => {
    setValues((current) => {
      const exists = current.interests.includes(interest);
      return {
        ...current,
        interests: exists
          ? current.interests.filter((item) => item !== interest)
          : [...current.interests, interest],
      };
    });
  };

  const persistStep = async (nextStep) => {
    await updateOnboardingProfile({
      ...safeValues,
      onboardingStep: nextStep,
      onboardingComplete: false,
    });
  };

  const handleNext = async () => {
    const nextStep = Math.min(step + 1, 4);
    await persistStep(nextStep);
    setStep(nextStep);
  };

  const handleBack = async () => {
    const nextStep = Math.max(step - 1, 1);
    await persistStep(nextStep);
    setStep(nextStep);
  };

  const handleFinish = async () => {
    setSaving(true);

    try {
      await markOnboardingComplete(safeValues);
      onComplete?.();
    } finally {
      setSaving(false);
    }
  };

  if (step === 1) {
    return <WelcomeStep profile={safeValues} onNext={handleNext} />;
  }

  if (step === 2) {
    return <ProfileStep values={safeValues} onChange={updateField} onBack={handleBack} onNext={handleNext} />;
  }

  if (step === 3) {
    return (
      <InterestsStep
        values={safeValues}
        onToggleInterest={toggleInterest}
        onChange={updateField}
        onBack={handleBack}
        onNext={handleNext}
      />
    );
  }

  return <ReadyStep values={safeValues} saving={saving} onBack={handleBack} onFinish={handleFinish} />;
}
