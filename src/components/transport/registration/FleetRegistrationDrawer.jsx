import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiCamera,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiMapPin,
  FiShield,
  FiTruck,
  FiUser,
} from "react-icons/fi";
import AppBackTab from "../../shared/AppBackTab";
import CenteredModal from "../../shared/CenteredModal";
import { ScreenSlideTransition, StepSlideTransition } from "../../shared/motion";
import { useDirectionalStep } from "../../shared/motionHooks";
import { scrollToFirstBlockingFieldSoon } from "../../shared/formValidationNavigation";
import {
  getOperatorDraft,
  saveOperatorAccount,
  saveOperatorDraft,
} from "../../services/transportOperatorAccountService";
import { getOnboardingProfile } from "../../../Backend/services/onboardingService";
import {
  constrainCountryPhoneInput,
  formatCountryMoney,
  getActiveCountryProfile,
  getCountryCurrencyCode,
  getCountryPhoneHint,
  normalizeCountryIso,
  validateCountryPhone,
} from "../../../data/globalCountryProfiles";
import {
  formatDocumentRequirementLabel,
  getUrRideDocumentRequirements,
  getUrRideFleetImageRequirements,
} from "../../../data/globalDocumentRequirements";
import {
  getPersonalFleetTypeOptions,
  getPersonalServiceCategoryOptions,
} from "../../../data/globalTransportCapabilities";

const availabilityOptions = ["Full-time", "Part-time", "Scheduled", "Weekends only", "Night service"];
const fuelTypes = ["Petrol", "Diesel", "Hybrid", "Electric", "Not applicable"];
const carBodyTypes = ["Sedan", "SUV", "Hatchback", "Minivan", "Pickup", "Van"];
const deliveryBodyTypes = ["Open cargo", "Covered cargo", "Delivery box", "Insulated box", "Passenger + cargo"];
const activeCountry = getActiveCountryProfile();

