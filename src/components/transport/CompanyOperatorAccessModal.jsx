import { useState } from "react";
import CenteredModal from "../shared/CenteredModal";
import { getOperatorCompanyAccessQuote, OPERATOR_COMPANY_ACCESS_CREDITS } from "../services/operatorCompanyAccessService";
import { requestExploreScreen } from "../../Backend/services/notificationBannerService";

export default function CompanyOperatorAccessModal({ invite, quote, onClose, onConfirm }) {
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
        setError("Add Visibility Credits to your wallet, then return to this invitation to continue.");
        return;
      }
      await onConfirm?.(invite);
    } catch (failure) {
      setError(failure.message || "Company access could not be confirmed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredModal open={Boolean(invite)} onClose={busy ? undefined : onClose} dismissOnBackdrop={!busy} labelledBy="operator-company-access-title">
      <p className="text-xs font-black uppercase tracking-wide text-emerald-700">UrRide company access</p>
      <h2 id="operator-company-access-title" className="mt-2 text-xl font-black text-slate-950">Work with transport companies</h2>
      <p className="mt-3 text-sm leading-6 text-slate-700">As an existing solo operator, joining your first company costs a one-time {OPERATOR_COMPANY_ACCESS_CREDITS} Visibility Credits. This unlocks membership in multiple companies. There is no additional access fee for another company or for switching between them.</p>
      <p className="mt-3 text-sm leading-6 text-slate-700">You can keep your solo fleet. Only the fleet you make active is available for new work; complete any ongoing trip before changing fleets.</p>
      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-slate-900">
        <p>Joining: {invite?.companyName || "Transport company"}</p>
        <p className="mt-2">Wallet balance: {Number(access?.balance || 0)} credits</p>
        <p className="mt-1">One-time access fee: {fee} credits{!fee ? " (already unlocked)" : ""}</p>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {insufficient ? (
        <>
          <p className="mt-3 text-sm font-semibold text-amber-800">You need {fee - Number(access?.balance || 0)} more credits. No credits have been deducted.</p>
          <button type="button" disabled={busy} onClick={() => { onClose?.(); requestExploreScreen("Profile"); }} className="mt-4 w-full rounded-2xl bg-emerald-700 px-4 py-3 font-black text-white">Top up Visibility Credits</button>
          <button type="button" disabled={busy} onClick={() => refreshOrConfirm(true)} className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 font-bold text-slate-900">{busy ? "Checking balance…" : "Check balance again"}</button>
        </>
      ) : <button type="button" disabled={busy} onClick={() => refreshOrConfirm()} className="mt-4 w-full rounded-2xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-60">{busy ? "Confirming…" : fee ? `Agree to ${fee} credits and continue` : "Continue to invitation"}</button>}
      <p className="mt-2 text-xs leading-5 text-slate-600">The fee is deducted only when your company invitation is successfully accepted.</p>
      <button type="button" disabled={busy} onClick={onClose} className="mt-3 w-full rounded-2xl px-4 py-3 font-bold text-slate-700">Not now</button>
    </CenteredModal>
  );
}
