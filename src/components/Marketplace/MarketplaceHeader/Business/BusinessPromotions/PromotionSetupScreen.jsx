import { Copy, Globe2, MapPin, Megaphone, Share2, Target, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useSellerPromotions } from "../../../../../Backend/hooks/useSellerPromotions";
import {
  MINIMUM_VERIFIED_INVITES,
  PROMOTION_DAY_OPTIONS,
  PROMOTION_VIEW_GOALS,
  calculateMarketplacePromotionCost,
  normalizeInviteGoal,
} from "../../../../../Backend/services/visibilityCreditService";

const REACH_OPTIONS = [
  {
    id: "nearby",
    label: "Nearby",
    helper: "Prioritize buyers around the seller location.",
    icon: MapPin,
  },
  {
    id: "countrywide",
    label: "Countrywide",
    helper: "Promote across the current country market.",
    icon: Globe2,
  },
];

const AUDIENCE_OPTIONS = [
  {
    id: "general",
    label: "General audience",
    helper: "Eligible buyers ranked by marketplace relevance.",
    icon: UsersRound,
  },
  {
    id: "targeted",
    label: "Targeted audience",
    helper: "Stronger focus by area, category, and buyer intent.",
    icon: Target,
  },
];

export default function PromotionSetupScreen({ onBack, onDone, product }) {
  const { createError, createPromotion, creating, wallet } = useSellerPromotions();
  const [durationDays, setDurationDays] = useState(3);
  const [reachScope, setReachScope] = useState("nearby");
  const [audienceType, setAudienceType] = useState("general");
  const [viewGoal, setViewGoal] = useState(250);
  const [targetArea, setTargetArea] = useState("");
  const [result, setResult] = useState(null);
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => {
    setResult(null);
    setShareStatus("");
  }, [product?.id]);

  const creditCost = useMemo(
    () => calculateMarketplacePromotionCost({ audienceType, durationDays, reachScope, viewGoal }),
    [audienceType, durationDays, reachScope, viewGoal],
  );
  const balance = Number(wallet?.balance || 0);
  const creditsNeeded = Math.max(0, creditCost - balance);
  const requiredInvites = normalizeInviteGoal(Math.max(MINIMUM_VERIFIED_INVITES, creditCost));
  const canActivateNow = creditsNeeded === 0;

  async function submitPromotion() {
    const nextResult = await createPromotion(product, {
      audienceType,
      durationDays,
      reachScope,
      requiredInvites,
      targetArea,
      viewGoal,
    });
    setResult(nextResult);
  }

  async function shareInvite() {
    const task = result?.task || result?.promotion?.task;
    if (!task?.inviteUrl) return;
    const text = task.shareMessage || task.inviteUrl;
    try {
      if (navigator.share) {
        await navigator.share({ text, title: "Join KunThai UrMall", url: task.inviteUrl });
        setShareStatus("Invite shared. Credits count after verified people join.");
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareStatus("Invite link copied. Credits count after verified people join.");
    } catch {
      setShareStatus("Copy the invite link and share it with people you know.");
    }
  }

  if (!product) {
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="font-black text-gray-950">Choose a product to promote</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-gray-500">
          Promotion setup needs an active product so KunThai can connect the visibility task to a real listing.
        </p>
        <button type="button" onClick={onBack} className="mt-5 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white">
          Back to products
        </button>
      </section>
    );
  }

  if (result) {
    const task = result.task || result.promotion?.task;
    const active = result.status === "active";

    return (
      <section className="mx-auto max-w-4xl space-y-4">
        <div className={`rounded-xl border p-5 shadow-sm ${active ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <p className={`text-xs font-black uppercase ${active ? "text-emerald-700" : "text-amber-700"}`}>
            {active ? "Promotion active" : "Promotion task created"}
          </p>
          <h2 className="mt-2 text-2xl font-black text-gray-950">{product.name}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
            {active
              ? `This product is now in promoted cards for ${durationDays} day${durationDays === 1 ? "" : "s"} or until the selected view cap ends.`
              : `This product is live normally. Promoted placement unlocks after ${requiredInvites} verified people join through the invite link.`}
          </p>
        </div>

        {!active && task ? (
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-gray-950">Verified invite progress</p>
                <p className="mt-1 text-sm font-semibold text-gray-500">
                  {task.verifiedInvites || 0} / {task.requiredInvites || requiredInvites} verified people
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                Needs {creditsNeeded || result.creditsNeeded || creditCost} credits
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${Math.min(100, ((task.verifiedInvites || 0) / (task.requiredInvites || requiredInvites)) * 100)}%` }}
              />
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={shareInvite}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700"
              >
                <Share2 size={17} /> Share invite
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(task.inviteUrl)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 hover:bg-gray-50"
              >
                <Copy size={17} /> Copy link
              </button>
            </div>
            {shareStatus ? <p className="mt-3 text-xs font-bold text-emerald-700">{shareStatus}</p> : null}
          </section>
        ) : null}

        <button type="button" onClick={onDone} className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-black text-white">
          Done
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-sm font-black uppercase text-emerald-700">Promotion setup</p>
        <h2 className="mt-1 text-2xl font-black text-gray-950">List and promote conditions</h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-gray-500">
          {product.name} is promoted only when credits are available. If credits are short, KunThai creates a verified-invite task instead.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Credit balance" value={balance} helper="Available now" />
          <Metric label="Required" value={creditCost} helper="For this setup" />
          <Metric label="Verified invite task" value={requiredInvites} helper="Minimum 5 people" />
          <Metric label="Status" value={canActivateNow ? "Ready" : "Task"} helper={canActivateNow ? "Can activate now" : `${creditsNeeded} more credits`} />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="font-black text-gray-950">For how many days?</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROMOTION_DAY_OPTIONS.map((option) => (
            <ChoiceButton
              key={option.value}
              active={durationDays === option.value}
              label={option.label}
              onClick={() => setDurationDays(option.value)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <OptionGroup title="Reach" value={reachScope} options={REACH_OPTIONS} onChange={setReachScope} />
        <OptionGroup title="Audience" value={audienceType} options={AUDIENCE_OPTIONS} onChange={setAudienceType} />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <div>
            <h3 className="font-black text-gray-950">Target area and view cap</h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-gray-500">
              When the selected days or view cap ends, the product leaves promoted cards automatically.
            </p>
            <input
              value={targetArea}
              onChange={(event) => setTargetArea(event.target.value)}
              placeholder={reachScope === "countrywide" ? "Optional country, region, or city focus" : "City, district, or nearby area"}
              className="mt-4 h-12 w-full rounded-lg border border-gray-200 px-4 text-sm font-bold text-gray-950 outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <p className="text-sm font-black text-gray-800">View cap</p>
            <div className="mt-2 grid gap-2">
              {PROMOTION_VIEW_GOALS.map((option) => (
                <ChoiceButton
                  key={option.value}
                  active={viewGoal === option.value}
                  label={option.label}
                  onClick={() => setViewGoal(option.value)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {createError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {createError}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onBack} className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={submitPromotion}
          disabled={creating}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Megaphone size={17} /> {creating ? "Creating..." : canActivateNow ? "Activate promotion" : "Create invite task"}
        </button>
      </div>
    </section>
  );
}

function ChoiceButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-3 text-sm font-black transition ${
        active ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

function Metric({ helper, label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <p className="text-xs font-black uppercase text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-black text-gray-950">{value}</p>
      <p className="mt-1 text-xs font-bold text-gray-500">{helper}</p>
    </div>
  );
}

function OptionGroup({ onChange, options, title, value }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="font-black text-gray-950">{title}</h3>
      <div className="mt-3 grid gap-2">
        {options.map((option) => {
          const Icon = option.icon;
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${
                active ? "border-emerald-600 bg-emerald-50" : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <span className={`grid h-10 w-10 flex-none place-items-center rounded-lg ${active ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                <Icon size={18} />
              </span>
              <span>
                <span className="block text-sm font-black text-gray-950">{option.label}</span>
                <span className="mt-1 block text-xs font-semibold leading-5 text-gray-500">{option.helper}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
