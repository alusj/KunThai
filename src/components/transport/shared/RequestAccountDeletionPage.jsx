import { useState } from "react";
import { Trash2 } from "lucide-react";

import { requestUrRideAccountDeletion } from "../../../Backend/services/accountDeletionRequestService";

// Operators ask KunThai admin to review their UrRide account before deletion.
// This page lives in the operator menu; passengers do not see it.
export default function RequestAccountDeletionPage() {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function sendRequest() {
    setSending(true);
    setMessage("");
    try {
      await requestUrRideAccountDeletion(reason);
      setReason("");
      setMessage("Account deletion request sent to KunThai admin for review.");
    } catch (error) {
      setMessage(error.message || "Unable to send this account deletion request.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p className={`rounded-xl p-3 text-sm font-bold ${message.startsWith("Unable") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {message}
        </p>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <Trash2 size={24} />
        </span>
        <h4 className="mt-4 text-xl font-black text-gray-950">Request account deletion</h4>
        <p className="mt-2 text-sm font-semibold leading-7 text-gray-600">
          This sends a review case to KunThai admin. Admins can inspect the UrRide account, recent trips, and support
          tickets before deciding what action should happen.
        </p>
      </section>

      <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="space-y-1">
          <span className="text-xs font-black uppercase text-gray-500">Reason</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Tell admin why you want your UrRide account deleted"
            rows={5}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-rose-400"
          />
        </label>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-black text-amber-900">Admin review happens first</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
            Your request is not an instant delete. KunThai checks safety, trip, support, and account records before taking final action.
          </p>
        </div>

        <button
          type="button"
          onClick={sendRequest}
          disabled={sending}
          className="kt-touchable h-12 rounded-xl bg-rose-600 px-4 text-sm font-black text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Sending..." : "Send deletion request"}
        </button>
      </section>
    </div>
  );
}
