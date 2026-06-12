import { useEffect, useMemo, useState } from "react";
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
import { ScreenSlideTransition, StepSlideTransition } from "../../shared/motion";
import { useDirectionalStep } from "../../shared/motionHooks";
import {
  getOperatorDraft,
  saveOperatorAccount,
  saveOperatorDraft,
} from "../../services/transportOperatorAccountService";
import { getOnboardingProfile } from "../../../Backend/services/onboardingService";
import {
  formatCountryMoney,
  getActiveCountryProfile,
  getCountryCurrencyCode,
  normalizeCountryIso,
} from "../../../data/westAfricanCountryProfiles";

const categories = ["Transport", "Delivery", "Both"];
const fleetTypes = ["Car", "Motorcycle", "Tricycle"];
const availabilityOptions = ["Full-time", "Part-time", "Scheduled", "Weekends only", "Night service"];
const fuelTypes = ["Petrol", "Diesel", "Hybrid", "Electric", "Not applicable"];
const carBodyTypes = ["Sedan", "SUV", "Hatchback", "Minivan", "Pickup", "Van"];
const deliveryBodyTypes = ["Open cargo", "Covered cargo", "Delivery box", "Insulated box", "Passenger + cargo"];
const activeCountry = getActiveCountryProfile();
const locationSuggestions = [
  `${activeCountry.cityPlaceholder} CBD`,
  `${activeCountry.cityPlaceholder} main road`,
  `${activeCountry.cityPlaceholder} market area`,
  "Central business district",
  "Main transport park",
  "Airport route",
  "School area",
  "Hospital area",
  "Market area",
  "Community junction",
  "Residential area",
  "Border route",
];
const requiredFleetImages = [
  "Front view",
  "Back view",
  "Left side",
  "Right side",
];

const baseDocuments = [
  "National ID",
  "Operator selfie/photo",
  "Driver or rider license",
  "Vehicle registration",
  "Insurance document",
];

