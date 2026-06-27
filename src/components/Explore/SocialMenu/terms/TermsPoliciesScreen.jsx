import { useState } from "react";
import {
  HiOutlineArchiveBox,
  HiOutlineArrowLeft,
  HiOutlineBanknotes,
  HiOutlineCheckBadge,
  HiOutlineChevronRight,
  HiOutlineDocumentText,
  HiOutlineScale,
  HiOutlineShieldCheck,
  HiOutlineTruck,
  HiOutlineUserMinus,
} from "react-icons/hi2";

import { useBrowserBack } from "../../../../Backend/hooks/useBrowserBack";
import SocialScreenHeader from "../shared/SocialScreenHeader";

const policies = [
  {
    id: "terms",
    title: "Terms of Service",
    icon: HiOutlineScale,
    summary: "The basic rules for using KunThai and keeping your account in good standing.",
    updated: "May 9, 2026",
    overview: "These terms explain how you may use KunThai across Explore, Marketplace, Transport, and connected services. By using the app, you agree to use it honestly, lawfully, and respectfully.",
    sections: [
      {
        title: "Your account",
        text: "Keep your account information accurate, protect your login, and do not let another person misuse your account.",
      },
      {
        title: "Using KunThai",
        text: "You may post, message, buy, sell, book transport, and connect with others when you follow the rules that apply to each service.",
      },
      {
        title: "Restricted activity",
        text: "Do not impersonate others, run scams, attack the app, post illegal content, or use KunThai to harm people or businesses.",
      },
      {
        title: "Service changes",
        text: "Features may change over time as KunThai improves safety, reliability, payments, transport, and marketplace experiences.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    icon: HiOutlineShieldCheck,
    summary: "How KunThai handles account details, profile activity, messages, reports, and service data.",
    updated: "May 9, 2026",
    overview: "This policy explains the types of information KunThai uses to run your account, personalize features, protect users, and support services like Explore, Marketplace, and Transport.",
    sections: [
      {
        title: "Information you provide",
        text: "This includes profile details, posts, comments, messages, support requests, marketplace activity, transport bookings, and information you choose to add.",
      },
      {
        title: "How information is used",
        text: "KunThai uses information to show your profile, deliver posts, power notifications, support bookings and orders, prevent abuse, and improve reliability.",
      },
      {
        title: "Your controls",
        text: "Use Privacy and Settings to manage post audience, message permissions, mentions, content filters, notifications, and local cache.",
      },
      {
        title: "Safety and legal needs",
        text: "Reports, suspicious activity, and service records may be reviewed when needed to protect users, investigate abuse, or meet legal requirements.",
      },
    ],
  },
  {
    id: "community",
    title: "Community Guidelines",
    icon: HiOutlineUserMinus,
    summary: "The behavior expected from everyone using posts, comments, Swip, messages, and profiles.",
    updated: "May 9, 2026",
    overview: "KunThai should feel useful, respectful, and safe. These guidelines explain the kind of behavior that helps people connect without abuse, spam, or fear.",
    sections: [
      {
        title: "Respect people",
        text: "Do not harass, threaten, shame, exploit, or target people because of who they are or what they believe.",
      },
      {
        title: "Be genuine",
        text: "Use honest profile information, avoid fake engagement, and do not pretend to be a person, business, operator, or authority you are not.",
      },
      {
        title: "Keep content safe",
        text: "Do not share sexual exploitation, severe violence, hate, scams, dangerous instructions, or content that puts people at risk.",
      },
      {
        title: "Use reporting tools",
        text: "If you see abuse or unsafe behavior, report it from the relevant post, profile, message, marketplace item, or support screen.",
      },
    ],
  },
  {
    id: "content",
    title: "Content and Moderation",
    icon: HiOutlineDocumentText,
    summary: "How posts, comments, reports, review stages, and account actions may be handled.",
    updated: "May 9, 2026",
    overview: "KunThai may review content to reduce abuse, scams, illegal activity, and harmful behavior. Some checks happen before publishing, while others may happen after reports.",
    sections: [
      {
        title: "Before content appears",
        text: "Posts may pass through review stages such as preparing, scanning text, reviewing media, publishing, and syncing to the feed.",
      },
      {
        title: "After content is reported",
        text: "Reported content may be reviewed, limited, removed, or left in place depending on context and policy.",
      },
      {
        title: "Account actions",
        text: "Repeated or serious violations may lead to warnings, reduced reach, feature limits, suspension, or removal from certain services.",
      },
      {
        title: "Appeals and support",
        text: "If you believe a decision was wrong, use Help Center to send details so the issue can be reviewed.",
      },
    ],
  },
  {
    id: "marketplace",
    title: "Marketplace Policy",
    icon: HiOutlineBanknotes,
    summary: "Expectations for buyers, sellers, product listings, orders, delivery, and disputes.",
    updated: "May 9, 2026",
    overview: "Marketplace works best when listings are accurate, sellers communicate clearly, and buyers use checkout and support tools responsibly.",
    sections: [
      {
        title: "Seller responsibilities",
        text: "Sellers should list real products, show clear pricing, keep stock accurate, respond professionally, and fulfil confirmed orders.",
      },
      {
        title: "Buyer responsibilities",
        text: "Buyers should provide accurate delivery or pickup information, pay through supported flows, and avoid false claims or abusive messages.",
      },
      {
        title: "Restricted listings",
        text: "Illegal, unsafe, misleading, counterfeit, stolen, or heavily restricted products should not be listed.",
      },
      {
        title: "Disputes",
        text: "If something goes wrong, keep order details, messages, photos, and payment references so support can review the issue fairly.",
      },
    ],
  },
  {
    id: "transport",
    title: "Transport Policy",
    icon: HiOutlineTruck,
    summary: "Expectations for passengers, operators, fleet profiles, bookings, deliveries, and trip history.",
    updated: "May 9, 2026",
    overview: "Transport features connect passengers with operators and fleets. Accuracy, safety, and reliable communication are important for every ride, delivery, and booking.",
    sections: [
      {
        title: "Passenger responsibilities",
        text: "Passengers should enter accurate pickup, drop-off, package, and contact details, then use official booking and communication tools.",
      },
      {
        title: "Operator responsibilities",
        text: "Operators should keep fleet information accurate, accept only trips they can complete, and maintain professional service standards.",
      },
      {
        title: "Fleet and route history",
        text: "Trip, route, and delivery history may be used to support safety, service quality, account records, and customer support.",
      },
      {
        title: "Safety issues",
        text: "Report unsafe conduct, false fleet details, payment pressure, or delivery problems through Help Center as soon as possible.",
      },
    ],
  },
  {
    id: "data",
    title: "Data and Account Deletion",
    icon: HiOutlineArchiveBox,
    summary: "How to manage local cache, request account changes, and understand data retention.",
    updated: "May 9, 2026",
    overview: "You should be able to manage your account information and understand what happens when you clear local data or request account deletion.",
    sections: [
      {
        title: "Local cache",
        text: "Settings can clear local Explore data such as drafts, recent searches, and temporary screen state on your device.",
      },
      {
        title: "Account deletion",
        text: "When deletion is available, eligible personal data should be removed or anonymized after required checks are complete.",
      },
      {
        title: "Records that may remain",
        text: "Some records may need to remain for safety, fraud prevention, dispute handling, transaction records, or legal compliance.",
      },
      {
        title: "Getting help",
        text: "Use Help Center if you need support with account access, privacy controls, data requests, or account closure.",
      },
    ],
  },
  {
    id: "cookies",
    title: "Cookie Policy",
    icon: HiOutlineArchiveBox,
    summary: "How browser storage and similar tools support sessions, preferences, safety, and reliability.",
    updated: "May 9, 2026",
    overview: "KunThai may use cookies and local browser storage to keep you signed in, remember choices, protect services, and understand whether essential features are working.",
    sections: [
      { title: "Essential storage", text: "Some storage is needed for sign-in, security, navigation, and preferences that make the app function correctly." },
      { title: "Preference storage", text: "KunThai may remember choices such as feed, video, notification, and display preferences on your device." },
      { title: "Service measurement", text: "Limited reliability information may help identify broken screens, failed requests, and performance problems." },
      { title: "Your choices", text: "Browser controls can clear stored data, although doing so may sign you out or reset device preferences." },
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property Policy",
    icon: HiOutlineDocumentText,
    summary: "Respect for original work, brand identity, ownership claims, and content removal requests.",
    updated: "May 9, 2026",
    overview: "People should share work they created or have permission to use. KunThai may review clear reports involving copied media, misleading brand use, or other ownership concerns.",
    sections: [
      { title: "Share responsibly", text: "Only upload content, product media, names, and designs you created or are allowed to use." },
      { title: "Ownership reports", text: "A report should identify the protected work, the KunThai content involved, and why the reporter is authorized to act." },
      { title: "Fair review", text: "KunThai may request more information before limiting or removing disputed content." },
      { title: "Repeated misuse", text: "Repeated serious ownership violations may lead to content or account restrictions." },
    ],
  },
  {
    id: "open-source",
    title: "Open Source Licenses",
    icon: HiOutlineCheckBadge,
    summary: "Notices for open source software that helps power the KunThai experience.",
    updated: "May 9, 2026",
    overview: "KunThai is built with open source software from many contributors. Their license notices and attribution requirements remain important parts of the product.",
    sections: [
      { title: "Third-party software", text: "The app uses libraries and tools that are licensed separately from KunThai product content." },
      { title: "License notices", text: "Required notices should be made available with release information as the production license inventory is finalized." },
      { title: "No ownership transfer", text: "Using KunThai does not change the ownership or license terms of included open source projects." },
      { title: "Corrections", text: "License or attribution questions can be sent through Help Center for review." },
    ],
  },
  {
    id: "kunthai-money",
    title: "KunThai Money Policy",
    icon: HiOutlineBanknotes,
    summary: "Account, transfer, payment, fraud-prevention, and transaction-record expectations.",
    updated: "May 9, 2026",
    overview: "KunThai Money features should make payment actions clear and traceable. Availability, limits, and verification requirements may differ by service and country.",
    sections: [
      { title: "Confirm before paying", text: "Review the recipient, amount, reason, and funding method before approving a payment or transfer." },
      { title: "Protect access", text: "Never share passwords, one-time codes, or account-recovery details with another person." },
      { title: "Transaction records", text: "References and status records may be retained for account support, disputes, fraud prevention, and legal requirements." },
      { title: "Report concerns", text: "Use Help Center promptly when a payment looks unfamiliar, delayed, duplicated, or connected to suspected fraud." },
    ],
  },
];

const policyOrder = [
  "community",
  "terms",
  "privacy",
  "cookies",
  "intellectual-property",
  "open-source",
  "marketplace",
  "transport",
  "kunthai-money",
  "content",
  "data",
];
const orderedPolicies = policyOrder.map((id) => policies.find((policy) => policy.id === id)).filter(Boolean);

function PolicyCard({ policy, onClick }) {
  const Icon = policy.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          <Icon className="text-2xl" />
        </span>
        <HiOutlineChevronRight className="mt-2 text-xl text-slate-400 transition group-hover:translate-x-1 group-hover:text-sky-700" />
      </div>
      <p className="mt-4 text-lg font-black text-slate-950">{policy.title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{policy.summary}</p>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Updated {policy.updated}</p>
    </button>
  );
}

function PolicyDetail({ policy, onBack }) {
  const Icon = policy.icon;

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm"
      >
        <HiOutlineArrowLeft className="text-xl" />
        Back to policies
      </button>

      <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
            <Icon className="text-3xl" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Terms & Policies</p>
            <h3 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">{policy.title}</h3>
            <p className="mt-3 max-w-4xl text-base font-semibold leading-7 text-slate-600">{policy.overview}</p>
            <p className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">Last updated {policy.updated}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {policy.sections.map((section) => (
            <section key={section.title} className="rounded-[22px] bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <HiOutlineCheckBadge className="mt-0.5 shrink-0 text-2xl text-sky-700" />
                <div>
                  <h4 className="text-base font-black text-slate-950">{section.title}</h4>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{section.text}</p>
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-6 rounded-[22px] border border-slate-200 p-4">
          <p className="text-sm font-black text-slate-950">Questions about this policy?</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
            Visit Help Center to report a problem, ask for support, or get guidance about your account.
          </p>
        </div>
      </article>
    </div>
  );
}

export default function TermsPoliciesScreen({ hideHeader = false }) {
  const [activeId, setActiveId] = useState("");
  const activePolicy = policies.find((policy) => policy.id === activeId) || null;

  useBrowserBack(Boolean(activePolicy), () => setActiveId(""), `terms-policy-${activeId || "list"}`);

  if (activePolicy) {
    return (
      <div>
        {!hideHeader ? <SocialScreenHeader title={activePolicy.title} subtitle={activePolicy.summary} /> : null}
        <PolicyDetail policy={activePolicy} onBack={() => setActiveId("")} />
      </div>
    );
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Terms & Policies" subtitle="Understand your rights, responsibilities, and safety rules." /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Legal & Trust</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">Know the rules before you use each service</h3>
          <p className="mt-2 max-w-4xl text-base font-semibold leading-7 text-slate-600">
            Review the policies that apply to your account, posts, messages, purchases, bookings, safety reports, and data choices.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700">Current policy center</span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">Last updated May 9, 2026</span>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orderedPolicies.map((policy) => (
            <PolicyCard key={policy.id} policy={policy} onClick={() => setActiveId(policy.id)} />
          ))}
        </section>
      </div>
    </div>
  );
}
