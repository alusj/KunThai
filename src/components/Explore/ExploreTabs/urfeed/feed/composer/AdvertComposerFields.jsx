import {
  CalendarClock,
  Image,
  Link,
  MapPin,
  Megaphone,
  MousePointerClick,
  Video,
} from "lucide-react";

const ADVERT_TYPES = [
  { value: "offer", label: "Offer" },
  { value: "service", label: "Service" },
  { value: "event", label: "Event" },
  { value: "announcement", label: "Announcement" },
];

const CTA_OPTIONS = [
  "Learn more",
  "Visit website",
  "Call or message",
  "Get directions",
  "Book now",
];

export default function AdvertComposerFields({
  advert,
  imagePreview,
  onChange,
  onPickLocation,
  onSelectMedia,
  pendingVideoFile,
  videoPreview,
}) {
  const hasVideo = Boolean(videoPreview || pendingVideoFile);
  const hasImage = Boolean(imagePreview);
  const hasLocation = Number.isFinite(Number(advert?.lat)) && Number.isFinite(Number(advert?.lng));

  return (
    <section className="space-y-4 rounded-[26px] border border-amber-200 bg-amber-50/45 p-4 shadow-sm shadow-amber-950/[0.03]">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-white text-amber-700 ring-1 ring-amber-100">
          <Megaphone size={20} strokeWidth={2.35} absoluteStrokeWidth />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Advert setup</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Make it easy to act on</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
            Add the offer, link, location, and schedule people need before they tap.
          </p>
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Advert title</span>
        <input
          value={advert.title}
          onChange={(event) => onChange("title", event.target.value)}
          placeholder="Example: Weekend tailoring discount"
          className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Advert type</span>
          <select
            value={advert.type}
            onChange={(event) => onChange("type", event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
          >
            {ADVERT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Action button</span>
          <select
            value={advert.ctaLabel}
            onChange={(event) => onChange("ctaLabel", event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
          >
            {CTA_OPTIONS.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
          <Link size={14} strokeWidth={2.4} absoluteStrokeWidth />
          Website or booking link
        </span>
        <input
          value={advert.link}
          onChange={(event) => onChange("link", event.target.value)}
          placeholder="https://example.com"
          inputMode="url"
          className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
        />
      </label>

      <div className="rounded-[22px] border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              <MapPin size={14} strokeWidth={2.4} absoluteStrokeWidth />
              Address
            </span>
            <p className="mt-1 truncate text-sm font-bold text-slate-800">
              {advert.address || "Add a shop, event, pickup point, or service area."}
            </p>
          </div>
          <button
            type="button"
            onClick={onPickLocation}
            className="kt-pressable flex h-11 flex-none items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
          >
            <MapPin size={16} strokeWidth={2.5} absoluteStrokeWidth />
            Area View
          </button>
        </div>
        {hasLocation ? (
          <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
            Map point attached: {Number(advert.lat).toFixed(5)}, {Number(advert.lng).toFixed(5)}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <CalendarClock size={14} strokeWidth={2.4} absoluteStrokeWidth />
            Date
          </span>
          <input
            value={advert.date}
            onChange={(event) => onChange("date", event.target.value)}
            type="date"
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Time</span>
          <input
            value={advert.time}
            onChange={(event) => onChange("time", event.target.value)}
            type="time"
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSelectMedia("image")}
          className={`kt-pressable flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-black ${
            hasImage ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          <Image size={17} strokeWidth={2.35} absoluteStrokeWidth />
          {hasImage ? "Image ready" : "Add image"}
        </button>
        <button
          type="button"
          onClick={() => onSelectMedia("video")}
          className={`kt-pressable flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-black ${
            hasVideo ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          <Video size={17} strokeWidth={2.35} absoluteStrokeWidth />
          {hasVideo ? "Video ready" : "Add video"}
        </button>
      </div>

      <div className="rounded-[22px] border border-white bg-white/80 p-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          <MousePointerClick size={14} strokeWidth={2.4} absoluteStrokeWidth />
          Live preview
        </div>
        <h4 className="mt-2 text-lg font-black text-slate-950">{advert.title || "Your advert headline"}</h4>
        <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">
          {advert.address || advert.link || "Add a location, link, or clear offer so people know what to do next."}
        </p>
      </div>
    </section>
  );
}
