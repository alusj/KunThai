import { BadgeCheck, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { createSellerVerificationRequest } from "../../../../../../../../../Backend/services/marketplace/sellerBoardService";
import { readRegisteredBusiness } from "../../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";

export default function VerificationCenter({ onBack }) {
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
      setStatus("Verification request sent. UrMall support will review your seller profile and documents.");
    } catch (error) {
      setStatus(error.message || "Unable to send verification request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title="Verification Center" eyebrow="Seller Board" onBack={onBack} />
      <main className="w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <BadgeCheck size={22} />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                Current status
              </p>
              <h1 className="mt-2 text-2xl font-black text-gray-950">
                {business?.verificationStatus || "pending"}
              </h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-emerald-950/75">
                Verification helps buyers know where to send money and whether a seller has taken trust seriously. Complete business details, truthful products, and clean documents make approval easier.
              </p>
            </div>
          </div>
        </section>

        <form onSubmit={submitRequest} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-gray-950">Request review</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
            Send a review request when your seller profile, contact details, product listings, and verification documents are ready for UrMall support to inspect.
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a short note for the review team..."
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
            {submitting ? "Sending..." : "Send verification request"}
          </button>
        </form>
      </main>
    </>
  );
}
