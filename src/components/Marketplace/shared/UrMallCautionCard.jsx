import { BadgeCheck, Clock, FileText, Hotel, House, Landmark, ShieldAlert, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";

import { useI18n, t } from "../../../i18n";

const BUSINESS_GUIDES = [
  { icon: Store, titleKey: "urmall.caution.shopTitle", purposeKey: "urmall.caution.shopPurpose", registrationKey: "urmall.caution.shopRegistration", operationKey: "urmall.caution.shopOperation" },
  { icon: UtensilsCrossed, titleKey: "urmall.caution.restaurantTitle", purposeKey: "urmall.caution.restaurantPurpose", registrationKey: "urmall.caution.restaurantRegistration", operationKey: "urmall.caution.restaurantOperation" },
  { icon: Hotel, titleKey: "urmall.caution.hotelTitle", purposeKey: "urmall.caution.hotelPurpose", registrationKey: "urmall.caution.hotelRegistration", operationKey: "urmall.caution.hotelOperation" },
  { icon: House, titleKey: "urmall.caution.realEstateTitle", purposeKey: "urmall.caution.realEstatePurpose", registrationKey: "urmall.caution.realEstateRegistration", operationKey: "urmall.caution.realEstateOperation" },
];

const VERIFICATION_GUIDES = [
  { icon: Landmark, titleKey: "urmall.caution.g1Title", bodyKey: "urmall.caution.g1Body" },
  { icon: Clock, titleKey: "urmall.caution.g2Title", bodyKey: "urmall.caution.g2Body" },
  { icon: BadgeCheck, titleKey: "urmall.caution.g3Title", bodyKey: "urmall.caution.g3Body" },
];

export default function UrMallCautionCard({ showMenuNote = true }) {
  useI18n();
  return (
    <section className="mt-5 rounded-[28px] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-4 shadow-sm sm:p-5">
      {showMenuNote ? (
        <div className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">
          {t("urmall.caution.menuNote")}
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-700">
          <ShoppingBag size={23} />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urmall.caution.eyebrow")}</p>
          <h2 className="mt-1 text-2xl font-black leading-tight text-slate-950">{t("urmall.caution.heading")}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {t("urmall.caution.intro")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {VERIFICATION_GUIDES.map(({ bodyKey, icon: Icon, titleKey }) => (
          <article key={titleKey} className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <Icon size={19} />
            </span>
            <h3 className="mt-3 font-black text-slate-950">{t(titleKey)}</h3>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{t(bodyKey)}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
            <FileText size={19} />
          </span>
          <div>
            <h3 className="font-black text-slate-950">{t("urmall.caution.typeTitle")}</h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
              {t("urmall.caution.typeBody")}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BUSINESS_GUIDES.map(({ icon: Icon, operationKey, purposeKey, registrationKey, titleKey }) => (
            <article key={titleKey} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <Icon size={18} className="text-blue-700" />
                <h4 className="font-black text-slate-950">{t(titleKey)}</h4>
              </div>
              <p className="mt-2 text-sm font-bold text-slate-700">{t("urmall.caution.purposeLabel", { purpose: t(purposeKey) })}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-600"><strong>{t("urmall.caution.registrationLabel")}</strong> {t(registrationKey)}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-600"><strong>{t("urmall.caution.howItWorksLabel")}</strong> {t(operationKey)}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
        <ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-700" />
        <p className="text-xs font-bold leading-5">
          {t("urmall.caution.security")}
        </p>
      </div>
    </section>
  );
}
