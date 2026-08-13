import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Image,
  Layers3,
  Link,
  MapPin,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Newspaper,
  Phone,
  PlaySquare,
  ShieldCheck,
  Share2,
  Sparkles,
  Target,
  Video,
} from "lucide-react";

import { useVisibilityCredits } from "../../../../../../Backend/hooks/useVisibilityCredits";
import {
  MINIMUM_VISIBILITY_CREDITS,
  normalizeVisibilityCreditSpend,
  VISIBILITY_BOOST_PACKAGES,
} from "../../../../../../Backend/services/visibilityCreditService";
import { hasAdvertCoordinates } from "../../../../shared/advertUtils";
import { useAddressAreaValidation } from "../../../../../shared/AddressAreaValidation";
import { t as i18nText, uiText } from "../../../../../../i18n/index";

const ADVERT_TYPES = [
  { value: "offer", label: "Offer" },
  { value: "service", label: "Service" },
  { value: "event", label: "Event" },
  { value: "job-vacancy", label: "Job Vacancy" },
  { value: "announcement", label: "Announcement" },
];

const CTA_OPTIONS = [
  "Learn more",
  "Visit website",
  "View profile",
  "Connect",
  "Call or message",
  "Watch now",
  "Get directions",
  "Book now",
  "Apply",
];

const PLACEMENTS = [
  { value: "urfeed", label: "UrFeed", description: "Native sponsored card between Explore posts.", icon: Newspaper },
  { value: "swip", label: "Swip", description: "Full-screen sponsored video between Swips.", icon: PlaySquare },
  { value: "both", label: "UrFeed & Swip", description: "Use an image in UrFeed and video in Swip.", icon: Layers3 },
];

const OBJECTIVES = [
  { value: "brand_awareness", label: "Brand Awareness", description: "Introduce your name, offer, or work." },
  { value: "profile_visits", label: "More Profile Visits", description: "Guide interested people to your Explore profile." },
  { value: "followers", label: "More Connections", description: "Grow connected people around your account." },
  { value: "website_clicks", label: "More Website Clicks", description: "Send people to your website or application page." },
  { value: "messages", label: "More Messages", description: "Encourage direct enquiries and conversations." },
  { value: "video_views", label: "More Video Views", description: "Prioritize people likely to watch your video." },
  { value: "event_promotion", label: "Promote an Event", description: "Share an event date, venue, and action." },
];

const AUDIENCES = [
  { value: "recommended", label: "Recommended Reach", description: "KunThai uses transparent Explore activity signals. AI-ready, without AI targeting yet." },
  { value: "everyone", label: "Everyone", description: "Eligible across public Explore, with relevance and safety ranking." },
  { value: "followers", label: "Connections Only", description: "Promoted to people already connected with your account." },
  { value: "followers_similar", label: "Connections + Similar Users", description: "Connected people plus others with related Explore interests." },
  { value: "nearby", label: "Nearby Reach", description: "Uses only coarse area personalization that viewers have permitted." },
];

const INTERESTS = [
  "Technology", "Fashion", "Beauty", "Food", "Sports", "Music", "Entertainment",
  "Education", "Business", "Travel", "Photography", "Gaming", "News",
];

const DURATIONS = [
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "custom", label: "Custom" },
];

const STEP_LABELS = ["Placement", "Objective", "Audience", "Duration", "Credits"];

