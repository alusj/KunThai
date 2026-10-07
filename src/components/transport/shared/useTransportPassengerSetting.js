import { useEffect, useState } from "react";

import { getTransportPassengerSettings, TRANSPORT_SETTINGS_EVENT } from "../../services/passengerTransportService";

// One UrRide passenger setting (Settings → UrRide), kept current when it is
// changed anywhere in the app.
export function useTransportPassengerSetting(key) {
  const [value, setValue] = useState(() => getTransportPassengerSettings()[key]);

  useEffect(() => {
    const refresh = () => setValue(getTransportPassengerSettings()[key]);
    refresh();
    window.addEventListener(TRANSPORT_SETTINGS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(TRANSPORT_SETTINGS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [key]);

  return value !== false;
}
