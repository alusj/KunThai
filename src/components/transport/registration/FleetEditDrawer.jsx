import { useEffect, useState } from "react";
import {
  FiAlertTriangle,
  FiCamera,
  FiCheckCircle,
  FiChevronUp,
  FiEdit2,
  FiFileText,
  FiMapPin,
  FiShield,
  FiTruck,
  FiUser,
} from "react-icons/fi";

import AppBackTab from "../../shared/AppBackTab";
import { ScreenSlideTransition } from "../../shared/motion";
import { saveOperatorAccount } from "../../services/transportOperatorAccountService";
import {
  constrainCountryPhoneInput,
  formatCountryMoney,
  getCountryPhoneHint,
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

function requirementUploadKey(prefix, requirement) {
  return `${prefix}-${requirement.key}`;
}

function legacyRequirementUploadKey(prefix, requirement) {
  return `${prefix}-${requirement.legacyLabel || requirement.label}`;
}

function getRequirementUpload(uploads, prefix, requirement) {
  return uploads[requirementUploadKey(prefix, requirement)] || uploads[legacyRequirementUploadKey(prefix, requirement)];
}

function formatFare(value, formCountry) {
  if (!value) return "Not set";
  return formatCountryMoney(value, formCountry, { maximumFractionDigits: 0 });
}

function joinParts(parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join("  •  ");
}

export default function FleetEditDrawer({ account, onBack, onSaved }) {
  const [form, setForm] = useState(() => ({ ...(account?.form || {}) }));
  const [answers, setAnswers] = useState(() => ({ ...(account?.answers || {}) }));
  const [uploads, setUploads] = useState(() => ({ ...(account?.uploads || {}) }));
  const [openIndex, setOpenIndex] = useState(-1);
  const [savedIndex, setSavedIndex] = useState(-1);
  const [savingIndex, setSavingIndex] = useState(-1);
  const [error, setError] = useState("");

  const formCountry = form.currency || form.countryCode || form.country;

  const categoryOptions = getPersonalServiceCategoryOptions(form);
  const fleetTypeOptions = getPersonalFleetTypeOptions(form, form.category);
  const fleetImageRequirements = getUrRideFleetImageRequirements({ country: form.country, countryCode: form.countryCode, category: form.category });
  const documents = getUrRideDocumentRequirements({ country: form.country, countryCode: form.countryCode, category: form.category });
  const questions = fleetQuestions[form.fleetType] || [];
  const fleetImageCount = fleetImageRequirements.filter((requirement) => getRequirementUpload(uploads, "fleet", requirement)).length;

  // Keep category and fleet type valid together when the category changes, the
  // same reconciliation the registration wizard performs.
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

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateAnswer = (key, value) => setAnswers((current) => ({ ...current, [key]: value }));
  const markUpload = (key, file) => setUploads((current) => ({ ...current, [key]: file }));

  function normalizedAnswers() {
    return questions.reduce(
      (next, question) => ({
        ...next,
        [question.key]: question.type === "select" ? answers[question.key] || "Yes" : answers[question.key] || "",
      }),
      answers,
    );
  }

  async function handleSave(index) {
    setSavingIndex(index);
    setError("");
    try {
      const updated = await saveOperatorAccount({
        operatorId: account.operatorId,
        displayCode: account.displayCode,
        step: 5,
        maxStepReached: 5,
        form,
        answers: normalizedAnswers(),
        uploads,
        documentsSkipped: account.documentsSkipped,
        verificationStatus: account.verificationStatus,
        status: account.status || "submitted",
        savedAt: new Date().toISOString(),
      });
      onSaved?.(updated);
      setOpenIndex(-1);
      setSavedIndex(index);
      window.setTimeout(() => setSavedIndex((current) => (current === index ? -1 : current)), 2600);
    } catch (saveError) {
      setError(saveError.message || "Unable to save your fleet changes.");
    } finally {
      setSavingIndex(-1);
    }
  }

  const answeredCount = questions.filter((question) => answers[question.key] != null && answers[question.key] !== "").length;

  const sections = [
    {
      key: "operator",
      title: "Operator",
      icon: FiUser,
      summary: joinParts([form.name, form.phone, form.city]) || "Not set yet",
      body: (
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput label="Operator name" value={form.name} onChange={(value) => update("name", value)} placeholder="Operator name" helper="Use the real operator name that passengers or admins can verify." />
          <FormInput label="Phone number" type="tel" value={form.phone} onChange={(value) => update("phone", constrainCountryPhoneInput(value, form.countryCode || form.country, { international: true }))} placeholder={getCountryPhoneHint(form.countryCode || form.country)} helper="This number is used for operator contact and account review." />
          <FormInput label="City or district" value={form.city} onChange={(value) => update("city", value)} placeholder="City or district" />
          <FormInput label="Emergency contact" type="tel" value={form.emergencyContact} onChange={(value) => update("emergencyContact", constrainCountryPhoneInput(value, form.countryCode || form.country, { international: true }))} placeholder={getCountryPhoneHint(form.countryCode || form.country)} helper="A trusted contact for urgent transport safety follow-up." />
        </div>
      ),
    },
    {
      key: "service",
      title: "Service",
      icon: FiTruck,
      summary: joinParts([form.category, form.fleetType]) || "Not set yet",
      body: (
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Service category" options={categoryOptions} value={form.category} onChange={(value) => update("category", value)} helper="Choose what this fleet will offer to passengers." />
          <SelectField label="Fleet type" options={fleetTypeOptions} value={form.fleetType} onChange={(value) => update("fleetType", value)} helper="This controls the safety questions and required review details." />
        </div>
      ),
    },
    {
      key: "fleet",
      title: "Fleet",
      icon: FiMapPin,
      summary: joinParts([form.fleetName || form.plateNumber, [form.make, form.model].filter(Boolean).join(" "), form.baseFare ? formatFare(form.baseFare, formCountry) : ""]) || "Not set yet",
      body: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <FormInput label="Fleet name or label" value={form.fleetName} onChange={(value) => update("fleetName", value)} placeholder="Fleet name or label" helper="A short public name passengers can recognize." />
          <FormInput label="Plate number" value={form.plateNumber} onChange={(value) => update("plateNumber", value.toUpperCase())} placeholder="Plate number" helper="Use the plate exactly as shown on the fleet." />
          <FormInput label="Make / brand" value={form.make} onChange={(value) => update("make", value)} placeholder="Make or brand" />
          <FormInput label="Model" value={form.model} onChange={(value) => update("model", value)} placeholder="Model" />
          <FormInput label="Year" type="number" value={form.year} onChange={(value) => update("year", value)} placeholder="Year" min="1950" helper="Vehicle manufacture year." />
          <FormInput label="Color" value={form.color} onChange={(value) => update("color", value)} placeholder="Color" />
          <FormInput label="Operating area" value={form.operatingArea} onChange={(value) => update("operatingArea", value)} placeholder="Operating area" />
          <FormInput label="Home base or station" value={form.homeBaseLocation} onChange={(value) => update("homeBaseLocation", value)} placeholder="Home base or station" />
          <FormInput label="Starting price" type="number" value={form.baseFare} onChange={(value) => update("baseFare", value)} placeholder="Starting price" min="0" helper="The minimum fare shown when a distance or time total is lower than your starting price." />
          <FormInput label="Price per 1 km or kilometer" type="number" value={form.pricePerKm} onChange={(value) => update("pricePerKm", value)} placeholder="Price for 1 km" min="0" helper="Distance bookings calculate this rate against the passenger route." />
          <FormInput label="Price per 1 hour" type="number" value={form.pricePerHour} onChange={(value) => update("pricePerHour", value)} placeholder="Price for 1 hour" min="0" helper="Time bookings calculate this rate against the passenger's requested hours." />
          <FormInput label="Passenger price note optional" value={form.priceHint} onChange={(value) => update("priceHint", value)} placeholder="Optional public price note" helper="Add a note only when passengers need extra context about your rates." />
          <SelectField label="Availability" options={availabilityOptions} value={form.availability} onChange={(value) => update("availability", value)} helper="Choose when this fleet is usually available." />
          {form.fleetType === "Car" ? (
            <>
              <SelectField label="Fuel type" options={fuelTypes} value={form.fuelType} onChange={(value) => update("fuelType", value)} />
              <SelectField label="Car body type" options={carBodyTypes} value={form.carBodyType} onChange={(value) => update("carBodyType", value)} />
            </>
          ) : null}
          {form.category === "Delivery" || form.category === "Both" ? (
            <FormInput label="Estimated max load" value={form.maxLoad} onChange={(value) => update("maxLoad", value)} placeholder="Estimated max load" />
          ) : null}
          {(form.category === "Delivery" || form.category === "Both") && form.fleetType === "Tricycle" ? (
            <SelectField label="Delivery booth type" options={deliveryBodyTypes} value={form.deliveryBodyType} onChange={(value) => update("deliveryBodyType", value)} />
          ) : null}
        </div>
      ),
    },
    {
      key: "safety",
      title: "Safety",
      icon: FiShield,
      summary: questions.length ? `${answeredCount}/${questions.length} safety answers` : "No safety questions for this fleet type",
      body: (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="mt-1 text-amber-700" size={19} />
              <div>
                <h3 className="font-semibold text-amber-900">Conditional safety questions</h3>
                <p className="mt-1 text-sm text-amber-800">These questions change for car, motorcycle, and tricycle fleets.</p>
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
      ),
    },
    {
      key: "documents",
      title: "Documents",
      icon: FiFileText,
      summary: "Upload new files only to replace existing ones",
      body: (
        <div className="space-y-5">
          <section>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-gray-950">Fleet images</h3>
                <p className="text-xs text-gray-500">Upload a new image only if you want to replace the current one.</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">{fleetImageCount}/{fleetImageRequirements.length}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {fleetImageRequirements.map((requirement) => (
                <UploadField
                  key={requirement.key}
                  label={formatDocumentRequirementLabel(requirement)}
                  value={getRequirementUpload(uploads, "fleet", requirement)}
                  onChange={(file) => markUpload(requirementUploadKey("fleet", requirement), file)}
                />
              ))}
            </div>
          </section>
          <section>
            <div className="mb-3">
              <h3 className="font-bold text-gray-950">Documents</h3>
              <p className="text-xs text-gray-500">Upload PDF or image files for review.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {documents.map((requirement) => (
                <UploadField
                  key={requirement.key}
                  label={formatDocumentRequirementLabel(requirement)}
                  value={getRequirementUpload(uploads, "doc", requirement)}
                  onChange={(file) => markUpload(requirementUploadKey("doc", requirement), file)}
                />
              ))}
            </div>
            <div className="mt-5">
              <h4 className="font-bold text-gray-950">Additional documents optional</h4>
              <p className="mt-1 text-xs text-gray-500">Add any extra permit, association card, inspection note, or supporting document that can help the review team.</p>
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
      ),
    },
    {
      key: "review",
      title: "Review",
      icon: FiCheckCircle,
      summary: account.verificationStatus === "notVerified" ? "Unverified - documents skipped" : "Verification Pending",
      body: (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ReviewRow label="Operator" value={form.name || "Not set"} />
          <ReviewRow label="Category" value={form.category} />
          <ReviewRow label="Fleet type" value={form.fleetType} />
          <ReviewRow label="Plate number" value={form.plateNumber || "Not set"} />
          <ReviewRow label="Home base" value={form.homeBaseLocation || "Not set"} />
          <ReviewRow label="Starting price" value={formatFare(form.baseFare, formCountry)} />
          <ReviewRow label="Distance rate" value={form.pricePerKm ? `${formatFare(form.pricePerKm, formCountry)} per km` : "Not set"} />
          <ReviewRow label="Time rate" value={form.pricePerHour ? `${formatFare(form.pricePerHour, formCountry)} per hour` : "Not set"} />
          <ReviewRow label="Operator ID" value={account.displayCode || `KT-${account.operatorId}`} />
          <ReviewRow label="Current status" value={account.verificationStatus === "notVerified" ? "Unverified - documents skipped" : "Verification Pending"} />
        </div>
      ),
    },
  ];

  return (
    <ScreenSlideTransition screenKey="transport-fleet-editor" className="min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4 lg:px-8">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label="Back to operator dashboard"
            historyKey="transport-fleet-editor"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
            useHistoryLayer={false}
          />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-green-700">Fleet Dashboard Editor</p>
            <h1 className="truncate text-lg font-bold text-gray-950">Edit your fleet profile</h1>
            <p className="truncate text-xs text-gray-500">Update the fleet details that power your dashboard, discovery, and passenger bookings.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
        <p className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          Open any section to update its details, then save your changes.
        </p>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>
        ) : null}

        {sections.map((section, index) => {
          const open = openIndex === index;
          return (
            <section key={section.key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? -1 : index)}
                className="flex w-full items-start justify-between gap-3 p-5 text-left"
                aria-expanded={open}
              >
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-lg font-black text-gray-950">
                    <section.icon size={17} className="text-green-700" />
                    {section.title}
                  </h2>
                  {open ? null : (
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-gray-600">{section.summary}</p>
                  )}
                  {savedIndex === index ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-black text-emerald-600">
                      <FiCheckCircle /> Saved
                    </p>
                  ) : null}
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-black text-gray-700">
                  {open ? (
                    <>
                      <FiChevronUp /> Close
                    </>
                  ) : (
                    <>
                      <FiEdit2 /> Edit
                    </>
                  )}
                </span>
              </button>

              {open ? (
                <div className="border-t border-gray-100 p-5">
                  {section.body}
                  <div className="mt-5 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenIndex(-1)}
                      className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-50"
                    >
                      Close
                    </button>
                    {section.key === "review" ? null : (
                      <button
                        type="button"
                        onClick={() => handleSave(index)}
                        disabled={savingIndex === index}
                        className="rounded-lg bg-green-600 px-6 py-3 text-sm font-black text-white transition hover:bg-green-700 disabled:opacity-60"
                      >
                        {savingIndex === index ? "Saving..." : "Save changes"}
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </main>
    </ScreenSlideTransition>
  );
}

function FormInput({ label, value, onChange, type = "text", placeholder = "", helper = "", ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <input
        {...props}
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
      />
      {helper ? <span className="mt-2 block text-xs font-medium leading-5 text-gray-500">{helper}</span> : null}
    </label>
  );
}

function SelectField({ label, options, value, onChange, helper = "" }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-700 outline-none transition focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
      >
        {!value ? <option value="">Select {String(label).toLowerCase()}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      {helper ? <span className="mt-2 block text-xs font-medium leading-5 text-gray-500">{helper}</span> : null}
    </label>
  );
}

function UploadField({ label, value, onChange }) {
  const selectedName = typeof value === "string" ? value : value?.fileName || value?.name || "";
  return (
    <label className="block cursor-pointer rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 transition hover:border-green-300 hover:bg-green-50">
      <input type="file" accept="image/*,.pdf" className="sr-only" onChange={(event) => onChange(event.target.files?.[0])} />
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-700">
          <FiCamera size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">{label}</span>
          <span className="block truncate text-xs text-gray-500">{selectedName || "Upload or take photo"}</span>
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
