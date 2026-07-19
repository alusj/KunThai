import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiBriefcase,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiMapPin,
  FiPlus,
  FiSearch,
  FiShield,
  FiTrash2,
  FiTruck,
  FiUserPlus,
  FiUsers,
  FiX,
} from "react-icons/fi";

import { getKunThaiPublicUserId } from "../../../Backend/services/identityCodeService";
import { getOnboardingProfile } from "../../../Backend/services/onboardingService";
import {
  createTransportCompanyFleetCode,
  getTransportCompanyDraft,
  lookupTransportOperatorByKunThaiId,
  saveTransportCompanyAccount,
  saveTransportCompanyDraft,
} from "../../services/transportCompanyService";
import AppBackTab from "../../shared/AppBackTab";
import { AddressAreaStatusIcon, useAddressAreaValidation } from "../../shared/AddressAreaValidation";
import { ScreenSlideTransition, StepSlideTransition } from "../../shared/motion";
import { useDirectionalStep } from "../../shared/motionHooks";
import { scrollToFirstBlockingFieldSoon } from "../../shared/formValidationNavigation";
import NearbyAreaScreen from "../NearbyAreaScreen";
import {
  constrainCountryPhoneInput,
  getActiveCountryProfile,
  getCountryPhoneHint,
  storeCountryContext,
  validateCountryPhone,
  GLOBAL_COUNTRY_PROFILES,
} from "../../../data/globalCountryProfiles";
import {
  formatDocumentRequirementLabel,
  getUrRideCompanyDocumentRequirements,
  getUrRideDocumentRequirements,
  getUrRideFleetImageRequirements,
} from "../../../data/globalDocumentRequirements";
import {
  getCompanyFleetTypeOptions,
  getCompanyServiceCategoryOptions,
} from "../../../data/globalTransportCapabilities";

const steps = [
  { label: "Company", icon: FiBriefcase },
  { label: "Location", icon: FiMapPin },
  { label: "Fleets", icon: FiTruck },
  { label: "Review", icon: FiCheckCircle },
];

const companyTypes = ["Transport company", "Delivery company", "Taxi union", "Bike riders group", "Community fleet", "Other organization"];
const companyFleetDocumentKeys = new Set([
  "vehicle_registration",
  "insurance_document",
  "roadworthiness_certificate",
  "passenger_interior_photo",
  "delivery_storage_photo",
  "item_handling_agreement",
]);
const fleetSafetyQuestions = {
  Taxi: [
    { key: "seatCount", label: "How many passenger seats are usable?", type: "number" },
    { key: "doorsWorking", label: "Are all passenger doors working?", type: "select" },
    { key: "seatbelts", label: "Are seatbelts available and usable?", type: "select" },
    { key: "acOrVentilation", label: "Is AC or clear ventilation available?", type: "select" },
    { key: "lightsMirrors", label: "Are lights, mirrors, indicators, and horn working?", type: "select" },
    { key: "spareTire", label: "Is a spare tire or emergency repair kit available?", type: "select" },
    { key: "interiorClean", label: "Is the passenger interior clean and safe?", type: "select" },
  ],
  Van: [
    { key: "seatCount", label: "How many passenger seats are usable?", type: "number" },
    { key: "doorsWorking", label: "Are all passenger and cargo doors working?", type: "select" },
    { key: "seatbelts", label: "Are passenger seatbelts available and usable?", type: "select" },
    { key: "acOrVentilation", label: "Is AC or clear ventilation available?", type: "select" },
    { key: "lightsMirrors", label: "Are lights, mirrors, indicators, and horn working?", type: "select" },
    { key: "spareTire", label: "Is a spare tire or emergency repair kit available?", type: "select" },
    { key: "interiorClean", label: "Is the passenger or cargo area clean and safe?", type: "select" },
  ],
  Motorbike: [
    { key: "helmet", label: "Is a passenger helmet available?", type: "select" },
    { key: "brakes", label: "Is the brake system in good condition?", type: "select" },
    { key: "lightsMirrors", label: "Are lights, mirrors, indicators, and horn working?", type: "select" },
    { key: "passengerFootrest", label: "Is the passenger footrest safe and usable?", type: "select" },
    { key: "deliveryBox", label: "Is there a delivery box or secure bag when used for delivery?", type: "select" },
  ],
  Tricycle: [
    { key: "seatCount", label: "How many passenger seats are usable?", type: "number" },
    { key: "entrySafe", label: "Is the passenger entry safe and easy to access?", type: "select" },
    { key: "lightsMirrors", label: "Are lights, mirrors, indicators, and horn working?", type: "select" },
    { key: "coveredSpace", label: "Is the passenger or cargo space clean and covered?", type: "select" },
    { key: "sideBar", label: "Are side bars, rails, or passenger supports firm?", type: "select" },
  ],
};

function createSafetyAnswers(fleetType) {
  return (fleetSafetyQuestions[fleetType] || []).reduce((answers, question) => ({
    ...answers,
    [question.key]: question.type === "select" ? "Yes" : "",
  }), {});
}

function fleetImageDocumentKey(image) {
  return `Fleet image - ${image}`;
}

function documentStorageKey(requirement) {
  return requirement.legacyLabel || requirement.label || requirement.key;
}

function documentGridItem(requirement, keyPrefix = "") {
  const storageKey = keyPrefix ? `${keyPrefix}${documentStorageKey(requirement)}` : documentStorageKey(requirement);
  return {
    key: storageKey,
    label: formatDocumentRequirementLabel(requirement),
  };
}

function fleetRequirementCategory(serviceCategory = "") {
  if (serviceCategory === "Delivery only") return "Delivery";
  if (serviceCategory === "Ride and delivery") return "Both";
  return "Transport";
}

function getFleetImageRequirements(form) {
  return getUrRideFleetImageRequirements({
    country: form.country,
    countryCode: form.countryCode,
  });
}

function getFleetDocumentRequirements(form, fleet) {
  return getUrRideDocumentRequirements({
    country: form.country,
    countryCode: form.countryCode,
    category: fleetRequirementCategory(fleet.serviceCategory),
  }).filter((requirement) => companyFleetDocumentKeys.has(requirement.key));
}

function createCompanyForm(profile = {}) {
  const name = String(profile.displayName || profile.fullName || "").trim();
  const countryProfile = getActiveCountryProfile(profile.country || profile.countryCode);
  return {
    companyName: "",
    companyType: "Transport company",
    registrationNumber: "",
    taxId: "",
    ownerName: name,
    ownerPublicId: getKunThaiPublicUserId(profile),
    phone: profile.phone || "",
    email: profile.email || "",
    country: profile.country || countryProfile.name,
    countryCode: countryProfile.iso2,
    currency: countryProfile.currency.code,
    city: profile.city || "",
    address: profile.address || "",
    coordinates: null,
    operatingAreas: [],
    supportPolicy: "",
    documents: {},
  };
}

function preferredCompanyServiceCategory(context = {}, fleetType = "") {
  const options = getCompanyServiceCategoryOptions(context);
  if (["Motorbike", "Van"].includes(fleetType) && options.includes("Delivery only")) {
    return "Delivery only";
  }
  return options.includes("Ride and delivery") ? "Ride and delivery" : options[0] || "Ride only";
}

