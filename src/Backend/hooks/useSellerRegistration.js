import { useEffect, useMemo, useState } from "react";

import {
  BUSINESS_CATEGORIES,
  INITIAL_REGISTRATION,
  calculateReadinessScore,
  readRegisteredBusiness,
  submitSellerRegistration,
  updateRegisteredBusinessProfile,
} from "../services/marketplace/sellerRegistrationService";
import { getOnboardingProfile } from "../services/onboardingService";
import {
  getActiveCountryProfile,
  storeCountryContext,
} from "../../data/westAfricanCountryProfiles";

const DRAFT_KEY = "marketplace-seller-registration-draft";

function cloneInitialRegistration() {
  const countryProfile = getActiveCountryProfile();
  return {
    identity: { ...INITIAL_REGISTRATION.identity, categories: [...INITIAL_REGISTRATION.identity.categories] },
    location: { ...INITIAL_REGISTRATION.location, country: countryProfile.name },
    operations: { ...INITIAL_REGISTRATION.operations },
    trustPayout: { ...INITIAL_REGISTRATION.trustPayout },
  };
}

function sanitizeDraftForm(form) {
  return {
    identity: {
      ...form.identity,
      categories: Array.isArray(form.identity.categories) ? form.identity.categories : [],
      logoFile: null,
      logoName: "",
      bannerFile: null,
      bannerName: "",
    },
    location: { ...form.location },
    operations: { ...form.operations },
    trustPayout: {
      ...form.trustPayout,
      idDocumentFile: null,
      idDocumentName: "",
      businessDocumentFile: null,
      businessDocumentName: "",
    },
  };
}

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft?.form) return null;
    const initial = cloneInitialRegistration();

    return {
      step: Math.min(Math.max(Number(draft.step || 0), 0), 4),
      savedAt: draft.savedAt || "",
      form: {
        identity: { ...initial.identity, ...draft.form.identity, categories: Array.isArray(draft.form.identity?.categories) ? draft.form.identity.categories : [] },
        location: { ...initial.location, ...draft.form.location },
        operations: { ...initial.operations, ...draft.form.operations },
        trustPayout: { ...initial.trustPayout, ...draft.form.trustPayout },
      },
    };
  } catch {
    return null;
  }
}

function formFromRegisteredBusiness(business) {
  const initial = cloneInitialRegistration();
  if (!business) return initial;

  return {
    identity: {
      ...initial.identity,
      ...(business.identity || {}),
      categories: Array.isArray(business.identity?.categories) ? business.identity.categories : [],
      logoFile: null,
      bannerFile: null,
    },
    location: {
      ...initial.location,
      ...(business.location || {}),
    },
    operations: {
      ...initial.operations,
      ...(business.operations || {}),
    },
    trustPayout: {
      ...initial.trustPayout,
      ...(business.trustPayout || {}),
      idDocumentFile: null,
      businessDocumentFile: null,
    },
  };
}

function formatCoordinates(latitude, longitude) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function getAccountDisplayName(profile) {
  return String(
    profile?.displayName ||
      profile?.display_name ||
      profile?.fullName ||
      profile?.full_name ||
      [profile?.firstName || profile?.first_name, profile?.lastName || profile?.last_name].filter(Boolean).join(" ") ||
      "",
  ).trim();
}

function getAccountPhone(profile) {
  return String(profile?.phone || profile?.phoneNumber || profile?.phone_number || "").trim();
}

async function reverseGeocode(latitude, longitude) {
  const fallback = {
    address: formatCoordinates(latitude, longitude),
    city: "",
    country: "",
  };

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
      { headers: { Accept: "application/json" } },
    );

    if (!response.ok) return fallback;

    const data = await response.json();
    const address = data?.address || {};
    const city = address.city || address.town || address.village || address.county || "";

    return {
      address: data?.display_name || fallback.address,
      city,
      country: address.country || "",
    };
  } catch {
    return fallback;
  }
}

