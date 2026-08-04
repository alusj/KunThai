import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ShieldCheck,
  Truck,
  UserRound,
} from "lucide-react";

import AppBackTab from "../../shared/AppBackTab";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import { ScreenSlideTransition } from "../../shared/motion";
import TransportEntryAnimation from "./TransportEntryAnimation";
import TransportCautionCard from "../shared/TransportCautionCard";
import { useI18n, t } from "../../../i18n";

const OPTIONS = [
  {
    id: "solo",
    titleKey: "urride.registration.type.soloTitle",
    subtitleKey: "urride.registration.type.soloSubtitle",
    icon: UserRound,
    bulletKeys: ["urride.registration.type.soloBullet1", "urride.registration.type.soloBullet2", "urride.registration.type.soloBullet3"],
  },
  {
    id: "company",
    titleKey: "urride.registration.type.companyTitle",
    subtitleKey: "urride.registration.type.companySubtitle",
    icon: Building2,
    bulletKeys: ["urride.registration.type.companyBullet1", "urride.registration.type.companyBullet2", "urride.registration.type.companyBullet3"],
  },
];

function scrollViewportTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

export default function TransportRegistrationTypeScreen({ onBack, onSelect }) {
  useI18n();
  const [showIntro, setShowIntro] = useState(true);
  const [cautionAccepted, setCautionAccepted] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [leavingCaution, setLeavingCaution] = useState(false);

  // While the caution card owns the viewport, lock the page behind it so the
  // background scrollbar can't scroll and hide/block the card.
  useBodyScrollLock(!cautionAccepted);

  useEffect(() => {
    scrollViewportTop();
  }, [selectedType]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowIntro(false);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, []);

  function handleSelect(type) {
    setSelectedType(type);
    scrollViewportTop();
    setShowIntro(true);

    window.setTimeout(() => {
      scrollViewportTop();
      onSelect(type);
    }, 700);
  }

  function acceptTransportCaution() {
    setLeavingCaution(true);

    window.setTimeout(() => {
      setCautionAccepted(true);
      setLeavingCaution(false);
      scrollViewportTop();
    }, 240);
  }

  if (!cautionAccepted) {
    return (
      <>
        <TransportEntryAnimation show={showIntro} />

        <ScreenSlideTransition screenKey="transport-registration-policy" className="flex h-dvh flex-col overflow-hidden bg-slate-50">
          <header className="z-30 shrink-0 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5">
            <div className="flex items-center gap-3">
              <AppBackTab
                onBack={onBack}
                label={t("urride.registration.type.back")}
                historyKey="transport-registration-policy"
                className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
              />

              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                  {t("urride.registration.type.beforeContinue")}
                </p>
                <h1 className="truncate text-xl font-black text-slate-950">
                  {t("urride.registration.type.regTitle")}
                </h1>
              </div>
            </div>
          </header>

          <main className="mx-auto flex w-full min-h-0 max-w-4xl flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-6">
            <section
              className={`mx-auto flex min-h-full w-full max-w-3xl flex-col rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-sm transition-all duration-300 ${
                leavingCaution
                  ? "-translate-x-10 opacity-0"
                  : "translate-x-0 opacity-100"
              }`}
            >
              <div>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
                  <ShieldCheck size={32} />
                </div>

                <h2 className="mt-5 text-3xl font-black text-slate-950">
                  {t("urride.registration.type.beforeRegister")}
                </h2>

                <div className="mt-5"><TransportCautionCard /></div>

                <div className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-black text-slate-950">{t("urride.registration.type.professionalTitle")}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    {t("urride.registration.type.professionalBody")}
                  </p>
                </div>
              </div>

              <div className="mt-auto pt-8">
                <button
                  type="button"
                  onClick={acceptTransportCaution}
                  disabled={leavingCaution}
                  className="h-14 w-full rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-70"
                >
                  {leavingCaution
                    ? t("urride.registration.type.opening")
                    : t("urride.registration.type.understand")}
                </button>
              </div>
            </section>
          </main>
        </ScreenSlideTransition>
      </>
    );
  }

  return (
    <>
      <TransportEntryAnimation show={showIntro} />

      <ScreenSlideTransition screenKey="transport-registration-type" className="min-h-dvh bg-slate-50">
        <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5">
          <div className="flex items-center gap-3">
            <AppBackTab
              onBack={onBack}
              label={t("urride.registration.type.back")}
              historyKey="transport-registration-type"
              className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
            />

            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                {t("urride.registration.type.regEyebrow")}
              </p>
              <h1 className="truncate text-xl font-black text-slate-950">
                {t("urride.registration.type.chooseType")}
              </h1>
            </div>
          </div>
        </header>

        <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Truck size={28} />
            </div>

            <p className="mt-4 text-xs font-black uppercase tracking-wide text-emerald-700">
              KunThai UrRide
            </p>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {t("urride.registration.type.registerHeading")}
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              {t("urride.registration.type.chooseSetup")}
            </p>
          </section>

          <section className="grid gap-4">
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              const isCompany = option.id === "company";

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelect(option.id)}
                  className={`kt-pressable rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                    isCompany
                      ? "border-blue-200 hover:border-blue-400"
                      : "border-emerald-200 hover:border-emerald-400"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                        isCompany
                          ? "bg-blue-50 text-blue-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      <Icon size={28} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-xl font-black text-slate-950">
                        {t(option.titleKey)}
                      </span>
                      <span className="mt-1 block text-sm font-semibold leading-6 text-slate-600">
                        {t(option.subtitleKey)}
                      </span>
                    </span>

                    <CheckCircle2
                      className={isCompany ? "text-blue-600" : "text-emerald-600"}
                      size={24}
                    />
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    {option.bulletKeys.map((bulletKey) => (
                      <span
                        key={bulletKey}
                        className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600"
                      >
                        {t(bulletKey)}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </section>
        </main>
      </ScreenSlideTransition>
    </>
  );
}
