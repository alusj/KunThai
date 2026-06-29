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
import { ScreenSlideTransition, StepSlideTransition } from "../../shared/motion";
import { useDirectionalStep } from "../../shared/motionHooks";
import NearbyAreaScreen from "../NearbyAreaScreen";
import {
  getActiveCountryProfile,
  getCountryPhonePlaceholder,
  storeCountryContext,
} from "../../../data/westAfricanCountryProfiles";

const steps = [
  { label: "Company", icon: FiBriefcase },
  { label: "Location", icon: FiMapPin },
  { label: "Fleets", icon: FiTruck },
  { label: "Review", icon: FiCheckCircle },
];

const fleetTypes = ["Motorbike", "Tricycle", "Taxi", "Van"];
const serviceCategories = ["Ride only", "Delivery only", "Ride and delivery"];
const companyTypes = ["Transport company", "Delivery company", "Taxi union", "Bike riders group", "Community fleet", "Other organization"];
const companyDocuments = ["Business registration", "Transport permit", "Tax or business ID", "Owner national ID"];
const fleetDocuments = [
  "Vehicle registration",
  "Insurance document",
  "Road worthiness or inspection certificate",
  "Passenger interior or seating photo",
];
const requiredFleetImages = ["Front view", "Back view", "Left side", "Right side"];
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
    city: profile.city || "",
    address: profile.address || "",
    coordinates: null,
    operatingAreas: [],
    supportPolicy: "",
    documents: {},
  };
}

