import { useMemo, useState } from "react";

import {
  BUSINESS_CATEGORIES,
  INITIAL_REGISTRATION,
  calculateReadinessScore,
  submitSellerRegistration,
} from "../services/marketplace/sellerRegistrationService";

export function useSellerRegistration({ onComplete } = {}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL_REGISTRATION);
  const [errors, setErrors] = useState({});
  const [locationStatus, setLocationStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const readinessScore = useMemo(() => calculateReadinessScore(form), [form]);

  function updateSection(section, patch) {
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
    setStep(nextStep);
  }

  function locateBusiness() {
    if (!navigator.geolocation) {
      setLocationStatus("Location is not supported on this device.");
      return;
    }

    setLocationStatus("Locating your business...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateSection("location", {
          coordinates: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });
        setLocationStatus("Location detected.");
      },
      () => {
        setLocationStatus("Location permission denied. You can enter address manually.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
      const business = await submitSellerRegistration(form);
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
    submitting,
    updateSection,
    toggleCategory,
    updateOtherCategory,
    addOtherCategory,
    locateBusiness,
    skipTrustPayout,
    next,
    back,
    goToStep,
    submit,
  };
}
