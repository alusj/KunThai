import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Megaphone, RotateCcw, Send, Users } from "lucide-react";

import { getChurnCampaigns, previewChurnCampaign, sendChurnCampaign } from "../churnAdminService";
import { formatCount, formatPercent } from "../churnAdminRules.js";
import {
  ACTIONS_BY_PRODUCT,
  CAMPAIGN_LOCALES,
  CHURN_CAMPAIGN_TEMPLATES,
  DEFAULT_ACTION_BY_PRODUCT,
  MESSAGE_LIMITS,
  buildCampaignMessages,
  messageProblems,
} from "../churnCampaignTemplates.js";
import { AUDIENCES, HOLDOUT_OPTIONS, campaignProgress, canSendPreview, languageName } from "../churnCampaignRules.js";
import { keyedLabel, productName, tx } from "../churnText.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";
import { ADMIN_CHURN } from "../../i18n/adminChurn.js";
import { Card, ErrorNote, Loading } from "./churnUi";

const SIGNAL_KEYS = Object.keys(ADMIN_CHURN.en.signal);
const field = "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-600";

function Label({ children, hint }) {
  return (
    <span className="mb-1 flex items-baseline justify-between gap-2 text-xs font-black uppercase text-zinc-500">
      <span>{children}</span>{hint ? <span className="font-bold normal-case text-zinc-400">{hint}</span> : null}
    </span>
  );
}

