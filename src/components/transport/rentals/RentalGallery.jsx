import { useMemo, useState } from "react";

import MediaGalleryViewer from "../../shared/MediaGalleryViewer";
import { useI18n, t } from "../../../i18n";
import { t as i18nText } from "../../../i18n/index";

// Rental vehicle photos. Tapping one opens the shared full-screen viewer, so a
// rental photo behaves exactly like an UrMall product photo or a fleet photo:
// it zooms open, double-tap or pinch to zoom, drag while zoomed, and swipe or
// use the arrows to slide to the next photo.
export default function RentalGallery({ photos = [], title }) {
  useI18n();
  const [index, setIndex] = useState(-1);
  const images = useMemo(() => photos.map((url) => ({ url, label: title })), [photos, title]);

  return (
    <>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {photos.map((url, position) => (
          <button
            type="button"
            key={`${url}-${position}`}
            onClick={() => setIndex(position)}
            aria-label={t("urride.fleetProfile.openFleetPhoto", { label: `${title} ${position + 1}` })}
            className="shrink-0 snap-start"
            data-suppress-app-swipe="true"
          >
            <img src={url} alt={i18nText("ui.literals.k1387069bff6f", { value0: title, value1: position + 1 })} className="h-52 w-80 max-w-[80vw] rounded-2xl object-cover" />
          </button>
        ))}
      </div>

      <MediaGalleryViewer
        activeIndex={index}
        images={images}
        onChange={setIndex}
        onClose={() => setIndex(-1)}
        backKey="transport-rental-photos"
        labels={{
          aria: t("urride.fleetProfile.mediaViewer"),
          close: t("urride.fleetProfile.closeMedia"),
          counter: ({ index: position, total }) => t("urride.fleetProfile.imageCount", { index: position, total }),
          zoomPrompt: t("urride.fleetProfile.pinchToZoom"),
          previous: t("urride.fleetProfile.previousPhoto"),
          next: t("urride.fleetProfile.nextPhoto"),
          openImage: ({ index: position }) => t("urride.fleetProfile.openFleetPhoto", { label: `${title} ${position}` }),
        }}
      />
    </>
  );
}