const categoryDocuments = {
  Transport: [
    "Road worthiness or inspection certificate",
    "Passenger interior or seating photo",
  ],
  Delivery: ["Delivery box, bag, or storage photo", "Item handling agreement"],
  Both: [
    "Road worthiness or inspection certificate",
    "Passenger interior or seating photo",
    "Delivery box, bag, or storage photo",
    "Item handling agreement",
  ],
};

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
  const [submitError, setSubmitError] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    let alive = true;

    async function loadRegistrationContext() {
      const profile = await getOnboardingProfile().catch(() => null);
      const accountName = getAccountDisplayName(profile);
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

  const documents = useMemo(() => {
    return [...baseDocuments, ...(categoryDocuments[form.category] || [])];
  }, [form.category]);

  const questions = fleetQuestions[form.fleetType] || [];
  const fleetImageCount = requiredFleetImages.filter((image) => uploads[`fleet-${image}`]).length;
  const stepSlideDirection = useDirectionalStep(step);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setStepError("");
  };

  const updateAnswer = (field, value) => {
    setAnswers((current) => ({ ...current, [field]: value }));
    setStepError("");
  };

  const markUpload = (field, file) => {
    setUploads((current) => ({ ...current, [field]: file?.name || "Selected" }));
    setDocumentsSkipped(false);
    setStepError("");
  };

  const validateStep = (targetStep = step) => {
    if (targetStep === 0) {
      const missing = [];
      if (!form.name.trim()) missing.push("operator name");
      if (!form.phone.trim()) missing.push("phone number");
      if (!form.city.trim()) missing.push("city or district");
      if (!form.emergencyContact.trim()) missing.push("emergency contact");
      return missing;
    }

    if (targetStep === 1) {
      const missing = [];
      if (!form.category) missing.push("service category");
      if (!form.fleetType) missing.push("fleet type");
      return missing;
    }

    if (targetStep === 2) {
      const missing = [];
      if (!form.fleetName.trim()) missing.push("fleet name");
      if (!form.plateNumber.trim()) missing.push("plate number");
      if (!form.make.trim()) missing.push("make / brand");
      if (!form.model.trim()) missing.push("model");
      if (!form.year.trim()) missing.push("year");
      if (!form.color.trim()) missing.push("color");
      if (!form.operatingArea.trim()) missing.push("operating area");
      if (!form.homeBaseLocation.trim()) missing.push("home base");
      if (!form.baseFare.trim()) missing.push("starting price");
      if (!form.pricePerKm.trim()) missing.push("price per 1 km");
      if (!form.pricePerHour.trim()) missing.push("price per 1 hour");
      return missing;
    }

    if (targetStep === 3) {
      return questions
        .filter((question) => question.type === "number" && !String(answers[question.key] || "").trim())
        .map((question) => question.label.toLowerCase());
    }

    if (targetStep === 4) {
      if (documentsSkipped) return [];
      const missing = [];
      requiredFleetImages.forEach((image) => {
        if (!uploads[`fleet-${image}`]) missing.push(image.toLowerCase());
      });
      documents.forEach((document) => {
        if (!uploads[`doc-${document}`]) missing.push(document.toLowerCase());
      });
      return missing;
    }

    return [];
  };

  const requireCurrentStep = () => {
    const missing = validateStep();
    if (!missing.length) {
      setStepError("");
      return true;
    }

    const preview = missing.slice(0, 4).join(", ");
    const extra = missing.length > 4 ? ` and ${missing.length - 4} more` : "";
    setStepError(`Complete this stage first: ${preview}${extra}. Save keeps your progress, but Continue unlocks only after this stage is complete.`);
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

  const handleSubmit = async () => {
    if (!requireCurrentStep()) return;

    try {
      setSubmitting(true);
      setSubmitError("");
      const account = await saveOperatorAccount(buildPayload("submitted"));
      onComplete?.(account);
    } catch (error) {
      setSubmitError(error.message || "Unable to submit fleet registration.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipDocuments = () => {
    setDocumentsSkipped(true);
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
  const goToStep = (index) => {
    if (index <= maxStepReached) {
      setStep(index);
    }
  };

  return (
    <ScreenSlideTransition screenKey="transport-solo-registration-form" className="min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4 lg:px-8">
        <div className="flex w-full items-center gap-3 sm:gap-4">
          <AppBackTab
            onBack={onClose}
            label="Back to transport"
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

      <main className="grid w-full gap-5 px-3 py-4 sm:px-5 sm:py-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[300px_minmax(0,1fr)]">
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
              />
              <FormInput
                label="Phone number"
                type="tel"
                value={form.phone}
                onChange={(value) => update("phone", value)}
                placeholder="Phone number"
                autoComplete="tel"
                helper="This number is used for operator contact and account review."
              />
              <LocationInput
                label="City or district"
                value={form.city}
                onChange={(value) => update("city", value)}
                placeholder="City or district"
                helper="Start typing and choose the closest operating city or district."
              />
              <FormInput
                label="Emergency contact"
                type="tel"
                value={form.emergencyContact}
                onChange={(value) => update("emergencyContact", value)}
                placeholder="Emergency contact"
                autoComplete="tel"
                helper="A trusted contact for urgent transport safety follow-up."
              />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <SelectField
                label="Service category"
                options={categories}
                value={form.category}
                onChange={(value) => update("category", value)}
                helper="Choose what this fleet will offer to passengers."
              />
              <SelectField
                label="Fleet type"
                options={fleetTypes}
                value={form.fleetType}
                onChange={(value) => update("fleetType", value)}
                helper="This controls the safety questions and required review details."
              />
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FormInput label="Fleet name or label" value={form.fleetName} onChange={(value) => update("fleetName", value)} placeholder="Fleet name or label" helper="A short public name passengers can recognize." />
              <FormInput label="Plate number" value={form.plateNumber} onChange={(value) => update("plateNumber", value.toUpperCase())} placeholder="Plate number" helper="Use the plate exactly as shown on the fleet." />
              <FormInput label="Make / brand" value={form.make} onChange={(value) => update("make", value)} placeholder="Make or brand" />
              <FormInput label="Model" value={form.model} onChange={(value) => update("model", value)} placeholder="Model" />
              <FormInput label="Year" type="number" value={form.year} onChange={(value) => update("year", value)} placeholder="Year" min="1950" helper="Vehicle manufacture year." />
              <FormInput label="Color" value={form.color} onChange={(value) => update("color", value)} placeholder="Color" />
              <LocationInput label="Operating area" value={form.operatingArea} onChange={(value) => update("operatingArea", value)} placeholder="Operating area" helper="Main area where passengers should expect service." />
              <LocationInput label="Home base or station" value={form.homeBaseLocation} onChange={(value) => update("homeBaseLocation", value)} placeholder="Home base or station" helper="Where the fleet usually starts or parks." />
              <FormInput label="Starting price" type="number" value={form.baseFare} onChange={(value) => update("baseFare", value)} placeholder="Starting price" min="0" helper="The minimum fare shown when a distance or time total is lower than your starting price." />
              <div>
                <FormInput label="Price per 1 km or kilometer" type="number" value={form.pricePerKm} onChange={(value) => update("pricePerKm", value)} placeholder="Price for 1 km" min="0" helper="Distance bookings calculate this rate against the passenger route." />
                <PricingGuide
                  type="km"
                  open={activePricingGuide === "km"}
                  onToggle={() => setActivePricingGuide((current) => (current === "km" ? "" : "km"))}
                  onViewOneKm={handleViewOneKm}
                  disabled={savingDraft}
                />
              </div>
              <div>
                <FormInput label="Price per 1 hour" type="number" value={form.pricePerHour} onChange={(value) => update("pricePerHour", value)} placeholder="Price for 1 hour" min="0" helper="Time bookings calculate this rate against the passenger's requested hours." />
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
                {questions.map((question) => (
                  <label key={question.key} className="block rounded-2xl border border-gray-100 p-4">
                    <span className="text-sm font-semibold text-gray-900">{question.label}</span>
                    {question.type === "number" ? (
                      <input
                        type="number"
                        min="0"
                        value={answers[question.key] || ""}
                        onChange={(event) => updateAnswer(question.key, event.target.value)}
                        placeholder="0"
                        className="mt-3 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-green-500"
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
                  </label>
                ))}
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
                  {requiredFleetImages.map((image) => (
                    <UploadField
                      key={image}
                      label={image}
                      value={uploads[`fleet-${image}`]}
                      onChange={(file) => markUpload(`fleet-${image}`, file)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-bold text-gray-950">Documents</h2>
                    <p className="text-xs text-gray-500">Upload PDF or image files for review.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSkipWarning(true)}
                    className="h-10 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-800 hover:bg-amber-100"
                  >
                    Skip for now
                  </button>
                </div>
                {documentsSkipped && (
                  <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                    Documents skipped. You can access the dashboard, but your account will be marked unverified.
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {documents.map((document) => (
                    <UploadField
                      key={document}
                      label={document}
                      value={uploads[`doc-${document}`]}
                      onChange={(file) => markUpload(`doc-${document}`, file)}
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
                        label={`Additional document ${item}`}
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
                <ReviewRow label="Fleet images" value={`${fleetImageCount}/4 uploaded`} />
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

      {showSkipWarning && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 px-3 py-3 sm:items-center sm:justify-center">
          <section className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-md">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="mt-1 shrink-0 text-amber-600" size={22} />
              <div>
                <h2 className="text-lg font-black text-gray-950">Skip documents?</h2>
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
          </section>
        </div>
      )}

      {showSafetyWarning && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 px-3 py-3 sm:items-center sm:justify-center">
          <section className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-lg">
            <div className="flex items-start gap-3">
              <FiShield className="mt-1 shrink-0 text-green-700" size={22} />
              <div>
                <h2 className="text-lg font-black text-gray-950">Confirm safety answers</h2>
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
          </section>
        </div>
      )}

      {showSaveCheckpoint && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 px-3 py-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <section className="kt-modal-enter w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-lg">
            <div className="flex items-start gap-3">
              <FiCheckCircle className="mt-1 shrink-0 text-green-700" size={23} />
              <div>
                <h2 className="text-lg font-black text-gray-950">Your information has been saved</h2>
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
          </section>
        </div>
      )}

      {showReviewSaveWarning && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 px-3 py-3 sm:items-center sm:justify-center">
          <section className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-lg">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="mt-1 shrink-0 text-amber-600" size={22} />
              <div>
                <h2 className="text-lg font-black text-gray-950">Before final review</h2>
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
                onClick={async () => {
                  try {
                    setShowReviewSaveWarning(false);
                    await saveOperatorDraft(buildPayload("draft"));
                    handleSubmit();
                  } catch (error) {
                    setSubmitError(error.message || "Unable to save this fleet draft.");
                  }
                }}
                className="h-11 rounded-2xl bg-green-600 text-sm font-bold text-white"
              >
                Save and continue
              </button>
            </div>
          </section>
        </div>
      )}
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

function FormInput({ label, value, onChange, type = "text", placeholder = "", helper = "", ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <input
        {...props}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
      />
      {helper ? <span className="mt-2 block text-xs font-medium leading-5 text-gray-500">{helper}</span> : null}
    </label>
  );
}

function LocationInput({ label, value, onChange, placeholder = "", helper = "" }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <input
        value={value}
        list="transport-location-suggestions"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
      />
      <datalist id="transport-location-suggestions">
        {locationSuggestions.map((location) => (
          <option key={location} value={location} />
        ))}
      </datalist>
      {helper ? <span className="mt-2 block text-xs font-medium leading-5 text-gray-500">{helper}</span> : null}
    </label>
  );
}

function SelectField({ label, options, value, onChange, helper = "" }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-700 outline-none transition focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
      >
        {!value ? <option value="">Select {label.toLowerCase()}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {helper ? <span className="mt-2 block text-xs font-medium leading-5 text-gray-500">{helper}</span> : null}
    </label>
  );
}

function UploadField({ label, value, onChange }) {
  return (
    <label className="block cursor-pointer rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 hover:border-green-300 hover:bg-green-50 transition">
      <input
        type="file"
        accept="image/*,.pdf"
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0])}
      />
      <span className="flex min-w-0 items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-full bg-white text-gray-700 flex items-center justify-center">
          <FiCamera size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">{label}</span>
          <span className="block truncate text-xs text-gray-500">{value || "Upload or take photo"}</span>
        </span>
      </span>
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
