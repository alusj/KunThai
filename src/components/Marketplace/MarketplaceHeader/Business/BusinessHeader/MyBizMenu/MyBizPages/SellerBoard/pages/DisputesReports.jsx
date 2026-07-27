import { Send } from "lucide-react";
import { useState } from "react";

import { createSellerCase } from "../../../../../../../../../Backend/services/marketplace/sellerBoardService";
import { useI18n, t } from "../../../../../../../../../i18n";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";

export default function DisputesReports({ onBack }) {
  useI18n();
  const [form, setForm] = useState({
    caseType: "order_dispute",
    priority: "normal",
    title: "",
    description: "",
  });
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setStatus("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      setStatus(t("urmall.biz.board.reports.validation"));
      return;
    }

    setSubmitting(true);
    setStatus("");
    try {
      await createSellerCase(form);
      setForm({ caseType: "order_dispute", priority: "normal", title: "", description: "" });
      setStatus(t("urmall.biz.board.reports.submitted"));
    } catch (error) {
      setStatus(error.message || t("urmall.biz.board.reports.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title={t("urmall.biz.board.items.reportsT")} eyebrow={t("urmall.biz.board.eyebrow")} onBack={onBack} />
      <main className="w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-black text-gray-950">{t("urmall.biz.board.reports.heading")}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
            {t("urmall.biz.board.reports.hint")}
          </p>
        </section>

        <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{t("urmall.biz.board.reports.caseType")}</span>
              <select
                value={form.caseType}
                onChange={(event) => update("caseType", event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
              >
                <option value="order_dispute">{t("urmall.biz.board.reports.typeOrderDispute")}</option>
                <option value="suspicious_buyer">{t("urmall.biz.board.reports.typeSuspiciousBuyer")}</option>
                <option value="payment_issue">{t("urmall.biz.board.reports.typePaymentIssue")}</option>
                <option value="product_report">{t("urmall.biz.board.reports.typeProductReport")}</option>
                <option value="support">{t("urmall.biz.board.reports.typeSupport")}</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{t("urmall.biz.board.reports.priority")}</span>
              <select
                value={form.priority}
                onChange={(event) => update("priority", event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
              >
                <option value="normal">{t("urmall.biz.board.reports.prioNormal")}</option>
                <option value="high">{t("urmall.biz.board.reports.prioHigh")}</option>
                <option value="urgent">{t("urmall.biz.board.reports.prioUrgent")}</option>
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{t("urmall.biz.board.reports.titleLabel")}</span>
              <input
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                placeholder={t("urmall.biz.board.reports.titlePlaceholder")}
              />
            </label>
            <label className="md:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{t("urmall.biz.board.reports.descLabel")}</span>
              <textarea
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                className="mt-2 min-h-36 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                placeholder={t("urmall.biz.board.reports.descPlaceholder")}
              />
            </label>
          </div>

          {status ? <p className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700">{status}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white transition hover:bg-gray-800 disabled:opacity-60 sm:w-auto"
          >
            <Send size={17} />
            {submitting ? t("urmall.biz.board.reports.submitting") : t("urmall.biz.board.reports.submit")}
          </button>
        </form>
      </main>
    </>
  );
}
