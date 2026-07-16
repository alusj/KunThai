import { useEffect, useMemo, useState } from "react";
import {
  HiOutlineAcademicCap,
  HiOutlineBanknotes,
  HiOutlineBuildingStorefront,
  HiOutlineCalendarDays,
  HiOutlineChartBarSquare,
  HiOutlineCheckCircle,
  HiOutlineCreditCard,
  HiOutlineCurrencyDollar,
  HiOutlineLightBulb,
  HiOutlineMegaphone,
  HiOutlinePresentationChartLine,
  HiOutlineRocketLaunch,
  HiOutlineShieldCheck,
  HiOutlineUserGroup,
  HiOutlineVideoCamera,
} from "react-icons/hi2";

import { showToast } from "../../../../Backend/services/toastService";
import SocialScreenHeader from "../shared/SocialScreenHeader";

const FUTURE_INTEREST_KEY = "kunthai.explore.futureFeatureInterest";

const featureGroups = [
  {
    id: "creator",
    label: "Creator",
    title: "Creator growth",
    features: [
      {
        id: "monetization",
        title: "Monetization",
        status: "Planning",
        icon: HiOutlineCurrencyDollar,
        accent: "emerald",
        summary: "Earnings tools for eligible creators, Spaces, video posts, and high-trust communities.",
        details: ["Creator eligibility", "Payout readiness", "Revenue dashboard"],
      },
      {
        id: "go-live",
        title: "Go Live",
        status: "Research",
        icon: HiOutlineVideoCamera,
        accent: "rose",
        summary: "Live broadcasts for profiles and Spaces with comments, moderators, and replay controls.",
        details: ["Live chat", "Moderator tools", "Replay library"],
      },
      {
        id: "creator-studio",
        title: "Creator Studio",
        status: "Planned",
        icon: HiOutlinePresentationChartLine,
        accent: "sky",
        summary: "One workspace for drafts, post scheduling, Swip uploads, team review, and performance.",
        details: ["Draft calendar", "Content review", "Performance trends"],
      },
      {
        id: "subscriptions",
        title: "Subscriptions",
        status: "Later",
        icon: HiOutlineCreditCard,
        accent: "violet",
        summary: "Paid member communities for creators, educators, and organizations with controlled access.",
        details: ["Member tiers", "Private posts", "Recurring support"],
      },
    ],
  },
  {
    id: "business",
    label: "Business",
    title: "Business and Space tools",
    features: [
      {
        id: "ads-manager",
        title: "Ads Manager",
        status: "Planned",
        icon: HiOutlineMegaphone,
        accent: "amber",
        summary: "Campaign setup, audience controls, budget tracking, and clear ad performance reporting.",
        details: ["Boost posts", "Campaign budget", "Audience reports"],
      },
      {
        id: "space-verification",
        title: "Space Verification",
        status: "Planning",
        icon: HiOutlineShieldCheck,
        accent: "blue",
        summary: "Verification requests for businesses, NGOs, schools, media, clubs, and public organizations.",
        details: ["Document review", "Verified badge", "Trust records"],
      },
      {
        id: "live-shopping",
        title: "Live Shopping",
        status: "Research",
        icon: HiOutlineBuildingStorefront,
        accent: "teal",
        summary: "Connect live videos with UrMall products, reservations, order questions, and promotions.",
        details: ["Product pins", "Seller chat", "Order handoff"],
      },
      {
        id: "advanced-insights",
        title: "Advanced Insights",
        status: "Planned",
        icon: HiOutlineChartBarSquare,
        accent: "indigo",
        summary: "Deeper analytics for Spaces, creators, adverts, posts, Swip videos, and connections.",
        details: ["Growth reports", "Best posting times", "Audience breakdown"],
      },
    ],
  },
  {
    id: "community",
    label: "Community",
    title: "Community and trust",
    features: [
      {
        id: "events",
        title: "Events",
        status: "Planned",
        icon: HiOutlineCalendarDays,
        accent: "orange",
        summary: "Create events for Spaces, collect interest, share updates, and manage attendees.",
        details: ["Event pages", "RSVPs", "Organizer roles"],
      },
      {
        id: "academy",
        title: "KunThai Academy",
        status: "Later",
        icon: HiOutlineAcademicCap,
        accent: "lime",
        summary: "Guides and learning paths for sellers, drivers, creators, moderators, and new users.",
        details: ["Short lessons", "Badges", "Service training"],
      },
      {
        id: "community-roles",
        title: "Community Roles",
        status: "Planned",
        icon: HiOutlineUserGroup,
        accent: "cyan",
        summary: "More granular roles for Spaces, large groups, departments, and collaboration teams.",
        details: ["Department leads", "Review queues", "Role history"],
      },
      {
        id: "creator-fund",
        title: "Creator Fund",
        status: "Research",
        icon: HiOutlineBanknotes,
        accent: "fuchsia",
        summary: "A structured program for rewarding helpful, original, high-quality KunThai content.",
        details: ["Program rules", "Quality review", "Reward records"],
      },
    ],
  },
];

const allFeatures = featureGroups.flatMap((group) => group.features.map((feature) => ({ ...feature, group: group.label })));

function readInterest() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FUTURE_INTEREST_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function writeInterest(values) {
  try {
    localStorage.setItem(FUTURE_INTEREST_KEY, JSON.stringify(Array.from(values)));
  } catch {
    // Interest tracking is local and optional.
  }
}

