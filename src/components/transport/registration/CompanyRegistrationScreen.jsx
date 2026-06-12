import { useEffect, useMemo, useState } from "react";
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
const fleetDocuments = ["Fleet registration", "Insurance", "Roadworthiness", "Fleet photos"];
const operatorDocuments = ["Driver or rider license", "National ID", "Selfie"];

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
    fleetCode: "",
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
    documents: {},
    safetyAnswers: {},
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

export default function CompanyRegistrationScreen({ existingCompany = null, onBack, onComplete, onSaveExit }) {
  const [step, setStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [form, setForm] = useState(() => createCompanyForm());
  const [fleets, setFleets] = useState(() => [createFleetDraft(0)]);
  const [areaText, setAreaText] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locationPickerMode, setLocationPickerMode] = useState(null);
  const [locationCautionOpen, setLocationCautionOpen] = useState(false);
  const [saveCheckpointOpen, setSaveCheckpointOpen] = useState(false);
  const stepDirection = useDirectionalStep(step);
  const hasLocation = Boolean(form.coordinates?.latitude || form.coordinates?.lat);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadContext() {
      const profile = await getOnboardingProfile().catch(() => null);
      const draft = await getTransportCompanyDraft().catch(() => null);
      if (!alive) return;

      const source = existingCompany || draft;
      if (source?.companyName || source?.company?.companyName) {
        const company = source.company || source;
        setForm({
          ...createCompanyForm(profile || {}),
          ...company,
          ownerPublicId: company.ownerPublicId || getKunThaiPublicUserId({ ...(profile || {}), userId: source.userId }),
          documents: company.documents || {},
        });
        setFleets((source.fleets || [createFleetDraft(0)]).length ? source.fleets : [createFleetDraft(0)]);
        setAreaText((company.operatingAreas || []).join(", "));
        setStep(source.step || 0);
        setMaxStepReached(source.maxStepReached || source.step || 0);
        return;
      }

      setForm(createCompanyForm(profile || {}));
    }

    loadContext();
    return () => {
      alive = false;
    };
  }, [existingCompany]);

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
                [document]: file?.name || "Selected",
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
    const request = {
      requestId: `invite-${Date.now()}`,
      operatorId: operator.id,
      userId: operator.userId,
      publicId: operator.publicId,
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

  function updateOperatorInvite(fleetId, requestId, patch) {
    setFleets((items) =>
      items.map((fleet) =>
        fleet.localId === fleetId
          ? {
              ...fleet,
              operators: (fleet.operators || []).map((operator) =>
                operator.requestId === requestId ? { ...operator, ...patch } : operator,
              ),
            }
          : fleet,
      ),
    );
  }

  function markOperatorDocument(fleetId, requestId, document, file) {
    setFleets((items) =>
      items.map((fleet) =>
        fleet.localId === fleetId
          ? {
              ...fleet,
              operators: (fleet.operators || []).map((operator) =>
                operator.requestId === requestId
                  ? {
                      ...operator,
                      documents: {
                        ...operator.documents,
                        [document]: file?.name || "Selected",
                      },
                    }
                  : operator,
              ),
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
      const incompleteFleet = fleets.find((fleet) => !fleet.plateNumber.trim() || !fleet.fleetName.trim());
      if (incompleteFleet) return "Each fleet needs a fleet name and plate number.";
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
    return {
      ...form,
      operatingAreas: splitAreas(areaText),
      fleets,
      step,
      maxStepReached,
      accountStatus,
      activities: [
        {
          id: `activity-${Date.now()}`,
          title: accountStatus === "submitted" ? "Company registration submitted" : "Company draft saved",
          body: `${form.companyName || "Company"} has ${fleets.length} fleet${fleets.length === 1 ? "" : "s"} in Fleet HQ.`,
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

  async function submitCompany() {
    const firstError = [0, 1, 2].map(validateStep).find(Boolean);
    if (firstError) {
      setStatus(firstError);
      return;
    }

    try {
      setSubmitting(true);
      const account = await saveTransportCompanyAccount(buildPayload("submitted"));
      onComplete?.(account);
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
    <ScreenSlideTransition screenKey="transport-company-registration-form" className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5 lg:px-8">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label="Back to transport"
            historyKey="transport-company-registration"
            className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">Fleet HQ</p>
            <h1 className="truncate text-lg font-black text-slate-950">Company / Organization Registration</h1>
          </div>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            {completion}/4 ready
          </span>
        </div>
      </header>

      <main className="grid w-full gap-5 px-3 py-4 sm:px-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8">
        <aside className="lg:sticky lg:top-20 lg:h-fit">
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
        </aside>

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
            {step === 2 ? (
              <FleetBuilderStep
                fleets={fleets}
                onAddFleet={addFleet}
                onInvite={addOperatorInvite}
                onOperatorDocument={markOperatorDocument}
                onOperatorUpdate={updateOperatorInvite}
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
                onClick={prevStep}
                disabled={step === 0}
                className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-40"
              >
                <span className="flex items-center justify-center gap-2"><FiChevronLeft /> Back</span>
              </button>
              <div className="grid gap-2 sm:flex sm:justify-end">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="h-11 rounded-2xl border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                {step < steps.length - 1 ? (
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

function FleetBuilderStep({ fleets, onAddFleet, onInvite, onOperatorDocument, onOperatorUpdate, onRemoveFleet, onUpdateFleet, onUploadFleetDocument }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Fleet builder</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Add every company fleet and invite operators by KunThai ID.</h2>
        </div>
        <button type="button" onClick={onAddFleet} className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white">
          <span className="flex items-center justify-center gap-2"><FiPlus /> Add Fleet</span>
        </button>
      </div>
      <div className="grid gap-4">
        {fleets.map((fleet, index) => (
          <FleetCard
            key={fleet.localId}
            fleet={fleet}
            index={index}
            onInvite={onInvite}
            onOperatorDocument={onOperatorDocument}
            onOperatorUpdate={onOperatorUpdate}
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

function FleetCard({ fleet, index, onInvite, onOperatorDocument, onOperatorUpdate, onRemove, onUpdate, onUploadDocument, removable }) {
  const [operatorId, setOperatorId] = useState("");
  const [lookupStatus, setLookupStatus] = useState("");
  const [operatorMatch, setOperatorMatch] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);

  function applyLookupResult(match) {
    setOperatorMatch(match);
    setLookupStatus(match ? `Account available as ${match.name}` : "KunThai ID not found. Check the account ID and try again.");
  }

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
  }, [operatorId]);

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
        <SelectField label="Fleet type" value={fleet.fleetType} options={fleetTypes} onChange={(value) => onUpdate(fleet.localId, { fleetType: value })} />
        <SelectField label="Service category" value={fleet.serviceCategory} options={serviceCategories} onChange={(value) => onUpdate(fleet.localId, { serviceCategory: value })} />
        <FormInput label="Fleet name" value={fleet.fleetName} onChange={(value) => onUpdate(fleet.localId, { fleetName: value })} placeholder="Example: Lumley taxi 01" />
        <FormInput label="Plate number" value={fleet.plateNumber} onChange={(value) => onUpdate(fleet.localId, { plateNumber: value.toUpperCase() })} placeholder="Plate number" />
        <FormInput label="Make / brand" value={fleet.make} onChange={(value) => onUpdate(fleet.localId, { make: value })} placeholder="Make or brand" />
        <FormInput label="Model" value={fleet.model} onChange={(value) => onUpdate(fleet.localId, { model: value })} placeholder="Model" />
        <FormInput label="Year" type="number" value={fleet.year} onChange={(value) => onUpdate(fleet.localId, { year: value })} placeholder="Year" />
        <FormInput label="Color" value={fleet.color} onChange={(value) => onUpdate(fleet.localId, { color: value })} placeholder="Color" />
        <FormInput label="Home base" value={fleet.homeBase} onChange={(value) => onUpdate(fleet.localId, { homeBase: value })} placeholder="Station, park, or yard" />
      </div>
      <DocumentGrid documents={fleetDocuments} uploads={fleet.documents} onUpload={(document, file) => onUploadDocument(fleet.localId, document, file)} />

      <div className="mt-5 rounded-3xl border border-blue-100 bg-white p-4">
        <div className="flex items-start gap-3">
          <FiUserPlus className="mt-1 text-blue-700" />
          <div>
            <h4 className="font-black text-slate-950">Add operator by KunThai ID</h4>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              Paste the operator's public KunThai ID. If the operator is registered, their name appears before you send the request.
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
          {(fleet.operators || []).map((operator) => (
            <OperatorRequestCard
              key={operator.requestId}
              fleetId={fleet.localId}
              operator={operator}
              onDocument={onOperatorDocument}
              onUpdate={onOperatorUpdate}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function OperatorRequestCard({ fleetId, operator, onDocument, onUpdate }) {
  const accepted = operator.status === "accepted";
  const rejected = operator.status === "rejected";

  return (
    <div className={`rounded-2xl border p-4 ${accepted ? "border-emerald-100 bg-emerald-50" : rejected ? "border-rose-100 bg-rose-50" : "border-slate-100 bg-slate-50"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Operator request</p>
          <h5 className="mt-1 font-black text-slate-950">{operator.name}</h5>
          <p className="mt-1 text-xs font-bold text-slate-500">{operator.publicId} - {operator.status}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onUpdate(fleetId, operator.requestId, { status: "accepted" })}
            disabled={accepted}
            className="h-10 rounded-2xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => onUpdate(fleetId, operator.requestId, { status: "rejected" })}
            disabled={rejected}
            className="h-10 rounded-2xl border border-rose-200 bg-white px-4 text-xs font-black text-rose-700 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
      {accepted ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-black text-slate-800">Operator document packet</p>
          <DocumentGrid
            compact
            documents={operatorDocuments}
            uploads={operator.documents}
            onUpload={(document, file) => onDocument(fleetId, operator.requestId, document, file)}
          />
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
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{fleet.fleetType}</p>
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
  return (
    <label className="block rounded-2xl border border-dashed border-slate-200 bg-white p-3">
      <span className="flex items-center gap-2 text-sm font-black text-slate-800"><FiFileText /> {label}</span>
      <input type="file" className="mt-3 block w-full text-xs font-semibold text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-xs file:font-black file:text-white" onChange={(event) => onChange(event.target.files?.[0])} />
      {value ? <span className="mt-2 block truncate text-xs font-black text-emerald-700">{value}</span> : null}
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
