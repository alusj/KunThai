import { useEffect } from "react";
import {
  HiOutlineArrowTopRightOnSquare,
  HiOutlineBuildingStorefront,
  HiOutlineChevronRight,
  HiOutlineCreditCard,
  HiOutlineEnvelope,
  HiOutlineExclamationTriangle,
  HiOutlineLockClosed,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
  HiOutlineTruck,
  HiOutlineUserCircle,
  HiOutlineWrenchScrewdriver,
} from "react-icons/hi2";

import { isResolvedLegalValue, legalConfig } from "../../config/legalConfig";

// Public, sign-in-free support page (App Store Connect "Support URL").
// Detailed requests stay in the app: Explore → Social Menu → Report a Problem.
// Every link below points at an existing public route (/privacy, /terms,
// /policy-center/<slug>); slugs come from data/policies/policyDocuments.js.

const SUPPORT_CATEGORIES = [
  {
    id: "account",
    title: "Account & Login",
    icon: HiOutlineUserCircle,
    body: "Signing in, verification codes, two-step verification, switching accounts, and account access.",
    links: [
      { label: "Account suspension", href: "/policy-center/account-suspension" },
      { label: "Account deletion", href: "/policy-center/account-deletion" },
    ],
  },
  {
    id: "explore",
    title: "Explore / UrFeed / Swip",
    icon: HiOutlineSparkles,
    body: "Posts, Swip videos, comments, voice notes, messages, Spaces, and your social profile.",
    links: [
      { label: "Explore policy", href: "/policy-center/explore" },
      { label: "Community standards", href: "/policy-center/community-standards" },
    ],
  },
  {
    id: "urmall",
    title: "UrMall",
    icon: HiOutlineBuildingStorefront,
    body: "Shopping, orders, sellers and stores, product listings, deliveries, and business accounts.",
    links: [
      { label: "UrMall marketplace", href: "/policy-center/urmall" },
      { label: "Seller standards", href: "/policy-center/seller-standards" },
    ],
  },
  {
    id: "urride",
    title: "UrRide",
    icon: HiOutlineTruck,
    body: "Booking trips, drivers and fleets, live trip tracking, transport companies, and lost property.",
    links: [
      { label: "Transport terms", href: "/policy-center/transport" },
      { label: "Passenger safety", href: "/policy-center/passenger-safety" },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    icon: HiOutlineCreditCard,
    body: "Card payments, Visibility Credits, business plans, promotions, refunds, and disputes.",
    links: [
      { label: "Payments notice", href: "/policy-center/payments" },
      { label: "Refunds & disputes", href: "/policy-center/refunds-disputes" },
    ],
  },
  {
    id: "safety",
    title: "Safety & Reporting",
    icon: HiOutlineShieldCheck,
    body: "Reporting people or content, blocking, harassment, scams, appeals, and child safety.",
    links: [
      { label: "Safety Center", href: "/policy-center/safety-center" },
      { label: "Reporting & appeals", href: "/policy-center/reporting-appeals" },
    ],
  },
  {
    id: "privacy",
    title: "Privacy & Account Controls",
    icon: HiOutlineLockClosed,
    body: "Your data, downloads of your information, location sharing, permissions, and deleting your account.",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Delete your account", href: "/policy-center/account-deletion" },
    ],
  },
  {
    id: "technical",
    title: "Technical Issues",
    icon: HiOutlineWrenchScrewdriver,
    body: "App not loading, uploads failing, notifications, camera or microphone access, and connection problems.",
    tips: [
      "Update KunThai to the latest version.",
      "Check your internet connection and try again.",
      "Allow camera, microphone, or location access in your device settings when a feature needs it.",
    ],
  },
];

const REPORT_STEPS = ["Explore", "Social Menu", "Report a Problem"];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Safety Center", href: "/policy-center/safety-center" },
  { label: "Community Standards", href: "/policy-center/community-standards" },
  { label: "Policy Center", href: "/policy-center" },
];

