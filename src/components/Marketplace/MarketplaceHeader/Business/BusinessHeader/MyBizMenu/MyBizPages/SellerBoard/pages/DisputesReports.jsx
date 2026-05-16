import { Send } from "lucide-react";
import { useState } from "react";

import { createSellerCase } from "../../../../../../../../../Backend/services/marketplace/sellerBoardService";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";

export default function DisputesReports({ onBack }) {
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
      setStatus("Add a clear title and description before submitting.");
      return;
    }

    setSubmitting(true);
    setStatus("");
    try {
      await createSellerCase(form);
      setForm({ caseType: "order_dispute", priority: "normal", title: "", description: "" });
      setStatus("Report submitted. UrMall support will review the case.");
    } catch (error) {
      setStatus(error.message || "Unable to submit report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title="Disputes & Reports" eyebrow="Seller Board" onBack={onBack} />
      <main className="w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-black text-gray-950">Create a seller case</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
            Use this board to report order disputes, suspicious buyers, fake payment claims, harassment, or marketplace issues. A strong report includes names, product details, order context, dates, and evidence.
          </p>
        </section>

        <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Case type</span>
              <select
                value={form.caseType}
                onChange={(event) => update("caseType", event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
              >
                <option value="order_dispute">Order dispute</option>
                <option value="suspicious_buyer">Suspicious buyer</option>
                <option value="payment_issue">Payment issue</option>
                <option value="product_report">Product or listing issue</option>
                <option value="support">General support case</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Priority</span>
              <select
                value={form.priority}
                onChange={(event) => update("priority", event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Title</span>
              <input
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                placeholder="Example: Buyer sent fake payment confirmation"
              />
            </label>
            <label className="md:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Description</span>
              <textarea
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                className="mt-2 min-h-36 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                placeholder="Explain what happened, who was involved, and what support should review."
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
            {submitting ? "Submitting..." : "Submit report"}
          </button>
        </form>
      </main>
    </>
  );
}
