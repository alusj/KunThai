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
import { useI18n, t } from "../../../i18n";

// Stored enum values stay English (saved on the account + compared); display is
// localized via urride.fleetEdit.enum.<value>.
const availabilityOptions = ["Full-time", "Part-time", "Scheduled", "Weekends only", "Night service"];
const fuelTypes = ["Petrol", "Diesel", "Hybrid", "Electric", "Not applicable"];
const carBodyTypes = ["Sedan", "SUV", "Hatchback", "Minivan", "Pickup", "Van"];
const deliveryBodyTypes = ["Open cargo", "Covered cargo", "Delivery box", "Insulated box", "Passenger + cargo"];
const enumLabel = (value) => t(`urride.fleetEdit.enum.${value}`);

const fleetQuestions = {
  Car: [
    { key: "seatCount", labelKey: "urride.fleetEdit.q.seatCount", type: "number" },
    { key: "doorsWorking", labelKey: "urride.fleetEdit.q.doorsWorking", type: "select" },
    { key: "seatbelts", labelKey: "urride.fleetEdit.q.seatbelts", type: "select" },
    { key: "acOrVentilation", labelKey: "urride.fleetEdit.q.acOrVentilation", type: "select" },
    { key: "lightsMirrors", labelKey: "urride.fleetEdit.q.lightsMirrors", type: "select" },
    { key: "spareTire", labelKey: "urride.fleetEdit.q.spareTire", type: "select" },
    { key: "interiorClean", labelKey: "urride.fleetEdit.q.interiorClean", type: "select" },
  ],
  Motorcycle: [
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
  if (!value) return t("urride.fleetEdit.notSet");
  return formatCountryMoney(value, formCountry, { maximumFractionDigits: 0 });
}

function joinParts(parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join("  •  ");
}

export default function FleetEditDrawer({ account, onBack, onSaved }) {
  useI18n();
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
      setError(saveError.message || t("urride.fleetEdit.saveError"));
    } finally {
      setSavingIndex(-1);
    }
  }

  const answeredCount = questions.filter((question) => answers[question.key] != null && answers[question.key] !== "").length;

  const sections = [
    {
      key: "operator",
      title: t("urride.fleetEdit.sectionOperator"),
      icon: FiUser,
      summary: joinParts([form.name, form.phone, form.city]) || t("urride.fleetEdit.notSetYet"),
      body: (
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput label={t("urride.fleetEdit.nameLabel")} value={form.name} onChange={(value) => update("name", value)} placeholder={t("urride.fleetEdit.nameLabel")} helper={t("urride.fleetEdit.nameHelper")} />
          <FormInput label={t("urride.fleetEdit.phoneLabel")} type="tel" value={form.phone} onChange={(value) => update("phone", constrainCountryPhoneInput(value, form.countryCode || form.country, { international: true }))} placeholder={getCountryPhoneHint(form.countryCode || form.country)} helper={t("urride.fleetEdit.phoneHelper")} />
          <FormInput label={t("urride.fleetEdit.cityLabel")} value={form.city} onChange={(value) => update("city", value)} placeholder={t("urride.fleetEdit.cityLabel")} />
          <FormInput label={t("urride.fleetEdit.emergencyLabel")} type="tel" value={form.emergencyContact} onChange={(value) => update("emergencyContact", constrainCountryPhoneInput(value, form.countryCode || form.country, { international: true }))} placeholder={getCountryPhoneHint(form.countryCode || form.country)} helper={t("urride.fleetEdit.emergencyHelper")} />
        </div>
      ),
    },
    {
      key: "service",
      title: t("urride.fleetEdit.sectionService"),
      icon: FiTruck,
      summary: joinParts([form.category, form.fleetType]) || t("urride.fleetEdit.notSetYet"),
      body: (
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label={t("urride.fleetEdit.categoryLabel")} options={categoryOptions} value={form.category} onChange={(value) => update("category", value)} helper={t("urride.fleetEdit.categoryHelper")} />
          <SelectField label={t("urride.fleetEdit.fleetTypeLabel")} options={fleetTypeOptions} value={form.fleetType} onChange={(value) => update("fleetType", value)} helper={t("urride.fleetEdit.fleetTypeHelper")} />
        </div>
      ),
    },
    {
      key: "fleet",
      title: t("urride.fleetEdit.sectionFleet"),
      icon: FiMapPin,
      summary: joinParts([form.fleetName || form.plateNumber, [form.make, form.model].filter(Boolean).join(" "), form.baseFare ? formatFare(form.baseFare, formCountry) : ""]) || t("urride.fleetEdit.notSetYet"),
      body: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <FormInput label={t("urride.fleetEdit.fleetNameLabel")} value={form.fleetName} onChange={(value) => update("fleetName", value)} placeholder={t("urride.fleetEdit.fleetNameLabel")} helper={t("urride.fleetEdit.fleetNameHelper")} />
          <FormInput label={t("urride.fleetEdit.plateLabel")} value={form.plateNumber} onChange={(value) => update("plateNumber", value.toUpperCase())} placeholder={t("urride.fleetEdit.plateLabel")} helper={t("urride.fleetEdit.plateHelper")} />
          <FormInput label={t("urride.fleetEdit.makeLabel")} value={form.make} onChange={(value) => update("make", value)} placeholder={t("urride.fleetEdit.makePlaceholder")} />
          <FormInput label={t("urride.fleetEdit.modelLabel")} value={form.model} onChange={(value) => update("model", value)} placeholder={t("urride.fleetEdit.modelLabel")} />
          <FormInput label={t("urride.fleetEdit.yearLabel")} type="number" value={form.year} onChange={(value) => update("year", value)} placeholder={t("urride.fleetEdit.yearLabel")} min="1950" helper={t("urride.fleetEdit.yearHelper")} />
          <FormInput label={t("urride.fleetEdit.colorLabel")} value={form.color} onChange={(value) => update("color", value)} placeholder={t("urride.fleetEdit.colorLabel")} />
          <FormInput label={t("urride.fleetEdit.areaLabel")} value={form.operatingArea} onChange={(value) => update("operatingArea", value)} placeholder={t("urride.fleetEdit.areaLabel")} />
          <FormInput label={t("urride.fleetEdit.homeBaseLabel")} value={form.homeBaseLocation} onChange={(value) => update("homeBaseLocation", value)} placeholder={t("urride.fleetEdit.homeBaseLabel")} />
          <FormInput label={t("urride.fleetEdit.startPriceLabel")} type="number" value={form.baseFare} onChange={(value) => update("baseFare", value)} placeholder={t("urride.fleetEdit.startPriceLabel")} min="0" helper={t("urride.fleetEdit.startPriceHelper")} />
          <FormInput label={t("urride.fleetEdit.perKmLabel")} type="number" value={form.pricePerKm} onChange={(value) => update("pricePerKm", value)} placeholder={t("urride.fleetEdit.perKmPlaceholder")} min="0" helper={t("urride.fleetEdit.perKmHelper")} />
          <FormInput label={t("urride.fleetEdit.perHourLabel")} type="number" value={form.pricePerHour} onChange={(value) => update("pricePerHour", value)} placeholder={t("urride.fleetEdit.perHourPlaceholder")} min="0" helper={t("urride.fleetEdit.perHourHelper")} />
          <FormInput label={t("urride.fleetEdit.priceNoteLabel")} value={form.priceHint} onChange={(value) => update("priceHint", value)} placeholder={t("urride.fleetEdit.priceNotePlaceholder")} helper={t("urride.fleetEdit.priceNoteHelper")} />
          <SelectField label={t("urride.fleetEdit.availabilityLabel")} options={availabilityOptions} optionLabels={enumLabel} value={form.availability} onChange={(value) => update("availability", value)} helper={t("urride.fleetEdit.availabilityHelper")} />
          {form.fleetType === "Car" ? (
            <>
              <SelectField label={t("urride.fleetEdit.fuelLabel")} options={fuelTypes} optionLabels={enumLabel} value={form.fuelType} onChange={(value) => update("fuelType", value)} />
              <SelectField label={t("urride.fleetEdit.carBodyLabel")} options={carBodyTypes} optionLabels={enumLabel} value={form.carBodyType} onChange={(value) => update("carBodyType", value)} />
            </>
          ) : null}
          {form.category === "Delivery" || form.category === "Both" ? (
            <FormInput label={t("urride.fleetEdit.maxLoadLabel")} value={form.maxLoad} onChange={(value) => update("maxLoad", value)} placeholder={t("urride.fleetEdit.maxLoadLabel")} />
          ) : null}
          {(form.category === "Delivery" || form.category === "Both") && form.fleetType === "Tricycle" ? (
            <SelectField label={t("urride.fleetEdit.deliveryBoothLabel")} options={deliveryBodyTypes} optionLabels={enumLabel} value={form.deliveryBodyType} onChange={(value) => update("deliveryBodyType", value)} />
          ) : null}
        </div>
      ),
    },
    {
      key: "safety",
      title: t("urride.fleetEdit.sectionSafety"),
      icon: FiShield,
      summary: questions.length ? t("urride.fleetEdit.safetyAnswers", { answered: answeredCount, total: questions.length }) : t("urride.fleetEdit.noQuestions"),
      body: (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="mt-1 text-amber-700" size={19} />
              <div>
                <h3 className="font-semibold text-amber-900">{t("urride.fleetEdit.conditionalTitle")}</h3>
                <p className="mt-1 text-sm text-amber-800">{t("urride.fleetEdit.conditionalBody")}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {questions.map((question) => (
              <label key={question.key} className="block rounded-2xl border border-gray-100 p-4">
                <span className="text-sm font-semibold text-gray-900">{t(question.labelKey)}</span>
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
                    <option value="Yes">{t("urride.fleetEdit.answerYes")}</option>
                    <option value="No">{t("urride.fleetEdit.answerNo")}</option>
                    <option value="Needs admin check">{t("urride.fleetEdit.answerAdmin")}</option>
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
      title: t("urride.fleetEdit.sectionDocuments"),
      icon: FiFileText,
      summary: t("urride.fleetEdit.uploadNote"),
      body: (
        <div className="space-y-5">
          <section>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-gray-950">{t("urride.fleetEdit.fleetImages")}</h3>
                <p className="text-xs text-gray-500">{t("urride.fleetEdit.fleetImagesNote")}</p>
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
              <h3 className="font-bold text-gray-950">{t("urride.fleetEdit.documentsTitle")}</h3>
              <p className="text-xs text-gray-500">{t("urride.fleetEdit.documentsNote")}</p>
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
              <h4 className="font-bold text-gray-950">{t("urride.fleetEdit.additionalTitle")}</h4>
              <p className="mt-1 text-xs text-gray-500">{t("urride.fleetEdit.additionalNote")}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <UploadField
                    key={item}
                    label={t("urride.fleetEdit.additionalDoc", { n: item })}
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
      title: t("urride.fleetEdit.sectionReview"),
      icon: FiCheckCircle,
      summary: account.verificationStatus === "notVerified" ? t("urride.fleetEdit.unverified") : t("urride.fleetEdit.pending"),
      body: (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ReviewRow label={t("urride.fleetEdit.reviewOperator")} value={form.name || t("urride.fleetEdit.notSet")} />
          <ReviewRow label={t("urride.fleetEdit.reviewCategory")} value={form.category} />
          <ReviewRow label={t("urride.fleetEdit.reviewFleetType")} value={form.fleetType} />
          <ReviewRow label={t("urride.fleetEdit.reviewPlate")} value={form.plateNumber || t("urride.fleetEdit.notSet")} />
          <ReviewRow label={t("urride.fleetEdit.reviewHomeBase")} value={form.homeBaseLocation || t("urride.fleetEdit.notSet")} />
          <ReviewRow label={t("urride.fleetEdit.reviewStartPrice")} value={formatFare(form.baseFare, formCountry)} />
          <ReviewRow label={t("urride.fleetEdit.reviewDistanceRate")} value={form.pricePerKm ? t("urride.fleetEdit.ratePerKm", { price: formatFare(form.pricePerKm, formCountry) }) : t("urride.fleetEdit.notSet")} />
          <ReviewRow label={t("urride.fleetEdit.reviewTimeRate")} value={form.pricePerHour ? t("urride.fleetEdit.ratePerHour", { price: formatFare(form.pricePerHour, formCountry) }) : t("urride.fleetEdit.notSet")} />
          <ReviewRow label={t("urride.fleetEdit.reviewOperatorId")} value={account.displayCode || t("urride.fleetEdit.operatorIdFallback", { id: account.operatorId })} />
          <ReviewRow label={t("urride.fleetEdit.reviewCurrentStatus")} value={account.verificationStatus === "notVerified" ? t("urride.fleetEdit.unverified") : t("urride.fleetEdit.pending")} />
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
            label={t("urride.fleetEdit.back")}
            historyKey="transport-fleet-editor"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
            useHistoryLayer={false}
          />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-green-700">{t("urride.fleetEdit.eyebrow")}</p>
            <h1 className="truncate text-lg font-bold text-gray-950">{t("urride.fleetEdit.title")}</h1>
            <p className="truncate text-xs text-gray-500">{t("urride.fleetEdit.subtitle")}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
        <p className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {t("urride.fleetEdit.intro")}
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
                      <FiCheckCircle /> {t("urride.fleetEdit.saved")}
                    </p>
                  ) : null}
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-black text-gray-700">
                  {open ? (
                    <>
                      <FiChevronUp /> {t("urride.fleetEdit.close")}
                    </>
                  ) : (
                    <>
                      <FiEdit2 /> {t("urride.fleetEdit.edit")}
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
                      {t("urride.fleetEdit.close")}
                    </button>
                    {section.key === "review" ? null : (
                      <button
                        type="button"
                        onClick={() => handleSave(index)}
                        disabled={savingIndex === index}
                        className="rounded-lg bg-green-600 px-6 py-3 text-sm font-black text-white transition hover:bg-green-700 disabled:opacity-60"
                      >
                        {savingIndex === index ? t("urride.fleetEdit.saving") : t("urride.fleetEdit.saveChanges")}
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

function SelectField({ label, options, value, onChange, helper = "", optionLabels }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-800">{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-700 outline-none transition focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
      >
        {!value ? <option value="">{t("urride.fleetEdit.selectPlaceholder", { label: String(label).toLowerCase() })}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>{optionLabels ? optionLabels(option) : option}</option>
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
          <span className="block truncate text-xs text-gray-500">{selectedName || t("urride.fleetEdit.uploadPhoto")}</span>
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
