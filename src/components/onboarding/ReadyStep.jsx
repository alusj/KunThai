import { Compass, ShoppingBag, CarFront } from "lucide-react";

import OnboardingFrame from "./OnboardingFrame";

const surfaceMap = {
  explore: { label: "Explore", icon: Compass },
  marketplace: { label: "Marketplace", icon: ShoppingBag },
  transport: { label: "Transport", icon: CarFront },
};

export default function ReadyStep({ values, saving, error, onBack, onFinish }) {
  const SurfaceIcon = surfaceMap[values.primarySurface]?.icon ?? Compass;
  const profileName =
    values.displayName || [values.firstName, values.middleName, values.lastName].filter(Boolean).join(" ");

  return (
    <OnboardingFrame
      step={4}
      total={4}
      title="You are ready to enter KunThai"
      subtitle="Here is a quick summary of how your platform setup will feel after we save it."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Profile</p>
          <div className="mt-4 flex items-center gap-4">
            {values.avatarUrl ? (
              <img src={values.avatarUrl} alt="Profile" className="h-16 w-16 rounded-3xl object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-xl font-semibold text-slate-700">
                {(profileName || "K").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-2xl font-semibold text-slate-950">{profileName || "New KunThai user"}</p>
              <p className="mt-2 text-sm text-slate-600">{values.username ? `@${values.username}` : "@username"}</p>
            </div>
          </div>
          <p className="mt-5 text-sm text-slate-600">
            {values.email || "Email"} - {values.phone || "Phone"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {values.city || "City"}, {values.country || "Country"}
          </p>
          <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
            {values.accountType}
          </p>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#082f49,#0f172a)] p-5 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-200">Default entry</p>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <SurfaceIcon size={20} />
            </span>
            <div>
              <p className="text-lg font-semibold">{surfaceMap[values.primarySurface]?.label ?? "Explore"}</p>
              <p className="text-sm text-slate-300">Your first landing space after sign-in.</p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-200">Interest tags</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(values.interests.length ? values.interests : ["social", "shopping", "rides"]).map((interest) => (
                <span key={interest} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold capitalize text-sky-100">
                  {interest.replace("-", " ")}
                </span>
              ))}
            </div>
          </div>
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
          Back
        </button>
        <button
          type="button"
          onClick={(event) => onFinish?.(event)}
          disabled={saving}
          className="rounded-[20px] bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving setup..." : "Enter KunThai"}
        </button>
      </div>
    </OnboardingFrame>
  );
}