const fleetQuestions = {
  Car: [
    { key: "seatCount", label: "How many passenger seats are usable?", type: "number" },
    { key: "doorsWorking", label: "Are all passenger doors working?", type: "select" },
    { key: "seatbelts", label: "Are seatbelts available and usable?", type: "select" },
    { key: "acOrVentilation", label: "Is AC or clear ventilation available?", type: "select" },
    { key: "lightsMirrors", label: "Are lights, mirrors, indicators, and horn working?", type: "select" },
    { key: "spareTire", label: "Is a spare tire or emergency repair kit available?", type: "select" },
    { key: "interiorClean", label: "Is the passenger interior clean and safe?", type: "select" },
  ],
  Motorcycle: [
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

const steps = [
  { label: "Operator", icon: FiUser },
  { label: "Service", icon: FiTruck },
  { label: "Fleet", icon: FiMapPin },
  { label: "Safety", icon: FiShield },
  { label: "Documents", icon: FiFileText },
  { label: "Review", icon: FiCheckCircle },
];

function generateOperatorId() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

const defaultForm = {
  name: "",
  phone: "",
  country: activeCountry.name,
  countryCode: activeCountry.iso2,
  currency: activeCountry.currency.code,
  city: "",
  emergencyContact: "",
  category: "Transport",
  fleetType: "Car",
  plateNumber: "",
  fleetName: "",
  make: "",
  model: "",
  year: "",
  color: "",
  operatingArea: "",
  availability: "Full-time",
  fuelType: "",
  carBodyType: "",
  maxLoad: "",
  baseFare: "",
  pricePerKm: "",
  pricePerHour: "",
  priceHint: "",
  homeBaseLocation: "",
  deliveryBodyType: "",
};

function getProfileCountryPatch(profile = {}) {
  const profileCountry = getActiveCountryProfile(profile.country || profile.countryCode);
  return {
    country: profileCountry.name,
    countryCode: profileCountry.iso2,
    currency: getCountryCurrencyCode(profileCountry.iso2),
  };
}

function formatFareReview(value, formCountry) {
  return formatCountryMoney(value, formCountry || activeCountry.iso2, { maximumFractionDigits: 0 });
}

function requirementUploadKey(prefix, requirement) {
  return `${prefix}-${requirement.key}`;
}

function legacyRequirementUploadKey(prefix, requirement) {
  return `${prefix}-${requirement.legacyLabel || requirement.label}`;
}

function getRequirementUpload(uploads, prefix, requirement) {
  return uploads[requirementUploadKey(prefix, requirement)] || uploads[legacyRequirementUploadKey(prefix, requirement)];
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

function clearFieldError(errors, field) {
  if (!errors[field]) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}

export default function FleetRegistrationDrawer({ onClose, onComplete, onSaveExit, onViewOneKmPreview }) {
  const [step, setStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [operatorId, setOperatorId] = useState(generateOperatorId);
  const [answers, setAnswers] = useState({});
  const [uploads, setUploads] = useState({});
  const [documentsSkipped, setDocumentsSkipped] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [showSafetyWarning, setShowSafetyWarning] = useState(false);
  const [showReviewSaveWarning, setShowReviewSaveWarning] = useState(false);
  const [showSaveCheckpoint, setShowSaveCheckpoint] = useState(false);
  const [activePricingGuide, setActivePricingGuide] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [stepError, setStepError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [transitionOrigin, setTransitionOrigin] = useState({ x: "50%", y: "70%" });
  const [form, setForm] = useState(defaultForm);
  const formTopRef = useRef(null);

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

    async function loadRegistrationContext() {
      const profile = await getOnboardingProfile().catch(() => null);
      const accountName = getAccountDisplayName(profile);
      const accountPhone = getAccountPhone(profile);
      const countryPatch = getProfileCountryPatch(profile || {});

      try {
        const draft = await getOperatorDraft();
        if (!alive) return;

        if (draft) {
          const draftForm = draft.form || {};
          setStep(draft.step || 0);
          setMaxStepReached(draft.maxStepReached || draft.step || 0);
          setOperatorId(draft.operatorId || generateOperatorId());
          setAnswers(draft.answers || {});
          setUploads(draft.uploads || {});
          setDocumentsSkipped(Boolean(draft.documentsSkipped));
          setForm({
            ...defaultForm,
            ...countryPatch,
            ...draftForm,
            name: draftForm.name || accountName || "",
            phone: draftForm.phone || accountPhone || "",
            countryCode: normalizeCountryIso(draftForm.countryCode || draftForm.country) || countryPatch.countryCode,
            currency: draftForm.currency || countryPatch.currency,
          });
          return;
        }

        if (accountName || countryPatch.countryCode) {
          setForm((current) => ({
            ...current,
            ...countryPatch,
            name: current.name || accountName || "",
            phone: current.phone || accountPhone || "",
          }));
        }
      } catch {
        if (alive) setSubmitError("Sign in again before continuing your fleet registration.");
      }
    }

    loadRegistrationContext();

    return () => {
      alive = false;
    };
  }, []);

  const fleetImageRequirements = useMemo(() => getUrRideFleetImageRequirements({
    country: form.country,
    countryCode: form.countryCode,
    category: form.category,
  }), [form.category, form.country, form.countryCode]);
  const categoryOptions = useMemo(
    () => getPersonalServiceCategoryOptions(form),
    [form.country, form.countryCode],
  );
  const fleetTypeOptions = useMemo(
    () => getPersonalFleetTypeOptions(form, form.category),
    [form.category, form.country, form.countryCode],
  );

  const documents = useMemo(() => getUrRideDocumentRequirements({
    country: form.country,
    countryCode: form.countryCode,
    category: form.category,
  }), [form.category, form.country, form.countryCode]);

  const questions = fleetQuestions[form.fleetType] || [];
  const fleetImageCount = fleetImageRequirements.filter((requirement) => getRequirementUpload(uploads, "fleet", requirement)).length;
  const stepSlideDirection = useDirectionalStep(step);

  useEffect(() => {
    setForm((current) => {
      const nextCategories = getPersonalServiceCategoryOptions(current);
      const fallbackCategory = current.fleetType === "Motorcycle" ? "Delivery" : "Transport";
      const category = nextCategories.includes(current.category)
        ? current.category
        : nextCategories.includes(fallbackCategory)
          ? fallbackCategory
          : nextCategories[0] || "Transport";
      const nextFleetTypes = getPersonalFleetTypeOptions(current, category);
      const fleetType = nextFleetTypes.includes(current.fleetType) ? current.fleetType : nextFleetTypes[0] || "Car";
      if (category === current.category && fleetType === current.fleetType) return current;
      return { ...current, category, fleetType };
    });
  }, [form.category, form.country, form.countryCode]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => clearFieldError(current, field));
    setStepError("");
  };

  const updateCategory = (value) => {
    setForm((current) => {
      const nextFleetTypes = getPersonalFleetTypeOptions(current, value);
      const fleetType = nextFleetTypes.includes(current.fleetType) ? current.fleetType : nextFleetTypes[0] || "Car";
      return { ...current, category: value, fleetType };
    });
    setFieldErrors((current) => clearFieldError(current, "category"));
    setStepError("");
  };

  const updateAnswer = (field, value) => {
    setAnswers((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => clearFieldError(current, `answer-${field}`));
    setStepError("");
  };

  const markUpload = (field, file) => {
    setUploads((current) => ({
      ...current,
      [field]: file ? { file, fileName: file.name } : "",
    }));
    setFieldErrors((current) => clearFieldError(current, field));
    setDocumentsSkipped(false);
    setStepError("");
  };

  const getStepErrors = (targetStep = step) => {
    const nextErrors = {};

    if (targetStep === 0) {
      if (!form.name.trim()) nextErrors.name = "Operator name required.";
      const phoneValidation = validateCountryPhone(form.phone, form.countryCode || form.country);
      if (!form.phone.trim()) nextErrors.phone = "Phone number required.";
      else if (!phoneValidation.valid) nextErrors.phone = phoneValidation.message;
      if (!form.city.trim()) nextErrors.city = "City or district required.";
      const emergencyValidation = validateCountryPhone(form.emergencyContact, form.countryCode || form.country);
      if (!form.emergencyContact.trim()) nextErrors.emergencyContact = "Emergency contact required.";
      else if (!emergencyValidation.valid) nextErrors.emergencyContact = emergencyValidation.message;
      return nextErrors;
    }

    if (targetStep === 1) {
      if (!form.category) nextErrors.category = "Service category required.";
      if (!form.fleetType) nextErrors.fleetType = "Fleet type required.";
      return nextErrors;
    }

    if (targetStep === 2) {
      if (!form.fleetName.trim()) nextErrors.fleetName = "Fleet name required.";
      if (!form.plateNumber.trim()) nextErrors.plateNumber = "Plate number required.";
      if (!form.make.trim()) nextErrors.make = "Make / brand required.";
      if (!form.model.trim()) nextErrors.model = "Model required.";
      if (!form.year.trim()) nextErrors.year = "Year required.";
      if (!form.color.trim()) nextErrors.color = "Color required.";
      if (!form.operatingArea.trim()) nextErrors.operatingArea = "Operating area required.";
      if (!form.homeBaseLocation.trim()) nextErrors.homeBaseLocation = "Home base required.";
      if (!form.baseFare.trim()) nextErrors.baseFare = "Starting price required.";
      if (!form.pricePerKm.trim()) nextErrors.pricePerKm = "Price per 1 km required.";
      if (!form.pricePerHour.trim()) nextErrors.pricePerHour = "Price per 1 hour required.";
      return nextErrors;
    }

    if (targetStep === 3) {
      questions.forEach((question) => {
        if (question.type === "number" && !String(answers[question.key] || "").trim()) {
          nextErrors[`answer-${question.key}`] = `${question.label} required.`;
        }
      });
      return nextErrors;
    }

    if (targetStep === 4) {
      if (documentsSkipped) return nextErrors;
      fleetImageRequirements.forEach((requirement) => {
        if (!getRequirementUpload(uploads, "fleet", requirement)) {
          nextErrors[requirementUploadKey("fleet", requirement)] = `${formatDocumentRequirementLabel(requirement)} required.`;
        }
      });
      documents.forEach((requirement) => {
        if (!getRequirementUpload(uploads, "doc", requirement)) {
          nextErrors[requirementUploadKey("doc", requirement)] = `${formatDocumentRequirementLabel(requirement)} required.`;
        }
      });
      return nextErrors;
    }

    return nextErrors;
  };

  const requireCurrentStep = () => {
    const nextErrors = getStepErrors();
    const messages = Object.values(nextErrors);
    if (!messages.length) {
      setStepError("");
      setFieldErrors({});
      return true;
    }

    const preview = messages.slice(0, 4).join(", ");
    const extra = messages.length > 4 ? ` and ${messages.length - 4} more` : "";
    setFieldErrors(nextErrors);
    setStepError(`Complete this stage first: ${preview}${extra}. Save keeps your progress, but Continue unlocks only after this stage is complete.`);
    scrollToFirstBlockingFieldSoon();
    return false;
  };

  const normalizedAnswers = () =>
    questions.reduce(
      (nextAnswers, question) => ({
        ...nextAnswers,
        [question.key]: question.type === "select" ? answers[question.key] || "Yes" : answers[question.key] || "",
      }),
      answers,
    );

  const buildPayload = (status = "draft") => ({
    operatorId,
    displayCode: `KT-${operatorId}`,
    step,
    maxStepReached,
    form,
    answers: normalizedAnswers(),
    uploads,
    documentsSkipped,
    verificationStatus: documentsSkipped ? "notVerified" : "pending",
    status,
    savedAt: new Date().toISOString(),
  });

  const saveDraftCheckpoint = async () => {
    setSavingDraft(true);
    try {
      await saveOperatorDraft(buildPayload("draft"));
      setSubmitError("");
      return true;
    } catch (error) {
      setSubmitError(error.message || "Unable to save this fleet draft.");
      return false;
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSave = async () => {
    const saved = await saveDraftCheckpoint();
    if (saved) setShowSaveCheckpoint(true);
  };

  const continueAfterSave = () => {
    setShowSaveCheckpoint(false);
    setSavedMessage("Checkpoint saved. You can continue from this step.");
    window.setTimeout(() => setSavedMessage(""), 4200);
  };

  const saveAndExit = () => {
    setShowSaveCheckpoint(false);
    if (onSaveExit) {
      onSaveExit();
      return;
    }
    onClose?.();
  };

  const handleViewOneKm = async () => {
    const saved = await saveDraftCheckpoint();
    if (saved) {
      onViewOneKmPreview?.();
    }
  };

  const handleSubmit = async (origin = { x: "50%", y: "70%" }) => {
    if (!requireCurrentStep()) return;

    try {
      setSubmitting(true);
      setSubmitError("");
      const account = await saveOperatorAccount(buildPayload("submitted"));
      setTransitionOrigin(origin);
      setFinishing(true);
      await new Promise((resolve) => window.setTimeout(resolve, 480));
      onComplete?.(account, origin);
    } catch (error) {
      setSubmitError(error.message || "Unable to submit fleet registration.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipDocuments = () => {
    setDocumentsSkipped(true);
    setFieldErrors({});
    setStepError("");
    setShowSkipWarning(false);
    setMaxStepReached(5);
    setStep(5);
  };

  const nextStep = () => {
    if (!requireCurrentStep()) return;

    if (step === 3) {
      setShowSafetyWarning(true);
      return;
    }

    proceedToNextStep();
  };

  const proceedToNextStep = () => {
    setStep((current) => {
      const next = Math.min(current + 1, steps.length - 1);
      setMaxStepReached((reached) => Math.max(reached, next));
      return next;
    });
  };

  const confirmSafetyAndContinue = () => {
    setAnswers(normalizedAnswers());
    setShowSafetyWarning(false);
    proceedToNextStep();
  };

  const saveReviewDraft = async () => {
    try {
      await saveOperatorDraft(buildPayload("draft"));
      setShowReviewSaveWarning(false);
      setSavedMessage("Review checkpoint saved. You can return later before submitting.");
      window.setTimeout(() => setSavedMessage(""), 4200);
    } catch (error) {
      setSubmitError(error.message || "Unable to save this fleet draft.");
    }
  };
  const prevStep = () => setStep((current) => Math.max(current - 1, 0));
  const handleRegistrationBack = () => {
    if (step > 0) {
      prevStep();
      return;
    }

    onClose?.();
  };
  const goToStep = (index) => {
    if (index <= maxStepReached) {
      setStep(index);
    }
  };

  return (
    <ScreenSlideTransition
      screenKey="transport-solo-registration-form"
      className={`${finishing ? "kt-onboarding-collapse-out" : ""} min-h-dvh bg-gray-50 [transform:translateZ(0)]`}
      style={{ "--kt-transition-x": transitionOrigin.x, "--kt-transition-y": transitionOrigin.y }}
    >
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4 lg:px-8">
        <div className="flex w-full items-center gap-3 sm:gap-4">
          <AppBackTab
            onBack={handleRegistrationBack}
            label={step > 0 ? "Back to previous registration step" : "Back to previous screen"}
            historyKey="transport-registration"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-gray-950">Fleet Registration</h1>
            <p className="hidden truncate text-xs text-gray-500 sm:block">
              Operator ID KT-{operatorId} will be searchable after submission.
            </p>
          </div>
          {savedMessage && (
            <span className="hidden max-w-sm rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 sm:inline-flex">
              {savedMessage}
            </span>
          )}
          <div className="shrink-0 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 sm:px-3">
            Step {step + 1} of {steps.length}
          </div>
        </div>
      </header>

      <main ref={formTopRef} className="grid w-full gap-5 px-3 py-4 sm:px-5 sm:py-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:h-fit">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm sm:grid-cols-3 sm:p-3 lg:grid-cols-1">
            {steps.map((item, index) => {
              const locked = index > maxStepReached;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => goToStep(index)}
                  disabled={locked}
                  title={locked ? "Complete the previous steps first" : item.label}
                  className={`min-h-12 rounded-2xl border px-2 py-2 text-xs font-semibold transition sm:px-3 sm:py-3 lg:text-left ${
                    step === index
                      ? "border-green-500 bg-green-50 text-green-700"
                      : locked
                        ? "border-gray-100 bg-gray-50 text-gray-300"
                        : "border-gray-100 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex min-w-0 items-center justify-center gap-2 lg:justify-start">
                    <item.icon size={16} />
                    <span className="truncate">{item.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
          {savedMessage && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 sm:hidden">
              {savedMessage}
            </div>
          )}
          {stepError && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
              {stepError}
            </div>
          )}
          <StepSlideTransition stepKey={step} direction={stepSlideDirection}>
          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormInput
                label="Operator name"
                value={form.name}
                onChange={(value) => update("name", value)}
                placeholder="Operator name"
                autoComplete="name"
                helper="Use the real operator name that passengers or admins can verify."
                error={fieldErrors.name}
              />
              <FormInput
                label="Phone number"
                type="tel"
                value={form.phone}
                onChange={(value) => update("phone", constrainCountryPhoneInput(value, form.countryCode || form.country, { international: true }))}
                placeholder={getCountryPhoneHint(form.countryCode || form.country)}
                autoComplete="tel"
                helper="This number is used for operator contact and account review."
                error={fieldErrors.phone}
              />
              <LocationInput
                label="City or district"
                value={form.city}
                onChange={(value) => update("city", value)}
                placeholder="City or district"
                error={fieldErrors.city}
              />
              <FormInput
                label="Emergency contact"
                type="tel"
                value={form.emergencyContact}
                onChange={(value) => update("emergencyContact", constrainCountryPhoneInput(value, form.countryCode || form.country, { international: true }))}
                placeholder={getCountryPhoneHint(form.countryCode || form.country)}
                autoComplete="tel"
                helper="A trusted contact for urgent transport safety follow-up."
                error={fieldErrors.emergencyContact}
              />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
                <SelectField
                label="Service category"
                options={categoryOptions}
                value={form.category}
                onChange={updateCategory}
                helper="Choose what this fleet will offer to passengers."
                error={fieldErrors.category}
              />
              <SelectField
                label="Fleet type"
                options={fleetTypeOptions}
                value={form.fleetType}
                onChange={(value) => update("fleetType", value)}
                helper="This controls the safety questions and required review details."
                error={fieldErrors.fleetType}
              />
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FormInput label="Fleet name or label" value={form.fleetName} onChange={(value) => update("fleetName", value)} placeholder="Fleet name or label" helper="A short public name passengers can recognize." error={fieldErrors.fleetName} />
              <FormInput label="Plate number" value={form.plateNumber} onChange={(value) => update("plateNumber", value.toUpperCase())} placeholder="Plate number" helper="Use the plate exactly as shown on the fleet." error={fieldErrors.plateNumber} />
              <FormInput label="Make / brand" value={form.make} onChange={(value) => update("make", value)} placeholder="Make or brand" error={fieldErrors.make} />
              <FormInput label="Model" value={form.model} onChange={(value) => update("model", value)} placeholder="Model" error={fieldErrors.model} />
              <FormInput label="Year" type="number" value={form.year} onChange={(value) => update("year", value)} placeholder="Year" min="1950" helper="Vehicle manufacture year." error={fieldErrors.year} />
              <FormInput label="Color" value={form.color} onChange={(value) => update("color", value)} placeholder="Color" error={fieldErrors.color} />
              <LocationInput label="Operating area" value={form.operatingArea} onChange={(value) => update("operatingArea", value)} placeholder="Operating area" error={fieldErrors.operatingArea} />
              <LocationInput label="Home base or station" value={form.homeBaseLocation} onChange={(value) => update("homeBaseLocation", value)} placeholder="Home base or station" error={fieldErrors.homeBaseLocation} />
              <FormInput label="Starting price" type="number" value={form.baseFare} onChange={(value) => update("baseFare", value)} placeholder="Starting price" min="0" helper="The minimum fare shown when a distance or time total is lower than your starting price." error={fieldErrors.baseFare} />
              <div>
                <FormInput label="Price per 1 km or kilometer" type="number" value={form.pricePerKm} onChange={(value) => update("pricePerKm", value)} placeholder="Price for 1 km" min="0" helper="Distance bookings calculate this rate against the passenger route." error={fieldErrors.pricePerKm} />
                <PricingGuide
                  type="km"
                  open={activePricingGuide === "km"}
                  onToggle={() => setActivePricingGuide((current) => (current === "km" ? "" : "km"))}
                  onViewOneKm={handleViewOneKm}
                  disabled={savingDraft}
                />
              </div>
              <div>
                <FormInput label="Price per 1 hour" type="number" value={form.pricePerHour} onChange={(value) => update("pricePerHour", value)} placeholder="Price for 1 hour" min="0" helper="Time bookings calculate this rate against the passenger's requested hours." error={fieldErrors.pricePerHour} />
                <PricingGuide
                  type="hour"
                  open={activePricingGuide === "hour"}
                  onToggle={() => setActivePricingGuide((current) => (current === "hour" ? "" : "hour"))}
                />
              </div>
              <FormInput label="Passenger price note optional" value={form.priceHint} onChange={(value) => update("priceHint", value)} placeholder="Optional public price note" helper="Add a note only when passengers need extra context about your rates." />
              <SelectField
                label="Availability"
                options={availabilityOptions}
                value={form.availability}
                onChange={(value) => update("availability", value)}
                helper="Choose when this fleet is usually available."
              />
              {form.fleetType === "Car" && (
                <>
                  <SelectField label="Fuel type" options={fuelTypes} value={form.fuelType} onChange={(value) => update("fuelType", value)} />
                  <SelectField label="Car body type" options={carBodyTypes} value={form.carBodyType} onChange={(value) => update("carBodyType", value)} />
                </>
              )}
              {(form.category === "Delivery" || form.category === "Both") && (
                <FormInput label="Estimated max load" value={form.maxLoad} onChange={(value) => update("maxLoad", value)} placeholder="Estimated max load" />
              )}
              {(form.category === "Delivery" || form.category === "Both") && form.fleetType === "Tricycle" && (
                <SelectField label="Delivery booth type" options={deliveryBodyTypes} value={form.deliveryBodyType} onChange={(value) => update("deliveryBodyType", value)} />
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <FiAlertTriangle className="mt-1 text-amber-700" size={19} />
                  <div>
                    <h2 className="font-semibold text-amber-900">Conditional safety questions</h2>
                    <p className="mt-1 text-sm text-amber-800">
                      These questions change for car, motorcycle, and tricycle fleets.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {questions.map((question) => {
                  const questionError = fieldErrors[`answer-${question.key}`];
                  return (
                  <label key={question.key} data-field-error={questionError ? "true" : undefined} className={`block rounded-2xl border p-4 ${questionError ? "border-red-200 bg-red-50" : "border-gray-100"}`}>
                    <span className="text-sm font-semibold text-gray-900">{question.label}</span>
                    {question.type === "number" ? (
                      <input
                        type="number"
                        min="0"
                        value={answers[question.key] || ""}
                        onChange={(event) => updateAnswer(question.key, event.target.value)}
                        placeholder="0"
                        aria-invalid={questionError ? "true" : undefined}
                        className={`mt-3 h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-green-500 ${questionError ? "border-red-300" : "border-gray-200"}`}
                      />
                    ) : (
                      <select
                        value={answers[question.key] || "Yes"}
                        onChange={(event) => updateAnswer(question.key, event.target.value)}
                        className="mt-3 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-green-500"
                      >
                        <option>Yes</option>
                        <option>No</option>
                        <option>Needs admin check</option>
                      </select>
                    )}
                    {questionError ? <span className="mt-2 block text-xs font-bold text-red-600" role="alert">{questionError}</span> : null}
                  </label>
                );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <section>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-bold text-gray-950">Required fleet images</h2>
                    <p className="text-xs text-gray-500">At least front, back, left side, and right side are required.</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                    {fleetImageCount}/4
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {fleetImageRequirements.map((requirement) => (
                    <UploadField
                      key={requirement.key}
                      label={formatDocumentRequirementLabel(requirement)}
                      value={getRequirementUpload(uploads, "fleet", requirement)}
                      error={fieldErrors[requirementUploadKey("fleet", requirement)]}
                      onChange={(file) => markUpload(requirementUploadKey("fleet", requirement), file)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-3">
                  <h2 className="font-bold text-gray-950">Documents</h2>
                  <p className="text-xs text-gray-500">Upload PDF or image files for review.</p>
                </div>
                {documentsSkipped && (
                  <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                    Documents skipped. You can access the dashboard, but your account will be marked unverified.
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {documents.map((requirement) => (
                    <UploadField
                      key={requirement.key}
                      label={formatDocumentRequirementLabel(requirement)}
                      value={getRequirementUpload(uploads, "doc", requirement)}
                      error={fieldErrors[requirementUploadKey("doc", requirement)]}
                      onChange={(file) => markUpload(requirementUploadKey("doc", requirement), file)}
                    />
                  ))}
                </div>
                <div className="mt-5">
                  <h3 className="font-bold text-gray-950">Additional documents optional</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Add any extra permit, association card, inspection note, or supporting document that can help the review team.
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[1, 2, 3].map((item) => (
                      <UploadField
                        key={item}
                        label={`Additional document ${item} (if applicable)`}
                        value={uploads[`doc-additional-${item}`]}
                        onChange={(file) => markUpload(`doc-additional-${item}`, file)}
                      />
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
                <p className="text-sm font-semibold text-green-800">Operator ID</p>
                <p className="mt-1 text-3xl font-bold text-gray-950">KT-{operatorId}</p>
                <p className="mt-1 text-xs text-green-700">
                  Passengers can search this ID after registration is submitted.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <ReviewRow label="Operator" value={form.name || "Not filled"} />
                <ReviewRow label="Category" value={form.category} />
                <ReviewRow label="Fleet type" value={form.fleetType} />
                <ReviewRow label="Plate number" value={form.plateNumber || "Not filled"} />
                <ReviewRow label="Home base" value={form.homeBaseLocation || "Not filled"} />
                <ReviewRow label="Starting price" value={form.baseFare ? formatFareReview(form.baseFare, form.currency || form.countryCode || form.country) : "Not filled"} />
                <ReviewRow label="Distance rate" value={form.pricePerKm ? `${formatFareReview(form.pricePerKm, form.currency || form.countryCode || form.country)} per km` : "Not filled"} />
                <ReviewRow label="Time rate" value={form.pricePerHour ? `${formatFareReview(form.pricePerHour, form.currency || form.countryCode || form.country)} per hour` : "Not filled"} />
                <ReviewRow label="Fleet images" value={`${fleetImageCount}/${fleetImageRequirements.length} uploaded`} />
                <ReviewRow
                  label="Current status"
                  value={documentsSkipped ? "Unverified - documents skipped" : "Verification Pending"}
                />
              </div>
            </div>
          )}
          </StepSlideTransition>

          <div className="mt-6 border-t border-gray-100 pt-4">
            {submitError && (
              <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {submitError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={prevStep}
                disabled={step === 0}
                className="h-11 w-full rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 disabled:opacity-40 sm:w-auto"
              >
                <span className="flex items-center gap-2">
                  <FiChevronLeft size={17} />
                  Back
                </span>
              </button>

              <div className="grid gap-2 sm:flex sm:items-center sm:justify-end">
              {step === 4 ? (
              <button
                type="button"
                onClick={() => setShowSkipWarning(true)}
                className="h-11 w-full rounded-2xl border border-amber-200 bg-amber-50 px-5 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition sm:w-auto"
              >
                Skip for now
              </button>
              ) : null}
              <button
                type="button"
                onClick={handleSave}
                disabled={savingDraft}
                className="h-11 w-full rounded-2xl border border-green-200 bg-green-50 px-5 text-sm font-semibold text-green-700 hover:bg-green-100 transition sm:w-auto"
              >
                {savingDraft ? "Saving..." : "Save"}
              </button>
              {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={nextStep}
                className="h-11 w-full rounded-2xl bg-green-600 px-5 text-sm font-semibold text-white hover:bg-green-700 transition sm:w-auto"
              >
                <span className="flex items-center gap-2">
                  Continue
                  <FiChevronRight size={17} />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowReviewSaveWarning(true)}
                disabled={submitting}
                className="h-11 w-full rounded-2xl bg-green-600 px-5 text-sm font-semibold text-white hover:bg-green-700 transition disabled:opacity-60 sm:w-auto"
              >
                {submitting ? "Submitting..." : "Review and submit"}
              </button>
            )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <CenteredModal open={showSkipWarning} onClose={() => setShowSkipWarning(false)} maxWidth="max-w-md" labelledBy="fleet-skip-title">
        <div className="flex items-start gap-3">
          <FiAlertTriangle className="mt-1 shrink-0 text-amber-600" size={22} />
          <div>
            <h2 id="fleet-skip-title" className="text-lg font-black text-gray-950">Skip documents?</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              You can access the dashboard, but your account will be marked unverified until your documents are uploaded and approved.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setShowSkipWarning(false)}
            className="h-11 rounded-2xl border border-gray-200 text-sm font-bold text-gray-700"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={handleSkipDocuments}
            className="h-11 rounded-2xl bg-amber-600 text-sm font-bold text-white"
          >
            Skip and continue
          </button>
        </div>
      </CenteredModal>

      <CenteredModal open={showSafetyWarning} onClose={() => setShowSafetyWarning(false)} maxWidth="max-w-lg" labelledBy="fleet-safety-title">
        <div className="flex items-start gap-3">
          <FiShield className="mt-1 shrink-0 text-green-700" size={22} />
          <div>
            <h2 id="fleet-safety-title" className="text-lg font-black text-gray-950">Confirm safety answers</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Be aware that the KunThai admin team will thoroughly check the safety answers you provided. Make sure each answer is honest and matches the actual condition of the fleet.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setShowSafetyWarning(false)}
            className="h-11 rounded-2xl border border-gray-200 text-sm font-bold text-gray-700"
          >
            Edit safety questions
          </button>
          <button
            type="button"
            onClick={confirmSafetyAndContinue}
            className="h-11 rounded-2xl bg-green-600 text-sm font-bold text-white"
          >
            Yes, continue
          </button>
        </div>
      </CenteredModal>

      <CenteredModal open={showSaveCheckpoint} onClose={() => setShowSaveCheckpoint(false)} maxWidth="max-w-lg" labelledBy="fleet-save-title">
        <div className="flex items-start gap-3">
          <FiCheckCircle className="mt-1 shrink-0 text-green-700" size={23} />
          <div>
            <h2 id="fleet-save-title" className="text-lg font-black text-gray-950">Your information has been saved</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              When you return to fleet registration, KunThai will continue from this same step. Choose Save if you want to leave the form now, or Continue if you want to keep completing it.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={saveAndExit}
            className="h-11 rounded-2xl border border-green-200 bg-green-50 text-sm font-bold text-green-700 hover:bg-green-100"
          >
            Save
          </button>
          <button
            type="button"
            onClick={continueAfterSave}
            className="h-11 rounded-2xl bg-green-600 text-sm font-bold text-white hover:bg-green-700"
          >
            Continue
          </button>
        </div>
      </CenteredModal>

      <CenteredModal open={showReviewSaveWarning} onClose={() => setShowReviewSaveWarning(false)} maxWidth="max-w-lg" labelledBy="fleet-review-title">
        <div className="flex items-start gap-3">
          <FiAlertTriangle className="mt-1 shrink-0 text-amber-600" size={22} />
          <div>
            <h2 id="fleet-review-title" className="text-lg font-black text-gray-950">Before final review</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              We are going to check every document you provided and run a thorough verification review. Please make sure most documents carry the same, or very similar, operator and fleet names so the KunThai admin team can confirm ownership faster.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setShowReviewSaveWarning(false)}
            className="h-11 rounded-2xl border border-gray-200 text-sm font-bold text-gray-700"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={saveReviewDraft}
            className="h-11 rounded-2xl border border-green-200 bg-green-50 text-sm font-bold text-green-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={async (event) => {
              const buttonRect = event.currentTarget.getBoundingClientRect();
              const origin = {
                x: `${buttonRect.left + buttonRect.width / 2}px`,
                y: `${buttonRect.top + buttonRect.height / 2}px`,
              };
              try {
                setShowReviewSaveWarning(false);
                await saveOperatorDraft(buildPayload("draft"));
                await handleSubmit(origin);
              } catch (error) {
                setSubmitError(error.message || "Unable to save this fleet draft.");
              }
            }}
            className="h-11 rounded-2xl bg-green-600 text-sm font-bold text-white"
          >
            Save and continue
          </button>
        </div>
      </CenteredModal>
    </ScreenSlideTransition>
  );
}

function PricingGuide({ type, open, onToggle, onViewOneKm, disabled = false }) {
  const isDistance = type === "km";
  const audience = isDistance ? "customers and passengers" : "customers who book by time";

  return (
    <div className="mt-2 rounded-2xl border border-green-100 bg-green-50 px-3 py-3">
      <p className="text-xs font-bold leading-5 text-green-800">
        Please enter a fair price to attract more {audience}.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="rounded-full border border-green-200 bg-white px-3 py-1.5 text-xs font-black text-green-700 hover:bg-green-100"
        >
          {open ? "Show less" : "Read more"}
        </button>
        {isDistance ? (
          <button
            type="button"
            onClick={onViewOneKm}
            disabled={disabled}
            className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {disabled ? "Saving..." : "View 1 KM"}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 rounded-2xl bg-white px-3 py-3 text-xs font-semibold leading-5 text-gray-600">
          {isDistance ? (
            <p>
              A lower and honest price per kilometre can help passengers choose your fleet more often, especially for short trips. Start with a rate that covers fuel, maintenance, and your time, but avoid pricing so high that customers compare you with cheaper operators before booking.
            </p>
          ) : (
            <p>
              For hourly bookings, customers look for confidence and value. Choose a fair hourly rate that covers waiting time and service quality, then keep it simple. A reasonable price can bring more repeat bookings than a high rate that only works once.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FormInput({ error = "", label, value, onChange, type = "text", placeholder = "", helper = "", ...props }) {
  return (
    <label className="block" data-field-error={error ? "true" : undefined}>
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <input
        {...props}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? "true" : undefined}
        className={`h-12 w-full rounded-2xl border bg-gray-50 px-4 text-sm font-medium outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100 ${error ? "border-red-300" : "border-gray-200"}`}
      />
      {error ? <span className="mt-2 block text-xs font-bold leading-5 text-red-600" role="alert">{error}</span> : null}
      {helper ? <span className="mt-2 block text-xs font-medium leading-5 text-gray-500">{helper}</span> : null}
    </label>
  );
}

function LocationInput({ error = "", label, value, onChange, placeholder = "", helper = "" }) {
  return (
    <label className="block" data-field-error={error ? "true" : undefined}>
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? "true" : undefined}
        className={`h-12 w-full rounded-2xl border bg-gray-50 px-4 text-sm font-medium outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100 ${error ? "border-red-300" : "border-gray-200"}`}
      />
      {error ? <span className="mt-2 block text-xs font-bold leading-5 text-red-600" role="alert">{error}</span> : null}
      {helper ? <span className="mt-2 block text-xs font-medium leading-5 text-gray-500">{helper}</span> : null}
    </label>
  );
}

function SelectField({ error = "", label, options, value, onChange, helper = "" }) {
  return (
    <label className="block" data-field-error={error ? "true" : undefined}>
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? "true" : undefined}
        className={`h-12 w-full rounded-2xl border bg-gray-50 px-4 text-sm font-semibold text-gray-700 outline-none transition focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100 ${error ? "border-red-300" : "border-gray-200"}`}
      >
        {!value ? <option value="">Select {label.toLowerCase()}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? <span className="mt-2 block text-xs font-bold leading-5 text-red-600" role="alert">{error}</span> : null}
      {helper ? <span className="mt-2 block text-xs font-medium leading-5 text-gray-500">{helper}</span> : null}
    </label>
  );
}

function UploadField({ error = "", label, value, onChange }) {
  const selectedName = typeof value === "string" ? value : value?.fileName || value?.name || "";
  return (
    <label data-field-error={error ? "true" : undefined} className={`block cursor-pointer rounded-2xl border border-dashed bg-gray-50 px-4 py-4 transition hover:border-green-300 hover:bg-green-50 ${error ? "border-red-300" : "border-gray-300"}`}>
      <input
        type="file"
        accept="image/*,.pdf"
        className="sr-only"
        aria-invalid={error ? "true" : undefined}
        onChange={(event) => onChange(event.target.files?.[0])}
      />
      <span className="flex min-w-0 items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-full bg-white text-gray-700 flex items-center justify-center">
          <FiCamera size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">{label}</span>
          <span className="block truncate text-xs text-gray-500">{selectedName || "Upload or take photo"}</span>
        </span>
      </span>
      {error ? <span className="mt-3 block text-xs font-bold leading-5 text-red-600" role="alert">{error}</span> : null}
    </label>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="break-words text-sm font-semibold text-gray-900 sm:text-right">{value}</span>
    </div>
  );
}
