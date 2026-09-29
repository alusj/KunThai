import { useAiScreen } from "../../../../../Backend/services/ai/aiScreenContext";
import { BUSINESS_CATEGORIES } from "../../../../../Backend/services/marketplace/sellerRegistrationService";
import {
  supportsMarketplaceFulfillment,
  usesMarketplaceCategories,
} from "../../../../../Backend/services/marketplace/marketplaceBusinessKinds";
import { constrainCountryPhoneInput, getActiveCountryProfile, GLOBAL_COUNTRY_PROFILES } from "../../../../../data/globalCountryProfiles";
import { t } from "../../../../../i18n";
import { BUSINESS_TYPES, SALES_MODELS, SELLING_UNITS, VENDOR_TYPES } from "./operationsOptions";

// KAI on the UrMall business registration (and edit) screen.
//
// KAI is told which fields this business type shows and what is in them, and
// may fill the text, choice and yes/no fields. It never fills the logo, banner,
// documents, the map pin or bank details — the person adds those themselves.
// Values are applied through the same setters the form uses, so every rule the
// form enforces (country currency, phone format, business-type defaults) holds.

const STEP_TITLE_KEYS = ["stepIdentity", "stepLocation", "stepOperations", "stepVerification", "stepReview"];

function matchCountry(text) {
  const wanted = String(text || "").trim().toLowerCase();
  const country = GLOBAL_COUNTRY_PROFILES.find((profile) => (
    profile.name.toLowerCase() === wanted || String(profile.iso2 || "").toLowerCase() === wanted
  ));
  return country ? { ok: true, value: country.name, display: country.name } : { ok: false, reason: "Not a country KunThai supports." };
}

function buildFields(registration) {
  const { form, businessKinds } = registration;
  const kind = form.identity.businessKind;
  const fulfillment = supportsMarketplaceFulfillment(kind);
  const fields = [
    {
      key: "identity.businessKind",
      label: t("urmall.biz.reg.primaryType"),
      type: "select",
      required: true,
      options: (businessKinds || []).map((item) => ({ value: item.id, label: item.label })),
      value: kind,
    },
    { key: "identity.businessName", label: "Business name", type: "text", required: true, maxLength: 80, value: form.identity.businessName },
  ];

  if (usesMarketplaceCategories(kind)) {
    fields.push({
      key: "identity.categories",
      label: "Categories (up to 5)",
      type: "multiselect",
      maxItems: 5,
      options: BUSINESS_CATEGORIES,
      value: form.identity.categories,
    });
  }

  fields.push(
    { key: "identity.description", label: "Business description", type: "textarea", maxLength: 600, value: form.identity.description },
    { key: "identity.logo", label: "Logo", type: "image", value: form.identity.logoName || "" },
    { key: "identity.banner", label: "Banner", type: "image", value: form.identity.bannerName || "" },
    {
      key: "location.country",
      label: "Country (full country name)",
      type: "text",
      required: true,
      normalize: matchCountry,
      value: form.location.country,
    },
    { key: "location.city", label: "City / town", type: "text", required: true, maxLength: 80, value: form.location.city },
    { key: "location.mainLabel", label: "Main address label", type: "text", maxLength: 60, value: form.location.mainLabel },
    { key: "location.address", label: "Street address", type: "text", required: true, maxLength: 200, value: form.location.address },
    {
      key: "location.pin",
      label: "Exact map location (use Locate me or Drop a pin)",
      type: "file",
      value: form.location.coordinates ? "set" : "",
    },
    { key: "location.phone", label: "Business phone", type: "phone", required: true, value: form.location.phone },
    { key: "location.whatsappEnabled", label: "Customers can reach you on WhatsApp", type: "boolean", value: form.location.whatsappEnabled ? "yes" : "no" },
    { key: "location.whatsapp", label: "WhatsApp number", type: "phone", value: form.location.whatsapp },
    { key: "location.email", label: "Business email", type: "email", value: form.location.email },
    { key: "location.website", label: "Website", type: "url", value: form.location.website },
    { key: "location.discoverableNearby", label: "Show the business to nearby shoppers", type: "boolean", value: form.location.discoverableNearby ? "yes" : "no" },
    {
      key: "operations.businessType",
      label: "Where the business sells",
      type: "select",
      options: BUSINESS_TYPES.map((item) => ({ value: item.id, label: t(`urmall.biz.reg.${item.labelKey}`) })),
      value: form.operations.businessType,
    },
  );

  if (kind === "vendor") {
    fields.push(
      { key: "operations.vendorType", label: "Vendor type", type: "select", options: VENDOR_TYPES.map(([value, label]) => ({ value, label })), value: form.operations.vendorType },
      { key: "operations.salesModel", label: "Sales model", type: "select", options: SALES_MODELS.map(([value, label]) => ({ value, label })), value: form.operations.salesModel },
      { key: "operations.defaultSellingUnit", label: "Default selling unit", type: "select", options: SELLING_UNITS, value: form.operations.defaultSellingUnit },
      { key: "operations.defaultMinOrderQuantity", label: "Minimum order quantity", type: "number", min: 1, value: form.operations.defaultMinOrderQuantity },
      { key: "operations.leadTimeDays", label: "Lead time (days)", type: "number", min: 0, value: form.operations.leadTimeDays },
      { key: "operations.serviceAreas", label: "Service areas", type: "text", maxLength: 200, value: form.operations.serviceAreas },
      { key: "operations.quotationEnabled", label: "Accept quotation requests", type: "boolean", value: form.operations.quotationEnabled ? "yes" : "no" },
    );
  }

  if (fulfillment) {
    fields.push(
      { key: "operations.deliveryEnabled", label: "Offers delivery", type: "boolean", value: form.operations.deliveryEnabled ? "yes" : "no" },
      { key: "operations.pickupEnabled", label: "Offers pickup", type: "boolean", value: form.operations.pickupEnabled ? "yes" : "no" },
    );
  }

  fields.push(
    { key: "operations.openTime", label: "Opening time", type: "time", value: form.operations.openTime },
    { key: "operations.closeTime", label: "Closing time", type: "time", value: form.operations.closeTime },
    { key: "trustPayout.idDocument", label: "ID document", type: "file", value: form.trustPayout.idDocumentName || "" },
    { key: "trustPayout.businessDocument", label: "Business registration document", type: "file", value: form.trustPayout.businessDocumentName || "" },
    // Bank details stay with the person.
    { key: "trustPayout.bankDetails", label: "Bank / payout details", type: "text", fillable: false, value: form.trustPayout.accountName ? "provided" : "" },
  );

  // Each field names its registration step, so KAI's guided filling can work
  // through the form one step at a time.
  return fields.map((field) => {
    const section = field.key.split(".")[0];
    return SECTION_STEP_KEYS[section] ? { ...field, section, sectionLabel: t(`urmall.biz.reg.${SECTION_STEP_KEYS[section]}`) } : field;
  });
}