function Stat({ label, value, tone = "text-zinc-950" }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <p className="text-[11px] font-black uppercase text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-black tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function SendForm({ access, country, product: filterProduct, locale, onSent }) {
  const products = useMemo(() => access.campaignProducts || [], [access.campaignProducts]);
  const [product, setProduct] = useState(products.includes(filterProduct) ? filterProduct : products[0] || "explore");
  const [audience, setAudience] = useState("attention");
  const [signal, setSignal] = useState("");
  const [messageAction, setMessageAction] = useState(DEFAULT_ACTION_BY_PRODUCT[product]);
  const [onlySuggested, setOnlySuggested] = useState(false);
  const [holdoutPct, setHoldoutPct] = useState(10);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState(CAMPAIGN_LOCALES.includes(String(locale).slice(0, 2)) ? String(locale).slice(0, 2) : "en");
  const [edits, setEdits] = useState({});
  const [preview, setPreview] = useState({ loading: false, data: null, error: "" });
  const [send, setSend] = useState({ confirming: false, sending: false, result: null, error: "" });

  useEffect(() => {
    if (products.includes(filterProduct)) setProduct(filterProduct);
  }, [filterProduct, products]);

  useEffect(() => {
    setMessageAction(DEFAULT_ACTION_BY_PRODUCT[product]);
    setEdits({});
    setOnlySuggested(false);
  }, [product]);

  // Any change to who is reached throws away the last audience check.
  useEffect(() => {
    setPreview({ loading: false, data: null, error: "" });
    setSend((current) => ({ ...current, confirming: false, error: "" }));
  }, [product, country, audience, signal, messageAction, onlySuggested, holdoutPct]);

  const messages = useMemo(() => buildCampaignMessages(messageAction, edits), [messageAction, edits]);
  const problems = useMemo(() => messageProblems(messages), [messages]);
  const current = messages[language];
  const template = CHURN_CAMPAIGN_TEMPLATES[messageAction]?.[language];
  const edited = Object.keys(edits).filter((key) => Object.values(edits[key] || {}).some((value) => String(value || "").trim()));
  const input = { product, country, audience, signal, action: onlySuggested ? messageAction : "", holdoutPct };

  function edit(fieldName, value) {
    setEdits((all) => ({ ...all, [language]: { ...(all[language] || {}), [fieldName]: value } }));
  }

  async function check() {
    setPreview({ loading: true, data: null, error: "" });
    try {
      setPreview({ loading: false, data: await previewChurnCampaign(input), error: "" });
    } catch (error) {
      setPreview({ loading: false, data: null, error: inlineErrorMessage(error, tx("previewError")) });
    }
  }

  async function confirmSend() {
    setSend({ confirming: false, sending: true, result: null, error: "" });
    try {
      const result = await sendChurnCampaign({ ...input, messages, name, messageAction });
      setSend({ confirming: false, sending: false, result, error: "" });
      setPreview({ loading: false, data: null, error: "" });
      setEdits({});
      setName("");
      onSent?.();
    } catch (error) {
      setSend({ confirming: false, sending: false, result: null, error: inlineErrorMessage(error, tx("sendError")) });
    }
  }

  const ready = canSendPreview(preview.data) && !problems.length;

  return (
    <Card title={tx("campaignsTitle")} note={tx("campaignsDescription")}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label>
          <Label>{tx("fieldSector")}</Label>
          <select value={product} onChange={(event) => setProduct(event.target.value)} className={field}>
            {products.map((item) => <option key={item} value={item}>{productName(item)}</option>)}
          </select>
        </label>
        <label>
          <Label>{tx("fieldAudience")}</Label>
          <select value={audience} onChange={(event) => setAudience(event.target.value)} className={field}>
            {AUDIENCES.map((item) => <option key={item} value={item}>{keyedLabel("audience", item)}</option>)}
          </select>
        </label>
        <label>
          <Label>{tx("fieldSignal")}</Label>
          <select value={signal} onChange={(event) => setSignal(event.target.value)} className={field}>
            <option value="">{tx("anySignal")}</option>
            {SIGNAL_KEYS.map((item) => <option key={item} value={item}>{keyedLabel("signal", item)}</option>)}
          </select>
        </label>
        <label>
          <Label>{tx("fieldHoldout")}</Label>
          <select value={holdoutPct} onChange={(event) => setHoldoutPct(Number(event.target.value))} className={field}>
            {HOLDOUT_OPTIONS.map((value) => <option key={value} value={value}>{value ? tx("holdoutValue", { pct: value }) : tx("noHoldout")}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label>
          <Label>{tx("fieldAction")}</Label>
          <select value={messageAction} onChange={(event) => { setMessageAction(event.target.value); setEdits({}); }} className={field}>
            {(ACTIONS_BY_PRODUCT[product] || []).map((item) => <option key={item} value={item}>{keyedLabel("action", item)}</option>)}
          </select>
          <span className="mt-2 flex items-center gap-2 text-xs font-semibold text-zinc-600">
            <input type="checkbox" checked={onlySuggested} onChange={(event) => setOnlySuggested(event.target.checked)} className="accent-emerald-700" />
            {tx("onlySuggested")}
          </span>
        </label>
        <label>
          <Label>{tx("fieldName")}</Label>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className={field} placeholder={tx("namePlaceholder")} />
        </label>
      </div>

      <section className="mt-5 rounded-lg border border-zinc-200 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="sm:w-64">
            <Label>{tx("fieldLanguage")}</Label>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} className={field}>
              {CAMPAIGN_LOCALES.map((code) => (
                <option key={code} value={code}>{languageName(code, locale)}{edited.includes(code) ? " ✎" : ""}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setEdits((all) => ({ ...all, [language]: {} }))} disabled={!edited.includes(language)}
            className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-zinc-200 px-3 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 sm:self-auto">
            <RotateCcw size={14} />{tx("resetTemplate")}
          </button>
        </div>
        <div className="mt-3 grid gap-3" dir={["ar", "ur"].includes(language) ? "rtl" : "ltr"}>
          <label>
            <Label hint={`${current.title.length}/${MESSAGE_LIMITS.title}`}>{tx("fieldTitle")}</Label>
            <input value={edits[language]?.title ?? current.title} onChange={(event) => edit("title", event.target.value)} maxLength={MESSAGE_LIMITS.title} className={field} />
          </label>
          <label>
            <Label hint={`${current.body.length}/${MESSAGE_LIMITS.pushBody}`}>{tx("fieldBody")}</Label>
            <textarea value={edits[language]?.body ?? current.body} onChange={(event) => edit("body", event.target.value)} maxLength={MESSAGE_LIMITS.body} rows={3}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-600" />
          </label>
          <label className="sm:w-72">
            <Label hint={`${current.cta.length}/${MESSAGE_LIMITS.cta}`}>{tx("fieldCta")}</Label>
            <input value={edits[language]?.cta ?? current.cta} onChange={(event) => edit("cta", event.target.value)} maxLength={MESSAGE_LIMITS.cta} className={field} />
          </label>
        </div>
        <p className="mt-2 text-xs font-semibold text-zinc-500">
          {tx("editedNote")}{template && current.body.length > MESSAGE_LIMITS.pushBody ? ` ${tx("pushCut")}` : ""}
        </p>
        <div className="mt-3 rounded-lg bg-zinc-950 p-3 text-white" dir={["ar", "ur"].includes(language) ? "rtl" : "ltr"}>
          <p className="text-[10px] font-black uppercase text-zinc-400">{tx("pushPreview")}</p>
          <p className="mt-1 text-sm font-black">{current.title}</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-300">{current.body.slice(0, MESSAGE_LIMITS.pushBody)}</p>
        </div>
      </section>

      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={check} disabled={preview.loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-black text-zinc-800 hover:bg-zinc-50 disabled:opacity-50">
            {preview.loading ? <LoaderCircle size={16} className="animate-spin" /> : <Users size={16} />}{tx("previewButton")}
          </button>
          {ready && !send.confirming ? (
            <button type="button" onClick={() => setSend((state) => ({ ...state, confirming: true, error: "" }))}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-black text-white hover:bg-emerald-800">
              <Send size={16} />{tx("sendButton", { count: formatCount(preview.data.targetEstimate, locale) })}
            </button>
          ) : null}
          {send.confirming ? (
            <>
              <button type="button" onClick={confirmSend} className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-black text-white hover:bg-red-800">
                <Check size={16} />{tx("confirmSend")}
              </button>
              <button type="button" onClick={() => setSend((state) => ({ ...state, confirming: false }))} className="h-10 rounded-lg px-3 text-sm font-black text-zinc-600 hover:bg-zinc-100">{tx("cancel")}</button>
            </>
          ) : null}
          {send.sending ? <span className="inline-flex items-center gap-2 text-sm font-bold text-zinc-600"><LoaderCircle size={16} className="animate-spin" />{tx("sending")}</span> : null}
        </div>
        {problems.length ? <p className="text-xs font-bold text-red-700">{tx("messageProblem", { languages: [...new Set(problems.map((item) => languageName(item.locale, locale)))].join(", ") })}</p> : null}
        {preview.error ? <ErrorNote message={preview.error} /> : null}
        {send.error ? <ErrorNote message={send.error} /> : null}
        {send.result ? (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
            {tx("sentResult", { target: formatCount(send.result.target, locale), holdout: formatCount(send.result.holdout, locale) })}
          </div>
        ) : null}
        {preview.data ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label={tx("previewMatching")} value={formatCount(preview.data.matching, locale)} />
            <Stat label={tx("previewSkipped")} value={formatCount(preview.data.recentlyContacted, locale)} tone="text-zinc-500" />
            <Stat label={tx("previewTarget")} value={formatCount(preview.data.targetEstimate, locale)} tone="text-emerald-700" />
            <Stat label={tx("previewHoldout")} value={formatCount(preview.data.holdoutEstimate, locale)} tone="text-sky-700" />
            <Stat label={tx("previewPush")} value={formatCount(preview.data.reachableByPush, locale)} />
            <Stat label={tx("previewLanguages")} value={(preview.data.languages || []).map((item) => `${item.locale.toUpperCase()} ${formatCount(item.users, locale)}`).join(" · ") || "—"} />
          </div>
        ) : null}
        {preview.data && preview.data.eligible > preview.data.cap ? <p className="text-xs font-bold text-red-700">{tx("previewTooMany")}</p> : null}
        {preview.data && !preview.data.eligible ? <p className="text-xs font-bold text-zinc-600">{tx("previewNobody")}</p> : null}
      </div>
    </Card>
  );
}

function ResultRow({ row, locale }) {
  const progress = campaignProgress(row);
  const max = Math.max(Number(row.targetRate) || 0, Number(row.holdoutRate) || 0, 0.01);
  const lift = row.liftPoints;
  return (
    <li className="rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-zinc-950">{row.name}</p>
          <p className="text-xs font-semibold text-zinc-500">
            {[productName(row.product), row.country || tx("allCountries"), row.action ? keyedLabel("action", row.action) : null, String(row.sentAt || "").slice(0, 10), row.createdBy ? tx("sentBy", { name: row.createdBy }) : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={`self-start rounded-full px-2.5 py-1 text-[11px] font-black ${progress.final ? "bg-zinc-900 text-white" : "bg-sky-50 text-sky-800 ring-1 ring-sky-200"}`}>
          {progress.final ? tx("final") : tx("measuring", { day: progress.day, days: progress.days })}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label={tx("colMessaged")} value={formatCount(row.target, locale)} />
        <Stat label={tx("colHeldBack")} value={formatCount(row.holdout, locale)} />
        <Stat label={tx("colDelivered")} value={formatCount(row.delivered, locale)} />
        <Stat label={tx("colPushed")} value={formatCount(row.pushed, locale)} />
        <Stat label={tx("colOpened")} value={formatCount(row.opened, locale)} />
        <Stat label={tx("colLiftPts")} value={lift === null || lift === undefined ? "—" : tx("liftPts", { value: lift > 0 ? `+${lift}` : String(lift) })}
          tone={lift > 0 ? "text-emerald-700" : lift < 0 ? "text-red-700" : "text-zinc-700"} />
      </div>
      <div className="mt-3 space-y-2">
        {[
          { key: "target", label: tx("colBackTarget"), rate: row.targetRate, n: row.targetRecovered, tone: "bg-emerald-600" },
          { key: "holdout", label: tx("colBackHoldout"), rate: row.holdoutRate, n: row.holdoutRecovered, tone: "bg-sky-500" },
        ].map((bar) => (
          <div key={bar.key}>
            <div className="flex items-baseline justify-between text-xs font-bold text-zinc-700">
              <span>{bar.label}</span>
              <span className="tabular-nums">{bar.rate === null || bar.rate === undefined ? "—" : `${formatPercent(bar.rate, locale)} · ${formatCount(bar.n, locale)}`}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div className={`h-full rounded-full ${bar.tone}`} style={{ width: `${Math.round(((Number(bar.rate) || 0) / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      {row.holdout > 0 && row.holdout < 30 ? <p className="mt-2 text-[11px] font-semibold text-zinc-500">{tx("smallHoldout")}</p> : null}
      {!row.holdout ? <p className="mt-2 text-[11px] font-semibold text-zinc-500">{tx("noHoldoutResult")}</p> : null}
    </li>
  );
}

// Phase 5: send a retention campaign and see whether it brought people back.
export default function ChurnCampaignsPanel({ access, country, product, locale }) {
  const [state, setState] = useState({ loading: true, rows: [], error: "" });

  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    getChurnCampaigns()
      .then((rows) => setState({ loading: false, rows: rows || [], error: "" }))
      .catch((error) => setState({ loading: false, rows: [], error: inlineErrorMessage(error, tx("loadError")) }));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      {access.canSendCampaigns && (access.campaignProducts || []).length ? (
        <SendForm access={access} country={country} product={product} locale={locale} onSent={load} />
      ) : (
        <Card><p className="flex items-center gap-2 text-sm font-semibold text-zinc-600"><Megaphone size={16} />{tx("noAccessSend")}</p></Card>
      )}
      <Card title={tx("resultsTitle")} note={tx("resultsNote", { days: 30 })}>
        {state.loading && !state.rows.length ? <Loading /> : null}
        {state.error ? <ErrorNote message={state.error} /> : null}
        {!state.loading && !state.rows.length && !state.error ? <p className="text-sm font-semibold text-zinc-500">{tx("resultsEmpty")}</p> : null}
        <ul className="space-y-3">{state.rows.map((row) => <ResultRow key={row.id} row={row} locale={locale} />)}</ul>
      </Card>
    </div>
  );
}
