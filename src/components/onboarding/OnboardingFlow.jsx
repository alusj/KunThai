import { useEffect, useMemo, useState } from "react";

import { markOnboardingComplete, updateOnboardingProfile } from "../../Backend/services/onboardingService";
import { fetchUserTopicFollows, saveUserTopicFollows } from "../../Backend/services/explore/topicService";
import { getActiveCountryProfile } from "../../data/westAfricanCountryProfiles";
import WelcomeStep from "./WelcomeStep";
import ProfileStep from "./ProfileStep";
import InterestsStep from "./InterestsStep";
import ReadyStep from "./ReadyStep";
import { StepSlideTransition } from "../shared/motion";

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
  const countryProfile = getActiveCountryProfile(profile?.country || profile?.countryCode);

  return {
    firstName: profile?.firstName || nameParts.firstName,
    middleName: profile?.middleName || nameParts.middleName,
    lastName: profile?.lastName || nameParts.lastName,
    displayName,
    dateOfBirth: profile?.dateOfBirth ?? "",
    username: profile?.username ?? "",
    city: profile?.city ?? "",
    country: profile?.country || countryProfile.name,
    countryCode: profile?.countryCode || countryProfile.iso2,
    currency: profile?.currency || countryProfile.currency.code,
    address: profile?.address ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    avatarUrl: profile?.avatarUrl ?? "",
    socialLinks: profile?.socialLinks ?? [],
    provider: profile?.provider ?? "email",
    providerName: profile?.providerName ?? "Email",
    accountType: profile?.accountType ?? "personal",
    interests: profile?.interests ?? [],
    contentTopics: profile?.contentTopics ?? [],
    primarySurface: profile?.primarySurface ?? "explore",
  };
}

export default function OnboardingFlow({ profile, onComplete }) {
  const [step, setStep] = useState(Math.min(Math.max(profile?.onboardingStep ?? 1, 1), 4));
  const [values, setValues] = useState(() => normalizeProfile(profile));
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState("forward");
  const [finishing, setFinishing] = useState(false);
  const [transitionOrigin, setTransitionOrigin] = useState({ x: "50%", y: "70%" });
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const safeValues = useMemo(() => normalizeProfile(values), [values]);

  useEffect(() => {
    let active = true;
    fetchUserTopicFollows()
      .then((contentTopics) => {
        if (active) setValues((current) => ({ ...current, contentTopics }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const updateField = (field, value) => {
    setError("");
    setErrorCode("");
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

  const toggleContentTopic = (topic) => {
    setValues((current) => {
      const exists = current.contentTopics.includes(topic);
      return {
        ...current,
        contentTopics: exists
          ? current.contentTopics.filter((item) => item !== topic)
          : [...current.contentTopics, topic],
      };
    });
  };

  const persistStep = async (nextStep) => {
    await updateOnboardingProfile({
      ...safeValues,
      onboardingStep: nextStep,
      onboardingComplete: false,
    });
    if (step === 3) {
      await saveUserTopicFollows(safeValues.contentTopics, { source: "onboarding" });
    }
  };

  const handleNext = async () => {
    const nextStep = Math.min(step + 1, 4);
    setDirection("forward");

    if (step === 1) {
      setError("");
      setErrorCode("");
      setStep(nextStep);
      return;
    }

    if (saving) return;
    setSaving(true);

    try {
      setError("");
      setErrorCode("");
      await persistStep(nextStep);
      setStep(nextStep);
    } catch (nextError) {
      setError(nextError.message || "We could not securely save these details.");
      setErrorCode(nextError.code || "");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    const nextStep = Math.max(step - 1, 1);
    setDirection("backward");
    setError("");
    setStep(nextStep);
  };

  const handleFinish = async (event) => {
    const buttonRect = event?.currentTarget?.getBoundingClientRect?.();
    const origin = buttonRect
      ? { x: `${buttonRect.left + buttonRect.width / 2}px`, y: `${buttonRect.top + buttonRect.height / 2}px` }
      : { x: "50%", y: "70%" };

    setSaving(true);

    try {
      await saveUserTopicFollows(safeValues.contentTopics, { source: "onboarding" });
      const finishedProfile = await markOnboardingComplete(safeValues);
      setTransitionOrigin(origin);
      setFinishing(true);
      await new Promise((resolve) => window.setTimeout(resolve, 480));
      onComplete?.(origin, finishedProfile || safeValues);
    } catch (error) {
      setSaving(false);
      setError(error.message || "We could not complete onboarding.");
      setErrorCode(error.code || "");
    }
  };

  let content;

  if (step === 1) {
    content = <WelcomeStep profile={safeValues} onNext={handleNext} />;
  } else if (step === 2) {
    content = <ProfileStep values={safeValues} saving={saving} error={error} errorCode={errorCode} onChange={updateField} onBack={handleBack} onNext={handleNext} />;
  } else if (step === 3) {
    content = (
      <InterestsStep
        values={safeValues}
        saving={saving}
        onToggleInterest={toggleInterest}
        onToggleContentTopic={toggleContentTopic}
        onChange={updateField}
        onBack={handleBack}
        onNext={handleNext}
      />
    );
  } else {
    content = <ReadyStep values={safeValues} saving={saving} error={error} onBack={handleBack} onFinish={handleFinish} />;
  }

  return (
    <div
      className={`${finishing ? "kt-onboarding-collapse-out" : ""} min-h-screen w-full overflow-x-hidden`}
      style={{ "--kt-transition-x": transitionOrigin.x, "--kt-transition-y": transitionOrigin.y }}
    >
      <StepSlideTransition direction={direction} stepKey={step}>
        {content}
      </StepSlideTransition>
    </div>
  );
}
