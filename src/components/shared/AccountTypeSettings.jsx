import { useState } from "react";
import { Briefcase, LoaderCircle } from "lucide-react";

import {
  HAS_BUSINESS_ACCOUNTS_CODE,
  saveAccountType,
  useAccountType,
} from "../../Backend/services/accountTypeService";
import { haptics } from "../../Backend/services/feedbackService";
import { isGuestMode } from "../../Backend/services/guestModeService";
import { shortErrorToast } from "../../Backend/services/friendlyErrorService";
import { showToast } from "../../Backend/services/toastService";
import { t } from "../../i18n";
import { uiText as translateUi, useI18n } from "../../i18n/index.js";

const ACCOUNT_TYPE_OPTIONS = [
  { id: "personal", titleKey: "acctPersonal", bodyKey: "acctPersonalBody" },
  { id: "business", titleKey: "acctBusiness", bodyKey: "acctBusinessBody" },
  { id: "both", titleKey: "acctBoth", bodyKey: "acctBothBody" },
];

function blockedMessage(owned = {}) {
  if (owned.urmall && owned.urride) return "Delete your UrMall business and UrRide accounts before switching to Personal.";
  if (owned.urmall) return "Delete your UrMall business before switching to Personal.";
  return "Delete your UrRide accounts before switching to Personal.";
}

/**
 * Settings > Account type. Personal hides UrMall/UrRide registration; Business
 * and Both show it. Personal is refused (double vibration + toast) while the
 * person still owns UrMall or UrRide business accounts.
 */
export default function AccountTypeSettings() {
  useI18n();
  const { accountType, loading } = useAccountType();
  const [saving, setSaving] = useState("");
  const [blocked, setBlocked] = useState("");

  if (isGuestMode()) return null;

  async function choose(nextType) {
    if (saving || nextType === accountType) return;
    setBlocked("");
    setSaving(nextType);
    try {
      await saveAccountType(nextType);
      showToast("Account type updated", "success");
    } catch (error) {
      if (error?.code === HAS_BUSINESS_ACCOUNTS_CODE) {
        haptics.doubleShake();
        showToast("Delete business accounts", "danger");
        setBlocked(blockedMessage(error.owned));
      } else {
        showToast(shortErrorToast(error, "Account type not saved"), "danger");
      }
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700">
          <Briefcase size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-black text-slate-950">{t("onboarding.profile.accountType")}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            {translateUi("Business and Both can register on UrMall and UrRide. Personal keeps KunThai for everyday use.")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3" role="radiogroup" aria-label={t("onboarding.profile.accountType")}>
        {ACCOUNT_TYPE_OPTIONS.map((option) => {
          const selected = !loading && accountType === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={Boolean(saving) || loading}
              onClick={() => choose(option.id)}
              className={`relative rounded-[22px] border px-4 py-4 text-left transition disabled:cursor-wait ${
                selected ? "border-sky-500 bg-sky-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                {t(`onboarding.profile.${option.titleKey}`)}
                {saving === option.id ? <LoaderCircle size={14} className="animate-spin text-slate-400" aria-hidden="true" /> : null}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{t(`onboarding.profile.${option.bodyKey}`)}</p>
            </button>
          );
        })}
      </div>

      {blocked ? (
        <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {translateUi(blocked)}
        </p>
      ) : null}
    </div>
  );
}
