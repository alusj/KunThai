import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiBriefcase,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiChevronUp,
  FiEdit2,
  FiFileText,
  FiMapPin,
  FiPlus,
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
import AddressLocationField from "../../shared/AddressLocationField";
import AccountSetupLoader from "../../shared/AccountSetupLoader";
import CenteredModal from "../../shared/CenteredModal";
import KunThaiIdHelpButton from "../../shared/KunThaiIdHelpButton";
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
import { useI18n, t } from "../../../i18n";
import { t as i18nText } from "../../../i18n/index";
import { useAiScreen } from "../../../Backend/services/ai/aiScreenContext";
import { buildCompanyRegistrationAiContext } from "./companyRegistrationAi";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";
import DeferredVerificationNotice from "../../shared/DeferredVerificationNotice";
import { useRegistrationTask } from "../../../Backend/hooks/useRegistrationTask";
import { REGISTRATION_KINDS } from "../../../Backend/services/registration/registrationTaskCore";
import {
  consumeRegistrationRecoveryNotice,
  startRegistrationTask,
} from "../../../Backend/services/registration/registrationTaskRunner";

const steps = [
  { labelKey: "urride.companyReg.stepCompany", icon: FiBriefcase },
  { labelKey: "urride.companyReg.stepLocation", icon: FiMapPin },
  { labelKey: "urride.companyReg.stepFleets", icon: FiTruck },
  { labelKey: "urride.companyReg.stepReview", icon: FiCheckCircle },
];

// Stored company-type values stay English; display via urride.companyReg.type.
const companyTypes = ["Transport company", "Delivery company", "Taxi union", "Bike riders group", "Community fleet", "Other organization"];
const companyTypeLabel = (value) => t(`urride.companyReg.type.${value}`);
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
    { key: "seatCount", labelKey: "urride.fleetEdit.q.seatCount", type: "number" },
    { key: "doorsWorking", labelKey: "urride.fleetEdit.q.doorsWorking", type: "select" },
    { key: "seatbelts", labelKey: "urride.fleetEdit.q.seatbelts", type: "select" },
    { key: "acOrVentilation", labelKey: "urride.fleetEdit.q.acOrVentilation", type: "select" },
    { key: "lightsMirrors", labelKey: "urride.fleetEdit.q.lightsMirrors", type: "select" },
    { key: "spareTire", labelKey: "urride.fleetEdit.q.spareTire", type: "select" },
    { key: "interiorClean", labelKey: "urride.fleetEdit.q.interiorClean", type: "select" },
  ],
  "Vehicle / Car": [
    { key: "seatCount", labelKey: "urride.fleetEdit.q.seatCount", type: "number" },
    { key: "doorsWorking", labelKey: "urride.fleetEdit.q.doorsWorking", type: "select" },
    { key: "seatbelts", labelKey: "urride.fleetEdit.q.seatbelts", type: "select" },
    { key: "acOrVentilation", labelKey: "urride.fleetEdit.q.acOrVentilation", type: "select" },
    { key: "lightsMirrors", labelKey: "urride.fleetEdit.q.lightsMirrors", type: "select" },
    { key: "spareTire", labelKey: "urride.fleetEdit.q.spareTire", type: "select" },
    { key: "interiorClean", labelKey: "urride.fleetEdit.q.interiorClean", type: "select" },
  ],
  Van: [
    { key: "seatCount", labelKey: "urride.fleetEdit.q.seatCount", type: "number" },
    { key: "doorsWorking", labelKey: "urride.companyReg.q.vanDoors", type: "select" },
    { key: "seatbelts", labelKey: "urride.companyReg.q.vanSeatbelts", type: "select" },
    { key: "acOrVentilation", labelKey: "urride.fleetEdit.q.acOrVentilation", type: "select" },
    { key: "lightsMirrors", labelKey: "urride.fleetEdit.q.lightsMirrors", type: "select" },
    { key: "spareTire", labelKey: "urride.fleetEdit.q.spareTire", type: "select" },
    { key: "interiorClean", labelKey: "urride.companyReg.q.vanInterior", type: "select" },
  ],
  Motorbike: [
    { key: "helmet", labelKey: "urride.fleetEdit.q.helmet", type: "select" },
    { key: "brakes", labelKey: "urride.fleetEdit.q.brakes", type: "select" },
    { key: "lightsMirrors", labelKey: "urride.fleetEdit.q.lightsMirrors", type: "select" },
    { key: "passengerFootrest", labelKey: "urride.fleetEdit.q.passengerFootrest", type: "select" },
    { key: "deliveryBox", labelKey: "urride.fleetEdit.q.deliveryBox", type: "select" },
  ],
  Tricycle: [
    { key: "seatCount", labelKey: "urride.fleetEdit.q.seatCount", type: "number" },
    { key: "entrySafe", labelKey: "urride.fleetEdit.q.entrySafe", type: "select" },
    { key: "lightsMirrors", labelKey: "urride.fleetEdit.q.lightsMirrors", type: "select" },
    { key: "coveredSpace", labelKey: "urride.fleetEdit.q.coveredSpace", type: "select" },
    { key: "sideBar", labelKey: "urride.fleetEdit.q.sideBar", type: "select" },
  ],
};

const rentalReadinessQuestions = [
  { key: "selfDriveAuthorised", label: "Is this vehicle authorised for self-drive rental?", type: "select", requireChoice: true },
  { key: "rentalInsurance", label: "Is the insurance valid for rental use?", type: "select", requireChoice: true },
  { key: "roadworthyServiced", label: "Is the vehicle currently roadworthy and serviced?", type: "select", requireChoice: true },
  { key: "licenceCheck", label: "Will the renter's driving licence be checked at pickup?", type: "select", requireChoice: true },
  { key: "handoverInspection", label: "Will pickup and return condition checks be recorded?", type: "select", requireChoice: true },
  { key: "renterSupport", label: "Will the renter receive a company emergency contact?", type: "select", requireChoice: true },
];

function getFleetQuestions(fleet = {}) {
  return fleet.serviceCategory === "Rental" ? rentalReadinessQuestions : fleetSafetyQuestions[fleet.fleetType] || [];
}

function questionLabel(question) {
  return question.label || t(question.labelKey);
}

