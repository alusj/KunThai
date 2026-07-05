import { CarFront, Compass, ShoppingBag } from "lucide-react";

import OnboardingFrame from "./OnboardingFrame";

const cards = [
  {
    icon: Compass,
    title: "Explore",
    body: "Discover people, posts, and local activity.",
  },
  {
    icon: ShoppingBag,
    title: "Marketplace",
    body: "Shop, sell, and manage business activity.",
  },
  {
    icon: CarFront,
    title: "Transport",
    body: "Book rides and delivery from the same account.",
  },
];

export default function WelcomeStep({ profile, onNext }) {
  const isConnectedProvider = ["google", "apple", "facebook", "phone"].includes(profile?.provider);
  const grantedItems = [
    profile?.displayName ? "name" : null,
    profile?.email ? "email" : null,
    profile?.phone ? "phone" : null,
    profile?.avatarUrl ? "profile photo" : null,
  ].filter(Boolean);

  return (
    <OnboardingFrame
      step={1}
      total={4}
      title={isConnectedProvider ? `${profile.providerName} connected` : "Welcome to KunThai"}
      subtitle={
        isConnectedProvider
          ? `Your ${profile.providerName} sign-in was successful. We'll use the granted information to speed up setup.`
          : "Let's set up your account before you enter KunThai."
      }
    >
      {isConnectedProvider ? (
        <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Profile" className="h-14 w-14 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-lg font-semibold text-sky-700">
                {(profile?.displayName || "K").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-lg font-semibold text-slate-900">{profile?.displayName || "Your account"}</p>
              <p className="mt-1 text-sm text-slate-600">{profile?.email || profile?.phone || profile?.providerName}</p>
            </div>
          </div>

          {grantedItems.length ? (
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Granted information: {grantedItems.join(", ")}.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Icon size={22} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.body}</p>
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
          Continue
        </button>
      </div>
    </OnboardingFrame>
  );
}
