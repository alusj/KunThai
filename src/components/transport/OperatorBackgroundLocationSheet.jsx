import { useEffect, useRef, useState } from "react";
import { FiBell, FiMapPin, FiPower, FiShield } from "react-icons/fi";

import { t, useI18n } from "../../i18n";
import AppPortal from "../shared/AppPortal";
import { registerOperatorBackgroundConsentPresenter } from "../services/operatorLiveLocationService";

// Native app only: when an operator switches Active on, explains why KunThai
// asks for location "Always" (iOS) or location + notifications (Android)
// before the system prompt appears. Opened through
// requestOperatorBackgroundConsent(); Continue lets the prompts show, Not now
// goes online without them.
export default function OperatorBackgroundLocationSheet() {
  useI18n();
  const [request, setRequest] = useState(null);
  const requestRef = useRef(null);

  useEffect(() => {
    const unregister = registerOperatorBackgroundConsentPresenter(({ platform, resolve }) => {
      // A second request answers the first one with "later".
      requestRef.current?.resolve("later");
      const next = { platform, resolve };
      requestRef.current = next;
      setRequest(next);
    });
    return () => {
      unregister();
      // Unmounting (sign out) must never leave the Active switch waiting.
      requestRef.current?.resolve("later");
      requestRef.current = null;
    };
  }, []);

  if (!request) return null;

  function answer(choice) {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(choice);
  }

  const android = request.platform === "android";

  return (
    <AppPortal>
      <div className="fixed inset-0 z-[1500] flex items-end justify-center sm:items-center" role="presentation">
        <div className="kt-backdrop absolute inset-0 bg-slate-950/45 backdrop-blur-sm" aria-hidden="true" />
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="urride-background-location-title"
          data-direction="urride-background-location-sheet"
          className="relative w-full max-w-md rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-slate-950 shadow-2xl sm:rounded-3xl"
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <FiMapPin size={22} aria-hidden="true" />
          </span>
          <h2 id="urride-background-location-title" className="mt-3 text-lg font-black leading-tight">
            {t("urrideBackgroundLocation.sheetTitle")}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {android ? t("urrideBackgroundLocation.sheetBodyAndroid") : t("urrideBackgroundLocation.sheetBodyIos")}
          </p>
          <ul className="mt-3 grid gap-2 text-sm font-semibold leading-5 text-slate-700">
            <li className="flex items-start gap-2">
              <FiShield className="mt-0.5 shrink-0 text-emerald-700" size={16} aria-hidden="true" />
              <span>{t("urrideBackgroundLocation.sheetOnlyOnline")}</span>
            </li>
            <li className="flex items-start gap-2">
              <FiPower className="mt-0.5 shrink-0 text-emerald-700" size={16} aria-hidden="true" />
              <span>{t("urrideBackgroundLocation.sheetStops")}</span>
            </li>
            {android ? (
              <li className="flex items-start gap-2">
                <FiBell className="mt-0.5 shrink-0 text-emerald-700" size={16} aria-hidden="true" />
                <span>{t("urrideBackgroundLocation.sheetAndroidNotice")}</span>
              </li>
            ) : null}
          </ul>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => answer("continue")}
              className="h-12 rounded-2xl bg-emerald-600 text-sm font-black text-white transition hover:bg-emerald-700"
            >
              {t("urrideBackgroundLocation.continue")}
            </button>
            <button
              type="button"
              onClick={() => answer("later")}
              className="h-11 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              {t("urrideBackgroundLocation.notNow")}
            </button>
          </div>
        </section>
      </div>
    </AppPortal>
  );
}
