import { useState } from "react";
import { Share2 } from "lucide-react";

import { shareUrMallLink, shareUrRideLink } from "../../Backend/services/shareCtaService";
import { isGuestMode } from "../../Backend/services/guestModeService";
import { useI18n } from "../../i18n";

// Call to action on empty local markets (UrMall with no sellers yet, UrRide
// with no operators nearby): share an invite link. A verified person who joins
// through it earns the sharer 5 Visibility Credits.
//
// The ripple on the left is the idea in one picture: you in the middle, your
// circle growing outward as people join.
const TONES = {
  urmall: {
    frame: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50",
    ring: "border-emerald-400/50",
    core: "bg-emerald-600",
    dot: "bg-teal-500",
    eyebrow: "text-emerald-700",
    button: "bg-emerald-700 hover:bg-emerald-800",
    badge: "bg-emerald-600 text-white",
  },
  urride: {
    frame: "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50",
    ring: "border-sky-400/50",
    core: "bg-sky-700",
    dot: "bg-indigo-500",
    eyebrow: "text-sky-700",
    button: "bg-sky-800 hover:bg-sky-900",
    badge: "bg-sky-700 text-white",
  },
};

export default function GrowLocalShareCard({ service = "urmall", country = "", delivery = false, className = "" }) {
  const { t } = useI18n();
  const [sharing, setSharing] = useState(false);
  if (isGuestMode()) return null;

  const tone = TONES[service] || TONES.urmall;
  const isRide = service === "urride";

  async function share() {
    if (sharing) return;
    setSharing(true);
    try {
      if (isRide) await shareUrRideLink(t("growLocal.copied"));
      else await shareUrMallLink();
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className={`relative overflow-hidden rounded-[24px] border p-4 sm:p-5 ${tone.frame} ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative mx-auto grid h-24 w-24 shrink-0 place-items-center sm:mx-0" aria-hidden="true">
          <span className={`absolute inset-0 rounded-full border-2 ${tone.ring} motion-safe:animate-ping`} style={{ animationDuration: "2.8s" }} />
          <span className={`absolute inset-3 rounded-full border-2 ${tone.ring}`} />
          <span className={`absolute inset-7 rounded-full border-2 ${tone.ring}`} />
          <span className={`absolute left-1 top-5 h-2.5 w-2.5 rounded-full ${tone.dot}`} />
          <span className={`absolute right-2 top-2 h-2 w-2 rounded-full ${tone.dot}`} />
          <span className={`absolute bottom-3 right-1 h-2.5 w-2.5 rounded-full ${tone.dot}`} />
          <span className={`absolute bottom-1 left-6 h-2 w-2 rounded-full ${tone.dot}`} />
          <span className={`relative grid h-9 w-9 place-items-center rounded-full text-white shadow-lg ${tone.core}`}>
            <Share2 size={16} />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-[11px] font-black uppercase tracking-[0.16em] ${tone.eyebrow}`}>
              {isRide ? t("growLocal.eyebrowUrRide") : t("growLocal.eyebrowUrMall")}
            </p>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${tone.badge}`}>{t("growLocal.badge")}</span>
          </div>
          <h3 className="mt-1 text-lg font-black leading-tight text-slate-950">
            {isRide
              ? delivery ? t("growLocal.titleUrRideDelivery") : t("growLocal.titleUrRide")
              : t("growLocal.titleUrMall", { country })}
          </h3>
          <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-600">{t("growLocal.body")}</p>

          <ol className="mt-3 grid gap-1.5 text-xs font-black text-slate-700 sm:grid-cols-3">
            {["step1", "step2", "step3"].map((key, index) => (
              <li key={key} className="flex items-center gap-2 rounded-xl bg-white/70 px-2.5 py-2">
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] text-white ${tone.core}`}>{index + 1}</span>
                <span className="min-w-0">{t(`growLocal.${key}`)}</span>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={share}
            disabled={sharing}
            className={`kt-pressable mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black text-white shadow-lg transition disabled:opacity-60 sm:w-auto ${tone.button}`}
          >
            <Share2 size={16} />
            {t("growLocal.share")}
          </button>
        </div>
      </div>
    </section>
  );
}
