import {
  formatDocumentRequirementLabel,
  getUrMallDocumentRequirements,
} from "../../../../../data/globalDocumentRequirements";
import { useI18n, t } from "../../../../../i18n";

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
        <p className="font-black capitalize">{String(form.identity.businessKind || "retail").replaceAll("_", " ")}</p>
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
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-black text-gray-950">{title}</h3>
        <button type="button" onClick={onEdit} className="text-sm font-black text-blue-700">
          {t("urmall.biz.reg.edit")}
        </button>
      </div>
      <div className="space-y-1 text-sm font-medium text-gray-600">{children}</div>
    </section>
  );
}
