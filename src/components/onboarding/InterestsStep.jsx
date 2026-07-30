import { useState } from "react";
import { Compass, Store, CarFront, BellRing, MessageSquare, MapPinned, Sparkles } from "lucide-react";

import { EXPLORE_TOPIC_CATALOG, STARTER_EXPLORE_TOPICS } from "../../data/exploreTopics";
import { useI18n, t } from "../../i18n";
import OnboardingFrame from "./OnboardingFrame";

const options = [
  { id: "nearby", labelKey: "optNearby", icon: MapPinned },
  { id: "social", labelKey: "optSocial", icon: Compass },
  { id: "shopping", labelKey: "optShopping", icon: Store },
  { id: "business", labelKey: "optBusiness", icon: BellRing },
  { id: "rides", labelKey: "optRides", icon: CarFront },
  { id: "messages", labelKey: "optMessages", icon: MessageSquare },
];

const surfaceOptions = [
  { id: "explore", labelKey: "openExplore", bodyKey: "openExploreBody" },
  { id: "marketplace", labelKey: "openMarketplace", bodyKey: "openMarketplaceBody" },
  { id: "transport", labelKey: "openTransport", bodyKey: "openTransportBody" },
];

export default function InterestsStep({ values, saving = false, onToggleInterest, onToggleContentTopic, onChange, onBack, onNext }) {
  useI18n();
  const [showAllTopics, setShowAllTopics] = useState(false);
  const visibleTopics = showAllTopics ? EXPLORE_TOPIC_CATALOG : STARTER_EXPLORE_TOPICS;

  return (
    <OnboardingFrame
      step={3}
      total={4}
      title={t("onboarding.interests.title")}
      subtitle={t("onboarding.interests.subtitle")}
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">{t("onboarding.interests.careAbout")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {options.map((option) => {
              const Icon = option.icon;
              const active = values.interests.includes(option.id);

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onToggleInterest(option.id)}
                  className={`flex items-center gap-3 rounded-[22px] border px-4 py-4 text-left transition ${
                    active ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${active ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    <Icon size={18} />
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{t(`onboarding.interests.${option.labelKey}`)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">{t("onboarding.interests.openFirst")}</p>
          <div className="mt-4 space-y-3">
            {surfaceOptions.map((surface) => (
              <button
                key={surface.id}
                type="button"
                onClick={() => onChange("primarySurface", surface.id)}
                className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                  values.primarySurface === surface.id
                    ? "border-orange-500 bg-orange-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{t(`onboarding.interests.${surface.labelKey}`)}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{t(`onboarding.interests.${surface.bodyKey}`)}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-sky-100 bg-sky-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-sky-700 text-white">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">{t("onboarding.interests.enjoySeeing")}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("onboarding.interests.topicsHint")}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-800 shadow-sm">
            {t("onboarding.interests.nSelected", { count: values.contentTopics.length })}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {visibleTopics.map((topic) => {
            const active = values.contentTopics.includes(topic.slug);
            return (
              <button
                key={topic.slug}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleContentTopic(topic.slug)}
                className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-sky-700 bg-sky-700 text-white"
                    : "border-sky-100 bg-white text-slate-700 hover:border-sky-300"
                }`}
              >
                {topic.name}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowAllTopics((current) => !current)}
          className="mt-4 text-sm font-semibold text-sky-800"
        >
          {showAllTopics ? t("onboarding.interests.showFewer") : t("onboarding.interests.showMore")}
        </button>
      </div>

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
          onClick={onNext}
          disabled={saving}
          className="rounded-[20px] bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {saving ? t("onboarding.saving") : t("onboarding.interests.reviewSetup")}
        </button>
      </div>
    </OnboardingFrame>
  );
}
