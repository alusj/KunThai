import { useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiArrowLeft,
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
import {
  getOperatorDraft,
  saveOperatorAccount,
  saveOperatorDraft,
} from "../../services/transportOperatorAccountService";

const categories = ["Transport", "Delivery", "Both"];
const fleetTypes = ["Car", "Motorcycle", "Tricycle"];
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
  priceHint: "",
  homeBaseLocation: "",
  deliveryBodyType: "",
};

export default function FleetRegistrationDrawer({ onClose, onComplete }) {
  const draft = getOperatorDraft();
  const [step, setStep] = useState(draft?.step || 0);
  const [operatorId] = useState(draft?.operatorId || generateOperatorId);
  const [answers, setAnswers] = useState(draft?.answers || {});
  const [uploads, setUploads] = useState(draft?.uploads || {});
  const [documentsSkipped, setDocumentsSkipped] = useState(Boolean(draft?.documentsSkipped));
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [form, setForm] = useState({
    ...defaultForm,
    ...(draft?.form || {}),
  });

  const documents = useMemo(() => {
    return [...baseDocuments, ...(categoryDocuments[form.category] || [])];
  }, [form.category]);

  const questions = fleetQuestions[form.fleetType] || [];
  const fleetImageCount = requiredFleetImages.filter((image) => uploads[`fleet-${image}`]).length;

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateAnswer = (field, value) => {
    setAnswers((current) => ({ ...current, [field]: value }));
  };

  const markUpload = (field, file) => {
    setUploads((current) => ({ ...current, [field]: file?.name || "Selected" }));
    setDocumentsSkipped(false);
  };

  const buildPayload = (status = "draft") => ({
    operatorId,
    displayCode: `KT-${operatorId}`,
    step,
    form,
    answers,
    uploads,
    documentsSkipped,
    verificationStatus: documentsSkipped ? "notVerified" : "pending",
    status,
    savedAt: new Date().toISOString(),
  });

  const handleSave = () => {
    saveOperatorDraft(buildPayload("draft"));
    setSavedMessage("Saved");
    window.setTimeout(() => setSavedMessage(""), 1600);
  };

  const handleSubmit = () => {
    const account = saveOperatorAccount(buildPayload("submitted"));
    onComplete?.(account);
  };

  const handleSkipDocuments = () => {
    setDocumentsSkipped(true);
    setShowSkipWarning(false);
    setStep(5);
  };

  const nextStep = () => setStep((current) => Math.min(current + 1, steps.length - 1));
  const prevStep = () => setStep((current) => Math.max(current - 1, 0));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="mx-auto flex max-w-7xl items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 shrink-0 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 transition"
            aria-label="Back to transport"
          >
            <FiArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-gray-950">Fleet Registration</h1>
            <p className="hidden truncate text-xs text-gray-500 sm:block">
              Operator ID KT-{operatorId} will be searchable after submission.
            </p>
          </div>
          {savedMessage && (
            <span className="hidden rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700 sm:inline-flex">
              {savedMessage}
            </span>
          )}
          <div className="shrink-0 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 sm:px-3">
            Step {step + 1} of {steps.length}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:px-4 sm:py-5 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:h-fit">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm sm:grid-cols-3 sm:p-3 lg:grid-cols-1">
            {steps.map((item, index) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setStep(index)}
                className={`min-h-12 rounded-2xl border px-2 py-2 text-xs font-semibold transition sm:px-3 sm:py-3 lg:text-left ${
                  step === index
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-100 bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                <span className="flex min-w-0 items-center justify-center gap-2 lg:justify-start">
                  <item.icon size={16} />
                  <span className="truncate">{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormInput label="Operator name" value={form.name} onChange={(value) => update("name", value)} />
              <FormInput label="Phone number" value={form.phone} onChange={(value) => update("phone", value)} />
              <FormInput label="City or district" value={form.city} onChange={(value) => update("city", value)} />
              <FormInput label="Emergency contact" value={form.emergencyContact} onChange={(value) => update("emergencyContact", value)} />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <SelectField
                label="Service category"
                options={categories}
                value={form.category}
                onChange={(value) => update("category", value)}
              />
              <SelectField
                label="Fleet type"
                options={fleetTypes}
                value={form.fleetType}
                onChange={(value) => update("fleetType", value)}
              />
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FormInput label="Fleet name or label" value={form.fleetName} onChange={(value) => update("fleetName", value)} />
              <FormInput label="Plate number" value={form.plateNumber} onChange={(value) => update("plateNumber", value)} />
              <FormInput label="Make / brand" value={form.make} onChange={(value) => update("make", value)} />
              <FormInput label="Model" value={form.model} onChange={(value) => update("model", value)} />
              <FormInput label="Year" value={form.year} onChange={(value) => update("year", value)} />
              <FormInput label="Color" value={form.color} onChange={(value) => update("color", value)} />
              <FormInput label="Operating area" value={form.operatingArea} onChange={(value) => update("operatingArea", value)} />
              <FormInput label="Home base or station" value={form.homeBaseLocation} onChange={(value) => update("homeBaseLocation", value)} />
              <FormInput label="Base fare" value={form.baseFare} onChange={(value) => update("baseFare", value)} />
              <FormInput label="Passenger price hint" value={form.priceHint} onChange={(value) => update("priceHint", value)} />
              <ChoiceGroup
                label="Availability"
                options={["Full-time", "Part-time", "Scheduled"]}
                value={form.availability}
                onChange={(value) => update("availability", value)}
              />
              {form.fleetType === "Car" && (
                <>
                  <FormInput label="Fuel type" value={form.fuelType} onChange={(value) => update("fuelType", value)} />
                  <FormInput label="Car body type" value={form.carBodyType} onChange={(value) => update("carBodyType", value)} />
                </>
              )}
              {(form.category === "Delivery" || form.category === "Both") && (
                <FormInput label="Estimated max load" value={form.maxLoad} onChange={(value) => update("maxLoad", value)} />
              )}
              {(form.category === "Delivery" || form.category === "Both") && form.fleetType === "Tricycle" && (
                <FormInput label="Delivery booth type" value={form.deliveryBodyType} onChange={(value) => update("deliveryBodyType", value)} />
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
                <ReviewRow label="Price hint" value={form.priceHint || "Not filled"} />
                <ReviewRow label="Fleet images" value={`${fleetImageCount}/4 uploaded`} />
                <ReviewRow
                  label="Current status"
                  value={documentsSkipped ? "Unverified - documents skipped" : "Verification Pending"}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
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
                className="h-11 w-full rounded-2xl border border-green-200 bg-green-50 px-5 text-sm font-semibold text-green-700 hover:bg-green-100 transition sm:w-auto"
              >
                Save
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
                onClick={handleSubmit}
                className="h-11 w-full rounded-2xl bg-green-600 px-5 text-sm font-semibold text-white hover:bg-green-700 transition sm:w-auto"
              >
                Submit Registration
              </button>
            )}
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
    </div>
  );
}

function FormInput({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium outline-none transition focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
      />
    </label>
  );
}

function ChoiceGroup({ label, options, value, onChange }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-800">{label}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`min-h-12 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
              value === option
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectField({ label, options, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-700 outline-none transition focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
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
