import { resolvePolicy } from "../../data/policies";
import TermsPoliciesScreen from "../Explore/SocialMenu/terms/TermsPoliciesScreen";

export default function PublicPolicyPage({ initialPolicyId = "" }) {
  const activePolicy = resolvePolicy(initialPolicyId);
  const pageTitle = activePolicy?.title || "Policy Center";

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
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

      <main className="mx-auto max-w-6xl pb-6">
        <div className="px-4 pt-6 sm:px-6 lg:px-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">KunThai Legal</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">{pageTitle}</h1>
          <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
            These policies apply across KunThai services where each feature is available.
          </p>
        </div>
        <TermsPoliciesScreen hideHeader initialPolicyId={initialPolicyId} />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm font-semibold text-slate-500 sm:px-6">
          <span>(c) {new Date().getFullYear()} KunThai</span>
          <span className="flex gap-4">
            <a href="/policy-center" className="hover:text-slate-900">Policy Center</a>
            <a href="/terms" className="hover:text-slate-900">Terms</a>
            <a href="/privacy" className="hover:text-slate-900">Privacy</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
