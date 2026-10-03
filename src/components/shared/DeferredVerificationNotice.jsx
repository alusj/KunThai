import { HiOutlineCheckCircle, HiOutlineClock, HiOutlineDocumentCheck, HiOutlineNoSymbol, HiOutlineShieldExclamation } from "react-icons/hi2";
import { t, useI18n } from "../../i18n";

const INTRO_KEYS = {
  business: "verificationNotice.introBusiness",
  operator: "verificationNotice.introOperator",
  company: "verificationNotice.introCompany",
};

// Shown wherever someone may finish a UrMall or UrRide registration without
// documents ("register first, upload later"). It makes three things
// unmistakable: skipping is allowed, the account stays Not verified until
// KunThai approves real documents, and false documents end in suspension or a
// ban.
export default function DeferredVerificationNotice({ subject = "business", className = "" }) {
  useI18n();
  return (
    <section
      role="note"
      aria-labelledby={`deferred-verification-${subject}`}
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 p-[2px] shadow-lg shadow-orange-500/20 ${className}`}
    >
      <div className="rounded-[22px] bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-2xl text-white shadow-md shadow-orange-500/30">
            <HiOutlineShieldExclamation aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-600">{t("verificationNotice.eyebrow")}</p>
            <h3 id={`deferred-verification-${subject}`} className="mt-1 text-lg font-black leading-snug text-slate-950">
              {t("verificationNotice.title")}
            </h3>
          </div>
        </div>

        <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{t(INTRO_KEYS[subject] || INTRO_KEYS.business)}</p>

        <ul className="mt-3 grid gap-2">
          <li className="flex items-start gap-2.5 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm font-bold leading-5 text-amber-900">
            <HiOutlineClock className="mt-0.5 shrink-0 text-lg text-amber-600" aria-hidden="true" />
            {t("verificationNotice.pointAddLater")}
          </li>
          <li className="flex items-start gap-2.5 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm font-bold leading-5 text-amber-900">
            <HiOutlineCheckCircle className="mt-0.5 shrink-0 text-lg text-amber-600" aria-hidden="true" />
            {t("verificationNotice.pointStatus")}
          </li>
        </ul>

        <div className="mt-3 rounded-2xl border-2 border-red-200 bg-red-50 p-3.5">
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-red-700">
            <HiOutlineNoSymbol className="shrink-0 text-lg" aria-hidden="true" />
            {t("verificationNotice.warningTitle")}
          </p>
          <p className="mt-1.5 text-sm font-semibold leading-6 text-red-900">{t("verificationNotice.warningBody")}</p>
        </div>

        <p className="mt-3 flex items-start gap-2 text-xs font-black leading-5 text-slate-600">
          <HiOutlineDocumentCheck className="mt-0.5 shrink-0 text-base text-emerald-600" aria-hidden="true" />
          {t("verificationNotice.pledge")}
        </p>
      </div>
    </section>
  );
}
