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
import { useI18n, t } from "../../../../../../../../i18n";
import AppBackTab from "../../../../../../../shared/AppBackTab";
import KunThaiIdHelpButton from "../../../../../../../shared/KunThaiIdHelpButton";
import { t as i18nText } from "../../../../../../../../i18n/index";

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-100",
  declined: "bg-rose-50 text-rose-700 border-rose-100",
};

export default function BusinessAdmins({ onBack }) {
  useI18n();
  const [business, setBusiness] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [inviting, setInviting] = useState(false);
  const [lookup, setLookup] = useState({ status: i18nText("ui.literals.k1adbcc344b31"), name: "", message: "" });
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
        showToast(error.message || t("urmall.biz.admins.loadFailed"), "danger");
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
      setLookup({ status: i18nText("ui.literals.k1adbcc344b31"), name: "", message: "" });
      return undefined;
    }
    if (detectPublicCodeKind(code) !== "kunthai") {
      setLookup({ status: i18nText("ui.literals.k81f344a7686a"), name: "", message: t("urmall.biz.admins.invalidId") });
      return undefined;
    }

    let alive = true;
    setLookup({ status: i18nText("ui.literals.k28cfb479fbfa"), name: "", message: t("urmall.biz.admins.checking") });
    const timer = window.setTimeout(async () => {
      try {
        const result = await resolvePublicCode(code);
        if (!alive) return;
        if (result?.userId) {
          setLookup({ status: i18nText("ui.literals.k2739bb260ce4"), name: result.title || t("urmall.biz.admins.memberFallback"), message: "" });
        } else {
          setLookup({ status: "notFound", name: "", message: t("urmall.biz.admins.notFound") });
        }
      } catch {
        if (alive) setLookup({ status: "notFound", name: "", message: t("urmall.biz.admins.checkFailed") });
      }
    }, 320);

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
      setLookup({ status: i18nText("ui.literals.k1adbcc344b31"), name: "", message: "" });
      haptics.medium("marketplace");
      sounds.success("marketplace");
      showToast(t("urmall.biz.admins.inviteSent"), "success");
      await reloadAdmins();
    } catch (error) {
      showToast(error.message || t("urmall.biz.admins.inviteFailed"), "danger");
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
      showToast(t("urmall.biz.admins.respUpdated"), "success");
      setResponsibilityAdmin(null);
      await reloadAdmins();
    } catch (error) {
      showToast(error.message || t("urmall.biz.admins.respUpdateFailed"), "danger");
    } finally {
      setSavingResponsibilities(false);
    }
  }

  async function removeAdmin(admin) {
    setActionAdmin(null);
    try {
      await removeBusinessAdmin(admin);
      haptics.medium("marketplace");
      showToast(t("urmall.biz.admins.removed", { name: admin.adminName }), "success");
      await reloadAdmins();
    } catch (error) {
      showToast(error.message || t("urmall.biz.admins.removeFailed"), "danger");
    }
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex items-center gap-3">
          <AppBackTab onBack={onBack} label={t("urmall.biz.admins.backLabel")} historyKey="business-admins" useHistoryLayer={false} />
          <div>
            <p className="text-xs font-black uppercase text-emerald-700">{t("urmall.biz.admins.team")}</p>
            <h1 className="text-lg font-black text-gray-950">{t("urmall.biz.menu.adminsTitle")}</h1>
          </div>
        </div>
      </header>

      <main className="space-y-5 px-4 py-5 sm:px-6">
        <section className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><UserPlus size={20} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-black text-gray-950">{t("urmall.biz.admins.inviteTitle")}</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-gray-500">
                {t("urmall.biz.admins.inviteHint")}
              </p>
            </div>
            <KunThaiIdHelpButton subject="business administrator" tone="emerald" />
          </div>
          <form onSubmit={sendInvite} className="mt-4 flex gap-2">
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              placeholder="KTU-XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label={t("urmall.biz.admins.idAria")}
              className="h-12 min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-bold uppercase tracking-wide outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />
            <button
              type="submit"
              disabled={inviting || lookup.status !== "found"}
              className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50"
            >
              {inviting ? <LoaderCircle size={16} className="animate-spin" /> : <UserPlus size={16} />}
              {t("urmall.biz.admins.invite")}
            </button>
          </form>
          {lookup.status === "found" ? (
            <div className="kt-modal-enter mt-3 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <Check size={16} className="shrink-0 text-emerald-600" />
              <p className="min-w-0 truncate text-sm font-black text-emerald-800">{lookup.name}</p>
            </div>
          ) : lookup.status === "checking" ? (
            <p aria-live="polite" className="kt-modal-enter mt-3 flex items-center gap-2 text-xs font-bold text-gray-500"><LoaderCircle size={14} className="animate-spin" /> {lookup.message}</p>
          ) : lookup.message ? (
            <p aria-live="polite" className="kt-modal-enter mt-3 text-xs font-bold text-rose-600">{lookup.message}</p>
          ) : null}
        </section>

        <section>
          <h2 className="px-1 text-xs font-black uppercase tracking-[0.16em] text-gray-500">{t("urmall.biz.admins.currentTeam")}</h2>
          <div className="mt-3 grid gap-3">
            {loading ? (
              <p className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-500">{t("urmall.biz.admins.loading")}</p>
            ) : !admins.length ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
                <ShieldCheck className="mx-auto text-gray-400" />
                <p className="mt-2 text-sm font-bold text-gray-500">{t("urmall.biz.admins.empty")}</p>
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
                      aria-label={t("urmall.biz.admins.actionsFor", { name: admin.adminName })}
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
                        <span className="text-xs font-bold text-gray-400">{t("urmall.biz.admins.noResp")}</span>
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
          <button type="button" aria-label={t("urmall.biz.admins.closeActionsOverlay")} onClick={() => setActionAdmin(null)} className="absolute inset-0 bg-slate-950/40" />
          <section role="dialog" aria-modal="true" aria-label={t("urmall.biz.admins.actionsFor", { name: actionAdmin.adminName })} className="kt-toast-expand-in absolute inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto max-w-sm rounded-[24px] bg-white p-3 shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-2 py-1">
              <p className="truncate text-sm font-black text-gray-950">{actionAdmin.adminName}</p>
              <button type="button" onClick={() => setActionAdmin(null)} className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-gray-600" aria-label={t("urmall.biz.admins.closeActions")}><X size={16} /></button>
            </div>
            {actionAdmin.status === "accepted" ? (
              <button type="button" onClick={() => openResponsibilities(actionAdmin)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-black text-gray-700 hover:bg-gray-50">
                <ShieldCheck size={17} /> {t("urmall.biz.admins.giveResp")}
              </button>
            ) : null}
            <button type="button" onClick={() => removeAdmin(actionAdmin)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-black text-rose-600 hover:bg-rose-50">
              <Trash2 size={17} /> {actionAdmin.status === "pending" ? t("urmall.biz.admins.cancelInvite") : t("urmall.biz.admins.removeAdmin")}
            </button>
          </section>
        </div>
      ) : null}

      {responsibilityAdmin ? (
        <div className="fixed inset-0 z-[1400]" role="presentation">
          <button type="button" aria-label={t("urmall.biz.admins.closeResp")} onClick={() => setResponsibilityAdmin(null)} className="absolute inset-0 bg-slate-950/40" />
          <section role="dialog" aria-modal="true" aria-label={t("urmall.biz.admins.respFor", { name: responsibilityAdmin.adminName })} className="kt-toast-expand-in absolute inset-x-4 top-1/2 mx-auto max-w-md -translate-y-1/2 rounded-[26px] bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-black text-gray-950">{t("urmall.biz.admins.respTitle")}</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">{t("urmall.biz.admins.respHint", { name: responsibilityAdmin.adminName })}</p>
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
                      <span className="block text-sm font-black text-gray-950">{t(`urmall.biz.admins.resp.${item.key}Label`)}</span>
                      <span className="mt-0.5 block text-xs font-semibold leading-5 text-gray-500">{t(`urmall.biz.admins.resp.${item.key}Desc`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setResponsibilityAdmin(null)} className="h-12 rounded-2xl bg-gray-100 text-sm font-black text-gray-700">{t("urmall.biz.admins.cancel")}</button>
              <button type="button" disabled={savingResponsibilities} onClick={saveResponsibilities} className="h-12 rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:opacity-60">
                {savingResponsibilities ? t("urmall.biz.saving") : t("urmall.biz.admins.save")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
