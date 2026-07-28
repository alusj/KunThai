import { useI18n, t } from "../../../../../i18n";

const STEP_KEYS = ["pBasics", "pDetails", "pMedia", "pPricing", "pPublish"];

export default function ProductFormProgress({ step }) {
  useI18n();
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black text-gray-950">{t("urmall.biz.reg.stepXofY", { n: step + 1, total: STEP_KEYS.length })}</p>
        <p className="text-sm font-bold text-gray-500">{t(`urmall.biz.pform.${STEP_KEYS[step]}`)}</p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {STEP_KEYS.map((item, index) => (
          <div key={item} className={`h-2 rounded-full ${index <= step ? "bg-blue-600" : "bg-gray-100"}`} />
        ))}
      </div>
    </div>
  );
}
