import { Compass, ShoppingBag, CarFront } from "lucide-react";

import OnboardingFrame from "./OnboardingFrame";
import { findExploreTopic } from "../../data/exploreTopics";
import { useI18n, t } from "../../i18n";
import { t as i18nText } from "../../i18n/index";

const surfaceMap = {
  explore: { labelKey: "onboarding.welcome.exploreT", icon: Compass },
  marketplace: { labelKey: "onboarding.welcome.marketplaceT", icon: ShoppingBag },
  transport: { labelKey: "onboarding.welcome.urrideT", icon: CarFront },
};

export default function ReadyStep({ values, saving, error, onBack, onFinish }) {
  useI18n();
  const SurfaceIcon = surfaceMap[values.primarySurface]?.icon ?? Compass;
  const surfaceLabel = t(surfaceMap[values.primarySurface]?.labelKey ?? "onboarding.welcome.exploreT");
  const profileName =
    values.displayName || [values.firstName, values.middleName, values.lastName].filter(Boolean).join(" ");

  return (
    <OnboardingFrame
      step={4}
      total={4}
      title={t("onboarding.ready.title")}
      subtitle={t("onboarding.ready.subtitle")}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.ready.profile")}</p>
          <div className="mt-4 flex items-center gap-4">
            {values.avatarUrl ? (
              <img src={values.avatarUrl} alt={t("onboarding.ready.profileAlt")} className="h-16 w-16 rounded-3xl object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-xl font-semibold text-slate-700">
                {(profileName || "K").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-2xl font-semibold text-slate-950">{profileName || t("onboarding.ready.newUser")}</p>
              <p className="mt-2 text-sm text-slate-600">{values.username ? i18nText("ui.literals.k92e5f8fb700e", { value0: values.username }) : t("onboarding.ready.usernamePlaceholder")}</p>
            </div>
          </div>
          <p className="mt-5 text-sm text-slate-600">
            {values.email || t("onboarding.ready.email")} - {values.phone || t("onboarding.ready.phone")}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {values.city || t("onboarding.ready.city")}, {values.country || t("onboarding.ready.country")}
          </p>
          <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
            {values.accountType}
          </p>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#082f49,#0f172a)] p-5 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-200">{t("onboarding.ready.defaultEntry")}</p>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <SurfaceIcon size={20} />
            </span>
            <div>
              <p className="text-lg font-semibold">{surfaceLabel}</p>
              <p className="text-sm text-slate-300">{t("onboarding.ready.landingHint")}</p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-200">{t("onboarding.ready.interestTags")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(values.interests.length ? values.interests : ["social", "shopping", "rides"]).map((interest) => (
                <span key={interest} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold capitalize text-sky-100">
                  {interest.replace("-", " ")}
                </span>
              ))}
            </div>
          </div>

          {values.contentTopics?.length ? (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-200">{t("onboarding.ready.exploreTopics")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {values.contentTopics.slice(0, 8).map((slug) => (
                  <span key={slug} className="rounded-full bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-100">
                    {findExploreTopic(slug)?.name || slug.replaceAll("-", " ")}
                  </span>
                ))}
                {values.contentTopics.length > 8 ? (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-sky-100">{t("onboarding.ready.moreCount", { count: values.contentTopics.length - 8 })}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-[20px] border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {t("onboarding.back")}
        </button>
        <button
          type="button"
          onClick={(event) => onFinish?.(event)}
          disabled={saving}
          className="rounded-[20px] bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? t("onboarding.ready.savingSetup") : t("onboarding.ready.enterKunThai")}
        </button>
      </div>
    </OnboardingFrame>
  );
}
