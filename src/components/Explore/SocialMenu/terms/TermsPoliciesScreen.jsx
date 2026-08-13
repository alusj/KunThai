import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowUp,
  HiOutlineBanknotes,
  HiOutlineCheckBadge,
  HiOutlineChevronRight,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlineMagnifyingGlass,
  HiOutlineScale,
  HiOutlineShieldCheck,
  HiOutlineTruck,
  HiOutlineUserMinus,
  HiOutlineXMark,
} from "react-icons/hi2";

import { legalConfig, isResolvedLegalValue } from "../../../../config/legalConfig";
import { useBrowserBack } from "../../../../Backend/hooks/useBrowserBack";
import {
  frequentPolicyIds,
  policyCategories,
  policyChangelog,
  policyDocuments,
  policiesById,
  resolvePolicy,
} from "../../../../data/policies";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import PublicPrivacyRequestDialog from "../../../public/PublicPrivacyRequestDialog";
import { t as i18nText } from "../../../../i18n/index";

const iconMap = {
  banknotes: HiOutlineBanknotes,
  document: HiOutlineDocumentText,
  shield: HiOutlineShieldCheck,
  store: HiOutlineBanknotes,
  truck: HiOutlineTruck,
  users: HiOutlineUserMinus,
};

const unresolvedLegalFields = [
  ["Legal business name", legalConfig.legalBusinessName],
  ["Support email", legalConfig.supportEmail],
  ["Privacy email", legalConfig.privacyEmail],
  ["Copyright email", legalConfig.copyrightEmail],
  ["Law-enforcement email", legalConfig.lawEnforcementEmail],
  ["Registered address", legalConfig.registeredAddress],
  ["Governing law", legalConfig.governingLaw],
  ["Dispute jurisdiction", legalConfig.disputeJurisdiction],
  ["Effective date", legalConfig.effectiveDate],
  ["Last updated date", legalConfig.lastUpdated],
].filter(([, value]) => !isResolvedLegalValue(value));

function normalizeSearchText(value) {
  return String(value || "").toLowerCase();
}

function getPolicySearchText(policy) {
  return [
    policy.title,
    policy.shortTitle,
    policy.summary,
    policy.category,
    policy.audience,
    policy.appliesWhen,
    ...(policy.keywords || []),
    ...(policy.sections || []).flatMap((section) => [
      section.title,
      section.introduction,
      ...(section.paragraphs || []),
      ...(section.bullets || []),
      ...(section.allowed || []),
      ...(section.prohibited || []),
      ...(section.examples || []),
      ...(section.callouts || []),
    ]),
  ].join(" ");
}

function buildSearchResults(query) {
  const needle = normalizeSearchText(query).trim();
  if (needle.length < 2) return [];

  return policyDocuments
    .map((policy) => {
      const policyText = normalizeSearchText(getPolicySearchText(policy));
      if (!policyText.includes(needle)) return null;

      const sectionMatches = (policy.sections || []).filter((section) =>
        normalizeSearchText([
          section.title,
          section.introduction,
          ...(section.paragraphs || []),
          ...(section.bullets || []),
          ...(section.allowed || []),
          ...(section.prohibited || []),
          ...(section.examples || []),
          ...(section.callouts || []),
        ].join(" ")).includes(needle),
      );

      return {
        policy,
        sectionMatches: sectionMatches.slice(0, 3),
        titleMatch: normalizeSearchText(policy.title).includes(needle) || normalizeSearchText(policy.shortTitle).includes(needle),
      };
    })
    .filter(Boolean);
}

function getInitialSlug(initialPolicyId) {
  return resolvePolicy(initialPolicyId)?.slug || "";
}

