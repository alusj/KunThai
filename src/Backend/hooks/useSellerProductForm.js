import { useEffect, useMemo, useState } from "react";

import {
  INITIAL_PRODUCT_FORM,
  fetchProductFormOptions,
  submitSellerProduct,
} from "../services/marketplace/sellerProductService";

export function useSellerProductForm({ onComplete } = {}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL_PRODUCT_FORM);
  const [options, setOptions] = useState({ categories: [], defaultLocation: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    let active = true;
    fetchProductFormOptions().then((nextOptions) => {
      if (!active) return;
      setOptions(nextOptions);
      setForm((current) => ({
        ...current,
        basics: {
          ...current.basics,
          category: nextOptions.categories[0] || "",
        },
        delivery: {
          ...current.delivery,
          deliveryAvailable: nextOptions.deliveryAvailable,
          pickupAvailable: nextOptions.pickupAvailable,
          location: nextOptions.defaultLocation,
        },
      }));
    });

    return () => {
      active = false;
    };
  }, []);

  const preview = useMemo(
    () => ({
      name: form.basics.name || "Product name",
      category: form.basics.category || "Category",
      description: form.basics.description || "Product description preview.",
      price: form.pricing.price || "0",
      coverName: form.media.coverImageName,
      status: form.pricing.publishStatus,
    }),
    [form],
  );

  function updateSection(section, patch) {
    setForm((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...patch,
      },
    }));
  }

  function validateStep(nextStep = step) {
    const nextErrors = {};

    if (nextStep === 0) {
      if (!form.basics.name.trim()) nextErrors.name = "Product name is required.";
      if (!form.basics.category) nextErrors.category = "Choose a product category.";
      if (!form.basics.description.trim()) nextErrors.description = "Description is required.";
    }

    if (nextStep === 1 && !form.media.coverImageFile) {
      nextErrors.coverImage = "Cover image is required.";
    }

    if (nextStep === 2) {
      if (!form.pricing.price || Number(form.pricing.price) <= 0) nextErrors.price = "Enter a valid price.";
      if (form.pricing.discountPrice && Number(form.pricing.discountPrice) >= Number(form.pricing.price)) {
        nextErrors.discountPrice = "Discount price must be lower than price.";
      }
      if (form.pricing.stock === "" || Number(form.pricing.stock) < 0) nextErrors.stock = "Enter stock quantity.";
    }

    if (nextStep === 3 && !form.delivery.deliveryAvailable && !form.delivery.pickupAvailable) {
      nextErrors.fulfillment = "Enable delivery, pickup, or both.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function next() {
    if (validateStep(step)) setStep((current) => Math.min(current + 1, 3));
  }

  function back() {
    setStep((current) => Math.max(current - 1, 0));
  }

  async function submit() {
    if (!validateStep(0) || !validateStep(1) || !validateStep(2) || !validateStep(3)) return;
    setErrors((current) => ({ ...current, submit: "" }));
    setSaveStatus("Starting save...");
    setSubmitting(true);
    try {
      const product = await submitSellerProduct(form, setSaveStatus);
      setSaveStatus("Product saved.");
      onComplete?.(product);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        submit: error.message || "Unable to save product. Please try again.",
      }));
      setSaveStatus("");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    step,
    form,
    options,
    errors,
    preview,
    submitting,
    saveStatus,
    updateSection,
    next,
    back,
    submit,
  };
}
