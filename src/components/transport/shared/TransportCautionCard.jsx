import { BadgeCheck, Building2, BusFront, Clock, FileText, ShieldAlert, Truck, UserRound } from "lucide-react";

import { useI18n, t } from "../../../i18n";

const VERIFICATION_GUIDES = [
  { icon: FileText, titleKey: "urride.caution.v1Title", bodyKey: "urride.caution.v1Body" },
  { icon: Clock, titleKey: "urride.caution.v2Title", bodyKey: "urride.caution.v2Body" },
  { icon: BadgeCheck, titleKey: "urride.caution.v3Title", bodyKey: "urride.caution.v3Body" },
];

const OPERATION_GUIDES = [
  { icon: UserRound, titleKey: "urride.caution.o1Title", bodyKey: "urride.caution.o1Body" },
  { icon: Truck, titleKey: "urride.caution.o2Title", bodyKey: "urride.caution.o2Body" },
  { icon: Building2, titleKey: "urride.caution.o3Title", bodyKey: "urride.caution.o3Body" },
];

export default function TransportCautionCard({ showMenuNote = true }) {
  useI18n();
  return (
    <section className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-4 shadow-sm sm:p-5">
      {showMenuNote ? (
        <div className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">
          {t("urride.caution.menuNote")}
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <ShieldAlert size={23} />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{t("urride.caution.eyebrow")}</p>
          <h2 className="mt-1 text-2xl font-black leading-tight text-slate-950">{t("urride.caution.heading")}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {t("urride.caution.intro")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {VERIFICATION_GUIDES.map(({ bodyKey, icon: Icon, titleKey }) => (
          <Guide key={titleKey} icon={Icon} title={t(titleKey)} body={t(bodyKey)} tone="emerald" />
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
            <BusFront size={19} />
          </span>
          <div>
            <h3 className="font-black text-slate-950">{t("urride.caution.beforeTitle")}</h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
              {t("urride.caution.beforeBody")}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {OPERATION_GUIDES.map(({ bodyKey, icon: Icon, titleKey }) => (
            <Guide key={titleKey} icon={Icon} title={t(titleKey)} body={t(bodyKey)} />
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
        <ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-700" />
        <p className="text-xs font-bold leading-5">
          {t("urride.caution.security")}
        </p>
      </div>
    </section>
  );
}

function Guide({ body, icon: Icon, title, tone = "slate" }) {
  const iconClass = tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-emerald-700";

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${iconClass}`}>
        <Icon size={19} />
      </span>
      <h3 className="mt-3 font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{body}</p>
    </article>
  );
}
