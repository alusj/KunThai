import { BadgeCheck, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { createSellerVerificationRequest } from "../../../../../../../../../Backend/services/marketplace/sellerBoardService";
import { readRegisteredBusiness } from "../../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import { useI18n, t } from "../../../../../../../../../i18n";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";

export default function VerificationCenter({ onBack }) {
  useI18n();
  const [business, setBusiness] = useState(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    readRegisteredBusiness().then((nextBusiness) => {
      if (active) setBusiness(nextBusiness);
    });
    return () => {
      active = false;
    };
  }, []);

  async function submitRequest(event) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      await createSellerVerificationRequest({ note });
      setNote("");
      setStatus(t("urmall.biz.board.verify.sent"));
    } catch (error) {
      setStatus(error.message || t("urmall.biz.board.verify.sendFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title={t("urmall.biz.board.items.verificationT")} eyebrow={t("urmall.biz.board.eyebrow")} onBack={onBack} />
      <main className="w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <BadgeCheck size={22} />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                {t("urmall.biz.board.verify.currentStatus")}
              </p>
              <h1 className="mt-2 text-2xl font-black text-gray-950">
                {business?.verificationStatus || "pending"}
              </h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-emerald-950/75">
                {t("urmall.biz.board.verify.hint")}
              </p>
            </div>
          </div>
        </section>

        <form onSubmit={submitRequest} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-gray-950">{t("urmall.biz.board.verify.requestReview")}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
            {t("urmall.biz.board.verify.requestHint")}
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("urmall.biz.board.verify.notePlaceholder")}
            className="mt-4 min-h-32 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950 focus:ring-4 focus:ring-gray-950/10"
          />
          {status ? (
            <p className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700">
              {status}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white transition hover:bg-gray-800 disabled:opacity-60 sm:w-auto"
          >
            <Send size={17} />
            {submitting ? t("urmall.biz.board.verify.sending") : t("urmall.biz.board.verify.send")}
          </button>
        </form>
      </main>
    </>
  );
}
