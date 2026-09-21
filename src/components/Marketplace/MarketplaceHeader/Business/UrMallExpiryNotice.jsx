import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, LoaderCircle } from "lucide-react";
import {
  fetchUrMallRetention,
  notifyUrMallRetentionUpdated,
  selectUrMallRetainedInventory,
  URMALL_RETENTION_UPDATED_EVENT,
} from "../../../../Backend/services/marketplace/urmallExpiryRetentionService";
import { t as i18nText } from "../../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";
import { inlineErrorMessage } from "../../../../Backend/services/friendlyErrorService";

const EMPTY_RETENTION = { case: null, items: [] };

export default function UrMallExpiryNotice({ businessId, businessKind = "retail", onOpenPlans }) {
  useUiLocale();
  const [state, setState] = useState(EMPTY_RETENTION);
  const [selected, setSelected] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const load = useCallback(() => fetchUrMallRetention(businessId), [businessId]);

  useEffect(() => {
    let active = true;
    let previousVersion = "";
    setState(EMPTY_RETENTION);
    setExpanded(false);
    setError("");
    const refresh = () => load().then((next) => {
      if (!active) return;
      const version = `${next.case?.id}:${next.case?.status}:${next.case?.retainedIds.join(",")}`;
      setState(next);
      if (version !== previousVersion) {
        setSelected(next.case?.retainedIds || []);
        const shouldInvalidate = Boolean(previousVersion || next.case?.status === "pending");
        previousVersion = version;
        if (shouldInvalidate) notifyUrMallRetentionUpdated(businessId);
      }
    }).catch(() => { /* Preserve any already-visible warning during a network interruption. */ });
    const handleUpdate = (event) => {
      if (event?.detail?.surface && event.detail.surface !== "urmall") return;
      if (event?.detail?.businessId && event.detail.businessId !== businessId) return;
      refresh();
    };
    refresh();
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("kunthai-business-subscription-updated", handleUpdate);
    window.addEventListener(URMALL_RETENTION_UPDATED_EVENT, handleUpdate);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("kunthai-business-subscription-updated", handleUpdate);
      window.removeEventListener(URMALL_RETENTION_UPDATED_EVENT, handleUpdate);
    };
  }, [businessId, load]);

  const retention = state.case;
  if (!retention || retention.businessId !== businessId || retention.status !== "pending") return null;
  const items = state.items.filter((item) => item.eligibleToKeep);
  const required = state.canSelect ? Math.min(10, items.length) : retention.retainedIds.length;
  const noun = businessKind === "restaurant" ? "meals" : businessKind === "property_agent" ? "properties" : "products";
  const deadline = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(retention.deleteAfter));
  const ended = new Date(retention.deleteAfter).getTime() <= Date.now();
  const excess = state.excessCount;
  const toggle = (id) => {
    setSaved(false);
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < required ? [...current, id] : current);
  };
  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const next = await selectUrMallRetainedInventory(retention.id, selected);
      setState(next);
      setSelected(next.case?.retainedIds || []);
      setSaved(true);
    } catch (failure) {
      setError(inlineErrorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label={i18nText("ui.literals.kb25dd737be27")} className="rounded-3xl border border-amber-400 bg-amber-50 p-4 text-slate-950 shadow-sm dark:border-amber-400 dark:bg-slate-900 dark:text-slate-50">
      <div className="flex items-start gap-3">
        <AlertTriangle size={23} className="mt-0.5 flex-none text-amber-700 dark:text-amber-300" />
        <div className="min-w-0">
          <h2 className="text-base font-black">{i18nText("ui.literals.k842bd9eb008b")}</h2>
          <p className="mt-2 text-sm font-semibold leading-6">{i18nText("ui.literals.ke269d18e749b")} {required} {noun} {i18nText("ui.literals.kfa6f14bfa878")} {excess > 0 ? i18nText("ui.literals.k23e52f50de03", { value0: excess, value1: deadline }) : i18nText("ui.literals.k9bd433be9209", { value0: deadline })}</p>
          <p className="mt-2 text-sm leading-6">{i18nText("ui.literals.k0a2eb61c2d44")} {noun} {i18nText("ui.literals.k99e6d9732f3a")}</p>
          {(businessKind === "retail" || businessKind === "vendor") && <p className="mt-2 text-sm leading-6">{i18nText("ui.literals.k5e0d5c4be9d4")}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {onOpenPlans && <button type="button" onClick={onOpenPlans} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">{i18nText("ui.literals.k596aae65b3fe")}</button>}
        {state.canSelect && <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex items-center gap-2 rounded-xl border border-amber-500 px-4 py-3 text-sm font-black">{i18nText("ui.literals.k78b7c9f6d6d7")} {required} {noun} {i18nText("ui.literals.ke40e6d3d9899")} {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>}
      </div>
      {expanded && state.canSelect && (
        <div className="mt-4 border-t border-amber-300 pt-4 dark:border-slate-600">
          <p className="mb-3 text-sm font-bold" aria-live="polite">{selected.length} {i18nText("ui.literals.kde04fa0e29f9")} {required} {i18nText("ui.literals.k170afd3a773e")}</p>
          <div className="max-h-80 space-y-2 overflow-y-auto overscroll-contain">
            {items.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white p-3 dark:border-slate-600 dark:bg-slate-950">
                <input type="checkbox" checked={selected.includes(item.id)} disabled={saving || ended || (!selected.includes(item.id) && selected.length >= required)} onChange={() => toggle(item.id)} className="h-5 w-5 flex-none accent-emerald-600" />
                {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" className="h-12 w-12 rounded-lg object-cover" />}
                <span className="min-w-0 text-sm font-bold">{item.title || i18nText("ui.literals.k903a1994839f")}</span>
              </label>
            ))}
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-bold text-red-700 dark:text-red-300">{translateUi(error)}</p>}
          {ended ? <p className="mt-3 text-sm font-bold">{i18nText("ui.literals.k4ba1ef836fa4")}</p> : (
            <button type="button" disabled={saving || selected.length !== required} onClick={save} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />}{saving ? i18nText("ui.literals.k96352a0ad69e") : i18nText("ui.literals.k57da1912ac20")}</button>
          )}
          {saved && <p role="status" className="mt-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">{i18nText("ui.literals.k7678507511e3")}</p>}
        </div>
      )}
    </section>
  );
}
