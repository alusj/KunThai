import { ArrowLeft, Briefcase } from "lucide-react";

import { uiText as translateUi, useI18n } from "../../i18n/index.js";
import { t } from "../../i18n";
import AccountTypeSettings from "./AccountTypeSettings";

/**
 * Shown instead of UrMall / UrRide registration for a Personal account. The
 * account type can be changed right here; registration then appears.
 */
export default function BusinessAccountRequired({ service = "UrMall", onBack }) {
  useI18n();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="kt-pressable inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {t("common.back")}
        </button>
      ) : null}
      <section className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-white text-amber-700 shadow-sm">
            <Briefcase size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-950">{translateUi("Business account needed")}</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
              {service === "UrRide"
                ? translateUi("Choose Business or Both to register a fleet or company on UrRide.")
                : translateUi("Choose Business or Both to register a business on UrMall.")}
            </p>
          </div>
        </div>
      </section>
      <AccountTypeSettings />
    </div>
  );
}