function createFleetDraft(index = 0) {
  return {
    localId: `fleet-${Date.now()}-${index}`,
    fleetCode: createTransportCompanyFleetCode(),
    fleetType: fleetTypes[index % fleetTypes.length],
    serviceCategory: "Ride and delivery",
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
    safetyAnswers: createSafetyAnswers(fleetTypes[index % fleetTypes.length]),
    operators: [],
    status: "pending_review",
  };
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

export default function CompanyRegistrationScreen({ existingCompany = null, mode = "full", onBack, onComplete, onSaveExit }) {
  const addOperatorMode = mode === "addOperator";
  const [step, setStep] = useState(() => (addOperatorMode ? 2 : 0));
  const [maxStepReached, setMaxStepReached] = useState(() => (addOperatorMode ? 2 : 0));
  const [form, setForm] = useState(() => createCompanyForm());
  const [fleets, setFleets] = useState(() => [createFleetDraft(0)]);
  const [areaText, setAreaText] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [transitionOrigin, setTransitionOrigin] = useState({ x: "50%", y: "70%" });
  const [locationPickerMode, setLocationPickerMode] = useState(null);
  const [locationCautionOpen, setLocationCautionOpen] = useState(false);
  const [saveCheckpointOpen, setSaveCheckpointOpen] = useState(false);
  const stepDirection = useDirectionalStep(step);
  const hasLocation = Boolean(form.coordinates?.latitude || form.coordinates?.lat);
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

    async function loadContext() {
      const profile = await getOnboardingProfile().catch(() => null);
      const draft = await getTransportCompanyDraft().catch(() => null);
      if (!alive) return;

      const source = existingCompany || (addOperatorMode ? null : draft);
      if (source?.companyName || source?.company?.companyName) {
        const company = source.company || source;
        setForm({
          ...createCompanyForm(profile || {}),
          ...company,
          ownerPublicId: company.ownerPublicId || getKunThaiPublicUserId({ ...(profile || {}), userId: source.userId }),
          documents: company.documents || {},
        });
        setFleets(addOperatorMode
          ? [createFleetDraft(0)]
          : ((source.fleets || [createFleetDraft(0)]).length ? source.fleets : [createFleetDraft(0)]));
        setAreaText((company.operatingAreas || []).join(", "));
        setStep(addOperatorMode ? 2 : source.step || 0);
        setMaxStepReached(addOperatorMode ? 2 : source.maxStepReached || source.step || 0);
        return;
      }

      setForm(createCompanyForm(profile || {}));
    }

    loadContext();
    return () => {
      alive = false;
    };
  }, [addOperatorMode, existingCompany]);

  const completion = useMemo(() => {
    const companyReady = Boolean(form.companyName && form.ownerName && form.phone);
    const locationReady = Boolean(form.country && form.city && form.address && hasLocation);
    const fleetReady = fleets.some((fleet) => fleet.fleetType && fleet.plateNumber && fleet.documents?.["Fleet registration"]);
    const documentReady = companyDocuments.some((document) => form.documents?.[document]);
    return [
      companyReady,
      locationReady,
      fleetReady,
      documentReady,
    ].filter(Boolean).length;
  }, [fleets, form, hasLocation]);

  function updateForm(field, value) {
    if (field === "country") storeCountryContext(value);
    setForm((current) => ({ ...current, [field]: value }));
    setStatus("");
  }

  function markCompanyDocument(document, file) {
    setForm((current) => ({
      ...current,
      documents: {
        ...current.documents,
        [document]: file?.name || "Selected",
      },
    }));
  }

  function updateFleet(fleetId, patch) {
    setFleets((items) => items.map((fleet) => (fleet.localId === fleetId ? { ...fleet, ...patch } : fleet)));
    setStatus("");
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
  }

  function addFleet() {
    setFleets((items) => [...items, createFleetDraft(items.length)]);
  }

  function removeFleet(fleetId) {
    setFleets((items) => (items.length <= 1 ? items : items.filter((fleet) => fleet.localId !== fleetId)));
  }

  function addOperatorInvite(fleetId, operator) {
    if (compactPublicId(operator.publicId) && compactPublicId(operator.publicId) === compactPublicId(form.ownerPublicId)) {
      setStatus("Use the selected fleet operator's KunThai ID. The company owner does not receive operator invitation requests.");
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
  }

  function validateStep(targetStep = step) {
    if (targetStep === 0) {
      if (!form.companyName.trim()) return "Enter the company or organization name.";
      if (!form.ownerName.trim()) return "Enter the responsible owner or director name.";
      if (!form.phone.trim()) return "Enter a support phone number.";
    }

    if (targetStep === 1) {
      if (!form.city.trim() || !form.address.trim()) return "Add the company base address.";
      if (!hasLocation) return "Use Locate Me or Drop Pin so KunThai can verify the company base on the map.";
    }

    if (targetStep === 2) {
      if (!fleets.length) return "Add at least one fleet.";
      const incompleteFleet = fleets.find((fleet) => [
        fleet.fleetName,
        fleet.plateNumber,
        fleet.make,
        fleet.model,
        fleet.year,
        fleet.color,
        fleet.operatingArea,
        fleet.homeBase,
        fleet.baseFare,
        fleet.pricePerKm,
        fleet.pricePerHour,
      ].some((value) => !String(value || "").trim()));
      if (incompleteFleet) return "Each fleet needs its name, plate, make, model, year, color, operating area, home base, starting price, per-kilometre price, and hourly price.";
      const missingImageFleet = fleets.find((fleet) => requiredFleetImages.some((image) => !fleet.documents?.[fleetImageDocumentKey(image)]));
      if (missingImageFleet) return "Upload the front, back, left-side, and right-side image for every fleet.";
      const missingDocumentFleet = fleets.find((fleet) => fleetDocuments.some((document) => !fleet.documents?.[document]));
      if (missingDocumentFleet) return "Upload all required vehicle documents for every fleet.";
      const incompleteSafetyFleet = fleets.find((fleet) => (fleetSafetyQuestions[fleet.fleetType] || []).some((question) => !String(fleet.safetyAnswers?.[question.key] || "").trim()));
      if (incompleteSafetyFleet) return "Answer every security and safety question for each fleet.";
      if (addOperatorMode && fleets.some((fleet) => !(fleet.operators || []).length)) {
        return "Add the operator's KunThai ID before sending the company request.";
      }
    }

    return "";
  }

  function nextStep() {
    const error = validateStep();
    if (error) {
      setStatus(error);
      return;
    }

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
      setStatus("Company draft saved. You can continue from this same step.");
      return true;
    } catch (error) {
      setStatus(error.message || "Unable to save company draft.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    const saved = await saveDraft();
    if (saved) setSaveCheckpointOpen(true);
  }

  function continueAfterSave() {
    setSaveCheckpointOpen(false);
    setStatus("Company draft saved. You can continue from this same step.");
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
    const firstError = (addOperatorMode ? [2] : [0, 1, 2]).map(validateStep).find(Boolean);
    if (firstError) {
      setStatus(firstError);
      return;
    }

    try {
      setSubmitting(true);
      const account = await saveTransportCompanyAccount(buildPayload("submitted"));
      setTransitionOrigin(origin);
      setFinishing(true);
      await new Promise((resolve) => window.setTimeout(resolve, 480));
      onComplete?.(account, origin);
    } catch (error) {
      setStatus(error.message || "Unable to submit company registration.");
    } finally {
      setSubmitting(false);
    }
  }

  function acceptLocation(location) {
    setForm((current) => ({
      ...current,
      address: location.address || current.address,
      city: location.city || current.city,
      country: location.country || current.country,
      coordinates: {
        latitude: location.lat,
        longitude: location.lng,
      },
    }));
    setLocationPickerMode(null);
    setLocationCautionOpen(false);
    setStatus(`Company base set to ${location.address || "selected map point"}.`);
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
            <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold leading-6 text-blue-800">
              {status}
            </div>
          ) : null}

          <StepSlideTransition stepKey={step} direction={stepDirection}>
            {step === 0 ? (
              <CompanyIdentityStep form={form} onChange={updateForm} onDocument={markCompanyDocument} />
            ) : null}
            {step === 1 ? (
              <LocationOperationsStep
                areaText={areaText}
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
                onAddFleet={addFleet}
                onInvite={addOperatorInvite}
                onRemoveFleet={removeFleet}
                onUpdateFleet={updateFleet}
                onUploadFleetDocument={markFleetDocument}
              />
            ) : null}
            {step === 3 ? (
              <CompanyReviewStep form={{ ...form, operatingAreas: splitAreas(areaText) }} fleets={fleets} />
            ) : null}
          </StepSlideTransition>

          <div className="mt-6 border-t border-slate-100 pt-4">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-4 py-5 backdrop-blur-sm sm:items-center">
          <section className="kt-modal-enter w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <FiCheckCircle className="mt-1 shrink-0 text-blue-700" size={23} />
              <div>
                <h2 className="text-lg font-black text-slate-950">Your information has been saved</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  When you return to company registration, KunThai will continue from this same step. Choose Save if you want to leave the form now, or Continue if you want to keep completing it.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={saveAndExit}
                className="h-11 rounded-2xl border border-blue-200 bg-blue-50 text-sm font-black text-blue-700 hover:bg-blue-100"
              >
                Save
              </button>
              <button
                type="button"
                onClick={continueAfterSave}
                className="h-11 rounded-2xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </ScreenSlideTransition>
  );
}