export default function AdvertComposerFields({
  advert,
  imagePreview,
  onChange,
  onPickLocation,
  onSelectMedia,
  pendingVideoFile,
  videoPreview,
}) {
  const [step, setStep] = useState(advert.setupComplete ? 6 : 1);
  const rootRef = useRef(null);
  const hasVideo = Boolean(videoPreview || pendingVideoFile);
  const hasImage = Boolean(imagePreview);
  const credits = useVisibilityCredits();
  const [creditFeedback, setCreditFeedback] = useState("");
  const selectedCredits = normalizeVisibilityCreditSpend(
    advert.creditSpend || advert.budgetAmount,
    MINIMUM_VISIBILITY_CREDITS,
  );
  const availableCredits = Number(credits.balance || 0);
  const hasEnoughCredits = availableCredits >= selectedCredits;
  const balanceAfterSpend = Math.max(0, availableCredits - selectedCredits);

  useLayoutEffect(() => {
    rootRef.current?.closest("[data-explore-composer-scroll]")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [step]);

  function continueSetup() {
    if (step < 5) {
      setStep((current) => current + 1);
      return;
    }
    onChange("setupComplete", true);
    setStep(6);
  }

  function selectObjective(value) {
    onChange("objective", value);
    const suggestedActions = {
      profile_visits: "View profile",
      followers: "Connect",
      website_clicks: "Visit website",
      messages: "Call or message",
      video_views: "Watch now",
      event_promotion: "Learn more",
    };
    if (!advert.ctaLabel || advert.ctaLabel === "Learn more") {
      onChange("ctaLabel", suggestedActions[value] || "Learn more");
    }
  }

  function toggleInterest(interest) {
    const normalized = interest.toLowerCase();
    const current = Array.isArray(advert.interests) ? advert.interests : [];
    onChange("interests", current.includes(normalized)
      ? current.filter((item) => item !== normalized)
      : [...current, normalized]);
  }

  const customDatesValid = advert.durationPreset !== "custom"
    || (advert.customStart && advert.customEnd && advert.customEnd >= advert.customStart);
  const canContinue = step === 3 && advert.audienceType === "nearby"
    ? Boolean(String(advert.targetArea || "").trim())
      : step === 4
      ? customDatesValid
      : step === 5
        ? selectedCredits >= MINIMUM_VISIBILITY_CREDITS && hasEnoughCredits && !credits.loading
        : true;

  async function handleShareCredits() {
    setCreditFeedback("");
    try {
      await credits.shareInvite();
      setCreditFeedback(i18nText("ui.literals.k77a6a6948969"));
    } catch (error) {
      setCreditFeedback(error.message || i18nText("ui.literals.kf27c08df5f80"));
    }
  }

  if (step <= 5) {
    return (
      <section ref={rootRef} className="rounded-[26px] border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-white p-4 shadow-sm shadow-sky-950/[0.04]">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
            <Target size={20} strokeWidth={2.35} absoluteStrokeWidth />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.k0f49597c1ab8")}</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{uiText(STEP_LABELS[step - 1])}</h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{i18nText("ui.literals.kdc416e1088e4")} {step} {i18nText("ui.literals.kb4ec0a5c208b")}</p>
          </div>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700">{step}/5</span>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${step * 20}%` }} />
        </div>

        <div className="mt-5">
          {step === 1 ? (
            <ChoiceGrid options={PLACEMENTS} value={advert.placement} onChange={(value) => onChange("placement", value)} />
          ) : null}

          {step === 2 ? (
            <ChoiceGrid options={OBJECTIVES} value={advert.objective} onChange={selectObjective} />
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <ChoiceGrid options={AUDIENCES} value={advert.audienceType} onChange={(value) => onChange("audienceType", value)} />

              {advert.audienceType === "nearby" ? (
                <label className="block rounded-[22px] border border-emerald-100 bg-emerald-50/60 p-3">
                  <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
                    <MapPin size={14} /> {i18nText("ui.literals.kde12b8e3e498")}
                  </span>
                  <input
                    value={advert.targetArea}
                    onChange={(event) => onChange("targetArea", event.target.value)}
                    placeholder={i18nText("ui.literals.kde12b8e3e498")}
                    maxLength={80}
                    className="mt-2 h-11 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-emerald-300"
                  />
                  <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">{i18nText("ui.literals.k906b57dc1464")}</span>
                </label>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{i18nText("ui.literals.kff9f1ff32120")}</span>
                  <select value={advert.ageRange} onChange={(event) => onChange("ageRange", event.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none">
                    <option value="everyone">{i18nText("ui.literals.kc756f6af1f03")}</option>
                    <option value="13+">13+</option>
                    <option value="18+">18+</option>
                    <option value="custom">{i18nText("ui.literals.k081ae3fdc403")}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{i18nText("ui.literals.k8a754c61c2ce")}</span>
                  <select value={advert.genderTarget} onChange={(event) => onChange("genderTarget", event.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none">
                    <option value="all">{i18nText("ui.literals.kc756f6af1f03")}</option>
                    <option value="male">{i18nText("ui.literals.k3f3a489c72de")}</option>
                    <option value="female">{i18nText("ui.literals.kb7c17e97d3d6")}</option>
                  </select>
                </label>
              </div>

              {advert.ageRange === "custom" ? (
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label={i18nText("ui.literals.k6d6060e923d1")} min="13" max="120" value={advert.minimumAge} onChange={(value) => onChange("minimumAge", value)} />
                  <NumberField label={i18nText("ui.literals.k289f169c9369")} min={advert.minimumAge || "13"} max="120" value={advert.maximumAge} onChange={(value) => onChange("maximumAge", value)} />
                </div>
              ) : null}

              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{i18nText("ui.literals.k8351236f4aea")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INTERESTS.map((interest) => {
                    const selected = advert.interests?.includes(interest.toLowerCase());
                    return (
                      <button key={interest} type="button" onClick={() => toggleInterest(interest)} className={`rounded-full px-3 py-2 text-xs font-black transition ${selected ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                      {uiText(interest)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <PrivacyNote />
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DURATIONS.map((duration) => (
                  <button key={duration.value} type="button" onClick={() => {
                    onChange("durationPreset", duration.value);
                    if (duration.value !== "custom") onChange("durationDays", Number(duration.value));
                  }} className={`h-12 rounded-2xl border text-sm font-black ${advert.durationPreset === duration.value ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
                    {uiText(duration.label)}
                  </button>
                ))}
              </div>
              {advert.durationPreset === "custom" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DateField label={i18nText("ui.literals.kff99f5b5f794")} value={advert.customStart} onChange={(value) => onChange("customStart", value)} />
                  <DateField label={i18nText("ui.literals.k89d10cd6c1e1")} value={advert.customEnd} min={advert.customStart} onChange={(value) => onChange("customEnd", value)} />
                </div>
              ) : null}
              {!customDatesValid ? <p className="text-sm font-bold text-rose-600">{i18nText("ui.literals.kb56ea585c49e")}</p> : null}
            </div>
          ) : null}

          {step === 5 ? (
            <VisibilityCreditSelector
              advert={advert}
              availableCredits={availableCredits}
              balanceAfterSpend={balanceAfterSpend}
              creditFeedback={creditFeedback || credits.error}
              creditLoading={credits.loading}
              hasEnoughCredits={hasEnoughCredits}
              onChange={onChange}
              onShare={handleShareCredits}
              selectedCredits={selectedCredits}
            />
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <button type="button" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))} className="kt-pressable inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 disabled:opacity-35">
            <ArrowLeft size={16} /> {i18nText("ui.literals.kb52b36b7269f")}
          </button>
          <button type="button" disabled={!canContinue} onClick={continueSetup} className="kt-pressable inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-35">
            {step === 5 ? i18nText("ui.literals.kab83ff8888d3") : i18nText("ui.literals.k2e02623966f9")} {step === 5 ? <Check size={16} /> : <ArrowRight size={16} />}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div ref={rootRef}>
    <CreativeFields
      advert={advert}
      hasImage={hasImage}
      hasVideo={hasVideo}
      onChange={onChange}
      onEditCampaign={() => {
        onChange("setupComplete", false);
        setStep(1);
      }}
      onPickLocation={onPickLocation}
      onSelectMedia={onSelectMedia}
    />
    </div>
  );
}

function CreativeFields({ advert, hasImage, hasVideo, onChange, onEditCampaign, onPickLocation, onSelectMedia }) {
  const hasLocation = hasAdvertCoordinates(advert);
  const enteredAddress = String(advert.address || "").trim();
  const addressValidation = useAddressAreaValidation(enteredAddress, {
    enabled: Boolean(enteredAddress),
    selectedPoint: hasLocation ? advert : null,
  });

  useEffect(() => {
    const result = addressValidation.result;
    if (addressValidation.status !== "found" || hasLocation || !result) return;
    if (!hasAdvertCoordinates(result)) return;

    onChange("lat", Number(result.lat));
    onChange("lng", Number(result.lng));
    onChange("coordinatesLabel", `${Number(result.lat).toFixed(6)}, ${Number(result.lng).toFixed(6)}`);
    onChange("source", "areaViewSearch");
  }, [addressValidation.result, addressValidation.status, hasLocation, onChange]);

  return (
    <section className="space-y-4 rounded-[26px] border border-amber-200 bg-amber-50/45 p-4 shadow-sm shadow-amber-950/[0.03]">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-white text-amber-700 ring-1 ring-amber-100"><Megaphone size={20} strokeWidth={2.35} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">{i18nText("ui.literals.kb304e646a318")}</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{i18nText("ui.literals.kaf75c82c8bff")}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{formatPlacement(advert.placement)} · {formatObjective(advert.objective)} · {formatDuration(advert)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
            {normalizeVisibilityCreditSpend(advert.creditSpend || advert.budgetAmount, MINIMUM_VISIBILITY_CREDITS)} {i18nText("ui.literals.k66c22fad3a99")}
          </span>
          <button type="button" onClick={onEditCampaign} className="rounded-full bg-white px-3 py-2 text-xs font-black text-sky-700 ring-1 ring-sky-100">{i18nText("ui.literals.k72d2c5fecf4c")}</button>
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{i18nText("ui.literals.kd5fcfe40a19e")}</span>
        <input value={advert.title} maxLength={30} onChange={(event) => onChange("title", event.target.value)} placeholder={i18nText("ui.literals.k8be94f3e824d")} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
        <span className="mt-1 block text-right text-[11px] font-bold text-slate-400">{String(advert.title || "").length}/30</span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField label={i18nText("ui.literals.k7208b99af7ee")} value={advert.type} onChange={(value) => onChange("type", value)} options={ADVERT_TYPES} />
        <SelectField label={i18nText("ui.literals.k81156442640c")} value={advert.ctaLabel} onChange={(value) => onChange("ctaLabel", value)} options={CTA_OPTIONS.map((label) => ({ value: label, label }))} />
      </div>

      <label className="block">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500"><Phone size={14} /> {i18nText("ui.literals.k8961d3bf56ef")}</span>
        <input value={advert.phone} onChange={(event) => onChange("phone", event.target.value)} placeholder={i18nText("ui.literals.kc5a16fb6b294")} inputMode="tel" autoComplete="tel" maxLength={32} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
        <span className="mt-2 block text-xs font-bold leading-5 text-slate-500">{i18nText("ui.literals.k6457c92e34ae")}</span>
      </label>

      <label className="block">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500"><MessageCircle size={14} /> {i18nText("ui.literals.k4955eb6c2b6d")}</span>
        <input value={advert.whatsapp} onChange={(event) => onChange("whatsapp", event.target.value)} placeholder={i18nText("ui.literals.kc5a16fb6b294")} inputMode="tel" autoComplete="tel" maxLength={40} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
        <span className="mt-2 block text-xs font-bold leading-5 text-slate-500">{i18nText("ui.literals.k522512d3a3f9")}</span>
      </label>

      <label className="block">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500"><Link size={14} /> {i18nText("ui.literals.k6790edee3d80")}</span>
        <input value={advert.link} onChange={(event) => onChange("link", event.target.value)} placeholder="https://example.com" inputMode="url" className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
      </label>

      <div className="rounded-[22px] border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <label className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500"><MapPin size={14} /> {i18nText("ui.literals.kd70f93df5e8f")}</span>
            <input value={advert.address} onChange={(event) => {
              onChange("address", event.target.value);
              onChange("lat", null);
              onChange("lng", null);
              onChange("coordinatesLabel", "");
              onChange("source", "");
            }} placeholder={i18nText("ui.literals.k65c5d8b667b9")} maxLength={180} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none focus:border-emerald-300 focus:bg-white" />
          </label>
          <button type="button" onClick={onPickLocation} className="kt-pressable flex h-11 flex-none items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"><MapPin size={16} /> {i18nText("ui.literals.k3e6700bf9758")}</button>
        </div>
        {enteredAddress && (hasLocation || addressValidation.status === "found") ? (
          <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">{i18nText("ui.literals.k932dd4b9eb49")}</p>
        ) : enteredAddress && addressValidation.status === "searching" ? (
          <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">{i18nText("ui.literals.k67973aa996db")}</p>
        ) : enteredAddress && addressValidation.status === "notFound" ? (
          <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">{i18nText("ui.literals.kf637cc5403ff")}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DateField label={i18nText("ui.literals.kdc6dded12b08")} value={advert.date} onChange={(value) => onChange("date", value)} />
        <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{i18nText("ui.literals.k6c82e6dd8680")}</span><input value={advert.time} onChange={(event) => onChange("time", event.target.value)} type="time" className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none" /></label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MediaButton active={hasImage} icon={Image} label={hasImage ? i18nText("ui.literals.k6ad38661b683") : i18nText("ui.literals.k5375634e24c9")} onClick={() => onSelectMedia("image")} />
        <MediaButton active={hasVideo} icon={Video} label={hasVideo ? i18nText("ui.literals.k99cab3ced87c") : i18nText("ui.literals.k8f9f9ae1e5f2")} onClick={() => onSelectMedia("video")} accent="sky" />
      </div>

      {advert.placement === "swip" && !hasVideo ? <RequirementNote text="Swip placement requires a video before publishing." /> : null}
      {advert.placement === "both" && (!hasVideo || !hasImage) ? <RequirementNote text="UrFeed & Swip placement requires both an image and a video." /> : null}
      {advert.placement === "urfeed" && hasVideo && !hasImage ? <RequirementNote text="Add an image so this video campaign has an UrFeed creative." /> : null}

      <div className="rounded-[22px] border border-white bg-white/80 p-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400"><MousePointerClick size={14} /> {i18nText("ui.literals.k2bd77db1594c")}</div>
        <h4 className="mt-2 text-lg font-black text-slate-950">{advert.title || i18nText("ui.literals.k0d71c321e780")}</h4>
        <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{advert.address || advert.phone || advert.link || i18nText("ui.literals.kc3667396fca8")}</p>
      </div>
    </section>
  );
}

function VisibilityCreditSelector({
  advert,
  availableCredits,
  balanceAfterSpend,
  creditFeedback,
  creditLoading,
  hasEnoughCredits,
  onChange,
  onShare,
  selectedCredits,
}) {
  const selectedPackage = advert.creditPackage || (
    VISIBILITY_BOOST_PACKAGES.find((item) => item.id !== "custom" && item.credits === selectedCredits)?.id || "custom"
  );
  const canUseAll = availableCredits >= MINIMUM_VISIBILITY_CREDITS;

  function setCreditSpend(value) {
    const normalized = normalizeVisibilityCreditSpend(value, MINIMUM_VISIBILITY_CREDITS);
    onChange("creditSpend", String(normalized));
    onChange("budgetType", "total");
    onChange("budgetAmount", String(normalized));
  }

  function selectPackage(item) {
    onChange("creditPackage", item.id);
    if (item.id !== "custom") setCreditSpend(item.credits);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-sky-100 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Visibility Credits</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{creditLoading ? "..." : availableCredits}</p>
          </div>
          <button
            type="button"
            onClick={onShare}
            className="kt-pressable inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
          >
            <Share2 size={16} />
            {i18nText("ui.literals.kdbcc1e50dcbe")}
          </button>
        </div>
        <p className="mt-3 text-xs font-bold leading-5 text-slate-500">
          {i18nText("ui.literals.k5dc29a8f9360")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {VISIBILITY_BOOST_PACKAGES.map((item) => {
          const active = selectedPackage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectPackage(item)}
              className={`rounded-[22px] border p-3 text-left transition ${
                active ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-black text-slate-950">{uiText(item.label)}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                  {item.id === "custom" ? i18nText("ui.literals.k322444d3bb52") : item.credits}
                </span>
              </span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{uiText(item.helper)}</span>
            </button>
          );
        })}
      </div>

      {selectedPackage === "custom" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <NumberField
            label={i18nText("ui.literals.k02813b2ded6e")}
            min={MINIMUM_VISIBILITY_CREDITS}
            step="1"
            value={String(selectedCredits)}
            onChange={(value) => {
              onChange("creditPackage", "custom");
              setCreditSpend(value);
            }}
          />
          <button
            type="button"
            onClick={() => {
              onChange("creditPackage", "custom");
              setCreditSpend(availableCredits);
            }}
            disabled={!canUseAll}
            className="kt-pressable h-12 self-end rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-40"
          >
            {i18nText("ui.literals.kd81b6af5429f")}
          </button>
        </div>
      ) : null}

      <div className={`rounded-[22px] border p-3 ${hasEnoughCredits ? "border-emerald-100 bg-emerald-50/70" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black">
          <span className={hasEnoughCredits ? "text-emerald-800" : "text-amber-900"}>
            {i18nText("ui.literals.k4302223c8ce6")} {selectedCredits} {i18nText("ui.literals.k66c22fad3a99")}
          </span>
          <span className={hasEnoughCredits ? "text-emerald-800" : "text-amber-900"}>
            {i18nText("ui.literals.k255d39f8177d")} {hasEnoughCredits ? balanceAfterSpend : availableCredits}
          </span>
        </div>
        {!hasEnoughCredits ? (
          <p className="mt-2 text-xs font-bold leading-5 text-amber-900">
            {i18nText("ui.literals.kcd203af054b5")} {selectedCredits} {i18nText("ui.literals.k3a44b838fc53")}
          </p>
        ) : null}
      </div>

      {creditFeedback ? <p className="text-xs font-black text-sky-700">{creditFeedback}</p> : null}
    </div>
  );
}

function ChoiceGrid({ options, value, onChange }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{options.map((option) => {
    const Icon = option.icon || Sparkles;
    const active = value === option.value;
    return <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`flex items-start gap-3 rounded-[22px] border p-3 text-left transition ${active ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-slate-300"}`}><span className={`grid h-10 w-10 flex-none place-items-center rounded-2xl ${active ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}><Icon size={18} /></span><span className="min-w-0"><span className="block text-sm font-black text-slate-950">{uiText(option.label)}</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{uiText(option.description)}</span></span>{active ? <Check size={17} className="ml-auto flex-none text-sky-700" /> : null}</button>;
  })}</div>;
}

function SelectField({ label, value, onChange, options }) {
  return <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 outline-none">{options.map((option) => <option key={option.value} value={option.value}>{uiText(option.label)}</option>)}</select></label>;
}

function NumberField({ label, value, onChange, ...props }) {
  return <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span><input {...props} type="number" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 outline-none focus:border-sky-300" /></label>;
}

function DateField({ label, value, onChange, min }) {
  return <label className="block"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500"><CalendarClock size={14} /> {label}</span><input type="date" min={min} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none" /></label>;
}

function MediaButton({ active, accent = "emerald", icon: Icon, label, onClick }) {
  const activeClass = accent === "sky" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return <button type="button" onClick={onClick} className={`kt-pressable flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-black ${active ? activeClass : "border-slate-200 bg-white text-slate-700"}`}><Icon size={17} />{label}</button>;
}

function PrivacyNote() {
  return <div className="flex items-start gap-3 rounded-[22px] border border-sky-100 bg-sky-50/70 p-3"><ShieldCheck size={19} className="mt-0.5 flex-none text-sky-700" /><p className="text-xs font-bold leading-5 text-slate-600">{i18nText("ui.literals.k928af3dfc2c0")}</p></div>;
}

function RequirementNote({ text }) {
  return <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">{text}</p>;
}

function formatPlacement(value) {
  return uiText(PLACEMENTS.find((item) => item.value === value)?.label || "UrFeed");
}

function formatObjective(value) {
  return uiText(OBJECTIVES.find((item) => item.value === value)?.label || "Brand Awareness");
}

function formatDuration(advert) {
  if (advert.durationPreset === "custom") return "Custom dates";
  return `${Number(advert.durationDays) || 14} days`;
}
