import { useI18n, t } from "../../../../../i18n";

const STEP_KEYS = ["pIdentity", "pLocation", "pOperations", "pVerification", "pReview"];

export default function RegistrationProgress({ step }) {
  useI18n();
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black text-gray-950">{t("urmall.biz.reg.stepXofY", { n: step + 1, total: STEP_KEYS.length })}</p>
        <p className="text-sm font-bold text-gray-500">{t(`urmall.biz.reg.${STEP_KEYS[step]}`)}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        {STEP_KEYS.map((labelKey, index) => (
          <div key={labelKey} className="space-y-1">
            <div className={`h-2 rounded-full ${index <= step ? "bg-blue-600" : "bg-gray-100"}`} />
            <p className={`hidden text-xs font-bold sm:block ${index <= step ? "text-blue-700" : "text-gray-400"}`}>
              {t(`urmall.biz.reg.${labelKey}`)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
