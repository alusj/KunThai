import { AlertTriangle } from "lucide-react";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";

export default function PayoutWarning({ warning }) {
  useUiLocale();
  if (!warning?.active) {
    return null;
  }

  return (
    <article className="rounded-lg border border-red-100 bg-red-50 p-4">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-red-700">
          <AlertTriangle size={18} strokeWidth={2.3} />
        </span>
        <div>
          <p className="font-black text-red-900">{translateUi(warning.title)}</p>
          <p className="mt-1 text-sm font-medium leading-5 text-red-700">
            {translateUi(warning.description)}
          </p>
        </div>
      </div>
    </article>
  );
}
