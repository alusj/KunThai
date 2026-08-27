import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Eye,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Search,
  ShieldCheck,
  Store,
} from "lucide-react";

import { getAdminMarketplaceConversations, readAdminMarketplaceConversation } from "../adminService";
import { formatDateTime } from "../adminConfig";
import { friendlyErrorMessage } from "../../Backend/services/friendlyErrorService";

function Header() {
  return (
    <header className="mb-6">
      <p className="text-xs font-black uppercase text-emerald-700">Audited commerce safety</p>
      <h1 className="mt-1 text-2xl font-black text-zinc-950 sm:text-3xl">UrMall message supervision</h1>
      <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-zinc-600">Review buyer and seller conversations only when required for safety, fraud prevention, support, or dispute resolution. Message content is never exposed in the conversation list, and every opened thread creates an immutable access record.</p>
    </header>
  );
}

function AccessForm({ conversation, onCancel, onSubmit, busy }) {
  const [reason, setReason] = useState("");
  const [caseId, setCaseId] = useState("");
  const valid = reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" aria-label="Close access request" className="absolute inset-0 bg-zinc-950/60" onClick={onCancel} />
      <form onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit({ reason: reason.trim(), caseId: caseId.trim() }); }} className="relative w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><LockKeyhole size={21} /></span>
          <div><p className="text-xs font-black uppercase text-amber-700">Controlled access</p><h2 className="mt-1 text-xl font-black text-zinc-950">Open supervised conversation</h2><p className="mt-1 text-sm font-semibold text-zinc-500">{conversation.buyer_name} and {conversation.business_name}</p></div>
        </div>
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">Only open this conversation for legitimate KunThai work. Your identity, reason, optional case reference, time, and number of messages accessed will be recorded.</div>
        <label className="mt-4 block"><span className="mb-1.5 block text-sm font-black text-zinc-800">Access reason</span><textarea autoFocus required minLength={10} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Example: Investigating buyer dispute reported in support case" className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm font-medium outline-none focus:border-emerald-600" /></label>
        <label className="mt-4 block"><span className="mb-1.5 block text-sm font-black text-zinc-800">UrMall case ID <span className="font-semibold text-zinc-400">(optional)</span></span><input value={caseId} onChange={(event) => setCaseId(event.target.value)} placeholder="UUID from an existing UrMall case" className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm font-medium outline-none focus:border-emerald-600" /></label>
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCancel} className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-700">Cancel</button><button type="submit" disabled={!valid || busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Eye size={16} />} Open and audit</button></div>
      </form>
    </div>
  );
}

