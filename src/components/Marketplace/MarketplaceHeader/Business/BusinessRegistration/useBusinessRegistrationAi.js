import { useRef } from "react";

import { useAiScreen } from "../../../../../Backend/services/ai/aiScreenContext";
import {
  BUSINESS_KIND_FIELD_KEY,
  BUSINESS_KIND_LABELS,
  REGISTRATION_SCREEN_ID,
  filterFieldsForKind,
  inferBusinessKind,
  isFieldAllowedForKind,
  normalizeBusinessKind,
  sanitizeRegistrationValues,
} from "../../../../../Backend/services/ai/businessKindPolicy";
import { BUSINESS_CATEGORIES } from "../../../../../Backend/services/marketplace/sellerRegistrationService";
import {
  supportsMarketplaceFulfillment,
  usesMarketplaceCategories,
} from "../../../../../Backend/services/marketplace/marketplaceBusinessKinds";
import { constrainCountryPhoneInput, getActiveCountryProfile, GLOBAL_COUNTRY_PROFILES } from "../../../../../data/globalCountryProfiles";
import { getLocale, t } from "../../../../../i18n";
import { BUSINESS_TYPES, SALES_MODELS, SELLING_UNITS, VENDOR_TYPES } from "./operationsOptions";

// KAI on the UrMall business registration (and edit) screen.
//
// KAI is told which fields this business type shows and what is in them, and
// may fill the text, choice and yes/no fields. The field list is filtered by
// business kind (businessKindPolicy.js): categories only for retail shops and
// vendors, supply fields only for vendors, delivery/pickup never for real
// estate. Until the person has chosen the kind, no kind-specific field is
// offered at all, so KAI (and the guided questions) ask for the kind first.
//
// It never fills the logo, banner, documents, the map pin or bank details —
// the person adds those themselves. Values are applied through the same
// setters the form uses, so every rule the form enforces (country currency,
// phone format, business-type defaults) holds.

const STEP_TITLE_KEYS = ["stepIdentity", "stepLocation", "stepOperations", "stepVerification", "stepReview"];
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function matchCountry(text) {
  const wanted = String(text || "").trim().toLowerCase();
  const country = GLOBAL_COUNTRY_PROFILES.find((profile) => (
    profile.name.toLowerCase() === wanted || String(profile.iso2 || "").toLowerCase() === wanted
  ));
  return country ? { ok: true, value: country.name, display: country.name } : { ok: false, reason: "Not a country KunThai supports." };
}

// Day names in the person's language (5 October 2026 was a Monday).
function weekDayOptions() {
  let format = null;
  try {
    format = new Intl.DateTimeFormat(getLocale() || "en", { weekday: "short", timeZone: "UTC" });
  } catch {
    format = null;
  }
  return WEEK_DAYS.map((value, index) => ({
    value,
    label: format ? format.format(new Date(Date.UTC(2026, 9, 5 + index))) : value,
  }));
}

// The kind question also understands plain phrasing ("I sell food", "I rent
// houses", "wholesale supplier"). An unclear answer is never guessed: the
// person is asked to pick one of the kinds.
function kindFieldNormalizer(businessKinds) {
  const offered = (businessKinds || []).map((item) => item.id);
  return (text) => {
    const { kind, confident } = inferBusinessKind(text);
    if (!kind || !confident || !offered.includes(kind)) {
      return { ok: false, reason: t("kaiRegistrationFix.kind.unsure") };
    }
    const label = (businessKinds || []).find((item) => item.id === kind)?.label || BUSINESS_KIND_LABELS[kind] || kind;
    return { ok: true, value: kind, display: label };
  };
}

/**
 * Whether the person has settled the business kind. A new registration starts
 * on the first offered kind as a default, which is not yet a choice.
 */
export function isBusinessKindConfirmed(registration, { editing = false, chosenByKai = false } = {}) {
  if (editing || chosenByKai) return true;
  if (Number(registration?.step || 0) > 0) return true;
  const kind = registration?.form?.identity?.businessKind;
  const defaultKind = registration?.businessKinds?.[0]?.id || "retail";
  return Boolean(kind) && kind !== defaultKind;
}

function descriptionLabel(kind, confirmed) {
  if (confirmed && kind === "restaurant") return t("kaiRegistrationFix.field.restaurantDescription");
  if (confirmed && (kind === "property_agent" || kind === "hotel")) return t("kaiRegistrationFix.field.propertyDescription");
  return "Business description";
}

