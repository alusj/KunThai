import { useMemo, useState } from "react";
import {
  HiOutlineBolt,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentCheck,
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
    title: "Account and profile",
    icon: HiOutlineUserCircle,
    summary: "Profile display, saved account data, switching accounts, and profile visibility.",
    bullets: ["Update your public Explore identity from Profile.", "Use Privacy to control who can message or mention you.", "Saved backend profile data should appear before fallback names."],
  },
  {
    id: "posts-swip",
    title: "Posts, comments, and Swip",
    icon: HiOutlineBolt,
    summary: "Publishing flow, moderation checks, comments, video sound, and playback behavior.",
    bullets: ["Posts publish in the background after review stages.", "Comments open as a half-screen sheet and close when tapping outside.", "Only the active Swip video should play sound."],
  },
  {
    id: "messages",
    title: "Messages and voice notes",
    icon: HiOutlineChatBubbleLeftRight,
    summary: "Typing status, active status, read receipts, and recording voice notes.",
    bullets: ["Voice note recording should show a live timer.", "Typing, recording, and active status are controlled from Settings.", "Message badges should reflect unread or live activity."],
  },
  {
    id: "privacy-safety",
    title: "Privacy and safety",
    icon: HiOutlineShieldCheck,
    summary: "Blocking, reporting, content filters, mentions, and activity visibility.",
    bullets: ["Block or report from profile and post menus.", "Sensitive content filters reduce risky content surfaces.", "Privacy controls sync when backend tables are available."],
  },
  {
    id: "marketplace",
    title: "Marketplace",
    icon: HiOutlineShoppingBag,
    summary: "Buyer orders, seller messages, carts, product issues, and store trust.",
    bullets: ["Orders and buyer messages should use real account data.", "Use report a problem for payment, order, or listing issues.", "Seller dashboards should avoid placeholders once real data exists."],
  },
  {
    id: "transport",
    title: "Transport",
    icon: HiOutlineTruck,
    summary: "Passenger bookings, saved operators, fleet profiles, and operator history.",
    bullets: ["Passenger data should connect to real fleet/operator accounts.", "Saved operators and active rides should use live data.", "Operator history should show areas served and delivery records."],
  },
];

const quickActions = [
  { title: "Report unsafe content", description: "Use this for abuse, scams, impersonation, or policy violations.", priority: "high" },
  { title: "Account or profile issue", description: "Use this when saved profile data, username, or identity displays incorrectly.", priority: "normal" },
  { title: "Payment, order, or booking issue", description: "Use this for Marketplace checkout or Transport booking problems.", priority: "high" },
];

function TopicCard({ topic }) {
  const Icon = topic.icon;

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          <Icon className="text-2xl" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-black text-slate-950">{topic.title}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{topic.summary}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {topic.bullets.map((item) => (
          <p key={item} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold leading-6 text-slate-700">
            {item}
          </p>
        ))}
      </div>
    </article>
  );
}

export default function HelpCenterScreen({ hideHeader = false }) {
  const support = useSupportCenter();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    category: "Explore",
    subject: "",
    message: "",
    priority: "normal",
  });

  const visibleTopics = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return helpTopics;

    return helpTopics.filter((topic) =>
      [topic.title, topic.summary, ...topic.bullets].join(" ").toLowerCase().includes(value),
    );
  }, [query]);

  async function submitTicket(event) {
    event.preventDefault();
    const created = await support.submitTicket(form);
    if (created) {
      setForm((current) => ({ ...current, subject: "", message: "" }));
    }
  }

  function applyQuickAction(action) {
    setForm((current) => ({
      ...current,
      priority: action.priority,
      subject: action.title,
      message: action.description,
    }));
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Help Center" subtitle="Guides, reports, support requests, and safety help." /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">KunThai Support</p>
              <h3 className="mt-2 text-2xl font-black text-slate-950">Find help without leaving Explore</h3>
              <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
                Search product guidance, report issues, and keep a simple support trail for Explore, Marketplace, and Transport.
              </p>
            </div>
            <div className="rounded-[24px] bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-950">{support.openCount} open support request{support.openCount === 1 ? "" : "s"}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Your recent support requests will appear here so you can keep track of them.</p>
            </div>
          </div>

          <label className="mt-5 flex h-14 items-center gap-3 rounded-[22px] bg-slate-100 px-4">
            <HiOutlineMagnifyingGlass className="text-xl text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search profile, Swip, privacy, marketplace, transport..."
              className="h-14 min-w-0 flex-1 bg-transparent text-base font-bold text-slate-800 outline-none placeholder:text-slate-400"
            />
          </label>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          {quickActions.map((action) => (
            <button
              key={action.title}
              type="button"
              onClick={() => applyQuickAction(action)}
              className="rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
            >
              <HiOutlineMegaphone className="text-2xl text-sky-700" />
              <p className="mt-3 text-base font-black text-slate-950">{action.title}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{action.description}</p>
            </button>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleTopics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>

          <aside className="space-y-4">
            <form onSubmit={submitTicket} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                  <HiOutlineLifebuoy className="text-2xl" />
                </span>
                <div>
                  <p className="text-lg font-black text-slate-950">Report a problem</p>
                  <p className="text-sm font-semibold text-slate-500">Send enough detail for support to understand the issue.</p>
                </div>
              </div>

              {support.feedback ? <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-black text-sky-700">{support.feedback}</p> : null}

              <div className="mt-4 grid gap-3">
                <select
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  className="h-12 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none"
                >
                  <option>Explore</option>
                  <option>Profile</option>
                  <option>Messages</option>
                  <option>Privacy & Safety</option>
                  <option>Marketplace</option>
                  <option>Transport</option>
                  <option>Payments</option>
                </select>
                <input
                  value={form.subject}
                  onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="Subject"
                  className="h-12 rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-800 outline-none"
                />
                <textarea
                  value={form.message}
                  onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                  placeholder="Describe what happened, what screen you were on, and what you expected."
                  rows={5}
                  className="resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-800 outline-none"
                />
                <select
                  value={form.priority}
                  onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                  className="h-12 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none"
                >
                  <option value="normal">Normal priority</option>
                  <option value="high">High priority</option>
                  <option value="urgent">Urgent safety issue</option>
                </select>
                <button
                  type="submit"
                  disabled={support.submitting}
                  className="h-12 rounded-2xl bg-sky-700 text-sm font-black text-white transition hover:bg-sky-800 disabled:opacity-60"
                >
                  {support.submitting ? "Submitting..." : "Submit support request"}
                </button>
              </div>
            </form>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <HiOutlineClipboardDocumentCheck className="text-2xl text-sky-700" />
                <h3 className="text-lg font-black text-slate-950">Recent requests</h3>
              </div>
              {!support.tickets.length ? (
                <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold leading-6 text-slate-500">No support requests yet.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {support.tickets.slice(0, 5).map((ticket) => (
                    <article key={ticket.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-black text-slate-950">{ticket.subject}</p>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black capitalize text-sky-700">{ticket.status}</span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-500">{ticket.category} • {ticket.priority}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}
