import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiOutlineBolt,
  HiOutlineBugAnt,
  HiOutlineCamera,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentCheck,
  HiOutlineCreditCard,
  HiOutlineLifebuoy,
  HiOutlineMagnifyingGlass,
  HiOutlineMegaphone,
  HiOutlineShieldCheck,
  HiOutlineShoppingBag,
  HiOutlineTruck,
  HiOutlineUserCircle,
} from "react-icons/hi2";

import { useSupportCenter } from "../../../../Backend/hooks/useSupportCenter";
import SocialScreenHeader from "../shared/SocialScreenHeader";

const helpTopics = [
  {
    id: "account-profile",
    group: "popular",
    title: "Account and profile",
    icon: HiOutlineUserCircle,
    summary: "Profile details, switching accounts, identity display, and account access.",
    bullets: ["Update your public identity from Profile.", "Use Security for account-protection guidance.", "Saved profile data should appear before fallback names."],
  },
  {
    id: "posts-swip",
    group: "popular",
    title: "Posts, comments, and Swip",
    icon: HiOutlineBolt,
    summary: "Publishing, review stages, comments, video sound, and playback behavior.",
    bullets: ["Posts may pass through review before publishing.", "Comments open from each post or video.", "Only the active Swip should continue playing."],
  },
  {
    id: "messages",
    group: "popular",
    title: "Messages and voice notes",
    icon: HiOutlineChatBubbleLeftRight,
    summary: "Message requests, read status, active status, and voice-note recording.",
    bullets: ["Voice notes show a live recording timer.", "Presence preferences live in Settings.", "Message badges reflect unread or live activity."],
  },
  {
    id: "privacy-safety",
    group: "service",
    title: "Safety help",
    icon: HiOutlineShieldCheck,
    summary: "Blocking, reporting, content filters, mentions, and activity visibility.",
    bullets: ["Block or report from relevant menus.", "Privacy Center keeps visibility controls together.", "Urgent danger should go to local emergency services."],
  },
  {
    id: "marketplace",
    group: "service",
    title: "Marketplace help",
    icon: HiOutlineShoppingBag,
    summary: "Orders, seller messages, listings, delivery, and store trust.",
    bullets: ["Keep order and seller-message records.", "Report payment or listing concerns with details.", "Use supported checkout and dispute paths."],
  },
  {
    id: "transport",
    group: "service",
    title: "Transport help",
    icon: HiOutlineTruck,
    summary: "Bookings, saved operators, fleet profiles, trips, and deliveries.",
    bullets: ["Confirm operator and fleet details.", "Keep booking and route information available.", "Report unsafe conduct as soon as practical."],
  },
  {
    id: "payments",
    group: "service",
    title: "Payments help",
    icon: HiOutlineCreditCard,
    summary: "Payment status, transaction references, charges, and account safety.",
    bullets: ["Keep transaction references for support.", "Confirm recipient and amount before approval.", "Never share passwords or verification codes."],
  },
];

const quickActions = [
  { title: "Report unsafe content", description: "Abuse, scams, impersonation, threats, or serious policy concerns.", priority: "urgent", category: "Privacy & Safety" },
  { title: "Account or profile issue", description: "Incorrect saved details, username, identity display, or account access.", priority: "normal", category: "Profile" },
  { title: "Payment, order, or booking issue", description: "Marketplace checkout, payments, delivery, or Transport bookings.", priority: "high", category: "Payments" },
];

