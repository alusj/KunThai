import { RadioTower } from "lucide-react";

import { uiText as translateUi, useI18n } from "../../../i18n/index.js";

/**
 * Open booking for Business / Both accounts: a round button set into the
 * centre of the four dashboard cards. Its ring is cut from the page
 * background, and the cards keep their text and icons clear of this corner
 * (their `notch` prop), so nothing written is covered.
 */
export default function OpenBookingCenterButton({ onClick }) {
  useI18n();
  const label = translateUi("Open booking");
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
      <span className="kt-open-booking-pulse pointer-events-none absolute inset-0 rounded-full bg-emerald-500/30" aria-hidden="true" />
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        data-direction="urride-open-booking"
        className="kt-open-booking-orb kt-pressable pointer-events-auto relative grid h-[60px] w-[60px] place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white transition hover:scale-105 active:scale-95"
        style={{ boxShadow: "0 0 0 6px var(--kt-open-booking-ring, #f9fafb), 0 14px 28px -10px rgb(4 120 87 / 0.55)" }}
      >
        <RadioTower size={26} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </div>
  );
}