function ConversationViewer({ conversation, messages, onBack, reason }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-zinc-200 p-4">
        <button type="button" onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50" aria-label="Back to conversations"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase text-emerald-700">Read-only supervised view</p><h2 className="mt-1 truncate text-lg font-black text-zinc-950">{conversation.buyer_name} ↔ {conversation.business_name}</h2><p className="mt-1 text-xs font-semibold text-zinc-500">{conversation.topic} · {messages.length} messages</p></div>
      </header>
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900"><span className="font-black">Access logged:</span> {reason}. This workspace is read-only; administrators cannot join or alter the conversation.</div>
      <div className="max-h-[65vh] space-y-3 overflow-y-auto bg-zinc-50 p-4 sm:p-6">
        {messages.map((message) => {
          const seller = message.sender_role === "seller";
          return (
            <article key={message.id} className={`max-w-[88%] rounded-2xl border p-3 shadow-sm ${seller ? "ml-auto border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-3"><span className={`text-[10px] font-black uppercase tracking-wide ${seller ? "text-emerald-700" : "text-sky-700"}`}>{seller ? message.business_name : message.buyer_name}</span><time className="text-[10px] font-bold text-zinc-400">{formatDateTime(message.created_at)}</time></div>
              {message.media_type === "image" && message.media_url ? <a href={message.media_url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"><img src={message.media_url} alt="UrMall message attachment" className="max-h-64 w-full object-contain" /></a> : null}
              {message.body ? <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-zinc-700">{message.body}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-zinc-400">{message.product_name ? <span>{message.product_name}</span> : null}{message.support_dispute ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Dispute-related</span> : null}{message.media_type === "image" ? <span className="inline-flex items-center gap-1"><ImageIcon size={11} /> Attachment</span> : null}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function UrMallMessageSupervisionView() {
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessTarget, setAccessTarget] = useState(null);
  const [accessBusy, setAccessBusy] = useState(false);
  const [opened, setOpened] = useState(null);

  async function load(query = "") {
    setLoading(true);
    setError("");
    try { setConversations(await getAdminMarketplaceConversations(query, 150)); }
    catch (nextError) { setError(friendlyErrorMessage(nextError, "Unable to load supervised UrMall conversations.")); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => ({
    conversations: conversations.length,
    disputes: conversations.filter((item) => item.support_dispute).length,
    messages: conversations.reduce((sum, item) => sum + Number(item.message_count || 0), 0),
  }), [conversations]);

  async function openConversation(access) {
    setAccessBusy(true);
    setError("");
    try {
      const messages = await readAdminMarketplaceConversation({
        businessId: accessTarget.business_id,
        buyerId: accessTarget.buyer_id,
        reason: access.reason,
        caseId: access.caseId || null,
      });
      setOpened({ conversation: accessTarget, messages, reason: access.reason });
      setAccessTarget(null);
    } catch (nextError) {
      setError(friendlyErrorMessage(nextError, "Unable to open this supervised UrMall conversation."));
    } finally { setAccessBusy(false); }
  }

  if (opened) return <><Header /><ConversationViewer {...opened} onBack={() => setOpened(null)} /></>;

  return (
    <>
      <Header />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4"><MessageSquareText className="text-zinc-400" size={19} /><p className="mt-3 text-3xl font-black text-zinc-950">{summary.conversations}</p><p className="mt-1 text-xs font-black uppercase text-zinc-500">Conversation groups</p></div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4"><ShieldCheck className="text-rose-600" size={19} /><p className="mt-3 text-3xl font-black text-rose-950">{summary.disputes}</p><p className="mt-1 text-xs font-black uppercase text-rose-700">Dispute-related</p></div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><Store className="text-emerald-600" size={19} /><p className="mt-3 text-3xl font-black text-emerald-950">{summary.messages}</p><p className="mt-1 text-xs font-black uppercase text-emerald-700">Messages represented</p></div>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); load(search); }} className="mb-4 flex gap-2 rounded-lg border border-zinc-200 bg-white p-3">
        <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search buyer, seller, topic, or buyer user ID" className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white" /></label>
        <button type="submit" disabled={loading} className="h-10 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white disabled:opacity-50">Search</button>
      </form>

      {error ? <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {loading ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin text-emerald-700" size={24} /></div> : null}
      {!loading && !conversations.length ? <div className="rounded-lg border border-zinc-200 bg-white p-10 text-center"><MessageSquareText className="mx-auto text-zinc-300" size={30} /><p className="mt-3 text-sm font-black text-zinc-900">No matching UrMall conversations</p></div> : null}

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {conversations.map((conversation) => (
          <article key={`${conversation.business_id}:${conversation.buyer_id}`} className="grid gap-3 border-b border-zinc-100 p-4 last:border-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0"><p className="truncate text-sm font-black text-zinc-950">{conversation.buyer_name}</p><p className="mt-1 truncate text-xs font-semibold text-zinc-500">Buyer ID {conversation.buyer_id}</p></div>
            <div className="min-w-0"><p className="truncate text-sm font-black text-emerald-800">{conversation.business_name}</p><p className="mt-1 truncate text-xs font-semibold text-zinc-500">{conversation.topic} · {conversation.message_count} messages · {formatDateTime(conversation.last_message_at)}</p></div>
            <button type="button" onClick={() => setAccessTarget(conversation)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 text-xs font-black text-zinc-700 hover:bg-zinc-50"><Eye size={15} /> Request access</button>
          </article>
        ))}
      </section>

      {accessTarget ? <AccessForm conversation={accessTarget} busy={accessBusy} onCancel={() => setAccessTarget(null)} onSubmit={openConversation} /> : null}
    </>
  );
}