export function useSellerRegistration({ mode = "create", onComplete } = {}) {
  const editing = mode === "edit";
  const draft = editing ? null : readDraft();
  const [step, setStep] = useState(draft?.step ?? 0);
  const [form, setForm] = useState(draft?.form ?? cloneInitialRegistration());
  const [errors, setErrors] = useState({});
  const [locationStatus, setLocationStatus] = useState("");
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [locationCandidate, setLocationCandidate] = useState(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(editing);
  const [draftStatus, setDraftStatus] = useState(draft?.savedAt ? `Draft saved ${new Date(draft.savedAt).toLocaleString()}` : "");

  const readinessScore = useMemo(() => calculateReadinessScore(form), [form]);

  useEffect(() => {
    if (editing) return undefined;

    let alive = true;

    getOnboardingProfile()
      .then((profile) => {
        if (!alive) return;
        const accountName = getAccountDisplayName(profile);
        const accountPhone = getAccountPhone(profile);
        const countryProfile = getActiveCountryProfile(profile?.country || profile?.countryCode);

        setForm((current) => {
          return {
            ...current,
            identity: {
              ...current.identity,
              businessName: current.identity.businessName.trim() ? current.identity.businessName : accountName,
            },
            location: {
              ...current.location,
              country: current.location.country || profile?.country || countryProfile.name,
              city: current.location.city || profile?.city || "",
              phone: current.location.phone || accountPhone,
              email: current.location.email || profile?.email || "",
            },
          };
        });
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [editing]);

  useEffect(() => {
    if (!editing) return undefined;

    let alive = true;
    setLoadingExisting(true);

    readRegisteredBusiness()
      .then((business) => {
        if (!alive) return;
        setForm(formFromRegisteredBusiness(business));
        setStep(0);
        setDraftStatus("");
      })
      .catch((error) => {
        if (alive) {
          setErrors((current) => ({
            ...current,
            submit: error.message || "Unable to load your business profile for editing.",
          }));
        }
      })
      .finally(() => {
        if (alive) setLoadingExisting(false);
      });

    return () => {
      alive = false;
    };
  }, [editing]);

  function updateSection(section, patch) {
    if (section === "location" && patch?.country) storeCountryContext(patch.country);
    setDraftStatus("");
    setForm((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...patch,
      },
    }));
  }

  function toggleCategory(category) {
    const selected = form.identity.categories;
    const exists = selected.includes(category);

    if (!exists && selected.length >= 5) {
      setErrors((current) => ({
        ...current,
        categories: "Choose up to 5 categories only.",
      }));
      return;
    }

    setErrors((current) => ({ ...current, categories: "" }));
    updateSection("identity", {
      categories: exists
        ? selected.filter((item) => item !== category)
        : [...selected, category],
    });
  }

  function updateOtherCategory(value) {
    updateSection("identity", { otherCategory: value });
  }

  function addOtherCategory() {
    const customCategory = form.identity.otherCategory.trim();

    if (!customCategory) {
      setErrors((current) => ({
        ...current,
        otherCategory: "Enter the category we missed.",
      }));
      return;
    }

    if (form.identity.categories.includes(customCategory)) {
      setErrors((current) => ({
        ...current,
        otherCategory: "This category is already selected.",
      }));
      return;
    }

    if (form.identity.categories.length >= 5) {
      setErrors((current) => ({
        ...current,
        otherCategory: "Remove one category before adding another.",
      }));
      return;
    }

    updateSection("identity", {
      categories: [...form.identity.categories, customCategory],
      otherCategory: "",
    });
    setErrors((current) => ({ ...current, otherCategory: "", categories: "" }));
  }

  function validateStep(nextStep = step) {
    const nextErrors = {};

    if (nextStep === 0) {
      if (!form.identity.businessName.trim()) nextErrors.businessName = "Business name is required.";
      if (form.identity.categories.length === 0) nextErrors.categories = "Choose at least one category.";
      if (!form.identity.description.trim()) nextErrors.description = "Short description is required.";
    }

    if (nextStep === 1) {
      if (!form.location.country.trim()) nextErrors.country = "Country is required.";
      if (!form.location.city.trim()) nextErrors.city = "City is required.";
      if (!form.location.phone.trim()) nextErrors.phone = "Phone number is required.";
      if (!form.location.email.trim()) nextErrors.email = "Email is required.";
    }

    if (nextStep === 2 && !form.operations.deliveryEnabled && !form.operations.pickupEnabled) {
      nextErrors.fulfillment = "Enable delivery, pickup, or both.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function next() {
    if (validateStep(step)) setStep((current) => Math.min(current + 1, 4));
  }

  function back() {
    setStep((current) => Math.max(current - 1, 0));
  }

  function goToStep(nextStep) {
    setDraftStatus("");
    setStep(nextStep);
  }

  function saveDraft() {
    const payload = {
      step,
      form: sanitizeDraftForm(form),
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    setDraftStatus(`Draft saved ${new Date(payload.savedAt).toLocaleString()}`);
    setErrors((current) => ({ ...current, submit: "" }));
    return payload;
  }

  function locateBusiness() {
    setLocationPromptOpen(true);
    setLocationCandidate(null);
    setLocationStatus("");
  }

  function closeLocationPrompt() {
    setLocationPromptOpen(false);
    setLocationCandidate(null);
    setLocating(false);
  }

  function detectBusinessLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Location is not supported on this device.");
      return;
    }

    setLocating(true);
    setLocationStatus("Locating your business...");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const resolved = await reverseGeocode(coordinates.latitude, coordinates.longitude);

        setLocationCandidate({
          ...resolved,
          coordinates: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });
        setLocationStatus(`Your current location is ${resolved.address}.`);
        setLocating(false);
      },
      () => {
        setLocationStatus("Location permission denied. You can enter address manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function acceptDetectedLocation() {
    if (!locationCandidate) return;

    updateSection("location", {
      address: locationCandidate.address,
      city: locationCandidate.city || form.location.city,
      country: locationCandidate.country || form.location.country,
      coordinates: locationCandidate.coordinates,
    });
    setLocationStatus(`Location added: ${locationCandidate.address}`);
    setLocationPromptOpen(false);
    setLocationCandidate(null);
  }

  function acceptAreaViewLocation(location) {
    const latitude = Number(location?.lat ?? location?.latitude);
    const longitude = Number(location?.lng ?? location?.longitude);
    const address = String(location?.address || location?.fullAddress || location?.label || location?.name || "").trim();
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

    if (!address && !hasCoordinates) {
      setLocationStatus("Choose a valid Area View location before adding it.");
      return;
    }

    updateSection("location", {
      address: address || formatCoordinates(latitude, longitude),
      city: location?.city || form.location.city,
      country: location?.country || form.location.country,
      coordinates: hasCoordinates
        ? {
            latitude,
            longitude,
          }
        : form.location.coordinates,
    });
    setLocationStatus(`Location added: ${address || formatCoordinates(latitude, longitude)}`);
    setLocationPromptOpen(false);
    setLocationCandidate(null);
  }

  function enterLocationManually() {
    setLocationStatus("Enter the business address manually.");
    setLocationPromptOpen(false);
    setLocationCandidate(null);
  }

  function skipTrustPayout() {
    updateSection("trustPayout", {
      idDocumentName: "",
      businessDocumentName: "",
      connectKunThaiMoney: false,
      bankName: "",
      accountNumber: "",
      accountName: "",
      skipped: true,
    });
    setStep(4);
  }

  async function submit() {
    if (!validateStep(0) || !validateStep(1) || !validateStep(2)) {
      return;
    }

    setErrors((current) => ({ ...current, submit: "" }));
    setSubmitting(true);
    try {
      const business = editing
        ? await updateRegisteredBusinessProfile(form)
        : await submitSellerRegistration(form);
      if (!editing) localStorage.removeItem(DRAFT_KEY);
      onComplete?.(business);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        submit: error.message || "Unable to submit business. Please try again.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return {
    categories: BUSINESS_CATEGORIES,
    step,
    form,
    errors,
    readinessScore,
    locationStatus,
    locationPromptOpen,
    locationCandidate,
    locating,
    loadingExisting,
    mode,
    submitting,
    updateSection,
    toggleCategory,
    updateOtherCategory,
    addOtherCategory,
    locateBusiness,
    closeLocationPrompt,
    detectBusinessLocation,
    acceptDetectedLocation,
    acceptAreaViewLocation,
    enterLocationManually,
    skipTrustPayout,
    saveDraft,
    next,
    back,
    goToStep,
    submit,
    draftStatus,
  };
}