export default function PublicSupportPage() {
  const supportEmail = isResolvedLegalValue(legalConfig.supportEmail) ? legalConfig.supportEmail : "";

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "KunThai Support";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="text-lg font-black tracking-tight text-slate-950">
            KunThai
          </a>
          <a
            href="/"
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800"
          >
            Open KunThai
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 px-5 py-8 text-white shadow-lg sm:px-10 sm:py-12">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">KunThai Support</p>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Get help with KunThai</h1>
          <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-slate-300">
            Find help with your KunThai account and services, report problems, and access safety and policy information.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="#report-a-problem"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-sky-400 px-5 text-sm font-black text-slate-950 transition hover:bg-sky-300"
            >
              Report a Problem
            </a>
            {supportEmail ? (
              <a
                href={`mailto:${supportEmail}`}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 text-sm font-black text-white transition hover:bg-white/20"
              >
                <HiOutlineEnvelope className="text-lg" />
                {supportEmail}
              </a>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="support-topics" className="mt-10">
          <h2 id="support-topics" className="text-xl font-black text-slate-950">
            Support topics
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">Choose the area you need help with.</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SUPPORT_CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <article key={category.id} id={category.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-xl text-sky-700">
                    <Icon />
                  </span>
                  <h3 className="mt-4 text-base font-black text-slate-950">{category.title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{category.body}</p>

                  {category.tips ? (
                    <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-600">
                      {category.tips.map((tip) => (
                        <li key={tip} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-500" />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {category.links ? (
                    <div className="mt-auto flex flex-col gap-1 pt-4">
                      {category.links.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          className="inline-flex items-center gap-1 text-sm font-black text-sky-700 hover:text-sky-900"
                        >
                          {link.label}
                          <HiOutlineChevronRight className="text-xs" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section id="report-a-problem" aria-labelledby="report-heading" className="mt-10 scroll-mt-24 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">In the app</p>
              <h2 id="report-heading" className="mt-2 text-2xl font-black text-slate-950">
                Report a Problem
              </h2>
              <p className="mt-3 text-base font-semibold leading-7 text-slate-600">
                Signed-in KunThai users can send a detailed support request from inside the app. Choose the KunThai service,
                add a subject, describe what happened, set the priority, and submit. You can follow your recent requests on the
                same screen.
              </p>

              <ol className="mt-5 flex flex-wrap items-center gap-2" aria-label="Where to find Report a Problem">
                {REPORT_STEPS.map((step, index) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-black text-slate-800">{step}</span>
                    {index < REPORT_STEPS.length - 1 ? <HiOutlineChevronRight className="text-slate-400" aria-hidden="true" /> : null}
                  </li>
                ))}
              </ol>

              <a
                href="/"
                className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
              >
                Open KunThai
                <HiOutlineArrowTopRightOnSquare className="text-base" />
              </a>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl bg-slate-50 p-5">
                <h3 className="text-sm font-black text-slate-950">Include in your report</h3>
                <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-600">
                  <li>The screen or service you were using</li>
                  <li>What you expected and what happened instead</li>
                  <li>Order, trip, message, or payment references, if any</li>
                  <li>Your device and app version</li>
                </ul>
              </div>

              {supportEmail ? (
                <div className="rounded-3xl bg-sky-50 p-5">
                  <h3 className="text-sm font-black text-slate-950">Can&apos;t sign in?</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    If you can&apos;t reach Report a Problem, email us at{" "}
                    <a href={`mailto:${supportEmail}`} className="font-black text-sky-700 underline">
                      {supportEmail}
                    </a>
                    . Never share your password or verification codes.
                  </p>
                </div>
              ) : null}

              <div className="flex gap-3 rounded-3xl bg-rose-50 p-5">
                <HiOutlineExclamationTriangle className="mt-0.5 flex-none text-lg text-rose-600" aria-hidden="true" />
                <p className="text-sm font-semibold leading-6 text-rose-900">
                  In an emergency, contact your local emergency services first.{" "}
                  <a href="/policy-center/emergency" className="font-black underline">
                    Emergency assistance
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="policy-heading" className="mt-10">
          <h2 id="policy-heading" className="text-xl font-black text-slate-950">
            Safety & policies
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {LEGAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm font-semibold text-slate-500 sm:px-6">
          <span>(c) {new Date().getFullYear()} KunThai</span>
          <span className="flex flex-wrap gap-4">
            <a href="/support" className="hover:text-slate-900">Support</a>
            <a href="/policy-center" className="hover:text-slate-900">Policy Center</a>
            <a href="/terms" className="hover:text-slate-900">Terms of Service</a>
            <a href="/privacy" className="hover:text-slate-900">Privacy Policy</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
