import { t } from "../../../i18n";

export function getBookingPickerLabels(kind, bookingMode) {
  const isPickup = kind === "pickup";
  const label = isPickup
    ? t("urride.booking.pickerNounPickup")
    : bookingMode === "delivery"
      ? t("urride.booking.pickerNounDelivery")
      : t("urride.booking.pickerNounDropoff");

  return {
    historyKey: `transport-booking-${kind}-picker`,
    backLabel: t("urride.booking.pickerBack"),
    eyebrow: t("urride.booking.pickerEyebrow"),
    cardEyebrow: isPickup ? t("urride.booking.pickerCardPickup") : bookingMode === "delivery" ? t("urride.booking.pickerCardDelivery") : t("urride.booking.pickerCardDropoff"),
    headerCurrentTitle: t("urride.booking.pickerHeaderCurrent", { label }),
    headerDropTitle: t("urride.booking.pickerHeaderDrop", { label }),
    currentHeading: t("urride.booking.pickerCurrentHeading", { label }),
    dropHeading: t("urride.booking.pickerDropHeading", { label }),
    dropInstruction: t("urride.booking.pickerDropInstruction", { label }),
    currentStatus: t("urride.booking.pickerCurrentStatus", { label }),
    dropStatus: t("urride.booking.pickerDropStatus", { label }),
    currentName: t("urride.booking.pickerCurrentName", { label }),
    droppedName: t("urride.booking.pickerDroppedName", { label }),
  };
}