function TopicCard({ topic }) {
  const Icon = topic.icon;
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><Icon className="text-2xl" /></span>
        <div className="min-w-0"><h3 className="text-base font-black text-slate-950">{topic.title}</h3><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{topic.summary}</p></div>
      </div>
      <div className="mt-4 space-y-2">
        {topic.bullets.map((item) => <p key={item} className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs font-bold leading-5 text-slate-600">{item}</p>)}
      </div>
    </article>
  );
}

export default function HelpCenterScreen({ focusReport = false, hideHeader = false, onOpenYourVoice }) {
  const support = useSupportCenter();
  const reportFormRef = useRef(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ category: "Explore", subject: "", message: "", priority: "normal" });

  const visibleTopics = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return helpTopics;
    return helpTopics.filter((topic) => [topic.title, topic.summary, ...topic.bullets].join(" ").toLowerCase().includes(value));
  }, [query]);
  const popularTopics = helpTopics.filter((topic) => topic.group === "popular");
  const serviceTopics = helpTopics.filter((topic) => topic.group === "service");

  useEffect(() => {
    if (!focusReport) return undefined;
    const frame = window.requestAnimationFrame(() => reportFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusReport]);

  async function submitTicket(event) {
    event.preventDefault();
    const created = await support.submitTicket(form);
    if (created) setForm((current) => ({ ...current, subject: "", message: "" }));
  }

  function applyQuickAction(action) {
    setForm((current) => ({ ...current, category: action.category, priority: action.priority, subject: action.title, message: action.description }));
    reportFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Help Center" subtitle="Search guidance, report problems, and track recent requests." /> : null}

      <div className="w-full space-y-7 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Search help</p>
              <h3 className="mt-2 text-2xl font-black text-slate-950">Find the right next step</h3>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Search guidance across Explore, Marketplace, Transport, Payments, privacy, and account support.</p>
            </div>
            <div className="rounded-[22px] bg-slate-50 p-4"><p className="text-sm font-black text-slate-950">{support.openCount} open request{support.openCount === 1 ? "" : "s"}</p><p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Recent requests remain visible below for easy follow-up.</p></div>
          </div>
          <label className="mt-5 flex h-14 items-center gap-3 rounded-[22px] bg-slate-100 px-4">
            <HiOutlineMagnifyingGlass className="text-xl text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts, Swip, safety, marketplace, transport, payments..." className="h-14 min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400 sm:text-base" />
          </label>
        </section>

        {onOpenYourVoice ? (
          <section className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onOpenYourVoice({ feedbackType: "bug", category: "explore", currentScreen: "Explore / Help Center", requestScreenshot: true })}
              className="flex items-center gap-3 rounded-[22px] border border-sky-200 bg-white p-4 text-left shadow-sm transition hover:bg-sky-50"
            >
              <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineCamera className="text-xl" /></span>
              <span><span className="block text-sm font-black text-slate-950">Attach screenshot</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">Open Your Voice and choose an image from this device.</span></span>
            </button>
            <button
              type="button"
              onClick={() => onOpenYourVoice({ feedbackType: "bug", category: "explore", title: "Feedback about Help Center", currentScreen: "Explore / Help Center" })}
              className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
            >
              <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-slate-100 text-slate-700"><HiOutlineBugAnt className="text-xl" /></span>
              <span><span className="block text-sm font-black text-slate-950">Report this screen</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">Send private feedback with this screen already identified.</span></span>
            </button>
          </section>
        ) : null}

        {query.trim() ? (
          <section>
            <SectionHeading title="Search results" description={`Topics matching “${query.trim()}”.`} />
            {visibleTopics.length ? <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{visibleTopics.map((topic) => <TopicCard key={topic.id} topic={topic} />)}</div> : <p className="rounded-[24px] border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500 shadow-sm">No help topic matched. You can still report the problem below.</p>}
          </section>
        ) : (
          <>
            <section><SectionHeading title="Popular topics" description="Common questions about accounts, content, and conversations." /><div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{popularTopics.map((topic) => <TopicCard key={topic.id} topic={topic} />)}</div></section>
            <section><SectionHeading title="Help by service" description="Safety, Marketplace, Transport, and Payments guidance." /><div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">{serviceTopics.map((topic) => <TopicCard key={topic.id} topic={topic} />)}</div></section>
          </>
        )}

        <section ref={reportFormRef} className="scroll-mt-28">
          <SectionHeading title="Report a problem" description="Start with a common issue or describe what happened in your own words." />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {quickActions.map((action) => (
                  <button key={action.title} type="button" onClick={() => applyQuickAction(action)} className="rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50">
                    <HiOutlineMegaphone className="text-2xl text-sky-700" /><p className="mt-3 text-sm font-black text-slate-950">{action.title}</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{action.description}</p>
                  </button>
                ))}
              </div>

              <form onSubmit={submitTicket} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineLifebuoy className="text-2xl" /></span><div><p className="text-lg font-black text-slate-950">Support request</p><p className="text-sm font-semibold text-slate-500">Share enough detail for a useful review.</p></div></div>
                {support.feedback ? <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-black text-sky-700">{support.feedback}</p> : null}
                <div className="mt-4 grid gap-3">
                  <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="h-12 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none">
                    <option>Explore</option><option>Profile</option><option>Messages</option><option>Privacy & Safety</option><option>Marketplace</option><option>Transport</option><option>Payments</option>
                  </select>
                  <input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Subject" className="h-12 rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-800 outline-none" />
                  <textarea value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="Describe what happened, the screen you were on, and what you expected." rows={5} className="resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-800 outline-none" />
                  <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className="h-12 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none"><option value="normal">Normal priority</option><option value="high">High priority</option><option value="urgent">Urgent safety issue</option></select>
                  <button type="submit" disabled={support.submitting} className="h-12 rounded-2xl bg-sky-700 text-sm font-black text-white transition hover:bg-sky-800 disabled:opacity-60">{support.submitting ? "Submitting..." : "Submit support request"}</button>
                </div>
              </form>
            </div>

            <section className="h-fit rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><HiOutlineClipboardDocumentCheck className="text-2xl text-sky-700" /><h3 className="text-lg font-black text-slate-950">Recent requests</h3></div>
              {!support.tickets.length ? <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold leading-6 text-slate-500">No support requests yet.</p> : (
                <div className="mt-4 space-y-2">{support.tickets.slice(0, 5).map((ticket) => <article key={ticket.id} className="rounded-2xl bg-slate-50 px-4 py-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-black text-slate-950">{ticket.subject}</p><span className="rounded-full bg-white px-2.5 py-1 text-xs font-black capitalize text-sky-700">{ticket.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs font-bold text-slate-500">{ticket.category} • {ticket.priority}</p>{ticket.adminReply ? <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-900"><span className="block text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">KunThai reply</span>{ticket.adminReply}</p> : null}</article>)}</div>
              )}
            </section>
          </div>
        </section>

        {/* Future backend: attach diagnostics and secure files only with explicit user consent. */}
      </div>
    </div>
  );
}

function SectionHeading({ description, title }) {
  return <div className="mb-3 px-1"><p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{title}</p><p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p></div>;
}
