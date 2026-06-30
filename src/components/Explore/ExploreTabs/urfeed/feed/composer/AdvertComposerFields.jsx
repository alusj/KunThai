import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarClock,
  Check,
  Image,
  Layers3,
  Link,
  MapPin,
  Megaphone,
  MousePointerClick,
  Newspaper,
  Phone,
  PlaySquare,
  ShieldCheck,
  Sparkles,
  Target,
  Video,
} from "lucide-react";

import { hasAdvertCoordinates } from "../../../../shared/advertUtils";
import { useAddressAreaValidation } from "../../../../../shared/AddressAreaValidation";

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
  "Follow",
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
  { value: "followers", label: "More Followers", description: "Grow an audience around your account." },
  { value: "website_clicks", label: "More Website Clicks", description: "Send people to your website or application page." },
  { value: "messages", label: "More Messages", description: "Encourage direct enquiries and conversations." },
  { value: "video_views", label: "More Video Views", description: "Prioritize people likely to watch your video." },
  { value: "event_promotion", label: "Promote an Event", description: "Share an event date, venue, and action." },
];

const AUDIENCES = [
  { value: "recommended", label: "Recommended Reach", description: "KunThai uses transparent Explore activity signals. AI-ready, without AI targeting yet." },
  { value: "everyone", label: "Everyone", description: "Eligible across public Explore, with relevance and safety ranking." },
  { value: "followers", label: "Followers Only", description: "Promoted to people who already follow your account." },
  { value: "followers_similar", label: "Followers + Similar Users", description: "Followers plus people with related Explore interests." },
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

const STEP_LABELS = ["Placement", "Objective", "Audience", "Duration", "Budget"];

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
      followers: "Follow",
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
        ? Number(advert.budgetAmount) > 0
        : true;

  if (step <= 5) {
    return (
      <section ref={rootRef} className="rounded-[26px] border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-white p-4 shadow-sm shadow-sky-950/[0.04]">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
            <Target size={20} strokeWidth={2.35} absoluteStrokeWidth />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-700">Campaign setup</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{STEP_LABELS[step - 1]}</h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Step {step} of 5 · Explore advertising only</p>
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
                    <MapPin size={14} /> Target city or area
                  </span>
                  <input
                    value={advert.targetArea}
                    onChange={(event) => onChange("targetArea", event.target.value)}
                    placeholder="Example: Freetown"
                    maxLength={80}
                    className="mt-2 h-11 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-emerald-300"
                  />
                  <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">People without location-personalization permission are not targeted by this option.</span>
                </label>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Age</span>
                  <select value={advert.ageRange} onChange={(event) => onChange("ageRange", event.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none">
                    <option value="everyone">Everyone</option>
                    <option value="13+">13+</option>
                    <option value="18+">18+</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Gender</span>
                  <select value={advert.genderTarget} onChange={(event) => onChange("genderTarget", event.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none">
                    <option value="all">Everyone</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>
              </div>

              {advert.ageRange === "custom" ? (
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Minimum age" min="13" max="120" value={advert.minimumAge} onChange={(value) => onChange("minimumAge", value)} />
                  <NumberField label="Maximum age" min={advert.minimumAge || "13"} max="120" value={advert.maximumAge} onChange={(value) => onChange("maximumAge", value)} />
                </div>
              ) : null}

              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Interest categories</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INTERESTS.map((interest) => {
                    const selected = advert.interests?.includes(interest.toLowerCase());
                    return (
                      <button key={interest} type="button" onClick={() => toggleInterest(interest)} className={`rounded-full px-3 py-2 text-xs font-black transition ${selected ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                        {interest}
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
                    {duration.label}
                  </button>
                ))}
              </div>
              {advert.durationPreset === "custom" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DateField label="Start date" value={advert.customStart} onChange={(value) => onChange("customStart", value)} />
                  <DateField label="End date" value={advert.customEnd} min={advert.customStart} onChange={(value) => onChange("customEnd", value)} />
                </div>
              ) : null}
              {!customDatesValid ? <p className="text-sm font-bold text-rose-600">Choose an end date after the start date.</p> : null}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[{ value: "daily", label: "Daily Budget" }, { value: "total", label: "Total Budget" }].map((budget) => (
                  <button key={budget.value} type="button" onClick={() => onChange("budgetType", budget.value)} className={`h-12 rounded-2xl border text-sm font-black ${advert.budgetType === budget.value ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
                    {budget.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Currency</span>
                  <input value={advert.currency} readOnly className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-100 px-3 text-sm font-black text-slate-900 outline-none" />
                </label>
                <NumberField label={advert.budgetType === "daily" ? "Amount per day" : "Campaign total"} min="1" step="0.01" value={advert.budgetAmount} onChange={(value) => onChange("budgetAmount", value)} />
              </div>
              <div className="flex items-start gap-3 rounded-[22px] border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <Banknote size={19} className="mt-0.5 flex-none" />
                <p className="text-xs font-bold leading-5">Budget is saved for campaign planning. No payment is collected in this version; the campaign model is ready for a future payment activation step.</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <button type="button" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))} className="kt-pressable inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 disabled:opacity-35">
            <ArrowLeft size={16} /> Back
          </button>
          <button type="button" disabled={!canContinue} onClick={continueSetup} className="kt-pressable inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-35">
            {step === 5 ? "Continue to creative" : "Continue"} {step === 5 ? <Check size={16} /> : <ArrowRight size={16} />}
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
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Sponsored creative</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Make it easy to act</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{formatPlacement(advert.placement)} · {formatObjective(advert.objective)} · {formatDuration(advert)}</p>
        </div>
        <button type="button" onClick={onEditCampaign} className="rounded-full bg-white px-3 py-2 text-xs font-black text-sky-700 ring-1 ring-sky-100">Edit setup</button>
      </div>

      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Advert title</span>
        <input value={advert.title} maxLength={30} onChange={(event) => onChange("title", event.target.value)} placeholder="Example: Weekend tailoring discount" className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
        <span className="mt-1 block text-right text-[11px] font-bold text-slate-400">{String(advert.title || "").length}/30</span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField label="Advert type" value={advert.type} onChange={(value) => onChange("type", value)} options={ADVERT_TYPES} />
        <SelectField label="Action button" value={advert.ctaLabel} onChange={(value) => onChange("ctaLabel", value)} options={CTA_OPTIONS.map((label) => ({ value: label, label }))} />
      </div>

      <label className="block">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500"><Phone size={14} /> Phone number</span>
        <input value={advert.phone} onChange={(event) => onChange("phone", event.target.value)} placeholder="Example: +232 76 123 456" inputMode="tel" autoComplete="tel" maxLength={32} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
        <span className="mt-2 block text-xs font-bold leading-5 text-slate-500">Adding a number publishes it on this sponsored advert and adds a phone action icon.</span>
      </label>

      <label className="block">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500"><Link size={14} /> Website or application link</span>
        <input value={advert.link} onChange={(event) => onChange("link", event.target.value)} placeholder="https://example.com" inputMode="url" className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
      </label>

      <div className="rounded-[22px] border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <label className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500"><MapPin size={14} /> Address</span>
            <input value={advert.address} onChange={(event) => {
              onChange("address", event.target.value);
              onChange("lat", null);
              onChange("lng", null);
              onChange("coordinatesLabel", "");
              onChange("source", "");
            }} placeholder="Enter address" maxLength={180} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none focus:border-emerald-300 focus:bg-white" />
          </label>
          <button type="button" onClick={onPickLocation} className="kt-pressable flex h-11 flex-none items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"><MapPin size={16} /> Area View</button>
        </div>
        {enteredAddress && (hasLocation || addressValidation.status === "found") ? (
          <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Location findable in Area View.</p>
        ) : enteredAddress && addressValidation.status === "searching" ? (
          <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">Checking whether this location is findable in Area View...</p>
        ) : enteredAddress && addressValidation.status === "notFound" ? (
          <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">Location is not findable in Area View. Please allow us to locate you.</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DateField label="Event or offer date" value={advert.date} onChange={(value) => onChange("date", value)} />
        <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Time</span><input value={advert.time} onChange={(event) => onChange("time", event.target.value)} type="time" className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none" /></label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MediaButton active={hasImage} icon={Image} label={hasImage ? "Image ready" : "Add image"} onClick={() => onSelectMedia("image")} />
        <MediaButton active={hasVideo} icon={Video} label={hasVideo ? "Video ready" : "Add video"} onClick={() => onSelectMedia("video")} accent="sky" />
      </div>

      {advert.placement === "swip" && !hasVideo ? <RequirementNote text="Swip placement requires a video before publishing." /> : null}
      {advert.placement === "both" && (!hasVideo || !hasImage) ? <RequirementNote text="UrFeed & Swip placement requires both an image and a video." /> : null}
      {advert.placement === "urfeed" && hasVideo && !hasImage ? <RequirementNote text="Add an image so this video campaign has an UrFeed creative." /> : null}

      <div className="rounded-[22px] border border-white bg-white/80 p-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400"><MousePointerClick size={14} /> Sponsored preview</div>
        <h4 className="mt-2 text-lg font-black text-slate-950">{advert.title || "Your advert headline"}</h4>
        <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{advert.address || advert.phone || advert.link || "Add a location, contact, link, or clear offer."}</p>
      </div>
    </section>
  );
}

function ChoiceGrid({ options, value, onChange }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{options.map((option) => {
    const Icon = option.icon || Sparkles;
    const active = value === option.value;
    return <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`flex items-start gap-3 rounded-[22px] border p-3 text-left transition ${active ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-slate-300"}`}><span className={`grid h-10 w-10 flex-none place-items-center rounded-2xl ${active ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}><Icon size={18} /></span><span className="min-w-0"><span className="block text-sm font-black text-slate-950">{option.label}</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{option.description}</span></span>{active ? <Check size={17} className="ml-auto flex-none text-sky-700" /> : null}</button>;
  })}</div>;
}

function SelectField({ label, value, onChange, options }) {
  return <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 outline-none">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
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
  return <div className="flex items-start gap-3 rounded-[22px] border border-sky-100 bg-sky-50/70 p-3"><ShieldCheck size={19} className="mt-0.5 flex-none text-sky-700" /><p className="text-xs font-bold leading-5 text-slate-600">Sponsored creatives are always public. Audience choices control promotion—not private access. KunThai does not use contacts, precise location, or sensitive personal traits for delivery.</p></div>;
}

function RequirementNote({ text }) {
  return <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">{text}</p>;
}

function formatPlacement(value) {
  return PLACEMENTS.find((item) => item.value === value)?.label || "UrFeed";
}

function formatObjective(value) {
  return OBJECTIVES.find((item) => item.value === value)?.label || "Brand Awareness";
}

function formatDuration(advert) {
  if (advert.durationPreset === "custom") return "Custom dates";
  return `${Number(advert.durationDays) || 14} days`;
}