const SECTION_STEP_KEYS = { identity: "stepIdentity", location: "stepLocation", operations: "stepOperations", trustPayout: "stepVerification" };

// Apply KAI's values the way the form's own inputs do.
function applyValues(registration, values) {
  const { form, updateSection } = registration;
  const patches = { identity: {}, location: {}, operations: {} };
  Object.entries(values).forEach(([key, value]) => {
    const [section, field] = key.split(".");
    if (patches[section]) patches[section][field] = value;
  });

  // Changing the business type resets what depends on it, exactly as the
  // Business type picker does.
  const nextKind = patches.identity.businessKind;
  if (nextKind && nextKind !== form.identity.businessKind) {
    if (!usesMarketplaceCategories(nextKind)) patches.identity.categories = [];
    patches.identity.otherCategory = "";
    if (!supportsMarketplaceFulfillment(nextKind)) {
      patches.operations.deliveryEnabled = false;
      patches.operations.pickupEnabled = false;
    }
    if (nextKind === "vendor" && (patches.location.mainLabel ?? form.location.mainLabel) === "Main store") {
      patches.location.mainLabel = "Main warehouse";
    } else if (nextKind !== "vendor" && (patches.location.mainLabel ?? form.location.mainLabel) === "Main warehouse") {
      patches.location.mainLabel = "Main store";
    }
  }
  if (Array.isArray(patches.identity.categories)) patches.identity.categories = patches.identity.categories.slice(0, 5);

  // Phones are formatted for the business's country, like typing them.
  const country = getActiveCountryProfile(patches.location.country || form.location.country);
  ["phone", "whatsapp"].forEach((field) => {
    if (patches.location[field]) patches.location[field] = constrainCountryPhoneInput(patches.location[field], country, { international: true });
  });

  // Country first: it resets currency and phone context for the rest.
  if (patches.location.country) updateSection("location", { country: patches.location.country });
  const { country: _country, ...locationRest } = patches.location;
  if (Object.keys(patches.identity).length) updateSection("identity", patches.identity);
  if (Object.keys(locationRest).length) updateSection("location", locationRest);
  if (Object.keys(patches.operations).length) updateSection("operations", patches.operations);
}

export function useBusinessRegistrationAi(registration, { editing = false, active = true } = {}) {
  useAiScreen(() => ({
    id: "urmall-business-registration",
    title: editing ? "UrMall business settings" : "UrMall business registration",
    describe: () => {
      const stepKey = STEP_TITLE_KEYS[registration.step] || STEP_TITLE_KEYS[0];
      const errors = Object.entries(registration.errors || {}).filter(([, message]) => message).map(([field, message]) => `${field}: ${message}`);
      return [
        editing
          ? "The person is editing their UrMall business details (all sections on one screen)."
          : `The person is registering a UrMall business. Step ${Number(registration.step || 0) + 1} of 5: ${t(`urmall.biz.reg.${stepKey}`)}.`,
        `Readiness score: ${registration.readinessScore ?? 0}%.`,
        errors.length ? `Problems shown on the form: ${errors.join("; ")}.` : "",
        "The exact map location is set with the Locate me or Drop a pin buttons; images and documents are uploaded by the person.",
      ].filter(Boolean).join(" ");
    },
    form: {
      fields: () => buildFields(registration),
      apply: (values) => applyValues(registration, values),
    },
  }), { enabled: active });
}