function getHashSection() {
  if (typeof window === "undefined") return "";
  return window.location.hash ? decodeURIComponent(window.location.hash.replace(/^#/, "")) : "";
}

function CategoryIcon({ icon }) {
  const Icon = iconMap[icon] || HiOutlineDocumentText;
  return <Icon className="text-2xl" />;
}

function MetadataPill({ label, value }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm">
      {label}: {value || i18nText("ui.literals.k96f608c16cef")}
    </span>
  );
}

function PolicySearch({ query, onChange }) {
  return (
    <label className="relative block">
      <span className="sr-only">{i18nText("ui.literals.k8105a5e4e7dd")}</span>
      <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400" />
      <input
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder={i18nText("ui.literals.k8105a5e4e7dd")}
        className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-12 text-sm font-black text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
      />
      {query ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
          aria-label={i18nText("ui.literals.k2a3aa6c18e42")}
        >
          <HiOutlineXMark className="text-xl" />
        </button>
      ) : null}
    </label>
  );
}

function PolicyListItem({ policy, onOpen, sectionId = "" }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(policy.slug, sectionId)}
      className="group flex w-full items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
        <HiOutlineDocumentText className="text-xl" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-slate-950">{policy.title}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{policy.summary}</span>
      </span>
      <HiOutlineChevronRight className="mt-2 shrink-0 text-xl text-slate-400 transition group-hover:translate-x-1 group-hover:text-sky-700" />
    </button>
  );
}

function SearchResults({ query, results, onOpen }) {
  if (!query.trim()) return null;

  if (!results.length) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-black text-slate-950">{i18nText("ui.literals.k7dec5d0fc998")}</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
          {i18nText("ui.literals.k364f9820395e")}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.k0144dae8fb18")}</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{results.length} {i18nText("ui.literals.kbdd1a2bdf3c2")}{results.length === 1 ? "y" : i18nText("ui.literals.kbac544f46726")}</h3>
        </div>
      </div>
      <div className="grid gap-3">
        {results.map(({ policy, sectionMatches, titleMatch }) => (
          <article key={policy.id} className="rounded-2xl bg-slate-50 p-3">
            <PolicyListItem policy={policy} onOpen={onOpen} />
            {sectionMatches.length ? (
              <div className="mt-2 grid gap-2 pl-2 sm:pl-12">
                {sectionMatches.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => onOpen(policy.slug, section.id)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-bold text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                  >
                    {i18nText("ui.literals.kcfd6869bbed1")} {section.title}
                  </button>
                ))}
              </div>
            ) : titleMatch ? (
              <p className="mt-2 pl-2 text-xs font-bold text-slate-500 sm:pl-12">{i18nText("ui.literals.kad96eab981fd")}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function PolicyCategoryCard({ category, onOpen }) {
  const policies = category.policyIds.map((id) => policiesById.get(id)).filter(Boolean);

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          <CategoryIcon icon={category.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-slate-950">{category.title}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{category.description}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {policies.map((policy) => (
          <button
            key={policy.id}
            type="button"
            onClick={() => onOpen(policy.slug)}
            className="group flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-left transition hover:bg-sky-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-slate-900">{policy.shortTitle || policy.title}</span>
              <span className="mt-0.5 block truncate text-xs font-bold text-slate-500">{policy.status === "conditional" ? i18nText("ui.literals.kc3accb895f00") : i18nText("ui.literals.k3d170043f7ed", { value0: policy.version })}</span>
            </span>
            <HiOutlineChevronRight className="shrink-0 text-lg text-slate-400 transition group-hover:translate-x-1 group-hover:text-sky-700" />
          </button>
        ))}
      </div>
    </article>
  );
}

function PolicyCenterHome({ onOpen }) {
  const [query, setQuery] = useState("");
  const searchResults = useMemo(() => buildSearchResults(query), [query]);
  const frequentPolicies = frequentPolicyIds.map((id) => policiesById.get(id)).filter(Boolean);

  return (
    <main className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Explore</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{i18nText("ui.literals.k176ded55d96d")}</h1>
            <p className="mt-3 text-base font-semibold leading-7 text-slate-600">
              {i18nText("ui.literals.k6d28e7a3f05c")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetadataPill label={i18nText("ui.literals.k2da600bf9404")} value={legalConfig.policyVersion} />
            <MetadataPill label={i18nText("ui.literals.kb034605d102e")} value={legalConfig.effectiveDate} />
            <MetadataPill label={i18nText("ui.literals.k583c9e23574a")} value={legalConfig.lastUpdated} />
          </div>
        </div>
        <div className="mt-5">
          <PolicySearch query={query} onChange={setQuery} />
        </div>
      </section>

      <SearchResults query={query} results={searchResults} onOpen={onOpen} />

      {!query.trim() ? (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.k6b27a0518074")}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {frequentPolicies.map((policy) => (
                  <PolicyListItem key={policy.id} policy={policy} onOpen={onOpen} />
                ))}
              </div>
            </div>

            <aside className="rounded-[24px] border border-amber-100 bg-amber-50 p-5 text-amber-950 shadow-sm">
              <HiOutlineExclamationTriangle className="text-3xl text-amber-700" />
              <h2 className="mt-3 text-lg font-black">{i18nText("ui.literals.kb840f35e2dea")}</h2>
              <p className="mt-2 text-sm font-bold leading-6">
                {i18nText("ui.literals.k44491de37bcb")}
              </p>
              {import.meta.env.DEV && unresolvedLegalFields.length ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-white/70 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">{i18nText("ui.literals.kf2f12daa22fb")}</p>
                  <p className="mt-1 text-sm font-bold leading-6">
                    {unresolvedLegalFields.map(([label]) => label).join(", ")}.
                  </p>
                </div>
              ) : null}
            </aside>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {policyCategories.map((category) => (
              <PolicyCategoryCard key={category.id} category={category} onOpen={onOpen} />
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.k7e4b91991b86")}</p>
              {policyChangelog.map((entry) => (
                <div key={entry.id} className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">v{entry.version}</span>
                    <span className="text-xs font-black text-slate-500">{entry.date}</span>
                  </div>
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-600">{entry.summary}</p>
                </div>
              ))}
            </article>

            <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.k8bd537ab4236")}</p>
              <h2 className="mt-2 text-lg font-black text-slate-950">{i18nText("ui.literals.k7c9c87da7f94")}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                {i18nText("ui.literals.kb56848461c6e")}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => onOpen("privacy")} className="h-11 rounded-2xl bg-sky-700 px-4 text-sm font-black text-white">
                  {i18nText("ui.literals.k9db108ba6b7f")}
                </button>
                <button type="button" onClick={() => onOpen("reporting-appeals")} className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700">
                  {i18nText("ui.literals.k208b4c929076")}
                </button>
              </div>
            </article>
          </section>
        </>
      ) : null}

      <footer className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm font-semibold leading-6 text-slate-500 shadow-sm">
        {i18nText("ui.literals.kbb4366479387")} {legalConfig.policyVersion}{i18nText("ui.literals.k6cd7f0b32975")} {legalConfig.effectiveDate}{i18nText("ui.literals.ke51e9310fdf6")} {legalConfig.lastUpdated}.
      </footer>
    </main>
  );
}

