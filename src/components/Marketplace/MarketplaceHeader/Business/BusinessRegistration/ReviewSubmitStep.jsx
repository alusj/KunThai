import {
  formatDocumentRequirementLabel,
  getUrMallDocumentRequirements,
} from "../../../../../data/globalDocumentRequirements";
import { useI18n, t } from "../../../../../i18n";
import { t as i18nText } from "../../../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";

export default function ReviewSubmitStep({ registration }) {
  useI18n();
  const { form, readinessScore, goToStep } = registration;
  const documentRequirements = getUrMallDocumentRequirements({
    country: form.location.country,
    countryCode: form.location.countryIso,
  });
  const uploadedDocumentCount = documentRequirements.filter((requirement) => form.trustPayout[requirement.nameField]).length;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-gray-950">{t("urmall.biz.reg.storeReadiness")}</p>
            <p className="text-sm font-medium text-gray-500">{t("urmall.biz.reg.improveAfter")}</p>
          </div>
          <p className="text-2xl font-black text-blue-700">{readinessScore}%</p>
        </div>
      </section>

      <SummaryCard title={t("urmall.biz.reg.sumIdentity")} onEdit={() => goToStep(0)}>
        <p className="font-black capitalize">{String(form.identity.businessKind || i18nText("ui.literals.k46bb7e3c2f0d")).replaceAll("_", " ")}</p>
        <p>{form.identity.businessName}</p>
        <p>{form.identity.categories.join(", ")}</p>
        <p>{form.identity.description}</p>
      </SummaryCard>

      <SummaryCard title={t("urmall.biz.reg.sumLocation")} onEdit={() => goToStep(1)}>
        <p>{form.location.city}, {form.location.country}</p>
        <p>{form.location.mainLabel || t("urmall.biz.reg.mainStore")}: {form.location.address}</p>
        {(form.location.branches || [])
          .filter((branch) => String(branch.address || "").trim() || branch.coordinates)
          .map((branch, index) => (
            <p key={`review-branch-${index}`}>{branch.label || t("urmall.biz.reg.branchN", { n: index + 2 })}: {branch.address || t("urmall.biz.reg.pinnedOnMap")}</p>
          ))}
        {form.location.website ? <p>{form.location.website}</p> : null}
        <p>{form.location.phone} | {form.location.email}</p>
      </SummaryCard>

      <SummaryCard title={t("urmall.biz.reg.sumOperations")} onEdit={() => goToStep(2)}>
        <p>{t("urmall.biz.reg.reviewType", { value: form.operations.businessType })}</p>
        {form.identity.businessKind === "vendor" ? (
          <>
            <p className="font-black capitalize">{String(form.operations.vendorType || i18nText("ui.literals.k9fdcb2f441fc")).replaceAll("_", " ")} · {String(form.operations.salesModel || i18nText("ui.literals.k8c941ab6f6d3")).replaceAll("_", " ")}</p>
            <p>{i18nText("ui.literals.kde8956a7c355")} {form.operations.defaultMinOrderQuantity || 1} {form.operations.defaultSellingUnit || i18nText("ui.literals.k3a7d9767b123")}(s)</p>
            <p>{i18nText("ui.literals.kf46ef9335080")} {form.operations.leadTimeDays || 0} {i18nText("ui.literals.k1e0b597ec3c9")}</p>
            {form.operations.serviceAreas ? <p>{i18nText("ui.literals.kfb1d866c5378")} {form.operations.serviceAreas}</p> : null}
            <p>{i18nText("ui.literals.k96032a0aebb9")} {form.operations.quotationEnabled ? i18nText("ui.literals.k61a0572c4893") : i18nText("ui.literals.k7cccebc0d9c3")}</p>
          </>
        ) : null}
        <p>{t("urmall.biz.reg.reviewFulfil", { delivery: form.operations.deliveryEnabled ? t("urmall.biz.reg.yes") : t("urmall.biz.reg.no"), pickup: form.operations.pickupEnabled ? t("urmall.biz.reg.yes") : t("urmall.biz.reg.no") })}</p>
        <p>{form.operations.openTime} - {form.operations.closeTime}</p>
      </SummaryCard>

      <SummaryCard title={t("urmall.biz.reg.sumVerification")} onEdit={() => goToStep(3)}>
        <p className={uploadedDocumentCount ? "text-blue-700" : "text-amber-700"}>
          {uploadedDocumentCount
            ? t("urmall.biz.reg.docsWillReview")
            : t("urmall.biz.reg.noDocs")}
        </p>
        {documentRequirements.map((requirement) => (
          <p key={requirement.key}>
            {formatDocumentRequirementLabel(requirement)}: {form.trustPayout[requirement.nameField] || t("urmall.biz.reg.notUploaded")}
          </p>
        ))}
      </SummaryCard>
    </div>
  );
}

function SummaryCard({ title, onEdit, children }) {
  useUiLocale();
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-black text-gray-950">{translateUi(title)}</h3>
        <button type="button" onClick={onEdit} className="text-sm font-black text-blue-700">
          {t("urmall.biz.reg.edit")}
        </button>
      </div>
      <div className="space-y-1 text-sm font-medium text-gray-600">{children}</div>
    </section>
  );
}