function createFleetDraft(index = 0, context = {}) {
  const serviceCategory = preferredCompanyServiceCategory(context);
  const fleetTypes = getCompanyFleetTypeOptions(context, serviceCategory);
  const fleetType = fleetTypes[index % Math.max(1, fleetTypes.length)] || fleetTypes[0] || "Taxi";

  return {
    localId: `fleet-${Date.now()}-${index}`,
    fleetCode: createTransportCompanyFleetCode(),
    fleetType,
    serviceCategory,
    fleetName: "",
    plateNumber: "",
    make: "",
    model: "",
    year: "",
    color: "",
    operatingArea: "",
    homeBase: "",
    baseFare: "",
    pricePerKm: "",
    pricePerHour: "",
    priceHint: "",
    documents: {},
    safetyAnswers: createSafetyAnswers(fleetType),
    operators: [],
    status: "pending_review",
  };
}

function sanitizeCompanyFleetForCountry(fleet = {}, context = {}, index = 0) {
  const serviceOptions = getCompanyServiceCategoryOptions(context);
  const serviceCategory = serviceOptions.includes(fleet.serviceCategory)
    ? fleet.serviceCategory
    : preferredCompanyServiceCategory(context, fleet.fleetType);
  const fleetTypes = getCompanyFleetTypeOptions(context, serviceCategory);
  const fleetType = fleetTypes.includes(fleet.fleetType)
    ? fleet.fleetType
    : fleetTypes[index % Math.max(1, fleetTypes.length)] || fleetTypes[0] || "Taxi";

  return {
    ...fleet,
    serviceCategory,
    fleetType,
    safetyAnswers: fleetType === fleet.fleetType ? fleet.safetyAnswers : createSafetyAnswers(fleetType),
  };
}

function sanitizeCompanyFleetsForCountry(fleets = [], context = {}) {
  const source = fleets.length ? fleets : [createFleetDraft(0, context)];
  return source.map((fleet, index) => sanitizeCompanyFleetForCountry(fleet, context, index));
}

function splitAreas(value = "") {
  return String(value)
    .split(",")
    .map((area) => area.trim())
    .filter(Boolean);
}

