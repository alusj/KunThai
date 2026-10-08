import { AlertTriangle, RefreshCw } from "lucide-react";

import { useI18n, t } from "../../../../i18n";

// Shown in place of a seller skeleton when its data could not be loaded, so a
// failed request never leaves the screen shimmering forever.
export default function SellerLoadError({ onRetry, className = "" }) {
  useI18n();
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm ${className}`} role="alert">
      <AlertTriangle className="mx-auto text-amber-600" size={26} />
      <p className="mt-3 text-sm font-bold text-gray-700">{t("sellerFix.loadFailed")}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-gray-950 px-5 text-sm font-black text-white hover:bg-gray-800"
        >
          <RefreshCw size={16} /> {t("sellerFix.retry")}
        </button>
      ) : null}
    </section>
  );
}