function CompanyIdentityStep({ form, onChange, onDocument }) {
  const countryProfile = getActiveCountryProfile(form.country);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Company profile</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Register the organization that owns or manages these fleets.</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput label="Company / organization name" value={form.companyName} onChange={(value) => onChange("companyName", value)} placeholder="Example: ABC Transport SL" />
        <SelectField label="Company type" value={form.companyType} options={companyTypes} onChange={(value) => onChange("companyType", value)} />
        <FormInput label="Business registration number" value={form.registrationNumber} onChange={(value) => onChange("registrationNumber", value)} placeholder="Registration number" />
        <FormInput label="Tax or business ID optional" value={form.taxId} onChange={(value) => onChange("taxId", value)} placeholder="Tax ID" />
        <FormInput label="Owner / director name" value={form.ownerName} onChange={(value) => onChange("ownerName", value)} placeholder="Responsible person" />
        <FormInput label="Support phone" type="tel" value={form.phone} onChange={(value) => onChange("phone", value)} placeholder={getCountryPhonePlaceholder(countryProfile)} />
        <FormInput label="Business email optional" type="email" value={form.email} onChange={(value) => onChange("email", value)} placeholder="company@example.com" />
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">Owner KunThai ID</span>
          <input value={form.ownerPublicId} readOnly className="h-12 w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 text-sm font-black text-blue-800 outline-none" />
          <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">Use this ID when adding company admins, fleet managers, or operator invitations.</span>
        </label>
      </div>
      <DocumentGrid documents={companyDocuments} uploads={form.documents} onUpload={onDocument} />
    </div>
  );
}

