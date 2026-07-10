import { useEffect, useState } from "react";
import { Check, LogOut, ShieldCheck, X } from "lucide-react";

import {
  ADMIN_RESPONSIBILITIES,
  fetchMyAdminRows,
  leaveBusinessAdmin,
  respondToAdminInvite,
} from "../../../Backend/services/marketplace/businessAdminService";
import { haptics, sounds } from "../../../Backend/services/feedbackService";
import { showToast } from "../../../Backend/services/toastService";

// Invitee side of UrMall business admins: respond to invitations, see the
// responsibilities each owner assigned, and leave a business at any time.
export default function AdminRolesPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [leavingRow, setLeavingRow] = useState(null);

  async function load() {
    try {
      setRows(await fetchMyAdminRows());
    } catch (error) {
      showToast(error.message || "Unable to load admin roles.", "danger");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function respond(row, accept) {
    setBusyId(row.id);
    try {
      await respondToAdminInvite(row.id, accept);
      if (accept) {
        haptics.medium("marketplace");
        sounds.success("marketplace");
      }
      showToast(accept ? `You are now an admin of ${row.businessName}.` : "Invitation declined.", accept ? "success" : "info");
      await load();
    } catch (error) {
      showToast(error.message || "Unable to respond to this invitation.", "danger");
    } finally {
      setBusyId("");
    }
  }

  async function leave(row) {
    setBusyId(row.id);
    try {
      await leaveBusinessAdmin(row);
      showToast(`You left ${row.businessName}.`, "success");
      setLeavingRow(null);
      await load();
    } catch (error) {
      showToast(error.message || "Unable to leave this business.", "danger");
    } finally {
      setBusyId("");
    }
  }

  const invites = rows.filter((row) => row.status === "pending");
  const roles = rows.filter((row) => row.status === "accepted");

  if (loading) {
    return <p className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-500">Loading admin roles...</p>;
  }

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
        <ShieldCheck className="mx-auto text-gray-400" />
        <p className="mt-3 font-black text-gray-950">No admin roles yet</p>
        <p className="mt-1 text-sm font-medium leading-6 text-gray-500">
          When a business owner invites you by your KunThai ID, the invitation appears here for you to accept or decline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {invites.length ? (
        <section>
          <h4 className="px-1 text-xs font-black uppercase tracking-[0.16em] text-gray-500">Invitations</h4>
          <div className="mt-2 grid gap-3">
            {invites.map((row) => (
              <article key={row.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <p className="text-sm font-black text-gray-950">{row.businessName}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-gray-600">
                  invited you to help manage their UrMall business. Accepting lets the owner assign you responsibilities.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => respond(row, false)}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm font-black text-gray-700 disabled:opacity-50"
                  >
                    <X size={15} /> Decline
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => respond(row, true)}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-60"
                  >
                    <Check size={15} /> Accept
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {roles.length ? (
        <section>
          <h4 className="px-1 text-xs font-black uppercase tracking-[0.16em] text-gray-500">Your admin roles</h4>
          <div className="mt-2 grid gap-3">
            {roles.map((row) => (
              <article key={row.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-gray-950">{row.businessName}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ADMIN_RESPONSIBILITIES.filter((item) => row.responsibilities[item.key]).map((item) => (
                        <span key={item.key} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                          {item.label}
                        </span>
                      ))}
                      {!ADMIN_RESPONSIBILITIES.some((item) => row.responsibilities[item.key]) ? (
                        <span className="text-xs font-bold text-gray-400">The owner has not assigned responsibilities yet.</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLeavingRow(row)}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50 px-3 text-xs font-black text-rose-600"
                  >
                    <LogOut size={14} /> Leave
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {leavingRow ? (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-950/40 px-4" role="presentation">
          <section role="alertdialog" aria-modal="true" aria-label="Leave business" className="kt-toast-expand-in w-full max-w-sm rounded-[26px] bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-gray-950">Leave {leavingRow.businessName}?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
              You will lose your admin responsibilities immediately. The owner will be notified, and can invite you again later.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setLeavingRow(null)} className="h-11 rounded-xl bg-gray-100 text-sm font-black text-gray-700">Stay</button>
              <button
                type="button"
                disabled={busyId === leavingRow.id}
                onClick={() => leave(leavingRow)}
                className="h-11 rounded-xl bg-rose-600 text-sm font-black text-white disabled:opacity-60"
              >
                {busyId === leavingRow.id ? "Leaving..." : "Leave business"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
