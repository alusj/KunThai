import { useEffect, useState } from "react";
import { Check, LoaderCircle, MoreVertical, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";

import {
  ADMIN_RESPONSIBILITIES,
  fetchBusinessAdmins,
  inviteBusinessAdmin,
  removeBusinessAdmin,
  updateAdminResponsibilities,
} from "../../../../../../../../Backend/services/marketplace/businessAdminService";
import { readRegisteredBusiness } from "../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import { resolvePublicCode, detectPublicCodeKind } from "../../../../../../../../Backend/services/publicCodeService";
import { haptics, sounds } from "../../../../../../../../Backend/services/feedbackService";
import { showToast } from "../../../../../../../../Backend/services/toastService";
import AppBackTab from "../../../../../../../shared/AppBackTab";

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-100",
  declined: "bg-rose-50 text-rose-700 border-rose-100",
};

export default function BusinessAdmins({ onBack }) {
  const [business, setBusiness] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [inviting, setInviting] = useState(false);
  const [lookup, setLookup] = useState({ status: "idle", name: "", message: "" });
  const [actionAdmin, setActionAdmin] = useState(null);
  const [responsibilityAdmin, setResponsibilityAdmin] = useState(null);
  const [responsibilityDraft, setResponsibilityDraft] = useState({});
  const [savingResponsibilities, setSavingResponsibilities] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const activeBusiness = await readRegisteredBusiness();
        if (!alive) return;
        setBusiness(activeBusiness);
        if (activeBusiness?.id) {
          const rows = await fetchBusinessAdmins(activeBusiness.id);
          if (alive) setAdmins(rows);
        }
      } catch (error) {
        showToast(error.message || "Unable to load business admins.", "danger");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // Live verification: as the owner pastes a KunThai ID, resolve it and show
  // whose account it is before the invitation is sent.
  useEffect(() => {
    const code = inviteCode.trim();
    if (!code) {
      setLookup({ status: "idle", name: "", message: "" });
      return undefined;
    }
    if (detectPublicCodeKind(code) !== "kunthai") {
      setLookup({ status: "invalid", name: "", message: "Enter a KunThai ID that starts with KTU." });
      return undefined;
    }

    let alive = true;
    setLookup({ status: "checking", name: "", message: "Checking this KunThai ID..." });
    const timer = window.setTimeout(async () => {
      try {
        const result = await resolvePublicCode(code);
        if (!alive) return;
        if (result?.userId) {
          setLookup({ status: "found", name: result.title || "KunThai member", message: "" });
        } else {
          setLookup({ status: "notFound", name: "", message: "No KunThai account matches this ID." });
        }
      } catch {
        if (alive) setLookup({ status: "notFound", name: "", message: "Unable to check this ID right now." });
      }
    }, 450);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [inviteCode]);

  async function reloadAdmins() {
    if (!business?.id) return;
    try {
      setAdmins(await fetchBusinessAdmins(business.id));
    } catch {
      // The list keeps its last known state.
    }
  }

  async function sendInvite(event) {
    event.preventDefault();
    if (!inviteCode.trim() || inviting) return;
    setInviting(true);
    try {
      await inviteBusinessAdmin(
        { id: business?.id, name: business?.identity?.businessName },
        inviteCode,
      );
      setInviteCode("");
      setLookup({ status: "idle", name: "", message: "" });
      haptics.medium("marketplace");
      sounds.success("marketplace");
      showToast("Invitation sent. The person can accept it from their UrMall menu.", "success");
      await reloadAdmins();
    } catch (error) {
      showToast(error.message || "Unable to send this invitation.", "danger");
    } finally {
      setInviting(false);
    }
  }

  function openResponsibilities(admin) {
    setActionAdmin(null);
    setResponsibilityAdmin(admin);
    setResponsibilityDraft({ ...admin.responsibilities });
  }

  async function saveResponsibilities() {
    if (!responsibilityAdmin || savingResponsibilities) return;
    setSavingResponsibilities(true);
    try {
      await updateAdminResponsibilities(responsibilityAdmin, responsibilityDraft);
      showToast("Responsibilities updated.", "success");
      setResponsibilityAdmin(null);
      await reloadAdmins();
    } catch (error) {
      showToast(error.message || "Unable to update responsibilities.", "danger");
    } finally {
      setSavingResponsibilities(false);
    }
  }

  async function removeAdmin(admin) {
    setActionAdmin(null);
    try {
      await removeBusinessAdmin(admin);
      haptics.medium("marketplace");
      showToast(`${admin.adminName} was removed from this business.`, "success");
      await reloadAdmins();
    } catch (error) {
      showToast(error.message || "Unable to remove this admin.", "danger");
    }
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex items-center gap-3">
          <AppBackTab onBack={onBack} label="Back to seller menu" historyKey="business-admins" useHistoryLayer={false} />
          <div>
            <p className="text-xs font-black uppercase text-emerald-700">Team</p>
            <h1 className="text-lg font-black text-gray-950">Business admins</h1>
          </div>
        </div>
      </header>

      <main className="space-y-5 px-4 py-5 sm:px-6">
        <section className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><UserPlus size={20} /></span>
            <div className="min-w-0">
              <h2 className="text-base font-black text-gray-950">Invite an admin</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-gray-500">
                Enter the person's KunThai unique ID (starts with KTU). They find it on their Explore profile.
                They must accept the invitation before getting any access.
              </p>
            </div>
          </div>
          <form onSubmit={sendInvite} className="mt-4 flex gap-2">
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="KTU-XXXX-XXXX-XXXX"
              className="h-12 min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-bold uppercase tracking-wide outline-none focus:border-emerald-500 focus:bg-white"
            />
            <button
              type="submit"
              disabled={inviting || lookup.status !== "found"}
              className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50"
            >
              {inviting ? <LoaderCircle size={16} className="animate-spin" /> : <UserPlus size={16} />}
              Invite
            </button>
          </form>
          {lookup.status === "found" ? (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <Check size={16} className="shrink-0 text-emerald-600" />
              <p className="min-w-0 truncate text-sm font-black text-emerald-800">{lookup.name}</p>
            </div>
          ) : lookup.status === "checking" ? (
            <p className="mt-3 flex items-center gap-2 text-xs font-bold text-gray-500"><LoaderCircle size={14} className="animate-spin" /> {lookup.message}</p>
          ) : lookup.message ? (
            <p className="mt-3 text-xs font-bold text-rose-600">{lookup.message}</p>
          ) : null}
        </section>

        <section>
          <h2 className="px-1 text-xs font-black uppercase tracking-[0.16em] text-gray-500">Current team</h2>
          <div className="mt-3 grid gap-3">
            {loading ? (
              <p className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-500">Loading admins...</p>
            ) : !admins.length ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
                <ShieldCheck className="mx-auto text-gray-400" />
                <p className="mt-2 text-sm font-bold text-gray-500">No admins yet. Invite trusted people to help run this store.</p>
              </div>
            ) : (
              admins.map((admin) => (
                <article key={admin.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-gray-950">{admin.adminName}</p>
                      <p className="mt-0.5 truncate text-xs font-bold text-gray-500">{admin.adminCode}</p>
                      <span className={`mt-2 inline-block rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${STATUS_STYLES[admin.status] || STATUS_STYLES.pending}`}>
                        {admin.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActionAdmin(admin)}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600"
                      aria-label={`Actions for ${admin.adminName}`}
                    >
                      <MoreVertical size={18} />
                    </button>
                  </div>
                  {admin.status === "accepted" ? (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
                      {ADMIN_RESPONSIBILITIES.filter((item) => admin.responsibilities[item.key]).map((item) => (
                        <span key={item.key} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                          {item.label}
                        </span>
                      ))}
                      {!ADMIN_RESPONSIBILITIES.some((item) => admin.responsibilities[item.key]) ? (
                        <span className="text-xs font-bold text-gray-400">No responsibilities assigned yet.</span>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </main>

      {actionAdmin ? (
        <div className="fixed inset-0 z-[1400]" role="presentation">
          <button type="button" aria-label="Close admin actions" onClick={() => setActionAdmin(null)} className="absolute inset-0 bg-slate-950/40" />
          <section role="dialog" aria-modal="true" aria-label={`Actions for ${actionAdmin.adminName}`} className="kt-toast-expand-in absolute inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto max-w-sm rounded-[24px] bg-white p-3 shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-2 py-1">
              <p className="truncate text-sm font-black text-gray-950">{actionAdmin.adminName}</p>
              <button type="button" onClick={() => setActionAdmin(null)} className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-gray-600" aria-label="Close actions"><X size={16} /></button>
            </div>
            {actionAdmin.status === "accepted" ? (
              <button type="button" onClick={() => openResponsibilities(actionAdmin)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                <ShieldCheck size={17} /> Give responsibilities
              </button>
            ) : null}
            <button type="button" onClick={() => removeAdmin(actionAdmin)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-black text-rose-600 hover:bg-rose-50">
              <Trash2 size={17} /> {actionAdmin.status === "pending" ? "Cancel invitation" : "Remove admin"}
            </button>
          </section>
        </div>
      ) : null}

      {responsibilityAdmin ? (
        <div className="fixed inset-0 z-[1400]" role="presentation">
          <button type="button" aria-label="Close responsibilities" onClick={() => setResponsibilityAdmin(null)} className="absolute inset-0 bg-slate-950/40" />
          <section role="dialog" aria-modal="true" aria-label={`Responsibilities for ${responsibilityAdmin.adminName}`} className="kt-toast-expand-in absolute inset-x-4 top-1/2 mx-auto max-w-md -translate-y-1/2 rounded-[26px] bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-black text-gray-950">Responsibilities</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">Choose what {responsibilityAdmin.adminName} can do for this business.</p>
            <div className="mt-4 grid gap-2">
              {ADMIN_RESPONSIBILITIES.map((item) => {
                const active = Boolean(responsibilityDraft[item.key]);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setResponsibilityDraft((current) => ({ ...current, [item.key]: !current[item.key] }))}
                    className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}
                  >
                    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ${active ? "bg-emerald-600 text-white" : "bg-gray-100 text-transparent"}`}>
                      <Check size={14} />
                    </span>
                    <span>
                      <span className="block text-sm font-black text-gray-950">{item.label}</span>
                      <span className="mt-0.5 block text-xs font-semibold leading-5 text-gray-500">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setResponsibilityAdmin(null)} className="h-12 rounded-2xl bg-gray-100 text-sm font-black text-gray-700">Cancel</button>
              <button type="button" disabled={savingResponsibilities} onClick={saveResponsibilities} className="h-12 rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:opacity-60">
                {savingResponsibilities ? "Saving..." : "Save"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