function compactPublicId(value = "") {
  return String(value).replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export default function CompanyRegistrationScreen({ existingCompany = null, mode = "full", onBack, onComplete, onSaveExit, onViewOneKmPreview }) {
  const addOperatorMode = mode === "addOperator";
  const [step, setStep] = useState(() => (addOperatorMode ? 2 : 0));
  const [maxStepReached, setMaxStepReached] = useState(() => (addOperatorMode ? 2 : 0));
  const [form, setForm] = useState(() => createCompanyForm());
  const [fleets, setFleets] = useState(() => [createFleetDraft(0)]);
  const [areaText, setAreaText] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("info");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [transitionOrigin, setTransitionOrigin] = useState({ x: "50%", y: "70%" });
  const [locationPickerMode, setLocationPickerMode] = useState(null);
  const [locationCautionOpen, setLocationCautionOpen] = useState(false);
  const [saveCheckpointOpen, setSaveCheckpointOpen] = useState(false);
  const stepDirection = useDirectionalStep(step);
  const latitude = form.coordinates?.latitude ?? form.coordinates?.lat;
  const longitude = form.coordinates?.longitude ?? form.coordinates?.lng;
  const hasLocation = latitude != null && longitude != null;
  const formTopRef = useRef(null);
  const statusClassName = statusTone === "error"
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : statusTone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-blue-100 bg-blue-50 text-blue-800";

  function showStatus(message, tone = "info") {
    setStatus(message);
    setStatusTone(tone);
  }

  function clearStatus() {
    setStatus("");
  }

  function clearFieldError(field) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      formTopRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  useEffect(() => {
    let alive = true;

    async function loadContext() {
      const profile = await getOnboardingProfile().catch(() => null);
      const draft = await getTransportCompanyDraft().catch(() => null);
      if (!alive) return;

      const source = existingCompany || (addOperatorMode ? null : draft);
      if (source?.companyName || source?.company?.companyName) {
        const company = source.company || source;
        const nextForm = {
          ...createCompanyForm(profile || {}),
          ...company,
          ownerPublicId: company.ownerPublicId || getKunThaiPublicUserId({ ...(profile || {}), userId: source.userId }),
          documents: company.documents || {},
        };
        setForm(nextForm);
        setFleets(addOperatorMode
          ? [createFleetDraft(0, nextForm)]
          : sanitizeCompanyFleetsForCountry(
              (source.fleets || [createFleetDraft(0, nextForm)]).length ? source.fleets : [createFleetDraft(0, nextForm)],
              nextForm,
            ));
        setAreaText((company.operatingAreas || []).join(", "));
        setStep(addOperatorMode ? 2 : source.step || 0);
        setMaxStepReached(addOperatorMode ? 2 : source.maxStepReached || source.step || 0);
        return;
      }

      const nextForm = createCompanyForm(profile || {});
      setForm(nextForm);
      setFleets((items) => sanitizeCompanyFleetsForCountry(items, nextForm));
    }

    loadContext();
    return () => {
      alive = false;
    };
  }, [addOperatorMode, existingCompany]);

  const companyDocumentRequirements = useMemo(() => getUrRideCompanyDocumentRequirements({
    country: form.country,
    countryCode: form.countryCode,
  }), [form.country, form.countryCode]);

  useEffect(() => {
    setFleets((items) => sanitizeCompanyFleetsForCountry(items, form));
  }, [form.country, form.countryCode]);

  const completion = useMemo(() => {
    const companyReady = Boolean(form.companyName && form.ownerName && form.phone);
    const locationReady = Boolean(form.country && form.city && form.address);
    const fleetReady = fleets.some((fleet) =>
      fleet.fleetType &&
      fleet.plateNumber &&
      getFleetDocumentRequirements(form, fleet).some((requirement) => fleet.documents?.[documentStorageKey(requirement)])
    );
    const documentReady = companyDocumentRequirements.some((requirement) => form.documents?.[documentStorageKey(requirement)]);
    return [
      companyReady,
      locationReady,
      fleetReady,
      documentReady,
    ].filter(Boolean).length;
  }, [companyDocumentRequirements, fleets, form]);

  function updateForm(field, value) {
    if (field === "country") {
      const selectedCountry = getActiveCountryProfile(value);
      storeCountryContext(selectedCountry.iso2);
      setForm((current) => ({
        ...current,
        country: selectedCountry.name,
        countryCode: selectedCountry.iso2,
        currency: selectedCountry.currency.code,
      }));
      setFleets((items) => sanitizeCompanyFleetsForCountry(items, {
        country: selectedCountry.name,
        countryCode: selectedCountry.iso2,
      }));
    } else {
      setForm((current) => ({ ...current, [field]: value }));
    }
    clearFieldError(field);
    clearStatus();
  }

  function markCompanyDocument(document, file) {
    setForm((current) => ({
      ...current,
      documents: {
        ...current.documents,
        [document]: file?.name || "Selected",
      },
    }));
    clearStatus();
  }

  function updateFleet(fleetId, patch) {
    setFleets((items) => items.map((fleet) => (fleet.localId === fleetId ? { ...fleet, ...patch } : fleet)));
    setFieldErrors((current) => {
      let next = current;
      Object.keys(patch || {}).forEach((field) => {
        if (next[`${fleetId}-${field}`]) {
          next = { ...next };
          delete next[`${fleetId}-${field}`];
        }
      });
      if (patch?.safetyAnswers) {
        Object.keys(next).forEach((key) => {
          if (key.startsWith(`${fleetId}-safety-`)) {
            if (next === current) next = { ...next };
            delete next[key];
          }
        });
      }
      return next;
    });
    clearStatus();
  }

  function markFleetDocument(fleetId, document, file) {
    setFleets((items) =>
      items.map((fleet) =>
        fleet.localId === fleetId
          ? {
              ...fleet,
              documents: {
                ...fleet.documents,
                [document]: document.startsWith("Fleet image -") && file
                  ? { file, fileName: file.name }
                  : file?.name || "Selected",
              },
            }
          : fleet,
      ),
    );
    clearStatus();
  }

  function addFleet() {
    setFleets((items) => [...items, createFleetDraft(items.length, form)]);
    clearStatus();
  }

  function removeFleet(fleetId) {
    setFleets((items) => (items.length <= 1 ? items : items.filter((fleet) => fleet.localId !== fleetId)));
    clearStatus();
  }

  function addOperatorInvite(fleetId, operator) {
    if (compactPublicId(operator.publicId) && compactPublicId(operator.publicId) === compactPublicId(form.ownerPublicId)) {
      showStatus("Use the selected fleet operator's KunThai ID. The company owner does not receive operator invitation requests.", "error");
      return;
    }

    const request = {
      requestId: `invite-${Date.now()}`,
      operatorId: operator.id,
      userId: operator.userId,
      publicId: operator.publicId,
      lookupValue: operator.lookupValue || operator.publicId,
      publicIdAliases: operator.publicIdAliases || [],
      name: operator.name,
      city: operator.city,
      verificationStatus: operator.verificationStatus,
      status: "pending",
      documents: {},
      createdAt: new Date().toISOString(),
    };

    setFleets((items) =>
      items.map((fleet) =>
        fleet.localId === fleetId
          ? {
              ...fleet,
              operators: [request, ...(fleet.operators || []).filter((item) => item.publicId !== request.publicId)],
            }
          : fleet,
      ),
    );
    clearFieldError(`${fleetId}-operators`);
  }

  function getStepErrors(targetStep = step) {
    const nextErrors = {};

    if (targetStep === 0) {
      if (!form.companyName.trim()) nextErrors.companyName = "Company or organization name required.";
      if (!form.ownerName.trim()) nextErrors.ownerName = "Owner or director name required.";
      const phoneValidation = validateCountryPhone(form.phone, form.country);
      if (!form.phone.trim()) nextErrors.phone = "Support phone required.";
      else if (!phoneValidation.valid) nextErrors.phone = phoneValidation.message;
    }

    if (targetStep === 1) {
      if (!form.city.trim()) nextErrors.city = "City or district required.";
      if (!form.address.trim()) nextErrors.address = "Company base address required.";
    }

    if (targetStep === 2) {
      if (!fleets.length) nextErrors.fleetList = "Add at least one fleet.";
      fleets.forEach((fleet, index) => {
        const labelPrefix = fleets.length > 1 ? `Fleet ${index + 1}: ` : "";
        [
          ["fleetName", "Fleet name required."],
          ["plateNumber", "Plate number required."],
          ["make", "Make / brand required."],
          ["model", "Model required."],
          ["year", "Year required."],
          ["color", "Color required."],
          ["operatingArea", "Operating area required."],
          ["homeBase", "Home base required."],
          ["baseFare", "Starting price required."],
          ["pricePerKm", "Price per 1 km required."],
          ["pricePerHour", "Price per 1 hour required."],
        ].forEach(([field, message]) => {
          if (!String(fleet[field] || "").trim()) {
            nextErrors[`${fleet.localId}-${field}`] = `${labelPrefix}${message}`;
          }
        });
        (fleetSafetyQuestions[fleet.fleetType] || []).forEach((question) => {
          if (!String(fleet.safetyAnswers?.[question.key] || "").trim()) {
            nextErrors[`${fleet.localId}-safety-${question.key}`] = `${labelPrefix}${question.label} required.`;
          }
        });
        if (addOperatorMode && !(fleet.operators || []).length) {
          nextErrors[`${fleet.localId}-operators`] = "Operator KunThai ID required.";
        }
      });
      // Fleet photos and vehicle documents are intentionally NOT required to
      // submit: Fleet HQ follows "register first, upload later". The company
      // stays unverified until KunThai reviews the documents.
    }

    return nextErrors;
  }

  function summarizeErrors(nextErrors) {
    const messages = Object.values(nextErrors);
    if (!messages.length) return "";
    const preview = messages.slice(0, 3).join(" ");
    const extra = messages.length > 3 ? ` ${messages.length - 3} more field${messages.length - 3 === 1 ? "" : "s"} need attention.` : "";
    return `${preview}${extra}`;
  }

  function nextStep() {
    const nextErrors = getStepErrors();
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      showStatus(summarizeErrors(nextErrors), "error");
      scrollToFirstBlockingFieldSoon();
      return;
    }

    setFieldErrors({});
    clearStatus();
    setStep((current) => {
      const next = Math.min(current + 1, steps.length - 1);
      setMaxStepReached((reached) => Math.max(reached, next));
      return next;
    });
  }

  function prevStep() {
    setStep((current) => Math.max(current - 1, 0));
  }

  function goToStep(index) {
    if (index <= maxStepReached) setStep(index);
  }

  function buildPayload(accountStatus = "draft") {
    const normalizedNewFleets = fleets.map((fleet) => ({
      ...fleet,
      safetyAnswers: {
        ...createSafetyAnswers(fleet.fleetType),
        ...(fleet.safetyAnswers || {}),
      },
    }));
    const payloadFleets = addOperatorMode
      ? [...(existingCompany?.fleets || []), ...normalizedNewFleets]
      : normalizedNewFleets;
    return {
      ...form,
      actionMode: addOperatorMode ? "add_operator" : "registration",
      operatingAreas: splitAreas(areaText),
      fleets: payloadFleets,
      step,
      maxStepReached,
      accountStatus,
      activities: [
        {
          id: `activity-${Date.now()}`,
          title: accountStatus === "submitted" ? "Company registration submitted" : "Company draft saved",
          body: addOperatorMode
            ? `A new fleet operator request was prepared for ${form.companyName || "the company"}.`
            : `${form.companyName || "Company"} has ${payloadFleets.length} fleet${payloadFleets.length === 1 ? "" : "s"} in Fleet HQ.`,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }

  async function saveDraft() {
    try {
      setSaving(true);
      await saveTransportCompanyDraft(buildPayload("draft"));
      showStatus("Company draft saved. You can keep editing or leave the form.", "success");
      return true;
    } catch (error) {
      showStatus(error.message || "Unable to save company draft.", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleViewOneKmPreview() {
    if (!onViewOneKmPreview) {
      showStatus("The one kilometre preview is not available right now.", "error");
      return;
    }

    const saved = await saveDraft();
    if (saved) onViewOneKmPreview();
  }

  async function handleSaveDraft() {
    const saved = await saveDraft();
    if (saved) setSaveCheckpointOpen(true);
  }

  function continueAfterSave() {
    setSaveCheckpointOpen(false);
    showStatus("Company draft saved. You can keep completing the registration.", "success");
  }

  function saveAndExit() {
    setSaveCheckpointOpen(false);
    if (onSaveExit) {
      onSaveExit();
      return;
    }
    onBack?.();
  }

  async function submitCompany(event) {
    const buttonRect = event?.currentTarget?.getBoundingClientRect?.();
    const origin = buttonRect
      ? { x: `${buttonRect.left + buttonRect.width / 2}px`, y: `${buttonRect.top + buttonRect.height / 2}px` }
      : { x: "50%", y: "70%" };
    for (const stepIndex of addOperatorMode ? [2] : [0, 1, 2]) {
      const nextErrors = getStepErrors(stepIndex);
      if (Object.keys(nextErrors).length) {
        setFieldErrors(nextErrors);
        if (!addOperatorMode) setStep(stepIndex);
        showStatus(summarizeErrors(nextErrors), "error");
        scrollToFirstBlockingFieldSoon();
        return;
      }
    }

    try {
      setFieldErrors({});
      setSubmitting(true);
      const account = await saveTransportCompanyAccount(buildPayload("submitted"));
      setTransitionOrigin(origin);
      setFinishing(true);
      await new Promise((resolve) => window.setTimeout(resolve, 480));
      onComplete?.(account, origin);
    } catch (error) {
      showStatus(error.message || "Unable to submit company registration.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function acceptLocation(location) {
    const selectedCountry = getActiveCountryProfile(location.country || form.country);
    setForm((current) => ({
      ...current,
      address: location.address || current.address,
      city: location.city || current.city,
      country: selectedCountry.name,
      countryCode: selectedCountry.iso2,
      currency: selectedCountry.currency.code,
      coordinates: {
        latitude: location.lat,
        longitude: location.lng,
      },
    }));
    setFleets((items) => sanitizeCompanyFleetsForCountry(items, {
      country: selectedCountry.name,
      countryCode: selectedCountry.iso2,
    }));
    setLocationPickerMode(null);
    setLocationCautionOpen(false);
    showStatus(`Company base set to ${location.address || "selected map point"}.`, "success");
  }

  function handleRegistrationBack() {
    if (!addOperatorMode && step > 0) {
      prevStep();
      return;
    }

    onBack?.();
  }

  if (locationPickerMode) {
    return (
      <div className="kt-explore-stack-enter min-h-dvh">
        <NearbyAreaScreen
          mode="businessLocationPicker"
          pickerStart={locationPickerMode}
          backLabel="Back to company form"
          pickerLabels={{
            historyKey: "transport-company-location-picker",
            backLabel: "Back to company form",
            eyebrow: "Fleet HQ location",
            headerCurrentTitle: "Locate company base",
            headerDropTitle: "Drop company pin",
            cardEyebrow: "Company base",
            currentHeading: "Confirm company base",
            dropHeading: "Place the pin on the company base",
            dropInstruction: "Move the map until the pin sits exactly on the office, station, dispatch yard, or main pickup point.",
            currentPreparing: "Preparing your current location for the company base.",
            currentStatus: "Confirming company base location...",
            currentName: "Company base",
            droppedName: "Pinned company base",
          }}
          onBack={() => setLocationPickerMode(null)}
          onLocationPicked={acceptLocation}
        />
      </div>
    );
  }

  return (
    <ScreenSlideTransition
      screenKey="transport-company-registration-form"
      className={`${finishing ? "kt-onboarding-collapse-out" : ""} min-h-dvh bg-slate-50 [transform:translateZ(0)]`}
      style={{ "--kt-transition-x": transitionOrigin.x, "--kt-transition-y": transitionOrigin.y }}
    >
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5 lg:px-8">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={handleRegistrationBack}
            label={!addOperatorMode && step > 0 ? "Back to previous registration step" : "Back to previous screen"}
            historyKey="transport-company-registration"
            className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">Fleet HQ</p>
            <h1 className="truncate text-lg font-black text-slate-950">{addOperatorMode ? "Add company operator" : "Company / Organization Registration"}</h1>
          </div>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            {addOperatorMode ? "Fleet stage" : `${completion}/4 ready`}
          </span>
        </div>
      </header>

      <main ref={formTopRef} className={`grid w-full gap-5 px-3 py-4 sm:px-5 lg:px-8 ${addOperatorMode ? "mx-auto max-w-6xl" : "lg:grid-cols-[280px_minmax(0,1fr)]"}`}>
        {!addOperatorMode ? <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="grid grid-cols-2 gap-2 rounded-3xl border border-slate-100 bg-white p-2 shadow-sm sm:grid-cols-4 lg:grid-cols-1">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const locked = index > maxStepReached;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => goToStep(index)}
                  disabled={locked}
                  className={`min-h-12 rounded-2xl border px-3 py-3 text-xs font-black transition lg:text-left ${
                    step === index
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : locked
                        ? "border-slate-100 bg-slate-50 text-slate-300"
                        : "border-slate-100 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center justify-center gap-2 lg:justify-start">
                    <Icon size={16} />
                    <span className="truncate">{item.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside> : null}

        <section className="min-w-0 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          {status ? (
            <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${statusClassName}`}>
              {status}
            </div>
          ) : null}

          <StepSlideTransition stepKey={step} direction={stepDirection}>
            {step === 0 ? (
              <CompanyIdentityStep
                documentRequirements={companyDocumentRequirements}
                errors={fieldErrors}
                form={form}
                onChange={updateForm}
                onDocument={markCompanyDocument}
              />
            ) : null}
            {step === 1 ? (
              <LocationOperationsStep
                areaText={areaText}
                errors={fieldErrors}
                form={form}
                hasLocation={hasLocation}
                onAreaText={setAreaText}
                onChange={updateForm}
                onDropPin={() => setLocationPickerMode("dropPin")}
                onLocateMe={() => setLocationCautionOpen(true)}
              />
            ) : null}
            {step === 2 || addOperatorMode ? (
              <FleetBuilderStep
                acceptedOperators={(existingCompany?.fleets || []).flatMap((fleet) => fleet.operators || []).filter((operator) => operator.status === "accepted")}
                allowMultiple={!addOperatorMode}
                fleets={fleets}
                form={form}
                errors={fieldErrors}
                onAddFleet={addFleet}
                onInvite={addOperatorInvite}
                onRemoveFleet={removeFleet}
                onUpdateFleet={updateFleet}
                onUploadFleetDocument={markFleetDocument}
                onViewOneKmPreview={handleViewOneKmPreview}
              />
            ) : null}
            {step === 3 ? (
              <CompanyReviewStep form={{ ...form, operatingAreas: splitAreas(areaText) }} fleets={fleets} />
            ) : null}
          </StepSlideTransition>

          <div className="mt-6 border-t border-slate-100 pt-4">
            {status && statusTone === "error" ? (
              <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${statusClassName}`}>
                {status}
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={addOperatorMode ? onBack : prevStep}
                disabled={!addOperatorMode && step === 0}
                className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-40"
              >
                <span className="flex items-center justify-center gap-2"><FiChevronLeft /> Back</span>
              </button>
              <div className="grid gap-2 sm:flex sm:justify-end">
                {!addOperatorMode ? <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="h-11 rounded-2xl border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button> : null}
                {addOperatorMode ? (
                  <button
                    type="button"
                    onClick={submitCompany}
                    disabled={submitting}
                    className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {submitting ? "Sending request..." : "Send operator request"}
                  </button>
                ) : step < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700"
                  >
                    <span className="flex items-center justify-center gap-2">Continue <FiChevronRight /></span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submitCompany}
                    disabled={submitting}
                    className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {submitting ? "Submitting..." : "Submit Company"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {locationCautionOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-4 py-5 backdrop-blur-sm sm:items-center">
          <section className="kt-modal-enter relative w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setLocationCautionOpen(false)}
              className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700"
              aria-label="Cancel location"
            >
              <FiX />
            </button>
            <div className="pl-12">
              <p className="text-xs font-black uppercase tracking-wide text-blue-700">Confirm company base</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Be at the exact company location</h2>
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
              Please stand at the office, station, dispatch yard, or main pickup point you want KunThai to verify for this company.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setLocationCautionOpen(false);
                  setLocationPickerMode("current");
                }}
                className="h-11 rounded-2xl bg-blue-600 text-sm font-black text-white"
              >
                Yes, locate me
              </button>
              <button
                type="button"
                onClick={() => {
                  setLocationCautionOpen(false);
                  setLocationPickerMode("dropPin");
                }}
                className="h-11 rounded-2xl border border-slate-200 text-sm font-black text-slate-700"
              >
                Drop a pin
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {saveCheckpointOpen ? (
        <div
          className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-950/25 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md sm:items-center"
          onClick={() => setSaveCheckpointOpen(false)}
        >
          <section className="kt-modal-enter max-h-[78dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3">
              <FiCheckCircle className="mt-1 shrink-0 text-blue-700" size={23} />
              <div>
                <h2 className="text-lg font-black text-slate-950">Your information has been saved</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  When you return to company registration, KunThai will continue from this same step. Choose Save and exit if you want to leave the form now, or Keep editing if you want to keep completing it.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={saveAndExit}
                className="h-11 rounded-2xl border border-blue-200 bg-blue-50 text-sm font-black text-blue-700 hover:bg-blue-100"
              >
                Save and exit
              </button>
              <button
                type="button"
                onClick={continueAfterSave}
                className="h-11 rounded-2xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700"
              >
                Keep editing
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </ScreenSlideTransition>
  );
}

function CompanyIdentityStep({ documentRequirements = [], errors = {}, form, onChange, onDocument }) {
  const countryProfile = getActiveCountryProfile(form.country);
  const phoneValidation = validateCountryPhone(form.phone, countryProfile);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Company profile</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Register the organization that owns or manages these fleets.</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput label="Company / organization name" value={form.companyName} onChange={(value) => onChange("companyName", value)} placeholder="Example: ABC Transport SL" error={errors.companyName} />
        <SelectField label="Company type" value={form.companyType} options={companyTypes} onChange={(value) => onChange("companyType", value)} />
        <FormInput label="Business registration number" value={form.registrationNumber} onChange={(value) => onChange("registrationNumber", value)} placeholder="Registration number" />
        <FormInput label="Tax or business ID optional" value={form.taxId} onChange={(value) => onChange("taxId", value)} placeholder="Tax ID" />
        <FormInput label="Owner / director name" value={form.ownerName} onChange={(value) => onChange("ownerName", value)} placeholder="Responsible person" error={errors.ownerName} />
        <FormInput
          label="Support phone"
          type="tel"
          value={form.phone}
          onChange={(value) => onChange("phone", constrainCountryPhoneInput(value, countryProfile, { international: true }))}
          placeholder={getCountryPhoneHint(countryProfile)}
          helper={phoneValidation.valid ? `${countryProfile.name}: ${countryProfile.dialCode} ${countryProfile.placeholder}` : phoneValidation.message}
          error={errors.phone}
        />
        <FormInput label="Business email optional" type="email" value={form.email} onChange={(value) => onChange("email", value)} placeholder="company@example.com" />
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">Owner KunThai ID</span>
          <input value={form.ownerPublicId} readOnly className="h-12 w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 text-sm font-black text-blue-800 outline-none" />
          <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">Use this ID when adding company admins, fleet managers, or operator invitations.</span>
        </label>
      </div>
      <DocumentGrid documents={documentRequirements.map((requirement) => documentGridItem(requirement))} uploads={form.documents} onUpload={onDocument} />
    </div>
  );
}

function LocationOperationsStep({ areaText, errors = {}, form, hasLocation, onAreaText, onChange, onDropPin, onLocateMe }) {
  const countryProfile = getActiveCountryProfile(form.country);
  const selectedPoint = hasLocation
    ? {
        lat: form.coordinates?.latitude ?? form.coordinates?.lat,
        lng: form.coordinates?.longitude ?? form.coordinates?.lng,
        address: form.address,
        city: form.city,
        country: form.country,
      }
    : null;
  const areaValidation = useAddressAreaValidation(form.address, { selectedPoint });
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Company base</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Add the company location passengers and operators can trust.</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Country" value={countryProfile.name} options={GLOBAL_COUNTRY_PROFILES.map((country) => country.name)} onChange={(value) => onChange("country", value)} />
        <FormInput label="City / district" value={form.city} onChange={(value) => onChange("city", value)} placeholder="City or district" error={errors.city} />
        <div className="md:col-span-2">
          <FormInput
            label="Office, station, or dispatch address"
            value={form.address}
            onChange={(value) => onChange("address", value)}
            placeholder="Office, station, or dispatch address"
            helper="Area View checks this address when you type, but an exact map point is optional."
            error={errors.address}
          />
          <CompanyAreaViewStatus validation={areaValidation} />
        </div>
      </div>
      <div className={`rounded-3xl border p-4 ${hasLocation ? "border-emerald-100 bg-emerald-50" : "border-blue-100 bg-blue-50"}`}>
        <div className="flex items-start gap-3">
          {hasLocation ? <FiCheckCircle className="mt-1 text-emerald-700" /> : <FiMapPin className="mt-1 text-blue-700" />}
          <div className="min-w-0 flex-1">
            <h3 className={`font-black ${hasLocation ? "text-emerald-900" : "text-blue-900"}`}>
              {hasLocation ? "Exact map point added" : "Exact map point optional"}
            </h3>
            <p className={`mt-1 text-sm font-semibold leading-6 ${hasLocation ? "text-emerald-800" : "text-blue-800"}`}>
              {hasLocation
                ? "KunThai can review the exact company base using the selected map point."
                : "You can continue with the typed address. Use Locate Me if you are at the company base, or Drop Pin if you want to place it manually."}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onLocateMe} className="h-11 rounded-2xl bg-slate-950 text-sm font-black text-white">
            Locate Me
          </button>
          <button type="button" onClick={onDropPin} className="h-11 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700">
            Drop a Pin
          </button>
        </div>
      </div>
      <FormInput label="Operating areas" value={areaText} onChange={onAreaText} placeholder="Operating areas" helper="Separate areas with commas." />
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-700">Dispatch and safety policy</span>
        <textarea
          value={form.supportPolicy}
          onChange={(event) => onChange("supportPolicy", event.target.value)}
          rows="4"
          placeholder="How this company assigns operators, handles passenger calls, delivery support, safety checks, and complaints."
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
        />
      </label>
    </div>
  );
}

function CompanyAreaViewStatus({ validation }) {
  const status = validation?.status || "idle";
  if (status === "idle") return null;

  const copy = {
    searching: {
      tone: "border-slate-200 bg-slate-50 text-slate-700",
      text: "Checking whether KunThai Area View can find this address...",
    },
    found: {
      tone: "border-emerald-100 bg-emerald-50 text-emerald-800",
      text: "Location findable by KunThai Area View.",
    },
    notFound: {
      tone: "border-rose-100 bg-rose-50 text-rose-800",
      text: "Location is not findable by KunThai Area View yet. You can still continue, or use Locate Me / Drop a Pin below to add an exact map point.",
    },
  }[status];

  if (!copy) return null;

  return (
    <div className={`mt-3 flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs font-bold leading-5 ${copy.tone}`}>
      <AddressAreaStatusIcon status={status} className="mt-0.5 shrink-0" />
      <span>{copy.text}</span>
    </div>
  );
}

function FleetBuilderStep({ acceptedOperators = [], allowMultiple = true, errors = {}, fleets, form, onAddFleet, onInvite, onRemoveFleet, onUpdateFleet, onUploadFleetDocument, onViewOneKmPreview }) {
  const acceptedPublicIds = acceptedOperators.map((operator) => compactPublicId(operator.publicId)).filter(Boolean);
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Fleet builder</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Add every company fleet and invite operators by KunThai ID.</h2>
        </div>
        {allowMultiple ? <button type="button" onClick={onAddFleet} className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white">
          <span className="flex items-center justify-center gap-2"><FiPlus /> Add Fleet</span>
        </button> : null}
      </div>
      <div className="grid gap-4">
        {fleets.map((fleet, index) => (
          <FleetCard
            key={fleet.localId}
            fleet={fleet}
            errors={errors}
            acceptedPublicIds={acceptedPublicIds}
            form={form}
            index={index}
            onInvite={onInvite}
            onRemove={onRemoveFleet}
            onUpdate={onUpdateFleet}
            onUploadDocument={onUploadFleetDocument}
            onViewOneKmPreview={onViewOneKmPreview}
            removable={fleets.length > 1}
          />
        ))}
      </div>
    </div>
  );
}

function FleetCard({ acceptedPublicIds = [], errors = {}, fleet, form, index, onInvite, onRemove, onUpdate, onUploadDocument, onViewOneKmPreview, removable }) {
  const [operatorId, setOperatorId] = useState("");
  const [lookupStatus, setLookupStatus] = useState("");
  const [operatorMatch, setOperatorMatch] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [activePricingGuide, setActivePricingGuide] = useState("");
  const serviceCategoryOptions = getCompanyServiceCategoryOptions(form);
  const fleetTypeOptions = getCompanyFleetTypeOptions(form, fleet.serviceCategory);

  const applyLookupResult = useCallback((match) => {
    if (match && acceptedPublicIds.includes(compactPublicId(match.publicId))) {
      setOperatorMatch(null);
      setLookupStatus("This operator is already accepted by the company and cannot be invited again.");
      return;
    }
    setOperatorMatch(match);
    setLookupStatus(match ? `Account available as ${match.name}` : "KunThai ID not found. Check the account ID and try again.");
  }, [acceptedPublicIds]);

  async function lookupOperator(query = operatorId) {
    const target = String(query || "").trim();
    if (!target) {
      setLookupStatus("Enter the operator's KunThai ID first.");
      return;
    }

    setLookingUp(true);
    setLookupStatus("Checking KunThai ID...");
    try {
      const match = await lookupTransportOperatorByKunThaiId(target);
      applyLookupResult(match);
    } catch (error) {
      setLookupStatus(error.message || "Unable to check this operator ID.");
    } finally {
      setLookingUp(false);
    }
  }

  useEffect(() => {
    const target = operatorId.trim();
    setOperatorMatch(null);

    if (!target) {
      setLookupStatus("");
      setLookingUp(false);
      return undefined;
    }

    const compactTarget = target.replace(/[^a-z0-9]/gi, "");
    if (compactTarget.length < 7) {
      setLookupStatus("Enter a complete KunThai ID.");
      setLookingUp(false);
      return undefined;
    }

    let alive = true;
    const timer = window.setTimeout(async () => {
      setLookingUp(true);
      setLookupStatus("Checking KunThai ID...");

      try {
        const match = await lookupTransportOperatorByKunThaiId(target);
        if (alive) applyLookupResult(match);
      } catch (error) {
        if (alive) setLookupStatus(error.message || "Unable to check this KunThai ID.");
      } finally {
        if (alive) setLookingUp(false);
      }
    }, 450);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [applyLookupResult, operatorId]);

  function addMatchedOperator() {
    if (!operatorMatch) return;
    onInvite(fleet.localId, operatorMatch);
    setOperatorId("");
    setOperatorMatch(null);
    setLookupStatus("Operator request added to this fleet.");
  }

  function updateServiceCategory(value) {
    const nextFleetTypes = getCompanyFleetTypeOptions(form, value);
    const fleetType = nextFleetTypes.includes(fleet.fleetType) ? fleet.fleetType : nextFleetTypes[0] || "Taxi";
    onUpdate(fleet.localId, {
      serviceCategory: value,
      fleetType,
      safetyAnswers: fleetType === fleet.fleetType ? fleet.safetyAnswers : createSafetyAnswers(fleetType),
    });
  }

  return (
    <section className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Fleet {index + 1}</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{fleet.fleetName || `${fleet.fleetType} fleet`}</h3>
        </div>
        {removable ? (
          <button type="button" onClick={() => onRemove(fleet.localId)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-rose-600 shadow-sm" aria-label="Remove fleet">
            <FiTrash2 />
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wide text-blue-600">Unique fleet code</p>
          <p className="mt-1 font-black text-slate-950">{fleet.fleetCode}</p>
        </div>
        <SelectField label="Fleet type" value={fleet.fleetType} options={fleetTypeOptions} onChange={(value) => onUpdate(fleet.localId, { fleetType: value, safetyAnswers: createSafetyAnswers(value) })} />
        <SelectField label="Service category" value={fleet.serviceCategory} options={serviceCategoryOptions} onChange={updateServiceCategory} />
        <FormInput label="Fleet name" value={fleet.fleetName} onChange={(value) => onUpdate(fleet.localId, { fleetName: value })} placeholder="Fleet name" error={errors[`${fleet.localId}-fleetName`]} />
        <FormInput label="Plate number" value={fleet.plateNumber} onChange={(value) => onUpdate(fleet.localId, { plateNumber: value.toUpperCase() })} placeholder="Plate number" error={errors[`${fleet.localId}-plateNumber`]} />
        <FormInput label="Make / brand" value={fleet.make} onChange={(value) => onUpdate(fleet.localId, { make: value })} placeholder="Make or brand" error={errors[`${fleet.localId}-make`]} />
        <FormInput label="Model" value={fleet.model} onChange={(value) => onUpdate(fleet.localId, { model: value })} placeholder="Model" error={errors[`${fleet.localId}-model`]} />
        <FormInput label="Year" type="number" value={fleet.year} onChange={(value) => onUpdate(fleet.localId, { year: value })} placeholder="Year" error={errors[`${fleet.localId}-year`]} />
        <FormInput label="Color" value={fleet.color} onChange={(value) => onUpdate(fleet.localId, { color: value })} placeholder="Color" error={errors[`${fleet.localId}-color`]} />
        <FormInput label="Operating area" value={fleet.operatingArea} onChange={(value) => onUpdate(fleet.localId, { operatingArea: value })} placeholder="Main service area" error={errors[`${fleet.localId}-operatingArea`]} />
        <FormInput label="Home base" value={fleet.homeBase} onChange={(value) => onUpdate(fleet.localId, { homeBase: value })} placeholder="Station, park, or yard" error={errors[`${fleet.localId}-homeBase`]} />
      </div>
      <section className="mt-5 rounded-3xl border border-blue-100 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Passenger pricing · company owner</p>
        <h4 className="mt-1 text-lg font-black text-slate-950">Set the prices passengers will see</h4>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">The company owner or CEO controls these prices. The assigned operator can manage availability and trips, but cannot replace company pricing.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FormInput label="Starting price" type="number" value={fleet.baseFare} onChange={(value) => onUpdate(fleet.localId, { baseFare: value })} placeholder="0" helper="The minimum fare shown when distance or time totals are lower than your starting price." error={errors[`${fleet.localId}-baseFare`]} />
          <div>
            <FormInput label="Price per 1 km" type="number" value={fleet.pricePerKm} onChange={(value) => onUpdate(fleet.localId, { pricePerKm: value })} placeholder="0" helper="Distance bookings multiply this rate by the passenger route." error={errors[`${fleet.localId}-pricePerKm`]} />
            <PricingGuide
              type="km"
              open={activePricingGuide === "km"}
              onToggle={() => setActivePricingGuide((current) => (current === "km" ? "" : "km"))}
              onViewOneKm={onViewOneKmPreview}
            />
          </div>
          <div>
            <FormInput label="Price per 1 hour" type="number" value={fleet.pricePerHour} onChange={(value) => onUpdate(fleet.localId, { pricePerHour: value })} placeholder="0" helper="Time bookings use this rate for booked or waiting hours." error={errors[`${fleet.localId}-pricePerHour`]} />
            <PricingGuide
              type="hour"
              open={activePricingGuide === "hour"}
              onToggle={() => setActivePricingGuide((current) => (current === "hour" ? "" : "hour"))}
            />
          </div>
          <FormInput label="Passenger price note optional" value={fleet.priceHint} onChange={(value) => onUpdate(fleet.localId, { priceHint: value })} placeholder="Example: final fare confirmed in booking" helper="Add a short public note only when passengers need extra price context." />
        </div>
      </section>
      <FleetImagesSection fleet={fleet} form={form} onUploadDocument={onUploadDocument} />
      <section className="mt-5">
        <h4 className="font-black text-slate-950">Vehicle documents</h4>
        <p className="mt-1 text-xs font-semibold text-slate-500">Optional now, needed for verification. Use clear PDF or image files - you can also add them later from Fleet HQ.</p>
        <DocumentGrid
          documents={getFleetDocumentRequirements(form, fleet).map((requirement) => documentGridItem(requirement))}
          uploads={fleet.documents}
          onUpload={(document, file) => onUploadDocument(fleet.localId, document, file)}
        />
      </section>
      <FleetSafetySection errors={errors} fleet={fleet} onUpdate={onUpdate} />

      <div data-field-error={errors[`${fleet.localId}-operators`] ? "true" : undefined} className={`mt-5 rounded-3xl border bg-white p-4 ${errors[`${fleet.localId}-operators`] ? "border-rose-200" : "border-blue-100"}`}>
        <div className="flex items-start gap-3">
          <FiUserPlus className="mt-1 text-blue-700" />
          <div>
            <h4 className="font-black text-slate-950">Add operator by KunThai ID</h4>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              Paste the operator's public KunThai ID. KunThai will send the operator a request with Accept and Reject actions.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={operatorId}
            onChange={(event) => setOperatorId(event.target.value)}
            placeholder="KTU-XXXX-XXXX or KT-12345"
            className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
          <button type="button" onClick={() => lookupOperator()} disabled={lookingUp} className="h-11 rounded-2xl border border-slate-950 bg-white px-5 text-sm font-black text-slate-950 disabled:opacity-60">
            <span className="flex items-center justify-center gap-2"><FiSearch /> {lookingUp ? "Checking" : "Check"}</span>
          </button>
        </div>
        {errors[`${fleet.localId}-operators`] ? <p className="mt-3 text-sm font-bold text-rose-700" role="alert">{errors[`${fleet.localId}-operators`]}</p> : null}
        {lookupStatus ? (
          <p className={`mt-3 text-sm font-bold ${operatorMatch ? "text-blue-700" : lookupStatus.includes("not found") || lookupStatus.includes("Unable") ? "text-rose-700" : "text-slate-600"}`}>
            {lookupStatus}
          </p>
        ) : null}
        {operatorMatch ? (
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-black text-slate-950">{operatorMatch.name}</p>
              <p className="text-xs font-bold text-blue-700">{operatorMatch.publicId} {operatorMatch.city ? `- ${operatorMatch.city}` : ""}</p>
            </div>
            <button type="button" onClick={addMatchedOperator} className="h-10 rounded-2xl border border-blue-300 bg-blue-50 px-5 text-sm font-black text-blue-800">
              Add
            </button>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3">
          {(fleet.operators || []).filter((operator) => operator.status !== "accepted").map((operator) => (
            <OperatorRequestCard
              key={operator.requestId}
              operator={operator}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FleetImagesSection({ fleet, form, onUploadDocument }) {
  const imageRequirements = getFleetImageRequirements(form);
  const imageCount = imageRequirements.filter((requirement) => fleet.documents?.[fleetImageDocumentKey(documentStorageKey(requirement))]).length;
  return (
    <section className="mt-5 rounded-3xl border border-slate-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-slate-950">Fleet images</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">Front, back, left side, and right side views. Optional now - passengers see them once uploaded, and verification needs them.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{imageCount}/{imageRequirements.length}</span>
      </div>
      <DocumentGrid
        documents={imageRequirements.map((requirement) => documentGridItem(requirement, "Fleet image - "))}
        uploads={fleet.documents}
        onUpload={(document, file) => onUploadDocument(fleet.localId, document, file)}
      />
    </section>
  );
}

function FleetSafetySection({ errors = {}, fleet, onUpdate }) {
  const questions = fleetSafetyQuestions[fleet.fleetType] || [];
  const answers = fleet.safetyAnswers || {};
  function updateAnswer(key, value) {
    onUpdate(fleet.localId, { safetyAnswers: { ...answers, [key]: value } });
  }
  return (
    <section className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <FiShield className="mt-1 shrink-0 text-amber-700" />
        <div>
          <h4 className="font-black text-slate-950">Security and safety questions</h4>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">KunThai reviews these answers for every company fleet, using the same checks as a sole operator.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {questions.map((question) => {
          const error = errors[`${fleet.localId}-safety-${question.key}`];
          return (
          <label key={question.key} data-field-error={error ? "true" : undefined} className={`rounded-2xl border bg-white p-3 ${error ? "border-rose-200" : "border-amber-100"}`}>
            <span className="text-sm font-bold text-slate-800">{question.label}</span>
            {question.type === "number" ? (
              <input type="number" min="0" value={answers[question.key] || ""} onChange={(event) => updateAnswer(question.key, event.target.value)} placeholder="0" aria-invalid={error ? "true" : undefined} className={`mt-3 h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-blue-500 ${error ? "border-rose-300" : "border-slate-200"}`} />
            ) : (
              <select value={answers[question.key] || "Yes"} onChange={(event) => updateAnswer(question.key, event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500">
                <option>Yes</option><option>No</option><option>Needs admin check</option>
              </select>
            )}
            {error ? <span className="mt-2 block text-xs font-bold text-rose-700" role="alert">{error}</span> : null}
          </label>
          );
        })}
      </div>
    </section>
  );
}

function getOperatorRequestStatus(status = "pending", documents = {}) {
  if (status === "accepted_pending_documents" || documents?.operatorDocumentsRequired || documents?.registrationRequired) {
    return {
      label: "Accepted - operator documents needed",
      body: "The operator accepted the request and only needs to submit identity and license documents. Company and fleet documents remain under your Fleet HQ.",
      panel: "border-blue-100 bg-blue-50",
      badge: "bg-blue-100 text-blue-700",
    };
  }

  if (status === "accepted") {
    return {
      label: "Accepted",
      body: documents?.reuseNotice
        ? "The operator accepted the company request. KunThai will use the operator identity and license documents already submitted on that account."
        : "The operator accepted the company request and submitted the required operator documents for review.",
      panel: "border-emerald-100 bg-emerald-50",
      badge: "bg-emerald-100 text-emerald-700",
    };
  }

  if (status === "rejected") {
    return {
      label: "Rejected",
      body: "The operator declined this company request. You can invite another operator for this fleet.",
      panel: "border-rose-100 bg-rose-50",
      badge: "bg-rose-100 text-rose-700",
    };
  }

  return {
    label: "Waiting for operator response",
    body: "The request has been sent to the operator. The operator must accept or reject it from their transport account.",
    panel: "border-slate-100 bg-slate-50",
    badge: "bg-amber-100 text-amber-800",
  };
}

function OperatorRequestCard({ operator }) {
  const status = getOperatorRequestStatus(operator.status, operator.documents);

  return (
    <div className={`rounded-2xl border p-4 ${status.panel}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Operator request</p>
          <h5 className="mt-1 font-black text-slate-950">{operator.name}</h5>
          <p className="mt-1 text-xs font-bold text-slate-500">{operator.publicId}</p>
        </div>
        <span className={`inline-flex h-9 items-center rounded-full px-3 text-xs font-black ${status.badge}`}>
          {status.label}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{status.body}</p>
      {operator.documents?.reuseNotice ? (
        <div className="mt-3 rounded-2xl border border-emerald-100 bg-white px-3 py-2 text-xs font-black text-emerald-700">
          Operator identity and license documents reused
        </div>
      ) : null}
      {operator.documents?.operatorDocumentsSubmitted ? (
        <div className="mt-3 rounded-2xl border border-blue-100 bg-white px-3 py-2 text-xs font-black text-blue-700">
          Operator documents submitted for review
        </div>
      ) : null}
    </div>
  );
}

function CompanyReviewStep({ fleets, form }) {
  const operatorCount = fleets.reduce((sum, fleet) => sum + (fleet.operators || []).length, 0);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Final review</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Review the company before sending it to KunThai.</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ReviewTile label="Company" value={form.companyName || "Not filled"} />
        <ReviewTile label="Company type" value={form.companyType} />
        <ReviewTile label="Fleets" value={fleets.length} />
        <ReviewTile label="Operator requests" value={operatorCount} />
      </div>
      <section className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
        <h3 className="font-black text-slate-950">Verification summary</h3>
        <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-600">
          <p><strong className="text-slate-950">Base:</strong> {form.address || "Not filled"} {form.city ? `- ${form.city}` : ""}</p>
          <p><strong className="text-slate-950">Areas:</strong> {form.operatingAreas?.length ? form.operatingAreas.join(", ") : "Not filled"}</p>
          <p><strong className="text-slate-950">Policy:</strong> {form.supportPolicy || "Not filled"}</p>
        </div>
      </section>
      <div className="grid gap-3">
        {fleets.map((fleet) => (
          <div key={fleet.localId} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">{fleet.fleetCode}</p>
            <h4 className="mt-1 font-black text-slate-950">{fleet.fleetName || "Unnamed fleet"}</h4>
            <p className="mt-1 text-sm font-semibold text-slate-500">{fleet.plateNumber || "No plate"} - {fleet.serviceCategory}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentGrid({ compact = false, documents, onUpload, uploads = {} }) {
  return (
    <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4"}`}>
      {documents.map((document) => {
        const key = typeof document === "string" ? document : document.key;
        const label = typeof document === "string" ? `${document} (if applicable)` : document.label;
        return (
          <UploadField
            key={key}
            label={label}
            value={uploads?.[key]}
            onChange={(file) => onUpload(key, file)}
          />
        );
      })}
    </div>
  );
}

function UploadField({ label, onChange, value }) {
  const displayLabel = String(label || "").replace(/^Fleet image - /, "");
  const selectedName = typeof value === "string" ? value : value?.fileName || value?.name || "";
  return (
    <label className="block rounded-2xl border border-dashed border-slate-200 bg-white p-3">
      <span className="flex items-center gap-2 text-sm font-black text-slate-800"><FiFileText /> {displayLabel}</span>
      <input type="file" className="mt-3 block w-full text-xs font-semibold text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-xs file:font-black file:text-white" onChange={(event) => onChange(event.target.files?.[0])} />
      {selectedName ? <span className="mt-2 block truncate text-xs font-black text-emerald-700">{selectedName}</span> : null}
    </label>
  );
}

function PricingGuide({ type, open, onToggle, onViewOneKm }) {
  const isDistance = type === "km";
  const audience = isDistance ? "customers and passengers" : "customers booking by time";

  return (
    <div className="mt-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3">
      <p className="text-xs font-bold leading-5 text-blue-800">
        Please enter a fair price to attract more {audience}.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100"
        >
          {open ? "Show less" : "Read more"}
        </button>
        {isDistance ? (
          <button
            type="button"
            onClick={onViewOneKm}
            disabled={!onViewOneKm}
            className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-60"
          >
            View 1 KM
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 rounded-2xl bg-white px-3 py-3 text-xs font-semibold leading-5 text-slate-600">
          {isDistance ? (
            <p>
              A lower and honest price per kilometre can help passengers choose this company fleet more often, especially for short trips. Set a rate that covers fuel, maintenance, operator time, and company costs without making nearby trips feel too expensive.
            </p>
          ) : (
            <p>
              Hourly pricing is useful for waiting time, events, dispatch work, and booked blocks of service. Keep the hourly rate clear and fair so passengers understand what they will pay before they confirm.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FormInput({ error = "", helper = "", label, onChange, placeholder = "", type = "text", value }) {
  return (
    <label className="block" data-field-error={error ? "true" : undefined}>
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? "true" : undefined}
        className={`h-12 w-full rounded-2xl border bg-slate-50 px-4 text-sm font-semibold outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 ${error ? "border-rose-300" : "border-slate-200"}`}
      />
      {error ? <span className="mt-2 block text-xs font-bold leading-5 text-rose-700" role="alert">{error}</span> : null}
      {helper ? <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">{helper}</span> : null}
    </label>
  );
}

function SelectField({ error = "", label, onChange, options, value }) {
  return (
    <label className="block" data-field-error={error ? "true" : undefined}>
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? "true" : undefined}
        className={`h-12 w-full rounded-2xl border bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 ${error ? "border-rose-300" : "border-slate-200"}`}
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
      {error ? <span className="mt-2 block text-xs font-bold leading-5 text-rose-700" role="alert">{error}</span> : null}
    </label>
  );
}

function ReviewTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}
