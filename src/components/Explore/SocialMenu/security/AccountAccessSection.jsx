import { useEffect, useState } from "react";
import { HiOutlineComputerDesktop, HiOutlineKey } from "react-icons/hi2";

import {
  changeAccountPassword,
  getPasswordChangeChannel,
  MIN_PASSWORD_LENGTH,
  sendPasswordChangeCode,
  signOutOtherDevices,
  validateNewPassword,
} from "../../../../Backend/services/accountSecurityService";
import { isConnectionFailure, shortErrorToast } from "../../../../Backend/services/friendlyErrorService";
import { showToast } from "../../../../Backend/services/toastService";
import { t as i18nText } from "../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../i18n/index.js";

const FORM_ERRORS = {
  too_short: "exploreSettingsFix.pwTooShort",
  mismatch: "exploreSettingsFix.pwMismatch",
  code_required: "exploreSettingsFix.pwCodeRequired",
  bad_code: "exploreSettingsFix.pwBadCode",
  same_as_current: "exploreSettingsFix.pwSame",
  weak: "exploreSettingsFix.pwWeak",
};

const inputClass = "h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-200";

function ChangePasswordCard() {
  useUiLocale();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState(null); // null = loading
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || channel !== null) return;
    getPasswordChangeChannel().then(setChannel).catch(() => setChannel(""));
  }, [channel, open]);

  function reset() {
    setOpen(false);
    setCodeSent(false);
    setCode("");
    setPassword("");
    setConfirm("");
    setError("");
  }

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await sendPasswordChangeCode();
      setCodeSent(true);
    } catch (nextError) {
      setError(isConnectionFailure(nextError) ? i18nText("common.networkLost") : i18nText("exploreSettingsFix.pwCodeFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const needsCode = Boolean(channel);
    const invalid = validateNewPassword({ password, confirm, code, needsCode });
    if (invalid) {
      setError(i18nText(FORM_ERRORS[invalid], { value0: MIN_PASSWORD_LENGTH }));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await changeAccountPassword({ password, code: needsCode ? code : "" });
      showToast(i18nText("exploreSettingsFix.toastPasswordChanged"), "success");
      reset();
    } catch (nextError) {
      setError(FORM_ERRORS[nextError?.code]
        ? i18nText(FORM_ERRORS[nextError.code], { value0: MIN_PASSWORD_LENGTH })
        : isConnectionFailure(nextError) ? i18nText("common.networkLost") : i18nText("exploreSettingsFix.pwFailed"));
    } finally {
      setBusy(false);
    }
  }

  const needsCodeFirst = Boolean(channel) && !codeSent;

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineKey className="text-2xl" /></span>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-black text-slate-950">{i18nText("exploreSettingsFix.pwTitle")}</h4>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{i18nText("exploreSettingsFix.pwDesc")}</p>
        </div>
      </div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-2xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white">
          {i18nText("exploreSettingsFix.pwTitle")}
        </button>
      ) : channel === null ? (
        <p className="mt-4 text-sm font-bold text-slate-500">{i18nText("exploreSettingsFix.checking")}</p>
      ) : needsCodeFirst ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold leading-6 text-sky-900">
            {channel === "phone" ? i18nText("exploreSettingsFix.pwCodeIntroPhone") : i18nText("exploreSettingsFix.pwCodeIntroEmail")}
          </p>
          {error ? <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700" role="alert">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={reset} disabled={busy} className="h-11 flex-1 rounded-2xl bg-slate-100 text-sm font-black text-slate-700 disabled:opacity-60">{i18nText("exploreSettingsFix.cancel")}</button>
            <button type="button" onClick={sendCode} disabled={busy} className="h-11 flex-1 rounded-2xl bg-sky-700 text-sm font-black text-white disabled:opacity-60">
              {busy ? i18nText("exploreSettingsFix.sending") : i18nText("exploreSettingsFix.pwSendCode")}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          {channel ? (
            <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder={i18nText("exploreSettingsFix.pwCodePlaceholder")} aria-label={i18nText("exploreSettingsFix.pwCodePlaceholder")} className={inputClass} />
          ) : null}
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder={i18nText("exploreSettingsFix.pwNew", { value0: MIN_PASSWORD_LENGTH })} aria-label={i18nText("exploreSettingsFix.pwNew", { value0: MIN_PASSWORD_LENGTH })} className={inputClass} />
          <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" placeholder={i18nText("exploreSettingsFix.pwConfirm")} aria-label={i18nText("exploreSettingsFix.pwConfirm")} className={inputClass} />
          {error ? <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700" role="alert">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={reset} disabled={busy} className="h-11 flex-1 rounded-2xl bg-slate-100 text-sm font-black text-slate-700 disabled:opacity-60">{i18nText("exploreSettingsFix.cancel")}</button>
            <button type="submit" disabled={busy} className="h-11 flex-1 rounded-2xl bg-sky-700 text-sm font-black text-white disabled:opacity-60">
              {busy ? i18nText("exploreSettingsFix.saving") : i18nText("exploreSettingsFix.pwSave")}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function OtherDevicesCard() {
  useUiLocale();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      await signOutOtherDevices();
      showToast(i18nText("exploreSettingsFix.toastOthersSignedOut"), "success");
      setConfirming(false);
    } catch (error) {
      showToast(shortErrorToast(error, i18nText("exploreSettingsFix.toastOthersFailed")), "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineComputerDesktop className="text-2xl" /></span>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-black text-slate-950">{i18nText("exploreSettingsFix.devicesTitle")}</h4>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{i18nText("exploreSettingsFix.devicesDesc")}</p>
        </div>
      </div>
      {confirming ? (
        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3">
          <p className="text-sm font-bold text-rose-800">{i18nText("exploreSettingsFix.devicesConfirm")}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-10 flex-1 rounded-xl bg-white text-sm font-black text-slate-700 disabled:opacity-60">{i18nText("exploreSettingsFix.cancel")}</button>
            <button type="button" onClick={run} disabled={busy} className="h-10 flex-1 rounded-xl bg-rose-600 text-sm font-black text-white disabled:opacity-60">
              {busy ? i18nText("exploreSettingsFix.signingOut") : i18nText("exploreSettingsFix.devicesAction")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="mt-4 rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-black text-rose-700">
          {i18nText("exploreSettingsFix.devicesAction")}
        </button>
      )}
    </article>
  );
}

// Security > account access: change password and sign out other devices.
export default function AccountAccessSection() {
  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <ChangePasswordCard />
      <OtherDevicesCard />
    </section>
  );
}
