import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { HiOutlineFingerPrint } from "react-icons/hi2";

import {
  getBiometricAvailability,
  readBiometricPreference,
  shouldRelockAfterBackground,
  verifyBiometricUnlock,
} from "../../../../Backend/services/biometricService";
import { isNativePlatform } from "../../../../Backend/services/nativeOAuthService";
import { signOutSocialSession } from "../../../../Backend/services/sessionService";
import { t as i18nText } from "../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../i18n/index.js";
import AppPortal from "../../../shared/AppPortal";

// Enforces "Biometric unlock" from Security: when it is on for the signed-in
// account, KunThai stays covered until the device confirms the person, on
// launch and after more than a minute in the background.
export default function BiometricLockGate({ userId = "" }) {
  useUiLocale();
  const [locked, setLocked] = useState(() => Boolean(userId && readBiometricPreference(userId).enabled));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(true);
  const hiddenAtRef = useRef(0);
  const autoPromptedRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    setLocked(Boolean(userId && readBiometricPreference(userId).enabled));
    setError("");
  }, [userId]);

  useEffect(() => {
    if (!locked) return undefined;
    let active = true;
    getBiometricAvailability().then((result) => {
      if (active) setAvailable(Boolean(result.available));
    });
    return () => {
      active = false;
    };
  }, [locked]);

  const markHidden = useCallback(() => {
    if (!hiddenAtRef.current) hiddenAtRef.current = Date.now();
  }, []);

  const markVisible = useCallback(() => {
    const hiddenAt = hiddenAtRef.current;
    hiddenAtRef.current = 0;
    if (userId && readBiometricPreference(userId).enabled && shouldRelockAfterBackground(hiddenAt)) {
      setError("");
      setLocked(true);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    function handleVisibility() {
      if (document.visibilityState === "hidden") markHidden();
      else markVisible();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    let nativeListener = null;
    let cancelled = false;
    if (isNativePlatform()) {
      Promise.resolve(CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) markVisible();
        else markHidden();
      }))
        .then((handle) => {
          if (cancelled) handle?.remove?.();
          else nativeListener = handle;
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      nativeListener?.remove?.();
    };
  }, [markHidden, markVisible, userId]);

  const unlock = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await verifyBiometricUnlock(userId);
      setLocked(false);
    } catch (unlockError) {
      // The app's own prompt explains why (cancelled, locked out, not set up);
      // the browser's WebAuthn errors are not translated, so keep the generic line.
      setError(isNativePlatform() && unlockError?.message ? unlockError.message : i18nText("exploreSettingsFix.lockFailed"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [userId]);

  // In the app, show the Face ID / fingerprint prompt straight away each time
  // KunThai locks (once; after a cancel the Unlock button asks again).
  useEffect(() => {
    if (!locked) {
      autoPromptedRef.current = false;
      return;
    }
    if (!available || autoPromptedRef.current || !isNativePlatform()) return;
    autoPromptedRef.current = true;
    unlock();
  }, [available, locked, unlock]);

  async function signOut() {
    if (busyRef.current) return;
    setBusy(true);
    try {
      await signOutSocialSession();
    } catch {
      // Local sign-out below still ends this device's access.
    }
    window.location.replace("/");
  }

  if (!locked || !userId) return null;

  return (
    <AppPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kunthai-lock-title"
      className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950 px-6 text-center text-white"
    >
      <div className="w-full max-w-sm">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-white/10">
          <HiOutlineFingerPrint className="text-5xl" />
        </span>
        <h2 id="kunthai-lock-title" className="mt-6 text-2xl font-black">{i18nText("exploreSettingsFix.lockTitle")}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/75">
          {available ? i18nText("exploreSettingsFix.lockBody") : i18nText("exploreSettingsFix.lockUnavailable")}
        </p>
        {error ? <p className="mt-4 rounded-2xl bg-rose-500/20 px-4 py-3 text-sm font-bold text-rose-100" role="alert">{error}</p> : null}
        {available ? (
          <button
            type="button"
            onClick={unlock}
            disabled={busy}
            className="mt-6 h-12 w-full rounded-2xl bg-white text-sm font-black text-slate-950 disabled:opacity-60"
          >
            {busy ? i18nText("exploreSettingsFix.lockChecking") : error ? i18nText("exploreSettingsFix.lockRetry") : i18nText("exploreSettingsFix.lockUnlock")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="mt-3 h-12 w-full rounded-2xl border border-white/25 text-sm font-black text-white disabled:opacity-60"
        >
          {i18nText("exploreSettingsFix.lockSignOut")}
        </button>
      </div>
    </div>
    </AppPortal>
  );
}