function LocationOperationsStep({ areaText, form, hasLocation, onAreaText, onChange, onDropPin, onLocateMe }) {
  const countryProfile = getActiveCountryProfile(form.country);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Company base</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Set the verified location passengers and operators can trust.</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput label="Country" value={form.country} onChange={(value) => onChange("country", value)} placeholder={countryProfile.name} />
        <FormInput label="City / district" value={form.city} onChange={(value) => onChange("city", value)} placeholder={countryProfile.cityPlaceholder} />
        <div className="md:col-span-2">
          <FormInput label="Office, station, or dispatch address" value={form.address} onChange={(value) => onChange("address", value)} placeholder="Street, junction, station, or yard" />
        </div>
      </div>
      <div className={`rounded-3xl border p-4 ${hasLocation ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
        <div className="flex items-start gap-3">
          {hasLocation ? <FiCheckCircle className="mt-1 text-emerald-700" /> : <FiAlertTriangle className="mt-1 text-amber-700" />}
          <div className="min-w-0 flex-1">
            <h3 className={`font-black ${hasLocation ? "text-emerald-900" : "text-amber-900"}`}>
              {hasLocation ? "Company base is mapped" : "Map location needed"}
            </h3>
            <p className={`mt-1 text-sm font-semibold leading-6 ${hasLocation ? "text-emerald-800" : "text-amber-800"}`}>
              {hasLocation
                ? "KunThai can review the exact company base using the selected map point."
                : "Use Locate Me if you are at the company base, or Drop Pin if you need to place it manually."}
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
      <FormInput label="Operating areas" value={areaText} onChange={onAreaText} placeholder="Lumley, Aberdeen, Waterloo" helper="Separate areas with commas." />
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

function FleetBuilderStep({ acceptedOperators = [], allowMultiple = true, fleets, onAddFleet, onInvite, onRemoveFleet, onUpdateFleet, onUploadFleetDocument }) {
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
            acceptedPublicIds={acceptedPublicIds}
            index={index}
            onInvite={onInvite}
            onRemove={onRemoveFleet}
            onUpdate={onUpdateFleet}
            onUploadDocument={onUploadFleetDocument}
            removable={fleets.length > 1}
          />
        ))}
      </div>
    </div>
  );
}

function FleetCard({ acceptedPublicIds = [], fleet, index, onInvite, onRemove, onUpdate, onUploadDocument, removable }) {
  const [operatorId, setOperatorId] = useState("");
  const [lookupStatus, setLookupStatus] = useState("");
  const [operatorMatch, setOperatorMatch] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);

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
        <SelectField label="Fleet type" value={fleet.fleetType} options={fleetTypes} onChange={(value) => onUpdate(fleet.localId, { fleetType: value, safetyAnswers: createSafetyAnswers(value) })} />
        <SelectField label="Service category" value={fleet.serviceCategory} options={serviceCategories} onChange={(value) => onUpdate(fleet.localId, { serviceCategory: value })} />
        <FormInput label="Fleet name" value={fleet.fleetName} onChange={(value) => onUpdate(fleet.localId, { fleetName: value })} placeholder="Example: Lumley taxi 01" />
        <FormInput label="Plate number" value={fleet.plateNumber} onChange={(value) => onUpdate(fleet.localId, { plateNumber: value.toUpperCase() })} placeholder="Plate number" />
        <FormInput label="Make / brand" value={fleet.make} onChange={(value) => onUpdate(fleet.localId, { make: value })} placeholder="Make or brand" />
        <FormInput label="Model" value={fleet.model} onChange={(value) => onUpdate(fleet.localId, { model: value })} placeholder="Model" />
        <FormInput label="Year" type="number" value={fleet.year} onChange={(value) => onUpdate(fleet.localId, { year: value })} placeholder="Year" />
        <FormInput label="Color" value={fleet.color} onChange={(value) => onUpdate(fleet.localId, { color: value })} placeholder="Color" />
        <FormInput label="Operating area" value={fleet.operatingArea} onChange={(value) => onUpdate(fleet.localId, { operatingArea: value })} placeholder="Main service area" />
        <FormInput label="Home base" value={fleet.homeBase} onChange={(value) => onUpdate(fleet.localId, { homeBase: value })} placeholder="Station, park, or yard" />
      </div>
      <section className="mt-5 rounded-3xl border border-blue-100 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Passenger pricing · company owner</p>
        <h4 className="mt-1 text-lg font-black text-slate-950">Set the prices passengers will see</h4>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">The company owner or CEO controls these prices. The assigned operator can manage availability and trips, but cannot replace company pricing.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FormInput label="Starting price" type="number" value={fleet.baseFare} onChange={(value) => onUpdate(fleet.localId, { baseFare: value })} placeholder="0" />
          <FormInput label="Price per 1 km" type="number" value={fleet.pricePerKm} onChange={(value) => onUpdate(fleet.localId, { pricePerKm: value })} placeholder="0" />
          <FormInput label="Price per 1 hour" type="number" value={fleet.pricePerHour} onChange={(value) => onUpdate(fleet.localId, { pricePerHour: value })} placeholder="0" />
          <FormInput label="Passenger price note optional" value={fleet.priceHint} onChange={(value) => onUpdate(fleet.localId, { priceHint: value })} placeholder="Example: final fare confirmed in booking" />
        </div>
      </section>
      <FleetImagesSection fleet={fleet} onUploadDocument={onUploadDocument} />
      <section className="mt-5">
        <h4 className="font-black text-slate-950">Required vehicle documents</h4>
        <p className="mt-1 text-xs font-semibold text-slate-500">Use clear PDF or image files, matching the sole-operator document style.</p>
        <DocumentGrid documents={fleetDocuments} uploads={fleet.documents} onUpload={(document, file) => onUploadDocument(fleet.localId, document, file)} />
      </section>
      <FleetSafetySection fleet={fleet} onUpdate={onUpdate} />

      <div className="mt-5 rounded-3xl border border-blue-100 bg-white p-4">
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

function FleetImagesSection({ fleet, onUploadDocument }) {
  const imageCount = requiredFleetImages.filter((image) => fleet.documents?.[fleetImageDocumentKey(image)]).length;
  return (
    <section className="mt-5 rounded-3xl border border-slate-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-slate-950">Required fleet images</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">Upload at least front, back, left side, and right side views.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{imageCount}/4</span>
      </div>
      <DocumentGrid
        documents={requiredFleetImages.map(fleetImageDocumentKey)}
        uploads={fleet.documents}
        onUpload={(document, file) => onUploadDocument(fleet.localId, document, file)}
      />
    </section>
  );
}

function FleetSafetySection({ fleet, onUpdate }) {
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
        {questions.map((question) => (
          <label key={question.key} className="rounded-2xl border border-amber-100 bg-white p-3">
            <span className="text-sm font-bold text-slate-800">{question.label}</span>
            {question.type === "number" ? (
              <input type="number" min="0" value={answers[question.key] || ""} onChange={(event) => updateAnswer(question.key, event.target.value)} placeholder="0" className="mt-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
            ) : (
              <select value={answers[question.key] || "Yes"} onChange={(event) => updateAnswer(question.key, event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500">
                <option>Yes</option><option>No</option><option>Needs admin check</option>
              </select>
            )}
          </label>
        ))}
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
      {documents.map((document) => (
        <UploadField key={document} label={document} value={uploads?.[document]} onChange={(file) => onUpload(document, file)} />
      ))}
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

function FormInput({ helper = "", label, onChange, placeholder = "", type = "text", value }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
      {helper ? <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">{helper}</span> : null}
    </label>
  );
}

function SelectField({ label, onChange, options, value }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
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
