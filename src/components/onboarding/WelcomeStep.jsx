import { CarFront, Compass, ShoppingBag } from "lucide-react";

import { useI18n, t } from "../../i18n";
import OnboardingFrame from "./OnboardingFrame";

const cards = [
  { icon: Compass, titleKey: "exploreT", bodyKey: "exploreB" },
  { icon: ShoppingBag, titleKey: "marketplaceT", bodyKey: "marketplaceB" },
  { icon: CarFront, titleKey: "urrideT", bodyKey: "urrideB" },
];

export default function WelcomeStep({ profile, onNext }) {
  useI18n();
  const isConnectedProvider = ["google", "apple", "facebook", "phone"].includes(profile?.provider);
  const grantedItems = [
    profile?.displayName ? t("onboarding.welcome.itemName") : null,
    profile?.email ? t("onboarding.welcome.itemEmail") : null,
    profile?.phone ? t("onboarding.welcome.itemPhone") : null,
    profile?.avatarUrl ? t("onboarding.welcome.itemPhoto") : null,
  ].filter(Boolean);

  return (
    <OnboardingFrame
      step={1}
      total={4}
      title={isConnectedProvider ? t("onboarding.welcome.providerConnected", { provider: profile.providerName }) : t("onboarding.welcome.title")}
      subtitle={
        isConnectedProvider
          ? t("onboarding.welcome.providerSubtitle", { provider: profile.providerName })
          : t("onboarding.welcome.subtitle")
      }
    >
      {isConnectedProvider ? (
        <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt={t("onboarding.welcome.profileAlt")} className="h-14 w-14 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-lg font-semibold text-sky-700">
                {(profile?.displayName || "K").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-lg font-semibold text-slate-900">{profile?.displayName || t("onboarding.welcome.yourAccount")}</p>
              <p className="mt-1 text-sm text-slate-600">{profile?.email || profile?.phone || profile?.providerName}</p>
            </div>
          </div>

          {grantedItems.length ? (
            <p className="mt-4 text-sm leading-6 text-slate-600">
              {t("onboarding.welcome.grantedInfo", { items: grantedItems.join(", ") })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.titleKey} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Icon size={22} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{t(`onboarding.welcome.${card.titleKey}`)}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t(`onboarding.welcome.${card.bodyKey}`)}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={onNext}
          className="inline-flex rounded-[20px] bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {t("onboarding.continue")}
        </button>
      </div>
    </OnboardingFrame>
  );
}