function getAccentClasses(accent) {
  const classes = {
    amber: "bg-amber-50 text-amber-800 border-amber-100",
    blue: "bg-blue-50 text-blue-800 border-blue-100",
    cyan: "bg-cyan-50 text-cyan-800 border-cyan-100",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-100",
    fuchsia: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-100",
    indigo: "bg-indigo-50 text-indigo-800 border-indigo-100",
    lime: "bg-lime-50 text-lime-800 border-lime-100",
    orange: "bg-orange-50 text-orange-800 border-orange-100",
    rose: "bg-rose-50 text-rose-800 border-rose-100",
    sky: "bg-sky-50 text-sky-800 border-sky-100",
    teal: "bg-teal-50 text-teal-800 border-teal-100",
    violet: "bg-violet-50 text-violet-800 border-violet-100",
  };
  return classes[accent] || classes.sky;
}

export default function FutureFeaturesScreen({ hideHeader = false, onOpenYourVoice }) {
  const [activeGroup, setActiveGroup] = useState("all");
  const [interest, setInterest] = useState(() => readInterest());

  useEffect(() => {
    writeInterest(interest);
  }, [interest]);

  const visibleFeatures = useMemo(() => (
    activeGroup === "all"
      ? allFeatures
      : allFeatures.filter((feature) => feature.group.toLowerCase() === activeGroup)
  ), [activeGroup]);

  function toggleInterest(feature) {
    setInterest((current) => {
      const next = new Set(current);
      if (next.has(feature.id)) {
        next.delete(feature.id);
        showToast(`${feature.title} removed from your interest list.`, "info");
      } else {
        next.add(feature.id);
        showToast(`${feature.title} added to your interest list.`, "success");
      }
      return next;
    });
  }

  function sendIdea(feature = null) {
    onOpenYourVoice?.({
      feedbackType: "idea",
      category: "explore",
      title: feature ? `Future feature idea: ${feature.title}` : "Future feature idea",
      message: feature
        ? `I am interested in ${feature.title}. My suggestion is: `
        : "I have an idea for a future KunThai feature: ",
      currentScreen: "Explore / Future Features",
    });
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Future Features" subtitle="Explore planned KunThai ideas and mark what matters to you." /> : null}

      <div className="w-full space-y-5 px-4 py-4 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <span className="grid h-14 w-14 place-items-center rounded-[20px] bg-slate-950 text-white">
                <HiOutlineRocketLaunch className="text-3xl" />
              </span>
              <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-sky-700">KunThai roadmap</p>
              <h3 className="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">Advanced tools for creators, Spaces, businesses, and communities.</h3>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">These features are not live yet. This screen helps users discover what is coming and lets KunThai learn which tools people care about most.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-80">
              <RoadmapStat label="Features listed" value={allFeatures.length} />
              <RoadmapStat label="Marked interest" value={interest.size} />
            </div>
          </div>
        </section>

        <section className="flex gap-2 overflow-x-auto rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm kuntai-scrollbar-none">
          <FilterButton active={activeGroup === "all"} label="All" onClick={() => setActiveGroup("all")} />
          {featureGroups.map((group) => (
            <FilterButton key={group.id} active={activeGroup === group.id} label={group.label} onClick={() => setActiveGroup(group.id)} />
          ))}
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {visibleFeatures.map((feature) => (
            <FeatureCard
              key={feature.id}
              feature={feature}
              interested={interest.has(feature.id)}
              onIdea={() => sendIdea(feature)}
              onToggle={() => toggleInterest(feature)}
            />
          ))}
        </section>

        <button
          type="button"
          onClick={() => sendIdea()}
          className="flex w-full items-center gap-3 rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
        >
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-100 text-sky-800">
            <HiOutlineLightBulb className="text-2xl" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black text-slate-950">Suggest another future feature</span>
            <span className="mt-1 block text-sm font-semibold leading-6 text-slate-600">Open Your Voice with a product idea draft ready to send.</span>
          </span>
        </button>
      </div>
    </div>
  );
}

function RoadmapStat({ label, value }) {
  return (
    <div className="rounded-[22px] bg-slate-50 px-4 py-3">
      <p className="text-2xl font-black text-slate-950">{value}</p>
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
    </div>
  );
}

function FilterButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 flex-none rounded-2xl px-4 text-sm font-black transition ${active ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
    >
      {label}
    </button>
  );
}

function FeatureCard({ feature, interested, onIdea, onToggle }) {
  const Icon = feature.icon;
  const accentClass = getAccentClasses(feature.accent);

  return (
    <article className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-12 w-12 flex-none place-items-center rounded-2xl border ${accentClass}`}>
            <Icon className="text-2xl" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-lg font-black text-slate-950">{feature.title}</h4>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">{feature.status}</span>
            </div>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-sky-700">{feature.group}</p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">{feature.summary}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {feature.details.map((detail) => (
          <span key={detail} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">{detail}</span>
        ))}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onToggle}
          className={`flex h-11 items-center justify-center gap-2 rounded-2xl text-sm font-black transition ${interested ? "bg-emerald-700 text-white" : "bg-slate-950 text-white hover:bg-slate-800"}`}
        >
          <HiOutlineCheckCircle className="text-xl" />
          {interested ? "Interested" : "I want this"}
        </button>
        <button
          type="button"
          onClick={onIdea}
          className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-100 text-sm font-black text-slate-700 transition hover:bg-sky-50 hover:text-sky-800"
        >
          <HiOutlineLightBulb className="text-xl" />
          Send idea
        </button>
      </div>
    </article>
  );
}
