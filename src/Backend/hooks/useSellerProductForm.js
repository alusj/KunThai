import { useEffect, useMemo, useState } from "react";

import {
  INITIAL_PRODUCT_FORM,
  fetchProductFormOptions,
  submitSellerProduct,
  updateSellerProductListing,
} from "../services/marketplace/sellerProductService";

function buildProductForm(product, options) {
  if (!product) {
    return {
      ...INITIAL_PRODUCT_FORM,
      basics: {
        ...INITIAL_PRODUCT_FORM.basics,
        category: options.categories[0] || "",
      },
      delivery: {
        ...INITIAL_PRODUCT_FORM.delivery,
        deliveryAvailable: options.deliveryAvailable,
        pickupAvailable: options.pickupAvailable,
        location: options.defaultLocation,
      },
    };
  }

  return {
    basics: {
      name: product.name || "",
      category: product.category || options.categories[0] || "",
      description: product.description || "",
      condition: product.condition || "new",
      brand: product.brand || "",
      model: product.model || "",
    },
    media: {
      coverImageFile: null,
      coverImageName: product.mainImageUrl ? "Current cover image" : "",
      coverImageUrl: product.mainImageUrl || "",
      extraImageFiles: [],
      extraImageUrls: product.imageUrls || [],
      videoFile: null,
      videoName: product.videoUrl ? "Current product video" : "",
      videoUrl: product.videoUrl || "",
    },
    pricing: {
      price: product.price === undefined ? "" : String(product.price),
      discountPrice: product.discountPrice ? String(product.discountPrice) : "",
      stock: product.stock === undefined ? "" : String(product.stock),
      sku: product.sku || "",
      lowStockAlert: product.lowStockAlert === undefined ? "3" : String(product.lowStockAlert),
      allowNegotiation: Boolean(product.allowNegotiation),
      publishStatus: product.status || "active",
    },
    delivery: {
      deliveryAvailable: product.deliveryAvailable ?? options.deliveryAvailable,
      pickupAvailable: product.pickupAvailable ?? options.pickupAvailable,
      deliveryTime: product.deliveryTime || "",
      location: product.location || options.defaultLocation,
    },
  };
}

export function useSellerProductForm({ onComplete, mode = "create", product = null } = {}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL_PRODUCT_FORM);
  const [options, setOptions] = useState({ categories: [], defaultLocation: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [warnings, setWarnings] = useState({});

  useEffect(() => {
    let active = true;
    fetchProductFormOptions().then((nextOptions) => {
      if (!active) return;
      setOptions(nextOptions);
      setForm(buildProductForm(product, nextOptions));
    });

    return () => {
      active = false;
    };
  }, [product]);

  const preview = useMemo(
    () => ({
      name: form.basics.name || "Product name",
      category: form.basics.category || "Category",
      description: form.basics.description || "Product description preview.",
      price: form.pricing.price || "0",
      coverName: form.media.coverImageName || (form.media.coverImageUrl ? "Current cover image" : ""),
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

    if (nextStep === 1 && !form.media.coverImageFile && !form.media.coverImageUrl) {
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
    setWarnings({});
    setSaveStatus("Starting save...");
    setSubmitting(true);
    try {
      const savedProduct =
        mode === "edit"
          ? await updateSellerProductListing(product, form, setSaveStatus)
          : await submitSellerProduct(form, setSaveStatus);
      if (savedProduct.videoWarning) {
        setWarnings({ video: savedProduct.videoWarning });
      }
      setSaveStatus(mode === "edit" ? "Product listing updated." : "Product saved.");
      onComplete?.(savedProduct);
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
    warnings,
    preview,
    submitting,
    saveStatus,
    updateSection,
    next,
    back,
    submit,
  };
}
