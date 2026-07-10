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
      {label}: {value || "Pending"}
    </span>
  );
}

function PolicySearch({ query, onChange }) {
  return (
    <label className="relative block">
      <span className="sr-only">Search policies</span>
      <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400" />
      <input
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search policies"
        className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-12 text-sm font-black text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
      />
      {query ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
          aria-label="Clear policy search"
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
        <p className="text-sm font-black text-slate-950">No policy result found</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
          Try words like privacy, transport, emergency, Swip, seller, refund, report, or deletion.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Search results</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{results.length} matching polic{results.length === 1 ? "y" : "ies"}</h3>
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
                    Jump to {section.title}
                  </button>
                ))}
              </div>
            ) : titleMatch ? (
              <p className="mt-2 pl-2 text-xs font-bold text-slate-500 sm:pl-12">Matched by policy title or summary.</p>
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
              <span className="mt-0.5 block truncate text-xs font-bold text-slate-500">{policy.status === "conditional" ? "Conditional" : `Version ${policy.version}`}</span>
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
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Policy Center</h1>
            <p className="mt-3 text-base font-semibold leading-7 text-slate-600">
              Understand how KunThai works, what we expect from users, and how we protect the community.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetadataPill label="Version" value={legalConfig.policyVersion} />
            <MetadataPill label="Effective" value={legalConfig.effectiveDate} />
            <MetadataPill label="Last updated" value={legalConfig.lastUpdated} />
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
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Frequently accessed</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {frequentPolicies.map((policy) => (
                  <PolicyListItem key={policy.id} policy={policy} onOpen={onOpen} />
                ))}
              </div>
            </div>

            <aside className="rounded-[24px] border border-amber-100 bg-amber-50 p-5 text-amber-950 shadow-sm">
              <HiOutlineExclamationTriangle className="text-3xl text-amber-700" />
              <h2 className="mt-3 text-lg font-black">Service-specific policies</h2>
              <p className="mt-2 text-sm font-bold leading-6">
                Some policies apply only to services that are available for your account, country, role, or business type. Conditional services are marked clearly.
              </p>
              {unresolvedLegalFields.length ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-white/70 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Needs legal confirmation</p>
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
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">What changed</p>
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
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Help and privacy requests</p>
              <h2 className="mt-2 text-lg font-black text-slate-950">Need support with a policy?</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Use Help Center inside KunThai for support, reports, account access, privacy questions, data requests, and deletion guidance.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => onOpen("privacy")} className="h-11 rounded-2xl bg-sky-700 px-4 text-sm font-black text-white">
                  Privacy Policy
                </button>
                <button type="button" onClick={() => onOpen("reporting-appeals")} className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700">
                  Reports and appeals
                </button>
              </div>
            </article>
          </section>
        </>
      ) : null}

      <footer className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm font-semibold leading-6 text-slate-500 shadow-sm">
        Policy Center version {legalConfig.policyVersion}. Effective date: {legalConfig.effectiveDate}. Last updated: {legalConfig.lastUpdated}.
      </footer>
    </main>
  );
}

function PolicyMetadata({ policy }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <MetadataPill label="Version" value={policy.version} />
      <MetadataPill label="Effective" value={policy.effectiveDate} />
      <MetadataPill label="Last updated" value={policy.lastUpdated} />
      <MetadataPill label="Status" value={policy.status === "conditional" ? "Conditional" : "Current"} />
    </div>
  );
}

function PolicyTableOfContents({ sections, onJump }) {
  return (
    <nav className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm" aria-label="Policy sections">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Contents</p>
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
      <TextList title="Key points" items={section.bullets} />
      <TextList title="Allowed" items={section.allowed} tone="green" />
      <TextList title="Not allowed" items={section.prohibited} tone="red" />
      <TextList title="Examples" items={section.examples} />
      {(section.callouts || []).map((callout) => (
        <p key={callout} className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-900">
          {callout}
        </p>
      ))}
    </section>
  );
}

function PolicyActions({ actions = [], onOpenHelp, onOpenPrivacy, onOpenReport }) {
  if (!actions.length) return null;

  function runAction(action) {
    const label = normalizeSearchText(action);
    if (label.includes("data") || label.includes("delete") || label.includes("privacy")) {
      onOpenPrivacy?.();
      return;
    }
    if (label.includes("report") || label.includes("appeal") || label.includes("ip") || label.includes("accessibility")) {
      onOpenReport?.();
      return;
    }
    onOpenHelp?.();
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Actions</p>
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
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Related policies</p>
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

function PolicyReader({ policy, onBack, onOpen, onOpenHelp, onOpenPrivacy, onOpenReport, sectionTarget }) {
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
        Back to Policy Center
      </button>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0 space-y-5">
          <header className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <HiOutlineScale className="text-3xl" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Policy Center</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{policy.title}</h1>
                <p className="mt-3 text-base font-semibold leading-7 text-slate-600">{policy.summary}</p>
                <PolicyMetadata policy={policy} />
              </div>
            </div>
          </header>

          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Who this applies to</p>
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
          />
        </aside>
      </div>

      {showTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white shadow-xl"
          aria-label="Scroll to top"
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
          sectionTarget={sectionTarget}
        />
      </div>
    );
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Policy Center" subtitle="Rules, privacy, safety, marketplace, transport, and transparency." /> : null}
      <PolicyCenterHome onOpen={openPolicy} />
    </div>
  );
}
