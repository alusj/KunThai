import { useEffect, useState } from "react";
import { X } from "lucide-react";

import AppPortal from "../AppPortal";
import { fetchFrontPicture } from "../../../Backend/services/frontPictureService";
import { t, useI18n } from "../../../i18n";

// The buyer's / passenger's front picture on a seller order or an operator
// request. Loads only when shown; renders nothing when there is none. Tap to
// see it full screen. Pass several { kind, id } candidates (an open booking
// and its trip) and the first picture found is shown.
export default function FrontPictureView({ sources = [], className = "" }) {
  useI18n();
  const [picture, setPicture] = useState("");
  const [zoomed, setZoomed] = useState(false);
  const key = sources.map((s) => `${s?.kind}:${s?.id || ""}`).join("|");

  useEffect(() => {
    let cancelled = false;
    setPicture("");
    (async () => {
      for (const source of sources) {
        if (!source?.id) continue;
        const found = await fetchFrontPicture(source.kind, source.id);
        if (cancelled) return;
        if (found) {
          setPicture(found);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // `key` stands for `sources`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!picture) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        className={`kt-touchable flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 text-left ${className}`}
      >
        <img src={picture} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        <span className="min-w-0">
          <span className="block text-xs font-black uppercase tracking-wide text-slate-500">{t("addressBook.picture")}</span>
          <span className="block text-xs font-semibold leading-5 text-slate-600">{t("addressBook.pictureHint")}</span>
        </span>
      </button>
      {zoomed ? (
        <AppPortal>
          <div
            className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-950/90 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={t("addressBook.picture")}
            onClick={() => setZoomed(false)}
          >
            <img src={picture} alt={t("addressBook.picture")} className="max-h-full max-w-full rounded-2xl object-contain" />
            <button
              type="button"
              onClick={() => setZoomed(false)}
              aria-label={t("liveSharing.close")}
              className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900"
            >
              <X size={20} />
            </button>
          </div>
        </AppPortal>
      ) : null}
    </>
  );
}
