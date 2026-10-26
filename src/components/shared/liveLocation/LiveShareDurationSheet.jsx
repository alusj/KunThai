import { useState } from "react";
import { FiRadio, FiX } from "react-icons/fi";

import AppPortal from "../AppPortal";
import { useI18n, t } from "../../../i18n";
import { LIVE_SHARE_DURATIONS } from "../../services/liveLocationShareService";

function durationLabel(minutes) {
  return minutes >= 60 ? t("liveSharing.oneHour") : t("liveSharing.minutes", { minutes });
}

// "Share live location": how long, at most 1 hour. Resolves through
// onStart(minutes); errors are shown here.
export default function LiveShareDurationSheet({ open, onClose, onStart, body = "" }) {
  useI18n();
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  async function start() {
    setBusy(true);
    setError("");
    try {
      await onStart?.(minutes);
      onClose?.();
    } catch (err) {
      setError(err?.message ? String(err.message) : t("liveSharing.startFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppPortal>
      <div className="fixed inset-0 z-[1700] flex items-end justify-center bg-slate-950/50 sm:items-center" role="dialog" aria-modal="true" aria-label={t("liveSharing.shareLive")} data-direction="live-share-duration">
        <button type="button" aria-label={t("liveSharing.close")} onClick={onClose} className="absolute inset-0 cursor-default" />
        <section className="relative w-full max-w-md rounded-t-[28px] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <FiRadio size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-black text-slate-950">{t("liveSharing.shareLive")}</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{body || t("liveSharing.durationBody")}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={t("liveSharing.close")} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <FiX size={16} />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("liveSharing.howLong")}>
            {LIVE_SHARE_DURATIONS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={minutes === value}
                onClick={() => setMinutes(value)}
                className={`h-12 rounded-2xl border text-sm font-black transition ${minutes === value ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
              >
                {durationLabel(value)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{t("liveSharing.durationHint")}</p>
          {error ? <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
          <button type="button" onClick={start} disabled={busy} className="mt-4 h-12 w-full rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:opacity-60">
            {busy ? t("liveSharing.starting") : t("liveSharing.startSharing", { duration: durationLabel(minutes) })}
          </button>
        </section>
      </div>
    </AppPortal>
  );
}
