import { useCallback, useState } from "react";
import { getActiveCountryProfile, getCountryProfile, normalizeCountryIso } from "../../../data/globalCountryProfiles";
import { getTrustedNow } from "../../../Backend/services/serverClock";
import LateHourBookingWarning from "./LateHourBookingWarning";
import { lateHourStatus } from "./lateHourBooking";

// Call `confirmLateHour({ country, longitude })` right before a booking is
// sent. Outside the late-hour windows it resolves true at once; inside them it
// shows the warning and resolves true only when the passenger confirms
// "I understand and want to book". Render `lateHourWarning` in the screen.
export function useLateHourGate() {
  const [request, setRequest] = useState(null);

  const confirmLateHour = useCallback(async ({ country = "", longitude = null } = {}) => {
    const countryIso = normalizeCountryIso(country) || normalizeCountryIso(getActiveCountryProfile());
    const now = await getTrustedNow();
    const status = lateHourStatus({ date: now, countryIso, longitude });
    if (!status.phase) return true;
    const countryName = getCountryProfile(countryIso)?.name || "";
    return new Promise((resolve) => setRequest({ ...status, countryName, resolve }));
  }, []);

  const settle = (answer) => {
    request?.resolve(answer);
    setRequest(null);
  };

  const lateHourWarning = request ? (
    <LateHourBookingWarning
      phase={request.phase}
      localTime={request.localTime}
      countryName={request.countryName}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirmLateHour, lateHourWarning };
}
