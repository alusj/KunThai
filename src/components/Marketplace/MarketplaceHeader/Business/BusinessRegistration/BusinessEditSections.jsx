import { useState } from "react";
import { FiCheckCircle, FiChevronUp, FiEdit2 } from "react-icons/fi";

import { URMALL_BUSINESS_KIND_LABELS } from "../../../../../Backend/services/marketplace/sellerRegistrationService";
import { t } from "../../../../../i18n";
import BusinessIdentityStep from "./BusinessIdentityStep";
import LocationContactStep from "./LocationContactStep";
import OperationsStep from "./OperationsStep";
import TrustPayoutStep from "./TrustPayoutStep";

function kindLabel(kindId) {
  return URMALL_BUSINESS_KIND_LABELS[kindId] || kindId || "";
}

function joinParts(parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join("  •  ");
}

function summarizeIdentity(form) {
  const identity = form.identity || {};
  const categories = Array.isArray(identity.categories) ? identity.categories : [];
  return (
    joinParts([
      identity.businessName,
      kindLabel(identity.businessKind),
      categories.length ? t("urmall.biz.reg.sumCategories", { count: categories.length }) : "",
    ]) || t("urmall.biz.reg.sumEmpty")
  );
}

function summarizeLocation(form) {
  const location = form.location || {};
  const place = [location.city, location.country].filter(Boolean).join(", ");
  const branches = Array.isArray(location.branches) ? location.branches : [];
  return (
    joinParts([
      place,
      location.phone,
      branches.length ? t("urmall.biz.reg.sumBranches", { count: branches.length }) : "",
    ]) || t("urmall.biz.reg.sumEmpty")
  );
}

function summarizeOperations(form) {
  const operations = form.operations || {};
  const fulfillment = [
    operations.deliveryEnabled ? t("urmall.biz.reg.sumDelivery") : "",
    operations.pickupEnabled ? t("urmall.biz.reg.sumPickup") : "",
  ]
    .filter(Boolean)
    .join(" & ");
  const days = Array.isArray(operations.operatingDays) ? operations.operatingDays.length : 0;
  const hours = operations.openTime && operations.closeTime ? `${operations.openTime} – ${operations.closeTime}` : "";
  return (
    joinParts([
      fulfillment,
      days ? t("urmall.biz.reg.sumOpenDays", { count: days }) : "",
      hours,
    ]) || t("urmall.biz.reg.sumEmpty")
  );
}

function summarizeTrust(form) {
  const trust = form.trustPayout || {};
  const documents = [trust.idDocumentName, trust.businessDocumentName].filter(Boolean).length;
  return joinParts([
    documents ? t("urmall.biz.reg.sumDocs", { count: documents }) : t("urmall.biz.reg.sumNoDocs"),
    trust.connectKunThaiMoney
      ? t("urmall.biz.reg.sumMoneyConnected")
      : (trust.bankName || ""),
  ]);
}

// The edit accordion maps 1:1 onto the wizard steps 0-3, so a section's index is
// also the step index the save routine validates and, if it fails, reopens.
const EDIT_SECTIONS = [
  { key: "identity", titleKey: "stepIdentity", Component: BusinessIdentityStep, summarize: summarizeIdentity },
  { key: "location", titleKey: "stepLocation", Component: LocationContactStep, summarize: summarizeLocation },
  { key: "operations", titleKey: "stepOperations", Component: OperationsStep, summarize: summarizeOperations },
  { key: "trustPayout", titleKey: "stepVerification", Component: TrustPayoutStep, summarize: summarizeTrust },
];

export default function BusinessEditSections({ registration }) {
  const [openIndex, setOpenIndex] = useState(-1);
  const [savedIndex, setSavedIndex] = useState(-1);

  async function handleSave(index) {
    const result = await registration.saveEdits();
    if (result?.ok) {
      setOpenIndex(-1);
      setSavedIndex(index);
      window.setTimeout(() => setSavedIndex((current) => (current === index ? -1 : current)), 2600);
      return;
    }
    // Reopen whichever section failed validation so the seller can fix it.
    if (typeof result?.failedStep === "number") setOpenIndex(result.failedStep);
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
        {t("urmall.biz.reg.editSectionsHint")}
      </p>

      {EDIT_SECTIONS.map((section, index) => {
        const open = openIndex === index;
        const StepComponent = section.Component;

        return (
          <section key={section.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? -1 : index)}
              className="flex w-full items-start justify-between gap-3 p-5 text-left"
              aria-expanded={open}
            >
              <div className="min-w-0">
                <h2 className="text-lg font-black text-gray-950">
                  {t(`urmall.biz.reg.${section.titleKey}`)}
                </h2>
                {open ? null : (
                  <p className="mt-1 line-clamp-2 text-sm font-medium text-gray-600">
                    {section.summarize(registration.form)}
                  </p>
                )}
                {savedIndex === index ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-black text-emerald-600">
                    <FiCheckCircle /> {t("urmall.biz.reg.editSectionSaved")}
                  </p>
                ) : null}
              </div>

              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-black text-gray-700">
                {open ? (
                  <>
                    <FiChevronUp /> {t("urmall.biz.reg.editSectionClose")}
                  </>
                ) : (
                  <>
                    <FiEdit2 /> {t("urmall.biz.reg.editSectionEdit")}
                  </>
                )}
              </span>
            </button>

            {open ? (
              <div className="border-t border-gray-100 p-5">
                <StepComponent registration={registration} />

                {registration.errors.submit ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                    {registration.errors.submit}
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(-1)}
                    className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-50"
                  >
                    {t("urmall.biz.reg.editSectionClose")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSave(index)}
                    disabled={registration.submitting}
                    className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {registration.submitting ? t("urmall.biz.reg.saving") : t("urmall.biz.reg.saveChanges")}
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
