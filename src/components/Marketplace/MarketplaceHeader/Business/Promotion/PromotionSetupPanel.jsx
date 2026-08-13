import {
  Check,
  Coins,
  Gauge,
  Gift,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { useVisibilityCredits } from "../../../../../Backend/hooks/useVisibilityCredits";
import {
  MINIMUM_VISIBILITY_CREDITS,
  normalizeVisibilityCreditSpend,
  VISIBILITY_BOOST_PACKAGES,
} from "../../../../../Backend/services/visibilityCreditService";
import { uiText, useI18n, t } from "../../../../../i18n";
import { estimatePromotionDays, normalizePromotionSettings, PROMOTION_AUDIENCES } from "./promotionSetup";

export default function PromotionSetupPanel({
  confirmLabel = "",
  error = "",
  onChange,
  onConfirm = null,
  settings,
  submitting = false,
  title = "",
}) {
  useI18n();
  const normalized = normalizePromotionSettings(settings);
  const wallet = useVisibilityCredits();
  const [shareFeedback, setShareFeedback] = useState("");
  const balance = Number(wallet.balance || 0);
  const selectedCredits = normalized.promotionCredits;
  const remainingCredits = Math.max(0, balance - selectedCredits);
  const hasEnoughCredits = !wallet.loading && balance >= selectedCredits;
  const estimatedDays = estimatePromotionDays(selectedCredits);
  const panelTitle = title || t("urmall.biz.promo.setupTitle");
  const launchLabel = confirmLabel || t("urmall.biz.promo.launch");

  function update(patch) {
    onChange?.({ ...normalized, ...patch });
  }

  async function shareInvite() {
    setShareFeedback("");
    try {
      await wallet.shareInvite();
      setShareFeedback(t("urmall.biz.pform.inviteReady"));
    } catch (nextError) {
      setShareFeedback(nextError.message || t("urmall.biz.pform.inviteFailed"));
    }
  }

  return (
    <section className="kt-promotion-panel overflow-hidden rounded-[26px] border border-emerald-200 bg-[linear-gradient(145deg,#f0fdf4_0%,#ffffff_48%,#ecfeff_100%)] shadow-sm">
      <div className="kt-promotion-panel__header border-b border-emerald-100 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"><Gauge size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Visibility Credits</p>
            <h3 className="mt-0.5 text-lg font-black text-slate-950">{panelTitle}</h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{t("urmall.biz.promo.plannerSubtitle")}</p>
          </div>
        </div>
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-800"><ShieldCheck size={13} /> {t("urmall.biz.promo.clearPricing")}</span>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <CreditMetric icon={Coins} label={t("urmall.biz.promo.availableCredits")} loading={wallet.loading} value={balance} />
          <CreditMetric icon={Check} label={t("urmall.biz.promo.selectedCredits")} value={selectedCredits} tone="emerald" />
          <CreditMetric icon={Sparkles} label={t("urmall.biz.promo.afterLaunch")} loading={wallet.loading} value={hasEnoughCredits ? remainingCredits : balance} />
        </div>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-slate-900">{t("urmall.biz.promo.chooseBoost")}</p>
            <span className="text-xs font-black text-emerald-700">{t("urmall.biz.pform.selectedBoost", { n: selectedCredits })}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {VISIBILITY_BOOST_PACKAGES.map((item) => {
              const selected = normalized.promotionCreditPackage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => update({
                    promotionCreditPackage: item.id,
                    ...(item.id === "custom" ? {} : { promotionCredits: item.credits }),
                  })}
                  className={`kt-promotion-option min-w-0 rounded-2xl border p-3 text-left transition-all duration-200 ${selected ? "kt-promotion-option--selected border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-600/15" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"}`}
                >
                  <span className="block truncate text-xs font-black">{uiText(item.label)}</span>
                  <span className={`mt-2 block text-xl font-black ${selected ? "text-white" : "text-slate-950"}`}>{item.id === "custom" ? t("urmall.biz.pform.any") : item.credits}</span>
                  <span className={`mt-1 block text-[10px] font-bold ${selected ? "text-emerald-50" : "text-slate-400"}`}>{t("urmall.biz.promo.creditsUnit")}</span>
                </button>
              );
            })}
          </div>

          {normalized.promotionCreditPackage === "custom" ? (
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <label className="min-w-0">
                <span className="sr-only">{t("urmall.biz.pform.creditsToSpend")}</span>
                <input
                  type="number"
                  min={MINIMUM_VISIBILITY_CREDITS}
                  step="1"
                  value={selectedCredits}
                  onChange={(event) => update({ promotionCredits: normalizeVisibilityCreditSpend(event.target.value, MINIMUM_VISIBILITY_CREDITS) })}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-950 outline-none focus:border-emerald-500"
                />
              </label>
              <button
                type="button"
                onClick={() => update({ promotionCredits: balance })}
                disabled={balance < MINIMUM_VISIBILITY_CREDITS}
                className="rounded-xl border border-emerald-200 bg-white px-4 text-xs font-black text-emerald-800 disabled:opacity-40"
              >
                {t("urmall.biz.pform.useAll")}
              </button>
            </div>
          ) : null}
        </div>

        <div>
          <p className="text-sm font-black text-slate-900">{t("urmall.biz.pform.promotionAudience")}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {PROMOTION_AUDIENCES.map((item) => {
              const Icon = item.icon;
              const selected = normalized.promotionAudience === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => update({ promotionAudience: item.id })}
                  className={`kt-promotion-audience min-w-0 rounded-2xl border p-3 text-left transition-all duration-200 ${selected ? "kt-promotion-audience--selected border-emerald-600 bg-white text-emerald-800 shadow-md" : "border-slate-200 bg-white/80 text-slate-700"}`}
                >
                  <span className={`grid h-8 w-8 place-items-center rounded-xl ${selected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><Icon size={16} /></span>
                  <span className="mt-2 block text-sm font-black">{t(`urmall.biz.pform.${item.labelKey}`)}</span>
                  <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-500">{t(`urmall.biz.pform.${item.descKey}`)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`kt-promotion-estimate rounded-2xl border p-4 ${hasEnoughCredits ? "kt-promotion-estimate--ready border-emerald-200 bg-emerald-50/70" : "kt-promotion-estimate--warning border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">{t("urmall.biz.promo.campaignWindow")}</p>
              <p className="mt-1 text-lg font-black text-slate-950">{t("urmall.biz.promo.upToDays", { count: estimatedDays })}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm">{normalized.promotionAudience}</span>
          </div>
          <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-500">{t("urmall.biz.promo.creditDisclosure")}</p>
          {!wallet.loading && !hasEnoughCredits ? <p className="mt-2 text-xs font-black text-amber-800">{t("urmall.biz.pform.needCredits", { n: selectedCredits })}</p> : null}
          {wallet.error ? <p className="mt-2 text-xs font-black text-amber-800">{wallet.error}</p> : null}
        </div>

        {!hasEnoughCredits && !wallet.loading ? (
          <div className="kt-promotion-rewards flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-100 text-violet-700"><Gift size={16} /></span><p className="text-xs font-bold text-slate-600">{t("urmall.biz.promo.earnCredits")}</p></div>
            <button type="button" onClick={shareInvite} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700">{t("urmall.biz.pform.shareInvite")}</button>
          </div>
        ) : null}
        {shareFeedback ? <p className="text-xs font-black text-emerald-700">{shareFeedback}</p> : null}
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

        {onConfirm ? (
          <button
            type="button"
            onClick={() => onConfirm(normalized)}
            disabled={submitting || wallet.loading || !hasEnoughCredits || selectedCredits < MINIMUM_VISIBILITY_CREDITS}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t("urmall.biz.promo.launching") : `${launchLabel} · ${selectedCredits} ${t("urmall.biz.promo.creditsUnit")}`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function CreditMetric({ icon: Icon, label, loading = false, tone = "slate", value }) {
  return (
    <div className={`kt-promotion-credit-metric min-w-0 rounded-2xl border p-3 ${tone === "emerald" ? "kt-promotion-credit-metric--selected border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white/80"}`}>
      <span className={`grid h-7 w-7 place-items-center rounded-lg ${tone === "emerald" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}><Icon size={14} /></span>
      <p className="mt-2 truncate text-xl font-black text-slate-950">{loading ? "…" : value}</p>
      <p className="mt-0.5 truncate text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
