import { useEffect, useState } from "react";
import { HiOutlineClipboard, HiOutlineShieldCheck } from "react-icons/hi2";

import { showToast } from "../../../../Backend/services/toastService";
import {
  confirmTotpEnrollment,
  disableTwoFactor,
  getTwoFactorState,
  startTotpEnrollment,
} from "../../../../Backend/services/twoFactorService";

function qrImageSource(qrCode = "") {
  if (!qrCode) return "";
  if (qrCode.startsWith("data:")) return qrCode;
  return `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`;
}

// Two-step verification management: enroll an authenticator app (TOTP),
// confirm with a first code, or turn the protection off again.
export default function TwoFactorSection() {
  const [state, setState] = useState({ enabled: false, factorId: "" });
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);

  async function refresh() {
    try {
      setLoading(true);
      setState(await getTwoFactorState());
      setError("");
    } catch (nextError) {
      setError(nextError.message || "Unable to load two-step verification.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // One-time load; actions refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartEnrollment() {
    try {
      setBusy(true);
      setError("");
      setEnrollment(await startTotpEnrollment());
      setConfirmCode("");
    } catch (nextError) {
      setError(nextError.message || "Unable to start two-step verification.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmEnrollment(event) {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      await confirmTotpEnrollment(enrollment.factorId, confirmCode);
      setEnrollment(null);
      setConfirmCode("");
      await refresh();
      showToast("Two-step verification is on. Your authenticator code is now required at sign in.", "success", {
        title: "Account protected",
      });
    } catch (nextError) {
      setError(nextError.message || "Unable to confirm the authenticator code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    try {
      setBusy(true);
      setError("");
      await disableTwoFactor(state.factorId);
      setDisableConfirmOpen(false);
      await refresh();
      showToast("Two-step verification is off. Only your password protects sign in now.", "warning", {
        title: "Protection removed",
      });
    } catch (nextError) {
      setError(nextError.message || "Unable to turn off two-step verification.");
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    navigator.clipboard?.writeText(enrollment?.secret || "");
    showToast("Setup key copied. Paste it into your authenticator app.", "success");
  }

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${state.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          <HiOutlineShieldCheck className="text-2xl" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black text-slate-950">Two-step verification</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            {state.enabled
              ? "On. Signing in needs your password plus a 6-digit code from your authenticator app."
              : "Add a second step at sign in: your password plus a code from an authenticator app such as Google Authenticator or Authy."}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase ${state.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {loading ? "..." : state.enabled ? "On" : "Off"}
        </span>
      </div>

      {error ? (
        <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>
      ) : null}

      {!loading && !state.enabled && !enrollment ? (
        <button
          type="button"
          onClick={handleStartEnrollment}
          disabled={busy}
          className="mt-4 h-12 w-full rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Preparing..." : "Turn on two-step verification"}
        </button>
      ) : null}

      {enrollment ? (
        <form onSubmit={handleConfirmEnrollment} className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-sm font-black text-slate-950">1. Scan this code with your authenticator app</p>
          {enrollment.qrCode ? (
            <img
              src={qrImageSource(enrollment.qrCode)}
              alt="Two-step verification QR code"
              className="mx-auto mt-3 h-44 w-44 rounded-2xl border border-emerald-200 bg-white p-2"
            />
          ) : null}
          <button
            type="button"
            onClick={copySecret}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-2.5 text-xs font-black text-emerald-800"
          >
            <HiOutlineClipboard className="text-base" />
            Can't scan? Copy the setup key
          </button>

          <p className="mt-4 text-sm font-black text-slate-950">2. Enter the 6-digit code the app shows</p>
          <input
            type="text"
            inputMode="numeric"
            value={confirmCode}
            onChange={(event) => setConfirmCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-center text-lg font-black tracking-[0.4em] text-slate-900 outline-none placeholder:text-sm placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-500"
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setEnrollment(null);
                setConfirmCode("");
              }}
              disabled={busy}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || confirmCode.length < 6}
              className="h-11 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-60"
            >
              {busy ? "Confirming..." : "Confirm and turn on"}
            </button>
          </div>
        </form>
      ) : null}

      {!loading && state.enabled ? (
        disableConfirmOpen ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold leading-6 text-amber-900">
              Turning this off removes the authenticator step. Anyone with your password could sign in.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDisableConfirmOpen(false)}
                disabled={busy}
                className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60"
              >
                Keep it on
              </button>
              <button
                type="button"
                onClick={handleDisable}
                disabled={busy}
                className="h-11 rounded-2xl bg-amber-600 px-4 text-sm font-black text-white disabled:opacity-60"
              >
                {busy ? "Turning off..." : "Turn off"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDisableConfirmOpen(true)}
            className="mt-4 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            Turn off two-step verification
          </button>
        )
      ) : null}
    </div>
  );
}
