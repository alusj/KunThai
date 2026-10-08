import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { readRegisteredBusiness } from "../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import AppBackTab from "../../../../../../../shared/AppBackTab";
import BusinessPlanScreen from "../../../../../../../shared/BusinessPlanScreen";
import SellerLoadError from "../../../../SellerLoadError";
import { t as i18nText } from "../../../../../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../../../../../i18n/index.js";

export default function SubscriptionPlans({ onBack }) {
  useUiLocale();
  const [business, setBusiness] = useState(null);
  // "loading" | "ready" | "error": a business that can't be read (or isn't
  // there) shows a retry instead of the plan loader spinning forever.
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    readRegisteredBusiness().then((row) => {
      if (!alive) return;
      setBusiness(row);
      setStatus(row?.id ? "ready" : "error");
    }).catch(() => {
      if (alive) setStatus("error");
    });
    return () => { alive = false; };
  }, [attempt]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 pb-3 pt-3 backdrop-blur">
        <AppBackTab onBack={onBack} label={i18nText("ui.literals.k5870f68809d4")} historyKey="business-subscription-plans" useHistoryLayer={false} />
        <div className="mt-3">
          <p className="text-xs font-black uppercase tracking-wider text-emerald-600">{i18nText("ui.literals.k6de88328f8ac")}</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">{i18nText("ui.literals.kef395ca5a659")}</h1>
        </div>
      </div>
      {status === "ready" ? (
        <BusinessPlanScreen
          surface="urmall"
          entityId={business.id}
          entityName={business.identity?.businessName || "Your UrMall business"}
        />
      ) : status === "error" ? (
        <div className="mx-auto max-w-lg px-4 py-10">
          <SellerLoadError onRetry={() => setAttempt((current) => current + 1)} />
        </div>
      ) : (
        <div className="flex min-h-[420px] items-center justify-center">
          <LoaderCircle className="animate-spin text-emerald-600" size={28} />
        </div>
      )}
    </div>
  );
}