export function buildFields(registration, { confirmed = true } = {}) {
  const { form, businessKinds } = registration;
  const kind = normalizeBusinessKind(form.identity.businessKind);
  const fulfillment = confirmed && supportsMarketplaceFulfillment(kind);
  const fields = [
    {
      key: BUSINESS_KIND_FIELD_KEY,
      label: t("urmall.biz.reg.primaryType"),
      type: "select",
      required: true,
      options: (businessKinds || []).map((item) => ({ value: item.id, label: item.label })),
      normalize: kindFieldNormalizer(businessKinds),
      // Applied as soon as it is answered in the guided questions, so the
      // questions that depend on the kind come next.
      immediate: true,
      // An unconfirmed default reads as empty, so KAI asks for it.
      value: confirmed ? kind : "",
    },
    { key: "identity.businessName", label: "Business name", type: "text", required: true, maxLength: 80, value: form.identity.businessName },
  ];

  if (confirmed && usesMarketplaceCategories(kind)) {
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
    { key: "identity.description", label: descriptionLabel(kind, confirmed), type: "textarea", maxLength: 600, value: form.identity.description },
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

  if (confirmed && kind === "vendor") {
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
      { key: "operations.deliveryEnabled", label: kind === "restaurant" ? t("urmall.biz.reg.mealDelivery") : "Offers delivery", type: "boolean", value: form.operations.deliveryEnabled ? "yes" : "no" },
      { key: "operations.pickupEnabled", label: kind === "restaurant" ? t("urmall.biz.reg.mealPickup") : "Offers pickup", type: "boolean", value: form.operations.pickupEnabled ? "yes" : "no" },
    );
  }

  fields.push(
    {
      key: "operations.operatingDays",
      label: t("kaiRegistrationFix.field.openingDays"),
      type: "multiselect",
      options: weekDayOptions(),
      value: Array.isArray(form.operations.operatingDays) ? form.operations.operatingDays : [],
    },
    { key: "operations.openTime", label: "Opening time", type: "time", value: form.operations.openTime },
    { key: "operations.closeTime", label: "Closing time", type: "time", value: form.operations.closeTime },
    { key: "trustPayout.idDocument", label: "ID document", type: "file", value: form.trustPayout.idDocumentName || "" },
    { key: "trustPayout.businessDocument", label: "Business registration document", type: "file", value: form.trustPayout.businessDocumentName || "" },
    // Bank details stay with the person.
    { key: "trustPayout.bankDetails", label: "Bank / payout details", type: "text", fillable: false, value: form.trustPayout.accountName ? "provided" : "" },
  );

  // The policy filter is the single gate for kind-specific fields. Each field
  // then names its registration step, so KAI's guided filling can work through
  // the form one step at a time.
  return filterFieldsForKind(fields, kind, { confirmed }).map((field) => {
    const section = field.key.split(".")[0];
    return SECTION_STEP_KEYS[section] ? { ...field, section, sectionLabel: t(`urmall.biz.reg.${SECTION_STEP_KEYS[section]}`) } : field;
  });
}

const SECTION_STEP_KEYS = { identity: "stepIdentity", location: "stepLocation", operations: "stepOperations", trustPayout: "stepVerification" };

// Apply KAI's values the way the form's own inputs do. Values for fields that
// do not apply to the (new) kind are dropped here as well, whatever produced them.
export function applyValues(registration, values, { confirmed = true } = {}) {
  const { form, updateSection } = registration;
  const { kept, kind: resolvedKind } = sanitizeRegistrationValues(
    Object.entries(values || {}).map(([key, value]) => ({ key, value })),
    { kind: form.identity.businessKind, confirmed },
  );
  const patches = { identity: {}, location: {}, operations: {} };
  kept.forEach(({ key, value }) => {
    const [section, field] = key.split(".");
    if (patches[section]) patches[section][field] = value;
  });
  if (patches.identity.businessKind) patches.identity.businessKind = resolvedKind || patches.identity.businessKind;

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
  // Restaurants and real estate never carry categories.
  const finalKind = normalizeBusinessKind(nextKind || form.identity.businessKind);
  if (!isFieldAllowedForKind("identity.categories", finalKind)) {
    if ((form.identity.categories || []).length || patches.identity.categories) patches.identity.categories = [];
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
  // Set once KAI has filled the kind: the person chose it in the chat.
  const kindChosenRef = useRef(false);

  useAiScreen(() => {
    const confirmed = isBusinessKindConfirmed(registration, { editing, chosenByKai: kindChosenRef.current });
    const kind = normalizeBusinessKind(registration.form.identity.businessKind);
    return {
      id: REGISTRATION_SCREEN_ID,
      title: editing ? "UrMall business settings" : "UrMall business registration",
      describe: () => {
        const stepKey = STEP_TITLE_KEYS[registration.step] || STEP_TITLE_KEYS[0];
        const errors = Object.entries(registration.errors || {}).filter(([, message]) => message).map(([field, message]) => `${field}: ${message}`);
        return [
          editing
            ? "The person is editing their UrMall business details (all sections on one screen)."
            : `The person is registering a UrMall business. Step ${Number(registration.step || 0) + 1} of 5: ${t(`urmall.biz.reg.${stepKey}`)}.`,
          confirmed
            ? `Business type: ${BUSINESS_KIND_LABELS[kind] || kind}.`
            : "The business type is not chosen yet (the form only shows a default). Ask what kind of business it is first.",
          `Readiness score: ${registration.readinessScore ?? 0}%.`,
          errors.length ? `Problems shown on the form: ${errors.join("; ")}.` : "",
          "The exact map location is set with the Locate me or Drop a pin buttons; images and documents are uploaded by the person.",
        ].filter(Boolean).join(" ");
      },
      form: {
        fields: () => buildFields(registration, { confirmed }),
        // Sent to the server, which applies the same field policy to whatever
        // the model proposes.
        meta: () => ({ businessKind: kind, kindConfirmed: confirmed }),
        sanitize: (proposed) => {
          const { kept, dropped } = sanitizeRegistrationValues(proposed, { kind, confirmed });
          return { kept, dropped: dropped.map((item) => ({ ...item, reason: t("kaiRegistrationFix.kind.fieldNotForKind") })) };
        },
        apply: (values) => {
          if (values && Object.prototype.hasOwnProperty.call(values, BUSINESS_KIND_FIELD_KEY)) kindChosenRef.current = true;
          applyValues(registration, values, { confirmed });
        },
      },
    };
  }, { enabled: active });
}
