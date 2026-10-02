import AppPortal from "../../shared/AppPortal";
import { normalizeAreaLocation } from "../../shared/AddressAreaValidation";
import NearbyAreaScreen from "../../transport/NearbyAreaScreen";
import { getBookingPickerLabels } from "../../transport/booking/TransportBookingDrawer";
import { normalizeBookingLocationPoint } from "../../transport/booking/bookingLocationPreferences";
import { t } from "../../../i18n";

// The UrRide map pin picker, opened from KAI's guided booking ("Drop a pin").
// It is the same picker the booking form uses, layered above the KAI chat; the
// chosen point goes back to the flow, which shows the address for the
// passenger to confirm. Loaded lazily: most chats never open a map.
export default function AiTripPinPicker({ picker, mode = "ride", onPicked, onClose }) {
  if (!picker) return null;

  function accept(location) {
    const point = normalizeBookingLocationPoint(normalizeAreaLocation(location, ""));
    onPicked?.(point || null);
  }

  return (
    <AppPortal>
      <div className="fixed inset-0 z-[2147483200] bg-slate-950">
        <NearbyAreaScreen
          mode="businessLocationPicker"
          pickerStart={picker.start || "dropPin"}
          pickerLabels={getBookingPickerLabels(picker.kind || "pickup", mode)}
          backLabel={t("urride.booking.pickerBack")}
          onBack={onClose}
          onLocationPicked={accept}
        />
      </div>
    </AppPortal>
  );
}