function PolicyMetadata({ policy }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <MetadataPill label={i18nText("ui.literals.k2da600bf9404")} value={policy.version} />
      <MetadataPill label={i18nText("ui.literals.kb034605d102e")} value={policy.effectiveDate} />
      <MetadataPill label={i18nText("ui.literals.k583c9e23574a")} value={policy.lastUpdated} />
      <MetadataPill label={i18nText("ui.literals.kbae7d5be7082")} value={policy.status === "conditional" ? "Conditional" : "Current"} />
    </div>
  );
}

function PolicyTableOfContents({ sections, onJump }) {
  return (
    <nav className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm" aria-label={i18nText("ui.literals.k227c57f873b0")}>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{i18nText("ui.literals.kf5cbdf6bfb51")}</p>
      <div className="mt-3 grid gap-2">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onJump(section.id)}
            className="rounded-2xl bg-slate-50 px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-100"
          >
            {section.title}
          </button>
        ))}
      </div>
    </nav>
  );
}

function TextList({ title, items, tone = "slate" }) {
  if (!items?.length) return null;
  const toneClass = tone === "green"
    ? "border-emerald-100 bg-emerald-50 text-emerald-900"
    : tone === "red"
      ? "border-red-100 bg-red-50 text-red-900"
      : "border-slate-100 bg-slate-50 text-slate-700";

  return (
    <div className={`mt-4 rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs font-black uppercase tracking-[0.16em]">{title}</p>
      <ul className="mt-2 space-y-2 text-sm font-semibold leading-6">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <HiOutlineCheckBadge className="mt-0.5 shrink-0 text-lg" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PolicySection({ section }) {
  return (
    <section id={`policy-section-${section.id}`} className="scroll-mt-28 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black tracking-tight text-slate-950">{section.title}</h2>
      {section.introduction ? <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{section.introduction}</p> : null}
      {(section.paragraphs || []).map((paragraph) => (
        <p key={paragraph} className="mt-3 text-sm font-semibold leading-7 text-slate-600">
          {paragraph}
        </p>
      ))}
      <TextList title={i18nText("ui.literals.k5d1855a1eaac")} items={section.bullets} />
      <TextList title={i18nText("ui.literals.k77c7b4909d39")} items={section.allowed} tone="green" />
      <TextList title={i18nText("ui.literals.ke0315131a0a7")} items={section.prohibited} tone="red" />
      <TextList title={i18nText("ui.literals.keb01bf04c9a0")} items={section.examples} />
      {(section.callouts || []).map((callout) => (
        <p key={callout} className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-900">
          {callout}
        </p>
      ))}
    </section>
  );
}

function PolicyActions({ actions = [], onOpenHelp, onOpenPrivacy, onOpenReport, onRequestPrivacy }) {
  if (!actions.length) return null;

  function email(address, action) {
    const subject = encodeURIComponent(`KunThai: ${action}`);
    window.location.href = `mailto:${address}?subject=${subject}`;
  }

  function runAction(action) {
    const label = normalizeSearchText(action);
    if (label.includes("delete")) {
      onRequestPrivacy?.("account_deletion");
      return;
    }
    if (label.includes("data")) {
      onRequestPrivacy?.("data_access");
      return;
    }
    if (label.includes("privacy")) {
      if (onOpenPrivacy) onOpenPrivacy();
      else email(legalConfig.privacyEmail, action);
      return;
    }
    if (label.includes("report") || label.includes("appeal") || label.includes("ip") || label.includes("accessibility")) {
      if (onOpenReport) onOpenReport();
      else email(legalConfig.supportEmail, action);
      return;
    }
    if (onOpenHelp) onOpenHelp();
    else email(legalConfig.supportEmail, action);
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.kc3cd636a585b")}</p>
      <div className="mt-3 grid gap-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => runAction(action)}
            className="h-11 rounded-2xl border border-slate-200 px-3 text-sm font-black text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
          >
            {action}
          </button>
        ))}
      </div>
    </section>
  );
}

function RelatedPolicies({ ids = [], onOpen }) {
  const policies = ids.map((id) => policiesById.get(id)).filter(Boolean);
  if (!policies.length) return null;

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.k62b8c4f8dafd")}</p>
      <div className="mt-3 grid gap-2">
        {policies.map((policy) => (
          <button
            key={policy.id}
            type="button"
            onClick={() => onOpen(policy.slug)}
            className="group flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-left transition hover:bg-sky-50"
          >
            <span className="min-w-0 text-sm font-black text-slate-900">{policy.shortTitle || policy.title}</span>
            <HiOutlineChevronRight className="shrink-0 text-lg text-slate-400 transition group-hover:translate-x-1 group-hover:text-sky-700" />
          </button>
        ))}
      </div>
    </section>
  );
}

function PolicyReader({ policy, onBack, onOpen, onOpenHelp, onOpenPrivacy, onOpenReport, onRequestPrivacy, sectionTarget }) {
  const articleRef = useRef(null);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const target = sectionTarget || getHashSection();
    if (!target) {
      articleRef.current?.scrollIntoView({ block: "start" });
      return undefined;
    }

    const timer = window.setTimeout(() => {
      document.getElementById(`policy-section-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [policy.slug, sectionTarget]);

  useEffect(() => {
    function onScroll() {
      setShowTop(window.scrollY > 600);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function jumpToSection(sectionId) {
    window.history.replaceState(window.history.state, "", `#${encodeURIComponent(sectionId)}`);
    document.getElementById(`policy-section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main ref={articleRef} className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
      >
        <HiOutlineArrowLeft className="text-xl" />
        {i18nText("ui.literals.k142f14211573")}
      </button>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0 space-y-5">
          <header className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <HiOutlineScale className="text-3xl" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{i18nText("ui.literals.k176ded55d96d")}</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{policy.title}</h1>
                <p className="mt-3 text-base font-semibold leading-7 text-slate-600">{policy.summary}</p>
                <PolicyMetadata policy={policy} />
              </div>
            </div>
          </header>

          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.k4f3c406088a5")}</p>
            <p className="mt-2 text-sm font-semibold leading-7 text-slate-600">{policy.audience}</p>
            <p className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold leading-6 text-slate-600">
              {policy.appliesWhen}
            </p>
          </section>

          {policy.sections.map((item) => (
            <PolicySection key={item.id} section={item} />
          ))}
        </article>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PolicyTableOfContents sections={policy.sections} onJump={jumpToSection} />
          <RelatedPolicies ids={policy.relatedPolicies} onOpen={onOpen} />
          <PolicyActions
            actions={policy.supportActions}
            onOpenHelp={onOpenHelp}
            onOpenPrivacy={onOpenPrivacy}
            onOpenReport={onOpenReport}
            onRequestPrivacy={onRequestPrivacy}
          />
        </aside>
      </div>

      {showTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white shadow-xl"
          aria-label={i18nText("ui.literals.kf077108ed196")}
        >
          <HiOutlineArrowUp className="text-xl" />
        </button>
      ) : null}
    </main>
  );
}

export default function TermsPoliciesScreen({
  hideHeader = false,
  initialPolicyId = "",
  onOpenHelp,
  onOpenPrivacy,
  onOpenReport,
}) {
  const [activeSlug, setActiveSlug] = useState(() => getInitialSlug(initialPolicyId));
  const [sectionTarget, setSectionTarget] = useState("");
  const [publicPrivacyRequest, setPublicPrivacyRequest] = useState("");
  const activePolicy = resolvePolicy(activeSlug);
  const browserBack = useBrowserBack(Boolean(activePolicy), () => {
    setActiveSlug("");
    setSectionTarget("");
  }, `terms-policy-${activeSlug || "list"}`);

  useEffect(() => {
    setActiveSlug(getInitialSlug(initialPolicyId));
    setSectionTarget(getHashSection());
  }, [initialPolicyId]);

  function openPolicy(slug, sectionId = "") {
    setActiveSlug(slug);
    setSectionTarget(sectionId);
  }

  function requestPrivacyAction(requestType) {
    if (onOpenPrivacy) {
      onOpenPrivacy();
      return;
    }
    setPublicPrivacyRequest(requestType);
  }

  if (activePolicy) {
    return (
      <div>
        {!hideHeader ? <SocialScreenHeader title={activePolicy.title} subtitle={activePolicy.summary} /> : null}
        <PolicyReader
          policy={activePolicy}
          onBack={browserBack}
          onOpen={openPolicy}
          onOpenHelp={onOpenHelp}
          onOpenPrivacy={onOpenPrivacy}
          onOpenReport={onOpenReport}
          onRequestPrivacy={requestPrivacyAction}
          sectionTarget={sectionTarget}
        />
        {publicPrivacyRequest ? (
          <PublicPrivacyRequestDialog requestType={publicPrivacyRequest} onClose={() => setPublicPrivacyRequest("")} />
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title={i18nText("ui.literals.k176ded55d96d")} subtitle={i18nText("ui.literals.k5b5db17fc7e6")} /> : null}
      <PolicyCenterHome onOpen={openPolicy} />
    </div>
  );
}
