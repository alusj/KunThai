import { useEffect } from "react";

import {
  clearCountryChoice,
  pickLegalCountry,
  readCountryChoice,
  readDetectedCountry,
  readLastActiveAt,
  shouldResetCountryChoice,
  touchLastActive,
} from "../../data/countryChoice";
import { detectDeviceCountryIso, storeCountryContext } from "../../data/globalCountryProfiles";
import { saveAccountCountry } from "../services/onboardingService";
import { showToast } from "../services/toastService";
import { t } from "../../i18n";

const ACTIVITY_TICK_MS = 60 * 1000;

// A country picked in Settings stays until KunThai has been unused for a
// while; on the next open the app returns to the country the person is in
// (last detected by GPS, else the phone's time zone). Runs once auth is known
// so a signed-in account's saved country is reset too.
export function useCountryChoiceExpiry({ ready = false, signedIn = false } = {}) {
  useEffect(() => {
    if (!ready) return undefined;

    function resetIfIdle() {
      const choice = readCountryChoice();
      if (!shouldResetCountryChoice({ choice, lastActiveAt: readLastActiveAt() })) return;

      clearCountryChoice();
      const legal = pickLegalCountry({ detected: readDetectedCountry(), timeZoneIso: detectDeviceCountryIso() });
      if (!legal || legal === choice.iso2) return;

      const announce = () => showToast(t("regions.profile.countryReset"), "info");
      if (signedIn) {
        saveAccountCountry(legal).then(announce).catch(() => storeCountryContext(legal));
      } else {
        storeCountryContext(legal);
        window.dispatchEvent(new CustomEvent("kunthai-urmall-retention-updated"));
        announce();
      }
    }

    function check() {
      resetIfIdle();
      touchLastActive();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") check();
      else touchLastActive();
    }

    check();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", touchLastActive);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") touchLastActive();
    }, ACTIVITY_TICK_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", touchLastActive);
      window.clearInterval(timer);
    };
  }, [ready, signedIn]);
}
