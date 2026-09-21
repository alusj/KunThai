import { useState } from "react";
import CenteredModal from "../shared/CenteredModal";
import { getOperatorCompanyAccessQuote, OPERATOR_COMPANY_ACCESS_CREDITS } from "../services/operatorCompanyAccessService";
import { requestExploreScreen } from "../../Backend/services/notificationBannerService";
import { t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";

export default function CompanyOperatorAccessModal({ invite, quote, onClose, onConfirm }) {
  useUiLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [latestQuote, setLatestQuote] = useState(null);
  const access = latestQuote || quote;
  const fee = access?.feeRequired ? OPERATOR_COMPANY_ACCESS_CREDITS : 0;
  const insufficient = Number(access?.balance || 0) < fee;

  async function refreshOrConfirm(refreshOnly = false) {
    setBusy(true);
    setError("");
    try {
      const current = await getOperatorCompanyAccessQuote();
      setLatestQuote(current);
      if (refreshOnly) return;
      if (current.feeRequired && Number(current.balance || 0) < OPERATOR_COMPANY_ACCESS_CREDITS) {
        setError(i18nText("ui.literals.k20b58cdf08cd"));
        return;
      }
      await onConfirm?.(invite);
    } catch (failure) {
      setError(inlineErrorMessage(failure, i18nText("ui.literals.k710c6f8720aa")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredModal open={Boolean(invite)} onClose={busy ? undefined : onClose} dismissOnBackdrop={!busy} labelledBy="operator-company-access-title">
      <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{i18nText("ui.literals.k9bcb6f3d3d68")}</p>
      <h2 id="operator-company-access-title" className="mt-2 text-xl font-black text-slate-950">{i18nText("ui.literals.k5ab659683c86")}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-700">{i18nText("ui.literals.kf88ac997ee40")} {OPERATOR_COMPANY_ACCESS_CREDITS} {i18nText("ui.literals.k1939b4585fa8")}</p>
      <p className="mt-3 text-sm leading-6 text-slate-700">{i18nText("ui.literals.k9cadeea12ab4")}</p>
      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-slate-900">
        <p>{i18nText("ui.literals.k3d9d99253263")} {invite?.companyName || i18nText("ui.literals.kd19b78e4cb46")}</p>
        <p className="mt-2">{i18nText("ui.literals.k34049ee5c6d7")} {Number(access?.balance || 0)} {i18nText("ui.literals.k66c22fad3a99")}</p>
        <p className="mt-1">{i18nText("ui.literals.k04863d5bcba7")} {fee} {i18nText("ui.literals.k66c22fad3a99")}{!fee ? i18nText("ui.literals.kd69b4600a1ce") : ""}</p>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{translateUi(error)}</p> : null}
      {insufficient ? (
        <>
          <p className="mt-3 text-sm font-semibold text-amber-800">{i18nText("ui.literals.k67f10b126557")} {fee - Number(access?.balance || 0)} {i18nText("ui.literals.k4cd29963d286")}</p>
          <button type="button" disabled={busy} onClick={() => { onClose?.(); requestExploreScreen("Profile"); }} className="mt-4 w-full rounded-2xl bg-emerald-700 px-4 py-3 font-black text-white">{i18nText("ui.literals.k40e627366c18")}</button>
          <button type="button" disabled={busy} onClick={() => refreshOrConfirm(true)} className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 font-bold text-slate-900">{busy ? i18nText("ui.literals.kb7c2f6d5aea6") : i18nText("ui.literals.k8ca5cc483434")}</button>
        </>
      ) : <button type="button" disabled={busy} onClick={() => refreshOrConfirm()} className="mt-4 w-full rounded-2xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-60">{busy ? i18nText("ui.literals.k0c2708b8beab") : fee ? i18nText("ui.literals.k954cec4eaaeb", { value0: fee }) : i18nText("ui.literals.ka46979ec59fb")}</button>}
      <p className="mt-2 text-xs leading-5 text-slate-600">{i18nText("ui.literals.k54f535eb3ae4")}</p>
      <button type="button" disabled={busy} onClick={onClose} className="mt-3 w-full rounded-2xl px-4 py-3 font-bold text-slate-700">{i18nText("ui.literals.ke45714907316")}</button>
    </CenteredModal>
  );
}
