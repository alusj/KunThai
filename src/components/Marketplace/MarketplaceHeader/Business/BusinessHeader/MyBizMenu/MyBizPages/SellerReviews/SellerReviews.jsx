import AppBackTab from "../../../../../../../shared/AppBackTab";
import BusinessReputation from "../../../../BusinessReputation/BusinessReputation";
import { useI18n, t } from "../../../../../../../../i18n";

// Seller menu → Reviews: what buyers said about this store, with the rating
// and the trust figures that are actually measured.
export default function SellerReviews({ onBack }) {
  useI18n();
  return (
    <div className="min-h-full bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 pb-3 pt-3 backdrop-blur">
        <AppBackTab onBack={onBack} label={t("sellerReviews.back")} historyKey="seller-reviews" useHistoryLayer={false} />
        <div className="mt-3">
          <p className="text-xs font-black uppercase tracking-wider text-emerald-600">{t("sellerReviews.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">{t("sellerReviews.title")}</h1>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-5">
        <BusinessReputation />
      </div>
    </div>
  );
}
