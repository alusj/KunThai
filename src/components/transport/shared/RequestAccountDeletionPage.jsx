import { useState } from "react";
import { Trash2 } from "lucide-react";

import { deleteMyUrRideOperatorAccount } from "../../../Backend/services/accountDeletionRequestService";
import { clearOperatorAccount } from "../../services/transportOperatorAccountService";
import { useI18n, t } from "../../../i18n";

// Operators delete their own UrRide account directly from the operator menu.
// The operator profile, fleets, and trips are removed immediately (server-side
// cascade); passengers do not see this page.
export default function RequestAccountDeletionPage() {
  useI18n();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);

  async function deleteAccount() {
    setDeleting(true);
    setMessage("");
    setMessageIsError(false);
    try {
      await deleteMyUrRideOperatorAccount();
      await clearOperatorAccount().catch(() => {});
      setDone(true);
      setMessage(t("urride.deletion.sentMessage"));
      // Reload so the app re-reads the now-removed operator account and returns
      // the user to the passenger/register state cleanly.
      window.setTimeout(() => window.location.reload(), 1600);
    } catch (error) {
      setMessage(error.message || t("urride.deletion.errorMessage"));
      setMessageIsError(true);
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p className={`rounded-xl p-3 text-sm font-bold ${messageIsError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {message}
        </p>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <Trash2 size={24} />
        </span>
        <h4 className="mt-4 text-xl font-black text-gray-950">{t("urride.deletion.title")}</h4>
        <p className="mt-2 text-sm font-semibold leading-7 text-gray-600">
          {t("urride.deletion.intro")}
        </p>
      </section>

      <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm font-black text-rose-900">{t("urride.deletion.reviewTitle")}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-rose-800">
            {t("urride.deletion.reviewBody")}
          </p>
        </div>

        {done ? null : confirming ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="kt-touchable h-12 rounded-xl bg-gray-100 px-4 text-sm font-black text-gray-700 disabled:opacity-60"
            >
              {t("urride.deletion.cancel")}
            </button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={deleting}
              className="kt-touchable h-12 rounded-xl bg-rose-600 px-4 text-sm font-black text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? t("urride.deletion.sending") : t("urride.deletion.confirm")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="kt-touchable h-12 rounded-xl bg-rose-600 px-4 text-sm font-black text-white hover:bg-rose-700"
          >
            {t("urride.deletion.send")}
          </button>
        )}
      </section>
    </div>
  );
}