function createSafetyAnswers(fleetType, serviceCategory = "") {
  const questions = serviceCategory === "Rental" ? rentalReadinessQuestions : fleetSafetyQuestions[fleetType] || [];
  return questions.reduce((answers, question) => ({
    ...answers,
    [question.key]: question.type === "select" && !question.requireChoice ? "Yes" : "",
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

function getFleetImageRequirements(form, fleet = {}) {
  const requirements = getUrRideFleetImageRequirements({
    country: form.country,
    countryCode: form.countryCode,
  });
  const labels = [...(fleet.serviceCategory === "Rental" ? ["Cover photo"] : []), ...(["Vehicle / Car", "Taxi"].includes(fleet.fleetType) ? ["Front interior", "Back interior"] : [])];
  return [...requirements, ...labels.map((label) => ({ key: label.toLowerCase().replaceAll(" ", "_"), label, legacyLabel: label, inlineNote: "", required: true }))];
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
    phone: profile.phone || profile.phoneNumber || profile.phone_number || "",
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

function createFleetDraft(index = 0, context = {}, requestedServiceCategory = "") {
  const availableServices = getCompanyServiceCategoryOptions(context);
  const serviceCategory = availableServices.includes(requestedServiceCategory)
    ? requestedServiceCategory
    : preferredCompanyServiceCategory(context);
  const fleetTypes = getCompanyFleetTypeOptions(context, serviceCategory);
  const fleetType = serviceCategory === "Rental" && fleetTypes.includes("Vehicle / Car")
    ? "Vehicle / Car"
    : fleetTypes[index % Math.max(1, fleetTypes.length)] || fleetTypes[0] || "Taxi";

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
    safetyAnswers: createSafetyAnswers(fleetType, serviceCategory),
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
    safetyAnswers: fleetType === fleet.fleetType ? fleet.safetyAnswers : createSafetyAnswers(fleetType, serviceCategory),
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

export default function CompanyRegistrationScreen({ existingCompany = null, mode = "full", onBack, onComplete, onSaved, onSaveExit, onViewOneKmPreview }) {
  useI18n();
  const addOperatorMode = mode === "addOperator";
  const addRentalMode = mode === "addRental";
  const incrementalFleetMode = addOperatorMode || addRentalMode;
  const openingSource = existingCompany || null;
  const openingCompany = openingSource?.company || openingSource;
  const openingFleetForm = incrementalFleetMode && openingCompany
    ? {
        ...createCompanyForm(),
        ...openingCompany,
        documents: openingCompany.documents || {},
      }
    : null;
  // Editing an existing company shows a single-screen accordion of the
  // registration steps (each with the current details + Edit) instead of
  // walking the wizard from the top.
  const editing = Boolean(existingCompany) && !incrementalFleetMode;
  // A new company is saved by a background task: leaving this screen never
  // cancels it, and reopening shows it (or, after a failure elsewhere, the
  // entered details and picked files) instead of a fresh form. Edits and
  // added vehicles keep saving in place, as before.
  const backgroundEnabled = !editing && !incrementalFleetMode;
  const backgroundTask = useRegistrationTask(REGISTRATION_KINDS.URRIDE_COMPANY, {
    enabled: backgroundEnabled,
    onSettled: handleBackgroundSettled,
  });
  const restored = backgroundTask.adopted?.restore || null;
  const skipContextLoadRef = useRef(Boolean(restored));
  const submitOriginRef = useRef(null);
  const [openSection, setOpenSection] = useState(-1);
  const [step, setStep] = useState(() => restored?.step ?? (incrementalFleetMode ? 2 : 0));
  const [maxStepReached, setMaxStepReached] = useState(() => restored?.maxStepReached ?? (incrementalFleetMode ? 2 : 0));
  const [form, setForm] = useState(() => restored?.form || openingFleetForm || createCompanyForm());
  const [fleets, setFleets] = useState(() => restored?.fleets || [createFleetDraft(0, openingFleetForm || {}, addRentalMode ? "Rental" : "")]);
  const [areaText, setAreaText] = useState(() => restored?.areaText ?? (openingFleetForm?.operatingAreas || []).join(", "));
  const [status, setStatus] = useState(() => (
    backgroundTask.adopted?.status === "failed"
      ? t("registrationSaving.failedInline", {
          reason: backgroundTask.adopted.error?.message || t("urride.companyReg.submitError"),
        })
      : ""
  ));
  const [statusTone, setStatusTone] = useState(() => (backgroundTask.adopted?.status === "failed" ? "error" : "info"));
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submittingInPlace, setSubmitting] = useState(false);
  const submitting = submittingInPlace || (backgroundEnabled && backgroundTask.running);
  const [finishing, setFinishing] = useState(false);
  const [initializing, setInitializing] = useState(() => !incrementalFleetMode && !restored);
  const [transitionOrigin, setTransitionOrigin] = useState({ x: "50%", y: "70%" });
  const [locationPickerMode, setLocationPickerMode] = useState(null);
  const [locationCautionOpen, setLocationCautionOpen] = useState(false);
  const [saveCheckpointOpen, setSaveCheckpointOpen] = useState(false);
  const stepDirection = useDirectionalStep(step);
  const latitude = form.coordinates?.latitude ?? form.coordinates?.lat;
  const longitude = form.coordinates?.longitude ?? form.coordinates?.lng;
  const hasLocation = latitude != null && longitude != null;
  const rentalSubmission = incrementalFleetMode && fleets.length > 0 && fleets.every((fleet) => fleet.serviceCategory === "Rental");
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

  // Opened from "Review" after a save was cut short (reload, app closed):
  // say why the details came back and that the files are needed again.
  useEffect(() => {
    if (!backgroundEnabled || !consumeRegistrationRecoveryNotice(REGISTRATION_KINDS.URRIDE_COMPANY)) return;
    setStatus(t("registrationSaving.interruptedInline"));
    setStatusTone("info");
    // Checked once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    // A save in progress (or one that failed elsewhere) already brought the
    // entered details back; a saved draft must not replace them.
    if (skipContextLoadRef.current) return undefined;

    // The company workspace already supplies everything needed to add an
    // operator or rental. Paint that screen immediately instead of showing a
    // loader for a profile/draft fetch that this mode does not use.
    if (incrementalFleetMode) {
      setInitializing(false);
      getOnboardingProfile()
        .then((profile) => {
          if (!alive) return;
          const accountPhone = String(profile?.phone || profile?.phoneNumber || profile?.phone_number || "").trim();
          if (accountPhone) {
            setForm((current) => ({ ...current, phone: current.phone || accountPhone }));
          }
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }

    async function loadContext() {
      try {
        const [profile, draft] = await Promise.all([
          getOnboardingProfile().catch(() => null),
          getTransportCompanyDraft().catch(() => null),
        ]);
        if (!alive) return;

        const source = existingCompany || restorableCompanyDraft(draft);
        if (source?.companyName || source?.company?.companyName) {
          const company = source.company || source;
          const nextForm = {
            ...createCompanyForm(profile || {}),
            ...company,
            phone: company.phone || createCompanyForm(profile || {}).phone,
            ownerPublicId: company.ownerPublicId || getKunThaiPublicUserId({ ...(profile || {}), userId: source.userId }),
            documents: company.documents || {},
          };
          setForm(nextForm);
          setFleets(sanitizeCompanyFleetsForCountry(
            (source.fleets || [createFleetDraft(0, nextForm)]).length ? source.fleets : [createFleetDraft(0, nextForm)],
            nextForm,
          ));
          setAreaText((company.operatingAreas || []).join(", "));
          setStep(source.step || 0);
          setMaxStepReached(source.maxStepReached || source.step || 0);
          return;
        }

        const nextForm = createCompanyForm(profile || {});
        setForm(nextForm);
        setFleets((items) => sanitizeCompanyFleetsForCountry(items, nextForm));
      } finally {
        if (alive) setInitializing(false);
      }
    }

    loadContext();
    return () => {
      alive = false;
    };
    // Capture the opening company/mode once. Parent subscription refreshes must
    // never replace fields while somebody is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const companyDocumentRequirements = useMemo(() => getUrRideCompanyDocumentRequirements({
    country: form.country,
    countryCode: form.countryCode,
  }), [form.country, form.countryCode]);

  useEffect(() => {
    setFleets((items) => sanitizeCompanyFleetsForCountry(items, {
      country: form.country,
      countryCode: form.countryCode,
    }));
  }, [form.country, form.countryCode]);

  const completion = useMemo(() => {
    const companyReady = Boolean(form.companyName && form.ownerName && form.phone);
    const locationReady = Boolean(form.country && form.city && form.address);
    const fleetReady = fleets.some((fleet) =>
      fleet.fleetType &&
      fleet.plateNumber &&
      getFleetImageRequirements(form, fleet).every((requirement) =>
        fleet.documents?.[fleetImageDocumentKey(documentStorageKey(requirement))]
      )
    );
    const documentReady = companyDocumentRequirements.some((requirement) => form.documents?.[documentStorageKey(requirement)]);
    return [
      companyReady,
      locationReady,
      fleetReady,
      documentReady,
    ].filter(Boolean).length;
  }, [companyDocumentRequirements, fleets, form]);

  // KAI can see this registration and fill it (never documents, photos or the map pin).
  useAiScreen(() => buildCompanyRegistrationAiContext({
    step,
    form,
    fleets,
    areaText,
    fieldErrors,
    status,
    updateForm,
    updateFleet,
    setAreaText,
  }), { enabled: !initializing && !finishing });

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

  // The picked file itself is kept so it is uploaded on submit; a cancelled
  // picker (no file) leaves the field as it was.
  function markCompanyDocument(document, file) {
    if (!file) return;
    setForm((current) => ({
      ...current,
      documents: {
        ...current.documents,
        [document]: { file, fileName: file.name },
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
    if (!file) return;
    setFleets((items) =>
      items.map((fleet) =>
        fleet.localId === fleetId
          ? {
              ...fleet,
              documents: {
                ...fleet.documents,
                [document]: { file, fileName: file.name },
              },
            }
          : fleet,
      ),
    );
    clearFieldError(`${fleetId}-${document}`);
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
      showStatus(t("urride.companyReg.ownerIdError"), "error");
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
      phone: operator.phone || "",
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
      if (!form.companyName.trim()) nextErrors.companyName = t("urride.companyReg.reqCompanyName");
      if (!form.ownerName.trim()) nextErrors.ownerName = t("urride.companyReg.reqOwnerName");
      const phoneValidation = validateCountryPhone(form.phone, form.country);
      if (!form.phone.trim()) nextErrors.phone = t("urride.companyReg.reqPhone");
      else if (!phoneValidation.valid) nextErrors.phone = phoneValidation.message;
    }

    if (targetStep === 1) {
      if (!form.city.trim()) nextErrors.city = t("urride.companyReg.reqCity");
      if (!form.address.trim()) nextErrors.address = t("urride.companyReg.reqAddress");
    }

    if (targetStep === 2) {
      if (!fleets.length) nextErrors.fleetList = t("urride.companyReg.reqAddFleet");
      fleets.forEach((fleet, index) => {
        const labelPrefix = fleets.length > 1 ? t("urride.companyReg.fleetPrefix", { n: index + 1 }) : "";
        [
          ["fleetName", "urride.companyReg.reqFleetName"],
          ["plateNumber", "urride.companyReg.reqPlate"],
          ["make", "urride.companyReg.reqMake"],
          ["model", "urride.companyReg.reqModel"],
          ["year", "urride.companyReg.reqYear"],
          ["color", "urride.companyReg.reqColor"],
          ["operatingArea", "urride.companyReg.reqArea"],
          ["homeBase", "urride.companyReg.reqHomeBase"],
          ["baseFare", "urride.companyReg.reqStartPrice"],
          ["pricePerKm", "urride.companyReg.reqPerKm"],
          ["pricePerHour", "urride.companyReg.reqPerHour"],
        ].forEach(([field, messageKey]) => {
          if (fleet.serviceCategory === "Rental" && ["baseFare", "pricePerKm", "pricePerHour"].includes(field)) return;
          if (!String(fleet[field] || "").trim()) {
            nextErrors[`${fleet.localId}-${field}`] = `${labelPrefix}${t(messageKey)}`;
          }
        });
        if (fleet.serviceCategory === "Rental") {
          const distanceNegotiable = Boolean(fleet.safetyAnswers?.rentalDistanceNegotiable);
          const timeNegotiable = Boolean(fleet.safetyAnswers?.rentalTimeNegotiable);
          if (!distanceNegotiable && !(Number(fleet.pricePerKm) > 0)) {
            nextErrors[`${fleet.localId}-pricePerKm`] = `${labelPrefix}Enter a positive price per kilometre or choose Negotiable.`;
          }
          if (!timeNegotiable && !(Number(fleet.pricePerHour) > 0)) {
            nextErrors[`${fleet.localId}-pricePerHour`] = `${labelPrefix}Enter a positive hourly price or choose Negotiable.`;
          }
          if (!fleet.safetyAnswers?.rentalTerms?.trim()) nextErrors[`${fleet.localId}-rentalTerms`] = "Enter rental conditions.";
          if (!fleet.safetyAnswers?.rentalPickup?.address || fleet.safetyAnswers.rentalPickup.latitude == null || fleet.safetyAnswers.rentalPickup.longitude == null) nextErrors[`${fleet.localId}-rentalPickup`] = "Confirm the rental pickup address and map pin.";
        }
        getFleetQuestions(fleet).forEach((question) => {
          if (!String(fleet.safetyAnswers?.[question.key] || "").trim()) {
            nextErrors[`${fleet.localId}-safety-${question.key}`] = `${labelPrefix}${t("urride.companyReg.reqSuffix", { label: questionLabel(question) })}`;
          }
        });
        if (incrementalFleetMode && fleet.serviceCategory !== "Rental" && !(fleet.operators || []).length) {
          nextErrors[`${fleet.localId}-operators`] = t("urride.companyReg.reqOperatorId");
        }
        getFleetImageRequirements(form, fleet).forEach((requirement) => {
          const imageKey = fleetImageDocumentKey(documentStorageKey(requirement));
          if (!fleet.documents?.[imageKey]) {
            nextErrors[`${fleet.localId}-${imageKey}`] = `${labelPrefix}${t("urride.companyReg.reqSuffix", { label: requirement.label })}`;
          }
        });
      });
      // Public fleet photos are required so passengers can identify the actual
      // vehicle. Verification documents remain optional at registration time.
    }

    return nextErrors;
  }

  function summarizeErrors(nextErrors) {
    const messages = Object.values(nextErrors);
    if (!messages.length) return "";
    const preview = messages.slice(0, 3).join(" ");
    const remaining = messages.length - 3;
    const extra = remaining > 0
      ? (remaining === 1 ? t("urride.companyReg.errorsMoreOne", { count: remaining }) : t("urride.companyReg.errorsMoreMany", { count: remaining }))
      : "";
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
        ...createSafetyAnswers(fleet.fleetType, fleet.serviceCategory),
        ...(fleet.safetyAnswers || {}),
      },
    }));
    const payloadFleets = incrementalFleetMode
      ? [...(existingCompany?.fleets || []), ...normalizedNewFleets]
      : normalizedNewFleets;
    const addingRentalFleet = incrementalFleetMode && normalizedNewFleets.every((fleet) => fleet.serviceCategory === "Rental");
    return {
      ...form,
      actionMode: addingRentalFleet ? "add_rental" : addOperatorMode ? "add_operator" : "registration",
      operatingAreas: splitAreas(areaText),
      fleets: payloadFleets,
      submittedFleetCodes: incrementalFleetMode ? normalizedNewFleets.map((fleet) => fleet.fleetCode) : null,
      step,
      maxStepReached,
      accountStatus: incrementalFleetMode ? form.accountStatus || accountStatus : accountStatus,
      activities: [
        {
          id: `activity-${Date.now()}`,
          title: accountStatus === "submitted" ? t("urride.companyReg.actSubmitted") : t("urride.companyReg.actDraft"),
          body: addingRentalFleet
            ? `${form.companyName || "Company"} added a self-drive rental vehicle.`
            : addOperatorMode
              ? t("urride.companyReg.actOperatorBody", { company: form.companyName || t("urride.companyReg.companyFallbackLower") })
            : (payloadFleets.length === 1
                ? t("urride.companyReg.actFleetsBodyOne", { company: form.companyName || t("urride.companyReg.companyFallback"), count: payloadFleets.length })
                : t("urride.companyReg.actFleetsBodyMany", { company: form.companyName || t("urride.companyReg.companyFallback"), count: payloadFleets.length })),
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }

  async function saveDraft() {
    try {
      setSaving(true);
      await saveTransportCompanyDraft(buildPayload("draft"));
      showStatus(t("urride.companyReg.draftSaved"), "success");
      return true;
    } catch (error) {
      showStatus(error.message || t("urride.companyReg.draftError"), "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleViewOneKmPreview() {
    if (!onViewOneKmPreview) {
      showStatus(t("urride.companyReg.previewUnavailable"), "error");
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
    showStatus(t("urride.companyReg.draftSavedContinue"), "success");
  }

  function saveAndExit() {
    setSaveCheckpointOpen(false);
    if (onSaveExit) {
      onSaveExit();
      return;
    }
    onBack?.();
  }

  // Edit-mode save: persists the whole company from the shared form/fleets
  // without leaving the accordion, so any section can be edited and saved in
  // place (just like UrMall). Refreshes the parent company so the workspace is
  // up to date when the seller finally goes back. Returns which step, if any,
  // failed validation so the accordion can reopen it.
  async function saveCompanyEdits() {
    for (const stepIndex of [0, 1, 2]) {
      const nextErrors = getStepErrors(stepIndex);
      if (Object.keys(nextErrors).length) {
        setFieldErrors(nextErrors);
        setOpenSection(stepIndex);
        showStatus(summarizeErrors(nextErrors), "error");
        scrollToFirstBlockingFieldSoon();
        return { ok: false, failedStep: stepIndex };
      }
    }

    try {
      setFieldErrors({});
      setSubmitting(true);
      const account = await saveTransportCompanyAccount(buildPayload("submitted"));
      onSaved?.(account);
      showStatus(t("urride.companyReg.changesSaved"), "success");
      return { ok: true };
    } catch (error) {
      showStatus(error.message || t("urride.companyReg.changesError"), "error");
      return { ok: false };
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCompany(event) {
    const buttonRect = event?.currentTarget?.getBoundingClientRect?.();
    const origin = buttonRect
      ? { x: `${buttonRect.left + buttonRect.width / 2}px`, y: `${buttonRect.top + buttonRect.height / 2}px` }
      : { x: "50%", y: "70%" };
    for (const stepIndex of incrementalFleetMode ? [2] : [0, 1, 2]) {
      const nextErrors = getStepErrors(stepIndex);
      if (Object.keys(nextErrors).length) {
        setFieldErrors(nextErrors);
        if (!incrementalFleetMode) setStep(stepIndex);
        if (editing) setOpenSection(stepIndex);
        showStatus(summarizeErrors(nextErrors), "error");
        scrollToFirstBlockingFieldSoon();
        return;
      }
    }

    if (backgroundEnabled) {
      // The save runs outside this screen; a second tap while it runs joins it.
      setFieldErrors({});
      clearStatus();
      submitOriginRef.current = origin;
      const payload = buildPayload("submitted");
      // Kept first, so a save cut short (reload, app closed) can be restored.
      const draftPayload = buildPayload("draft");
      startRegistrationTask(REGISTRATION_KINDS.URRIDE_COMPANY, {
        restore: { step, maxStepReached, form, fleets, areaText },
        matchHint: form.companyName,
        expectedUploads: countCompanyFiles(form, fleets),
        run: async (report) => {
          await saveTransportCompanyDraft(draftPayload).catch(() => {});
          return saveTransportCompanyAccount(payload, { onProgress: report });
        },
      });
      return;
    }

    try {
      setFieldErrors({});
      setSubmitting(true);
      const payload = buildPayload("submitted");
      const account = await saveTransportCompanyAccount(payload);
      setTransitionOrigin(origin);
      setFinishing(true);
      await new Promise((resolve) => window.setTimeout(resolve, 480));
      onComplete?.(account, origin, { actionMode: payload.actionMode });
    } catch (error) {
      showStatus(error.message || t("urride.companyReg.submitError"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBackgroundSettled(task) {
    if (task.status !== "succeeded") {
      showStatus(task.error?.message || t("urride.companyReg.submitError"), "error");
      return;
    }
    const origin = submitOriginRef.current || { x: "50%", y: "70%" };
    setTransitionOrigin(origin);
    setFinishing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 480));
    onComplete?.(task.result, origin, { actionMode: "registration" });
  }

  // Back while the company is saving leaves the screen; the save carries on
  // in the background and a toast reports it.
  function leaveWhileSaving() {
    if (onSaveExit) {
      onSaveExit();
      return;
    }
    onBack?.();
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
    showStatus(t("urride.companyReg.baseSet", { location: location.address || t("urride.companyReg.baseSetFallback") }), "success");
  }

  function handleRegistrationBack() {
    if (backgroundEnabled && backgroundTask.running) {
      leaveWhileSaving();
      return;
    }

    // The edit accordion is a single screen, so Back leaves to the workspace
    // rather than stepping through wizard stages.
    if (!incrementalFleetMode && !editing && step > 0) {
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
          backLabel={t("urride.companyReg.pickerBack")}
          pickerLabels={{
            historyKey: "transport-company-location-picker",
            backLabel: t("urride.companyReg.pickerBack"),
            eyebrow: t("urride.companyReg.pickerEyebrow"),
            headerCurrentTitle: t("urride.companyReg.pickerCurrentTitle"),
            headerDropTitle: t("urride.companyReg.pickerDropTitle"),
            cardEyebrow: t("urride.companyReg.pickerCardEyebrow"),
            currentHeading: t("urride.companyReg.pickerCurrentHeading"),
            dropHeading: t("urride.companyReg.pickerDropHeading"),
            dropInstruction: t("urride.companyReg.pickerDropInstruction"),
            currentPreparing: t("urride.companyReg.pickerPreparing"),
            currentStatus: t("urride.companyReg.pickerCurrentStatus"),
            currentName: t("urride.companyReg.pickerCurrentName"),
            droppedName: t("urride.companyReg.pickerDroppedName"),
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
      className={`${finishing ? "kt-onboarding-collapse-out" : ""} kt-mobile-viewport kt-safe-screen bg-slate-50 [transform:translateZ(0)]`}
      style={{ "--kt-transition-x": transitionOrigin.x, "--kt-transition-y": transitionOrigin.y }}
    >
      <AccountSetupLoader
        open={submitting || finishing}
        sector="urride"
        kind={REGISTRATION_KINDS.URRIDE_COMPANY}
        progress={backgroundEnabled ? backgroundTask.progress : null}
        onBack={backgroundEnabled && backgroundTask.running && !finishing ? leaveWhileSaving : undefined}
      />
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5 lg:px-8">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={handleRegistrationBack}
            label={!incrementalFleetMode && !editing && step > 0 ? t("urride.companyReg.back") : t("urride.companyReg.backScreen")}
            historyKey="transport-company-registration"
            className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">Fleet HQ</p>
            <h1 className="truncate text-lg font-black text-slate-950">{rentalSubmission ? i18nText("ui.literals.kb883f465c09a") : addOperatorMode ? t("urride.companyReg.addOperatorTitle") : editing ? t("urride.companyReg.editTitle") : t("urride.companyReg.regTitle")}</h1>
          </div>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            {rentalSubmission ? i18nText("ui.literals.k81e22e383e11") : addOperatorMode ? t("urride.companyReg.fleetStage") : t("urride.companyReg.readyCount", { count: completion })}
          </span>
        </div>
      </header>

      <main ref={formTopRef} className={`grid w-full gap-5 px-3 py-4 sm:px-5 lg:px-8 ${incrementalFleetMode || editing ? "mx-auto max-w-4xl" : "lg:grid-cols-[280px_minmax(0,1fr)]"}`}>
        {!incrementalFleetMode && !editing ? <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="grid grid-cols-2 gap-2 rounded-3xl border border-slate-100 bg-white p-2 shadow-sm sm:grid-cols-4 lg:grid-cols-1">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const locked = index > maxStepReached;
              return (
                <button
                  key={item.labelKey}
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
                    <span className="truncate">{t(item.labelKey)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside> : null}

        <section aria-busy={initializing ? "true" : undefined} className="min-w-0 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          {status ? (
            <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${statusClassName}`}>
              {translateUi(status)}
            </div>
          ) : null}

          {initializing ? (
            <div className="grid min-h-72 place-items-center" role="status" aria-live="polite">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" aria-hidden="true" />
                <p className="text-sm font-black text-slate-600">{t("urride.common.loading")}</p>
              </div>
            </div>
          ) : editing ? (
            <CompanyEditSections
              openSection={openSection}
              onToggle={setOpenSection}
              onSave={saveCompanyEdits}
              saving={submitting}
              sections={[
                {
                  title: t("urride.companyReg.secCompanyProfile"),
                  summary: [form.companyName, companyTypeLabel(form.companyType), form.phone].filter(Boolean).join("  •  ") || t("urride.companyReg.notSetYet"),
                  node: (
                    <CompanyIdentityStep
                      documentRequirements={companyDocumentRequirements}
                      errors={fieldErrors}
                      form={form}
                      onChange={updateForm}
                      onDocument={markCompanyDocument}
                    />
                  ),
                },
                {
                  title: t("urride.companyReg.secCompanyBase"),
                  summary: [form.city, form.country, form.address].filter(Boolean).join("  •  ") || t("urride.companyReg.notSetYet"),
                  node: (
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
                  ),
                },
                {
                  title: t("urride.companyReg.secFleets"),
                  summary: `${fleets.length === 1 ? t("urride.companyReg.fleetCountOne", { count: fleets.length }) : t("urride.companyReg.fleetCountMany", { count: fleets.length })}${
                    [...new Set(fleets.map((fleet) => fleet.fleetType).filter(Boolean))].length
                      ? `  •  ${[...new Set(fleets.map((fleet) => fleet.fleetType).filter(Boolean))].join(", ")}`
                      : ""
                  }`,
                  node: (
                    <FleetBuilderStep
                      acceptedOperators={(existingCompany?.fleets || []).flatMap((fleet) => fleet.operators || []).filter((operator) => operator.status === "accepted")}
                      allowMultiple
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
                  ),
                },
              ]}
            />
          ) : (
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
            {step === 2 || incrementalFleetMode ? (
              <FleetBuilderStep
                acceptedOperators={(existingCompany?.fleets || []).flatMap((fleet) => fleet.operators || []).filter((operator) => operator.status === "accepted")}
                allowMultiple={!incrementalFleetMode}
                fleets={fleets}
                form={form}
                errors={fieldErrors}
                onAddFleet={addFleet}
                onInvite={addOperatorInvite}
                onRemoveFleet={removeFleet}
                onUpdateFleet={updateFleet}
                onUploadFleetDocument={markFleetDocument}
                onViewOneKmPreview={handleViewOneKmPreview}
                lockRentalCategory={addRentalMode}
              />
            ) : null}
            {step === 3 ? (
              <CompanyReviewStep form={{ ...form, operatingAreas: splitAreas(areaText) }} fleets={fleets} />
            ) : null}
          </StepSlideTransition>
          )}

          {initializing || editing ? null : (
          <div className="mt-6 border-t border-slate-100 pt-4">
            {status && statusTone === "error" ? (
              <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${statusClassName}`}>
                {translateUi(status)}
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={incrementalFleetMode ? onBack : prevStep}
                disabled={!incrementalFleetMode && step === 0}
                className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-40"
              >
                <span className="flex items-center justify-center gap-2"><FiChevronLeft /> {t("urride.companyReg.backBtn")}</span>
              </button>
              <div className="grid gap-2 sm:flex sm:justify-end">
                {!incrementalFleetMode ? <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="h-11 rounded-2xl border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-700 disabled:opacity-60"
                >
                  {saving ? t("urride.companyReg.saving") : t("urride.companyReg.save")}
                </button> : null}
                {incrementalFleetMode ? (
                  <button
                    type="button"
                    onClick={submitCompany}
                    disabled={submitting}
                    className={`h-11 rounded-2xl px-5 text-sm font-black text-white disabled:opacity-60 ${rentalSubmission ? "bg-emerald-700 hover:bg-emerald-800" : "bg-blue-600 hover:bg-blue-700"}`}
                  >
                    {submitting ? (rentalSubmission ? i18nText("ui.literals.k1ac16ae4b71a") : t("urride.companyReg.sendingRequest")) : rentalSubmission ? i18nText("ui.literals.k7af252cec249") : t("urride.companyReg.sendOperatorRequest")}
                  </button>
                ) : step < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700"
                  >
                    <span className="flex items-center justify-center gap-2">{t("urride.companyReg.continue")} <FiChevronRight /></span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submitCompany}
                    disabled={submitting}
                    className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {submitting ? t("urride.companyReg.submitting") : t("urride.companyReg.submitCompany")}
                  </button>
                )}
              </div>
            </div>
          </div>
          )}
        </section>
      </main>

      <CenteredModal open={locationCautionOpen} onClose={() => setLocationCautionOpen(false)} maxWidth="max-w-lg" labelledBy="company-location-title">
        <button
          type="button"
          onClick={() => setLocationCautionOpen(false)}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700"
          aria-label={t("urride.companyReg.cancelLocation")}
        >
          <FiX />
        </button>
        <div className="pl-12">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyReg.confirmBaseEyebrow")}</p>
          <h2 id="company-location-title" className="mt-1 text-xl font-black text-slate-950">{t("urride.companyReg.beExactTitle")}</h2>
        </div>
        <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
          {t("urride.companyReg.beExactBody")}
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
            {t("urride.companyReg.yesLocate")}
          </button>
          <button
            type="button"
            onClick={() => {
              setLocationCautionOpen(false);
              setLocationPickerMode("dropPin");
            }}
            className="h-11 rounded-2xl border border-slate-200 text-sm font-black text-slate-700"
          >
            {t("urride.companyReg.dropPin")}
          </button>
        </div>
      </CenteredModal>

      <CenteredModal open={saveCheckpointOpen} onClose={() => setSaveCheckpointOpen(false)} maxWidth="max-w-lg" labelledBy="company-save-title">
        <div className="flex items-start gap-3">
          <FiCheckCircle className="mt-1 shrink-0 text-blue-700" size={23} />
          <div>
            <h2 id="company-save-title" className="text-lg font-black text-slate-950">{t("urride.companyReg.savedTitle")}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {t("urride.companyReg.savedBody")}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={saveAndExit}
            className="h-11 rounded-2xl border border-blue-200 bg-blue-50 text-sm font-black text-blue-700 hover:bg-blue-100"
          >
            {t("urride.companyReg.saveExit")}
          </button>
          <button
            type="button"
            onClick={continueAfterSave}
            className="h-11 rounded-2xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700"
          >
            {t("urride.companyReg.keepEditing")}
          </button>
        </div>
      </CenteredModal>
    </ScreenSlideTransition>
  );
}

function CompanyEditSections({ sections = [], openSection, onToggle, onSave, saving }) {
  useUiLocale();
  const [savedSection, setSavedSection] = useState(-1);

  async function handleSave(index) {
    const result = await onSave();
    if (result?.ok) {
      onToggle(-1);
      setSavedSection(index);
      window.setTimeout(() => setSavedSection((current) => (current === index ? -1 : current)), 2600);
    }
    // A failed section is reopened by the parent via setOpenSection.
  }

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
        {t("urride.companyReg.editIntro")}
      </p>

      {sections.map((section, index) => {
        const open = openSection === index;
        return (
          <section key={section.title} className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => onToggle(open ? -1 : index)}
              className="flex w-full items-start justify-between gap-3 p-4 text-left sm:p-5"
              aria-expanded={open}
            >
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-950 sm:text-lg">{translateUi(section.title)}</h2>
                {open ? null : (
                  <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-600">{translateUi(section.summary)}</p>
                )}
                {savedSection === index ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-black text-emerald-600">
                    <FiCheckCircle /> {t("urride.companyReg.saved")}
                  </p>
                ) : null}
              </div>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-black text-slate-700">
                {open ? (
                  <>
                    <FiChevronUp /> {t("urride.companyReg.close")}
                  </>
                ) : (
                  <>
                    <FiEdit2 /> {t("urride.companyReg.edit")}
                  </>
                )}
              </span>
            </button>

            {open ? (
              <div className="border-t border-slate-100 p-4 sm:p-5">
                {section.node}
                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => onToggle(-1)}
                    className="h-11 rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-700"
                  >
                    {t("urride.companyReg.close")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSave(index)}
                    disabled={saving}
                    className="h-11 rounded-2xl bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {saving ? t("urride.companyReg.saving") : t("urride.companyReg.saveChanges")}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function CompanyIdentityStep({ documentRequirements = [], errors = {}, form, onChange, onDocument }) {
  useUiLocale();
  const countryProfile = getActiveCountryProfile(form.country);
  const phoneValidation = validateCountryPhone(form.phone, countryProfile);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyReg.profileEyebrow")}</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">{t("urride.companyReg.profileHeading")}</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput label={t("urride.companyReg.companyNameLabel")} value={form.companyName} onChange={(value) => onChange("companyName", value)} placeholder={t("urride.companyReg.companyNamePlaceholder")} error={errors.companyName} />
        <SelectField label={t("urride.companyReg.companyTypeLabel")} value={form.companyType} options={companyTypes} optionLabels={companyTypeLabel} onChange={(value) => onChange("companyType", value)} />
        <FormInput label={t("urride.companyReg.regNumLabel")} value={form.registrationNumber} onChange={(value) => onChange("registrationNumber", value)} placeholder={t("urride.companyReg.regNumPlaceholder")} />
        <FormInput label={t("urride.companyReg.taxIdLabel")} value={form.taxId} onChange={(value) => onChange("taxId", value)} placeholder={t("urride.companyReg.taxIdPlaceholder")} />
        <FormInput label={t("urride.companyReg.ownerNameLabel")} value={form.ownerName} onChange={(value) => onChange("ownerName", value)} placeholder={t("urride.companyReg.ownerNamePlaceholder")} error={errors.ownerName} />
        <FormInput
          label={t("urride.companyReg.supportPhoneLabel")}
          type="tel"
          value={form.phone}
          onChange={(value) => onChange("phone", constrainCountryPhoneInput(value, countryProfile, { international: true }))}
          placeholder={getCountryPhoneHint(countryProfile)}
          helper={phoneValidation.valid ? undefined : phoneValidation.message}
          error={errors.phone}
        />
        <FormInput label={t("urride.companyReg.emailLabel")} type="email" value={form.email} onChange={(value) => onChange("email", value)} placeholder={t("urride.companyReg.emailPlaceholder")} />
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">{t("urride.companyReg.ownerIdLabel")}</span>
          <input value={form.ownerPublicId} readOnly className="h-12 w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 text-sm font-black text-blue-800 outline-none" />
          <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">{t("urride.companyReg.ownerIdHelper")}</span>
        </label>
      </div>
      <DeferredVerificationNotice subject="company" className="mt-5" />
      <DocumentGrid documents={documentRequirements.map((requirement) => documentGridItem(requirement))} uploads={form.documents} onUpload={onDocument} />
    </div>
  );
}

function LocationOperationsStep({ areaText, errors = {}, form, hasLocation, onAreaText, onChange, onDropPin, onLocateMe }) {
  useUiLocale();
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
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyReg.baseEyebrow")}</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">{t("urride.companyReg.baseHeading")}</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label={t("urride.companyReg.countryLabel")} value={countryProfile.name} options={GLOBAL_COUNTRY_PROFILES.map((country) => country.name)} onChange={(value) => onChange("country", value)} />
        <FormInput label={t("urride.companyReg.cityLabel")} value={form.city} onChange={(value) => onChange("city", value)} placeholder={t("urride.companyReg.cityPlaceholder")} error={errors.city} />
        <div className="md:col-span-2">
          <FormInput
            label={t("urride.companyReg.addressLabel")}
            value={form.address}
            onChange={(value) => onChange("address", value)}
            placeholder={t("urride.companyReg.addressLabel")}
            helper={t("urride.companyReg.addressHelper")}
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
              {hasLocation ? t("urride.companyReg.exactAdded") : t("urride.companyReg.exactOptional")}
            </h3>
            <p className={`mt-1 text-sm font-semibold leading-6 ${hasLocation ? "text-emerald-800" : "text-blue-800"}`}>
              {hasLocation
                ? t("urride.companyReg.exactAddedBody")
                : t("urride.companyReg.exactOptionalBody")}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onLocateMe} className="h-11 rounded-2xl bg-slate-950 text-sm font-black text-white">
            {t("urride.companyReg.locateMe")}
          </button>
          <button type="button" onClick={onDropPin} className="h-11 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700">
            {t("urride.companyReg.dropPinBtn")}
          </button>
        </div>
      </div>
      <FormInput label={t("urride.companyReg.areasLabel")} value={areaText} onChange={onAreaText} placeholder={t("urride.companyReg.areasLabel")} helper={t("urride.companyReg.areasHelper")} />
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-700">{t("urride.companyReg.policyLabel")}</span>
        <textarea
          value={form.supportPolicy}
          onChange={(event) => onChange("supportPolicy", event.target.value)}
          rows="4"
          placeholder={t("urride.companyReg.policyPlaceholder")}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
        />
      </label>
    </div>
  );
}

function CompanyAreaViewStatus({ validation }) {
  useUiLocale();
  const status = validation?.status || "idle";
  if (status === "idle") return null;

  const copy = {
    searching: {
      tone: "border-slate-200 bg-slate-50 text-slate-700",
      text: t("urride.companyReg.areaSearching"),
    },
    found: {
      tone: "border-emerald-100 bg-emerald-50 text-emerald-800",
      text: t("urride.companyReg.areaFound"),
    },
    notFound: {
      tone: "border-rose-100 bg-rose-50 text-rose-800",
      text: t("urride.companyReg.areaNotFound"),
    },
  }[status];

  if (!copy) return null;

  return (
    <div className={`mt-3 flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs font-bold leading-5 ${copy.tone}`}>
      <AddressAreaStatusIcon status={status} className="mt-0.5 shrink-0" />
      <span>{translateUi(copy.text)}</span>
    </div>
  );
}

function FleetBuilderStep({ acceptedOperators = [], allowMultiple = true, errors = {}, fleets, form, lockRentalCategory = false, onAddFleet, onInvite, onRemoveFleet, onUpdateFleet, onUploadFleetDocument, onViewOneKmPreview }) {
  useUiLocale();
  const acceptedPublicIds = acceptedOperators.map((operator) => compactPublicId(operator.publicId)).filter(Boolean);
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyReg.builderEyebrow")}</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">{t("urride.companyReg.builderHeading")}</h2>
        </div>
        {allowMultiple ? <button type="button" onClick={onAddFleet} className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white">
          <span className="flex items-center justify-center gap-2"><FiPlus /> {t("urride.companyReg.addFleet")}</span>
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
            lockRentalCategory={lockRentalCategory}
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

function FleetCard({ acceptedPublicIds = [], errors = {}, fleet, form, index, lockRentalCategory = false, onInvite, onRemove, onUpdate, onUploadDocument, onViewOneKmPreview, removable }) {
  useUiLocale();
  const [operatorId, setOperatorId] = useState("");
  const [lookupStatus, setLookupStatus] = useState("");
  const [operatorMatch, setOperatorMatch] = useState(null);
  const [, setLookingUp] = useState(false);
  const [activePricingGuide, setActivePricingGuide] = useState("");
  const acceptedPublicIdsKey = acceptedPublicIds.join("|");
  const acceptedPublicIdSet = useMemo(
    () => new Set(acceptedPublicIdsKey.split("|").filter(Boolean)),
    [acceptedPublicIdsKey],
  );
  const serviceCategoryOptions = getCompanyServiceCategoryOptions(form);
  const fleetTypeOptions = getCompanyFleetTypeOptions(form, fleet.serviceCategory);
  const rentalDistanceNegotiable = Boolean(fleet.safetyAnswers?.rentalDistanceNegotiable);
  const rentalTimeNegotiable = Boolean(fleet.safetyAnswers?.rentalTimeNegotiable);

  const applyLookupResult = useCallback((match) => {
    if (match && acceptedPublicIdSet.has(compactPublicId(match.publicId))) {
      setOperatorMatch(null);
      setLookupStatus(t("urride.companyReg.lookupAlreadyAccepted"));
      return;
    }
    setOperatorMatch(match);
    setLookupStatus(match ? t("urride.companyReg.lookupAvailable", { name: match.name }) : t("urride.companyReg.lookupNotFound"));
  }, [acceptedPublicIdSet]);

  useEffect(() => {
    const target = operatorId.trim();

    if (!target) {
      setOperatorMatch(null);
      setLookupStatus("");
      setLookingUp(false);
      return undefined;
    }

    const compactTarget = target.replace(/[^a-z0-9]/gi, "");
    if (compactTarget.length < 7) {
      // Keep any previous match on screen instead of flashing it away on every
      // keystroke — only reset once the field is clearly incomplete again.
      setOperatorMatch(null);
      setLookupStatus(t("urride.companyReg.lookupEnterComplete"));
      setLookingUp(false);
      return undefined;
    }

    let alive = true;
    const timer = window.setTimeout(async () => {
      setLookingUp(true);
      setLookupStatus(t("urride.companyReg.lookupChecking"));

      try {
        const match = await lookupTransportOperatorByKunThaiId(target);
        if (alive) applyLookupResult(match);
      } catch (error) {
        if (alive) setLookupStatus(inlineErrorMessage(error, t("urride.companyReg.lookupCheckError")));
      } finally {
        if (alive) setLookingUp(false);
      }
    }, 320);

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
    setLookupStatus(t("urride.companyReg.operatorAdded"));
  }

  function updateServiceCategory(value) {
    const nextFleetTypes = getCompanyFleetTypeOptions(form, value);
    const fleetType = value === "Rental" && nextFleetTypes.includes("Vehicle / Car")
      ? "Vehicle / Car"
      : nextFleetTypes.includes(fleet.fleetType) ? fleet.fleetType : nextFleetTypes[0] || "Taxi";
    onUpdate(fleet.localId, {
      serviceCategory: value,
      ...(value === "Rental" ? { operators: [] } : {}),
      fleetType,
      safetyAnswers: createSafetyAnswers(fleetType, value),
    });
  }

  function updateRentalNegotiation(key, priceField, checked) {
    onUpdate(fleet.localId, {
      ...(checked ? { [priceField]: "" } : {}),
      safetyAnswers: {
        ...(fleet.safetyAnswers || {}),
        [key]: checked,
      },
    });
  }

  return (
    <section className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">{t("urride.companyReg.fleetNo", { n: index + 1 })}</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{fleet.fleetName || t("urride.companyReg.fleetNameFallback", { type: fleet.fleetType })}</h3>
        </div>
        {removable ? (
          <button type="button" onClick={() => onRemove(fleet.localId)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-rose-600 shadow-sm" aria-label={t("urride.companyReg.removeFleet")}>
            <FiTrash2 />
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wide text-blue-600">{t("urride.companyReg.uniqueCode")}</p>
          <p className="mt-1 font-black text-slate-950">{fleet.fleetCode}</p>
        </div>
        <SelectField label={t("urride.companyReg.fleetTypeLabel")} value={fleet.fleetType} options={fleetTypeOptions} onChange={(value) => onUpdate(fleet.localId, { fleetType: value, safetyAnswers: { ...createSafetyAnswers(value, fleet.serviceCategory), ...(fleet.serviceCategory === "Rental" ? { rentalDistanceNegotiable, rentalTimeNegotiable } : {}) } })} />
        {lockRentalCategory ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"><p className="text-xs font-black uppercase tracking-wide text-emerald-700">{i18nText("ui.literals.k9c995cd13e56")}</p><p className="mt-1 font-black text-slate-950">{i18nText("ui.literals.k9f86f85e4649")}</p></div> : <SelectField label={t("urride.companyReg.serviceCategoryLabel")} value={fleet.serviceCategory} options={serviceCategoryOptions} onChange={updateServiceCategory} />}
        <FormInput label={fleet.serviceCategory === "Rental" ? i18nText("ui.literals.k03b8a85b895f") : t("urride.companyReg.fleetNameLabel")} value={fleet.fleetName} onChange={(value) => onUpdate(fleet.localId, { fleetName: value })} placeholder={fleet.serviceCategory === "Rental" ? i18nText("ui.literals.k73ff0b898afd") : t("urride.companyReg.fleetNameLabel")} error={errors[`${fleet.localId}-fleetName`]} />
        <FormInput label={t("urride.companyReg.plateLabel")} value={fleet.plateNumber} onChange={(value) => onUpdate(fleet.localId, { plateNumber: value.toUpperCase() })} placeholder={t("urride.companyReg.plateLabel")} error={errors[`${fleet.localId}-plateNumber`]} />
        <FormInput label={t("urride.companyReg.makeLabel")} value={fleet.make} onChange={(value) => onUpdate(fleet.localId, { make: value })} placeholder={t("urride.companyReg.makePlaceholder")} error={errors[`${fleet.localId}-make`]} />
        <FormInput label={t("urride.companyReg.modelLabel")} value={fleet.model} onChange={(value) => onUpdate(fleet.localId, { model: value })} placeholder={t("urride.companyReg.modelLabel")} error={errors[`${fleet.localId}-model`]} />
        <FormInput label={t("urride.companyReg.yearLabel")} type="number" value={fleet.year} onChange={(value) => onUpdate(fleet.localId, { year: value })} placeholder={t("urride.companyReg.yearLabel")} error={errors[`${fleet.localId}-year`]} />
        <FormInput label={t("urride.companyReg.colorLabel")} value={fleet.color} onChange={(value) => onUpdate(fleet.localId, { color: value })} placeholder={t("urride.companyReg.colorLabel")} error={errors[`${fleet.localId}-color`]} />
        <FormInput label={fleet.serviceCategory === "Rental" ? i18nText("ui.literals.k2bc54a825bae") : t("urride.companyReg.opAreaLabel")} value={fleet.operatingArea} onChange={(value) => onUpdate(fleet.localId, { operatingArea: value })} placeholder={fleet.serviceCategory === "Rental" ? i18nText("ui.literals.k999dc2be1d27") : t("urride.companyReg.opAreaPlaceholder")} error={errors[`${fleet.localId}-operatingArea`]} />
        <FormInput label={fleet.serviceCategory === "Rental" ? i18nText("ui.literals.k6a857d271eec") : t("urride.companyReg.homeBaseLabel")} value={fleet.homeBase} onChange={(value) => onUpdate(fleet.localId, { homeBase: value })} placeholder={fleet.serviceCategory === "Rental" ? i18nText("ui.literals.k57a9fdad7a67") : t("urride.companyReg.homeBasePlaceholder")} error={errors[`${fleet.localId}-homeBase`]} />
      </div>
      {fleet.serviceCategory === "Rental" ? <>
        <section className="mt-5 rounded-3xl border border-emerald-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{i18nText("ui.literals.kb56ccdb6dbd7")}</p>
          <h4 className="mt-1 text-lg font-black text-slate-950">{i18nText("ui.literals.k8de8e8730c67")}</h4>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{i18nText("ui.literals.ka3969e84ffc4")}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <FormInput disabled={rentalDistanceNegotiable} label={i18nText("ui.literals.kf932837b05d1", { value0: form.currency || getActiveCountryProfile(form.country).currency.code })} type="number" value={fleet.pricePerKm} onChange={(value) => onUpdate(fleet.localId, { pricePerKm: value })} placeholder="0" helper={i18nText("ui.literals.kda9a3169454d")} error={errors[`${fleet.localId}-pricePerKm`]} />
              <label className="mt-3 flex items-start gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={rentalDistanceNegotiable} onChange={(event) => updateRentalNegotiation("rentalDistanceNegotiable", "pricePerKm", event.target.checked)} className="mt-0.5 h-5 w-5 accent-emerald-700" /><span>{i18nText("ui.literals.k3bbb577489a7")}</span></label>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <FormInput disabled={rentalTimeNegotiable} label={i18nText("ui.literals.k53389a5d2871", { value0: form.currency || getActiveCountryProfile(form.country).currency.code })} type="number" value={fleet.pricePerHour} onChange={(value) => onUpdate(fleet.localId, { pricePerHour: value })} placeholder="0" helper={i18nText("ui.literals.k245ed823d4bd")} error={errors[`${fleet.localId}-pricePerHour`]} />
              <label className="mt-3 flex items-start gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={rentalTimeNegotiable} onChange={(event) => updateRentalNegotiation("rentalTimeNegotiable", "pricePerHour", event.target.checked)} className="mt-0.5 h-5 w-5 accent-emerald-700" /><span>{i18nText("ui.literals.kb3e010f98913")}</span></label>
            </div>
          </div>
        </section>
        <section className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h4 className="font-black text-slate-950">{i18nText("ui.literals.k79fa00a8dc59")}</h4>
          <FormInput label={i18nText("ui.literals.ke7b0b317a6e8")} type="number" value={fleet.safetyAnswers?.rentalDeposit || "0"} onChange={(value) => onUpdate(fleet.localId, { safetyAnswers: { ...fleet.safetyAnswers, rentalDeposit: value } })} />
          <label className="block text-sm font-bold text-slate-800">{i18nText("ui.literals.ke3392650036e")}<textarea className="kt-registration-input mt-2 w-full rounded-xl border p-3" rows={4} value={fleet.safetyAnswers?.rentalTerms || ""} onChange={(event) => onUpdate(fleet.localId, { safetyAnswers: { ...fleet.safetyAnswers, rentalTerms: event.target.value } })} placeholder={i18nText("ui.literals.ka67bf67527b3")} /></label>
          {errors[i18nText("ui.literals.kef76401cd583", { value0: fleet.localId })] && <p role="alert" className="text-sm text-rose-700">{errors[i18nText("ui.literals.kef76401cd583", { value0: fleet.localId })]}</p>}
          <AddressLocationField value={fleet.safetyAnswers?.rentalPickup || { address: "", latitude: null, longitude: null }} onChange={(patch) => onUpdate(fleet.localId, { safetyAnswers: { ...fleet.safetyAnswers, rentalPickup: { ...fleet.safetyAnswers?.rentalPickup, ...patch } } })} />
          {errors[i18nText("ui.literals.k7074b163bc25", { value0: fleet.localId })] && <p role="alert" className="text-sm text-rose-700">{errors[i18nText("ui.literals.k7074b163bc25", { value0: fleet.localId })]}</p>}
          <p className="text-sm text-slate-600">{i18nText("ui.literals.kceaed1266814")}</p>
        </section>
      </> : <section className="mt-5 rounded-3xl border border-blue-100 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">{t("urride.companyReg.pricingEyebrow")}</p>
        <h4 className="mt-1 text-lg font-black text-slate-950">{t("urride.companyReg.pricingHeading")}</h4>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{t("urride.companyReg.pricingBody")}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FormInput label={t("urride.companyReg.startPriceLabel")} type="number" value={fleet.baseFare} onChange={(value) => onUpdate(fleet.localId, { baseFare: value })} placeholder="0" helper={t("urride.companyReg.startPriceHelper")} error={errors[`${fleet.localId}-baseFare`]} />
          <div>
            <FormInput label={t("urride.companyReg.perKmLabel")} type="number" value={fleet.pricePerKm} onChange={(value) => onUpdate(fleet.localId, { pricePerKm: value })} placeholder="0" helper={t("urride.companyReg.perKmHelper")} error={errors[`${fleet.localId}-pricePerKm`]} />
            <PricingGuide
              type="km"
              open={activePricingGuide === "km"}
              onToggle={() => setActivePricingGuide((current) => (current === "km" ? "" : "km"))}
              onViewOneKm={onViewOneKmPreview}
            />
          </div>
          <div>
            <FormInput label={t("urride.companyReg.perHourLabel")} type="number" value={fleet.pricePerHour} onChange={(value) => onUpdate(fleet.localId, { pricePerHour: value })} placeholder="0" helper={t("urride.companyReg.perHourHelper")} error={errors[`${fleet.localId}-pricePerHour`]} />
            <PricingGuide
              type="hour"
              open={activePricingGuide === "hour"}
              onToggle={() => setActivePricingGuide((current) => (current === "hour" ? "" : "hour"))}
            />
          </div>
          <FormInput label={t("urride.companyReg.priceNoteLabel")} value={fleet.priceHint} onChange={(value) => onUpdate(fleet.localId, { priceHint: value })} placeholder={t("urride.companyReg.priceNotePlaceholder")} helper={t("urride.companyReg.priceNoteHelper")} />
        </div>
      </section>}
      <FleetImagesSection errors={errors} fleet={fleet} form={form} onUploadDocument={onUploadDocument} />
      <section className="mt-5">
        <h4 className="font-black text-slate-950">{t("urride.companyReg.vehicleDocsTitle")}</h4>
        <p className="mt-1 text-xs font-semibold text-slate-500">{t("urride.companyReg.vehicleDocsNote")}</p>
        <DocumentGrid
          documents={getFleetDocumentRequirements(form, fleet).map((requirement) => documentGridItem(requirement))}
          uploads={fleet.documents}
          onUpload={(document, file) => onUploadDocument(fleet.localId, document, file)}
        />
      </section>
      <FleetSafetySection errors={errors} fleet={fleet} onUpdate={onUpdate} />

      {fleet.serviceCategory !== "Rental" && <div data-field-error={errors[`${fleet.localId}-operators`] ? "true" : undefined} className={`mt-5 rounded-3xl border bg-white p-4 ${errors[`${fleet.localId}-operators`] ? "border-rose-200" : "border-blue-100"}`}>
        <div className="flex items-start gap-3">
          <FiUserPlus className="mt-1 text-blue-700" />
          <div className="min-w-0 flex-1">
            <h4 className="font-black text-slate-950">{t("urride.companyReg.addOperatorHeading")}</h4>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {t("urride.companyReg.addOperatorBody")}
            </p>
          </div>
          <KunThaiIdHelpButton subject="operator" tone="blue" />
        </div>
        <div className="mt-4">
          <input
            value={operatorId}
            onChange={(event) => setOperatorId(event.target.value.toUpperCase())}
            placeholder={t("urride.companyReg.operatorIdPlaceholder")}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-label={t("urride.companyReg.addOperatorHeading")}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black uppercase tracking-wide outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
        </div>
        {errors[i18nText("ui.literals.k5c30e91aa380", { value0: fleet.localId })] ? <p className="mt-3 text-sm font-bold text-rose-700" role="alert">{errors[i18nText("ui.literals.k5c30e91aa380", { value0: fleet.localId })]}</p> : null}
        {lookupStatus ? (
          <p aria-live="polite" className={`mt-3 text-sm font-bold ${operatorMatch ? "text-blue-700" : lookupStatus.includes("not found") || lookupStatus.includes("Unable") ? "text-rose-700" : "text-slate-600"}`}>
            {lookupStatus}
          </p>
        ) : null}
        {operatorMatch ? (
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-black text-slate-950">{operatorMatch.name}</p>
              <p className="text-xs font-bold text-blue-700">{operatorMatch.publicId} {operatorMatch.city ? `- ${operatorMatch.city}` : ""}</p>
            </div>
            <button type="button" onClick={addMatchedOperator} className="h-10 rounded-2xl border border-blue-300 bg-blue-50 px-5 text-sm font-black text-blue-800">
              {t("urride.companyReg.addMatched")}
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
      </div>}
    </section>
  );
}

function FleetImagesSection({ errors = {}, fleet, form, onUploadDocument }) {
  useUiLocale();
  const imageRequirements = getFleetImageRequirements(form, fleet);
  const imageCount = imageRequirements.filter((requirement) => fleet.documents?.[fleetImageDocumentKey(documentStorageKey(requirement))]).length;
  return (
    <section className="mt-5 rounded-3xl border border-slate-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-slate-950">{t("urride.companyReg.imagesTitle")}</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">{t("urride.companyReg.imagesNote")}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{imageCount}/{imageRequirements.length}</span>
      </div>
      <DocumentGrid
        documents={imageRequirements.map((requirement) => documentGridItem(requirement, "Fleet image - "))}
        errors={Object.fromEntries(imageRequirements.map((requirement) => {
          const key = fleetImageDocumentKey(documentStorageKey(requirement));
          return [key, errors[`${fleet.localId}-${key}`] || ""];
        }))}
        uploads={fleet.documents}
        onUpload={(document, file) => onUploadDocument(fleet.localId, document, file)}
      />
    </section>
  );
}

function FleetSafetySection({ errors = {}, fleet, onUpdate }) {
  useUiLocale();
  const rental = fleet.serviceCategory === "Rental";
  const questions = getFleetQuestions(fleet);
  const answers = fleet.safetyAnswers || {};
  function updateAnswer(key, value) {
    onUpdate(fleet.localId, { safetyAnswers: { ...answers, [key]: value } });
  }
  return (
    <section className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <FiShield className="mt-1 shrink-0 text-amber-700" />
        <div>
          <h4 className="font-black text-slate-950">{rental ? i18nText("ui.literals.k0065d03c1068") : t("urride.companyReg.safetyTitle")}</h4>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{rental ? i18nText("ui.literals.k16198bf42a8d") : t("urride.companyReg.safetyNote")}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {questions.map((question) => {
          const error = errors[i18nText("ui.literals.k708f2ea56851", { value0: fleet.localId, value1: question.key })];
          return (
          <label key={question.key} data-field-error={error ? "true" : undefined} className={`rounded-2xl border bg-white p-3 ${error ? "border-rose-200" : "border-amber-100"}`}>
            <span className="text-sm font-bold text-slate-800">{questionLabel(question)}</span>
            {question.type === "number" ? (
              <input type="number" min="0" value={answers[question.key] || ""} onChange={(event) => updateAnswer(question.key, event.target.value)} placeholder="0" aria-invalid={error ? "true" : undefined} className={`mt-3 h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-blue-500 ${error ? "border-rose-300" : "border-slate-200"}`} />
            ) : (
              <select value={answers[question.key] || (question.requireChoice ? "" : "Yes")} onChange={(event) => updateAnswer(question.key, event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500">
                {question.requireChoice ? <option value="" disabled>{i18nText("ui.literals.k8d61f7a27537")}</option> : null}
                <option value="Yes">{t("urride.fleetEdit.answerYes")}</option><option value="No">{t("urride.fleetEdit.answerNo")}</option><option value="Needs admin check">{t("urride.fleetEdit.answerAdmin")}</option>
              </select>
            )}
            {error ? <span className="mt-2 block text-xs font-bold text-rose-700" role="alert">{translateUi(error)}</span> : null}
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
      label: t("urride.companyReg.reqAcceptedDocsLabel"),
      body: t("urride.companyReg.reqAcceptedDocsBody"),
      panel: "border-blue-100 bg-blue-50",
      badge: "bg-blue-100 text-blue-700",
    };
  }

  if (status === "accepted") {
    return {
      label: t("urride.companyReg.reqAcceptedLabel"),
      body: documents?.reuseNotice
        ? t("urride.companyReg.reqAcceptedReuseBody")
        : t("urride.companyReg.reqAcceptedBody"),
      panel: "border-emerald-100 bg-emerald-50",
      badge: "bg-emerald-100 text-emerald-700",
    };
  }

  if (status === "rejected") {
    return {
      label: t("urride.companyReg.reqRejectedLabel"),
      body: t("urride.companyReg.reqRejectedBody"),
      panel: "border-rose-100 bg-rose-50",
      badge: "bg-rose-100 text-rose-700",
    };
  }

  return {
    label: t("urride.companyReg.reqWaitingLabel"),
    body: t("urride.companyReg.reqWaitingBody"),
    panel: "border-slate-100 bg-slate-50",
    badge: "bg-amber-100 text-amber-800",
  };
}

function OperatorRequestCard({ operator }) {
  useUiLocale();
  const status = getOperatorRequestStatus(operator.status, operator.documents);

  return (
    <div className={`rounded-2xl border p-4 ${status.panel}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">{t("urride.companyReg.operatorRequest")}</p>
          <h5 className="mt-1 font-black text-slate-950">{operator.name}</h5>
          <p className="mt-1 text-xs font-bold text-slate-500">{operator.publicId}</p>
        </div>
        <span className={`inline-flex h-9 items-center rounded-full px-3 text-xs font-black ${status.badge}`}>
          {translateUi(status.label)}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{status.body}</p>
      {operator.documents?.reuseNotice ? (
        <div className="mt-3 rounded-2xl border border-emerald-100 bg-white px-3 py-2 text-xs font-black text-emerald-700">
          {t("urride.companyReg.reuseBadge")}
        </div>
      ) : null}
      {operator.documents?.operatorDocumentsSubmitted ? (
        <div className="mt-3 rounded-2xl border border-blue-100 bg-white px-3 py-2 text-xs font-black text-blue-700">
          {t("urride.companyReg.submittedBadge")}
        </div>
      ) : null}
    </div>
  );
}

function CompanyReviewStep({ fleets, form }) {
  useUiLocale();
  const operatorCount = fleets.reduce((sum, fleet) => sum + (fleet.operators || []).length, 0);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyReg.reviewEyebrow")}</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">{t("urride.companyReg.reviewHeading")}</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ReviewTile label={t("urride.companyReg.tileCompany")} value={form.companyName || t("urride.companyReg.notFilled")} />
        <ReviewTile label={t("urride.companyReg.tileCompanyType")} value={companyTypeLabel(form.companyType)} />
        <ReviewTile label={t("urride.companyReg.tileFleets")} value={fleets.length} />
        <ReviewTile label={t("urride.companyReg.tileOperatorReqs")} value={operatorCount} />
      </div>
      <section className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
        <h3 className="font-black text-slate-950">{t("urride.companyReg.verificationSummary")}</h3>
        <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-600">
          <p><strong className="text-slate-950">{t("urride.companyReg.baseRowLabel")}</strong> {form.address || t("urride.companyReg.notFilled")} {form.city ? `- ${form.city}` : ""}</p>
          <p><strong className="text-slate-950">{t("urride.companyReg.areasRowLabel")}</strong> {form.operatingAreas?.length ? form.operatingAreas.join(", ") : t("urride.companyReg.notFilled")}</p>
          <p><strong className="text-slate-950">{t("urride.companyReg.policyRowLabel")}</strong> {form.supportPolicy || t("urride.companyReg.notFilled")}</p>
        </div>
      </section>
      <div className="grid gap-3">
        {fleets.map((fleet) => (
          <div key={fleet.localId} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">{fleet.fleetCode}</p>
            <h4 className="mt-1 font-black text-slate-950">{fleet.fleetName || t("urride.companyReg.unnamedFleet")}</h4>
            <p className="mt-1 text-sm font-semibold text-slate-500">{fleet.plateNumber || t("urride.companyReg.noPlate")} - {fleet.serviceCategory}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// A saved draft keeps only file names: the files themselves cannot be stored.
// Uploads that were never sent (no stored copy) are cleared, so the form asks
// for them again instead of failing on submit or saving a bare name.
function keepStoredUpload(documents = {}) {
  return Object.fromEntries(Object.entries(documents || {}).filter(([, value]) =>
    value && typeof value === "object" && (value.fileUrl || value.publicUrl || value.url || (value.bucket && value.path)),
  ));
}

// Files picked for the company and its vehicles that the save will upload.
function countCompanyFiles(form = {}, fleets = []) {
  return [
    ...Object.values(form.documents || {}),
    ...fleets.flatMap((fleet) => Object.values(fleet.documents || {})),
  ].filter((value) => value && typeof value === "object" && (value.file || (typeof Blob !== "undefined" && value instanceof Blob))).length;
}

function restorableCompanyDraft(draft) {
  if (!draft) return draft;
  const company = draft.company || draft;
  const cleanCompany = { ...company, documents: keepStoredUpload(company.documents) };
  const fleets = (draft.fleets || company.fleets || []).map((fleet) => ({ ...fleet, documents: keepStoredUpload(fleet.documents) }));
  return draft.company ? { ...draft, company: cleanCompany, fleets } : { ...cleanCompany, fleets };
}

function DocumentGrid({ compact = false, documents, errors = {}, onUpload, uploads = {} }) {
  useUiLocale();
  return (
    <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4"}`}>
      {documents.map((document) => {
        const key = typeof document === "string" ? document : document.key;
        const label = typeof document === "string" ? t("urride.companyReg.ifApplicable", { label: document }) : document.label;
        return (
          <UploadField
            key={key}
            label={translateUi(label)}
            value={uploads?.[key]}
            error={errors[key]}
            accept={String(key).startsWith("Fleet image -") ? "image/*" : undefined}
            onChange={(file) => onUpload(key, file)}
          />
        );
      })}
    </div>
  );
}

function UploadField({ accept, error = "", label, onChange, value }) {
  useUiLocale();
  const displayLabel = String(label || "").replace(/^Fleet image - /, "");
  const selectedName = typeof value === "string" ? value : value?.fileName || value?.name || "";
  return (
    <label data-field-error={error ? "true" : undefined} className={`block rounded-2xl border border-dashed bg-white p-3 ${error ? "border-rose-300" : "border-slate-200"}`}>
      <span className="flex items-center gap-2 text-sm font-black text-slate-800"><FiFileText /> {displayLabel}</span>
      <input type="file" accept={accept} className="mt-3 block w-full text-xs font-semibold text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-xs file:font-black file:text-white" onChange={(event) => onChange(event.target.files?.[0])} />
      {selectedName ? <span className="mt-2 block truncate text-xs font-black text-emerald-700">{selectedName}</span> : null}
      {error ? <span className="mt-2 block text-xs font-bold text-rose-700" role="alert">{translateUi(error)}</span> : null}
    </label>
  );
}

function PricingGuide({ type, open, onToggle, onViewOneKm }) {
  useUiLocale();
  const isDistance = type === "km";
  const audience = isDistance ? t("urride.companyReg.audienceDistance") : t("urride.companyReg.audienceTime");

  return (
    <div className="mt-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3">
      <p className="text-xs font-bold leading-5 text-blue-800">
        {t("urride.companyReg.fairPrice", { audience })}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100"
        >
          {open ? t("urride.companyReg.showLess") : t("urride.companyReg.readMore")}
        </button>
        {isDistance ? (
          <button
            type="button"
            onClick={onViewOneKm}
            disabled={!onViewOneKm}
            className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {t("urride.companyReg.viewOneKm")}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 rounded-2xl bg-white px-3 py-3 text-xs font-semibold leading-5 text-slate-600">
          <p>{isDistance ? t("urride.companyReg.distanceBody") : t("urride.companyReg.hourBody")}</p>
        </div>
      ) : null}
    </div>
  );
}

function FormInput({ disabled = false, error = "", helper = "", label, onChange, placeholder = "", type = "text", value }) {
  useUiLocale();
  return (
    <label className="block" data-field-error={error ? "true" : undefined}>
      <span className="mb-2 block text-sm font-bold text-slate-700">{translateUi(label)}</span>
      <input
        type={type}
        min={type === "number" ? "0" : undefined}
        disabled={disabled}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={translateUi(placeholder)}
        aria-invalid={error ? "true" : undefined}
        className={`h-12 w-full rounded-2xl border bg-slate-50 px-4 text-sm font-semibold outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${error ? "border-rose-300" : "border-slate-200"}`}
      />
      {error ? <span className="mt-2 block text-xs font-bold leading-5 text-rose-700" role="alert">{translateUi(error)}</span> : null}
      {helper ? <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">{translateUi(helper)}</span> : null}
    </label>
  );
}

function SelectField({ error = "", label, onChange, options, value, optionLabels }) {
  useUiLocale();
  return (
    <label className="block" data-field-error={error ? "true" : undefined}>
      <span className="mb-2 block text-sm font-bold text-slate-700">{translateUi(label)}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? "true" : undefined}
        className={`h-12 w-full rounded-2xl border bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 ${error ? "border-rose-300" : "border-slate-200"}`}
      >
        {options.map((option) => <option key={option} value={option}>{optionLabels ? optionLabels(option) : translateUi(option)}</option>)}
      </select>
      {error ? <span className="mt-2 block text-xs font-bold leading-5 text-rose-700" role="alert">{translateUi(error)}</span> : null}
    </label>
  );
}

function ReviewTile({ label, value }) {
  useUiLocale();
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{translateUi(label)}</p>
      <p className="mt-1 truncate text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}
