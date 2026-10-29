import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { formatCaseNumber, titleCase } from "../adminConfig";
import { getCaseCountryLabel, getCaseSearchText, getCaseTypeLabel } from "../adminService";
import { VERIFICATION_LANES, hasMissingDocuments, inVerificationLane, laneOf, sortVerificationQueue, verificationLaneCounts, verificationStage } from "../verificationStages.js";
import { ReviewRoundChip, VerificationStageBadge, WaitLabel } from "../components/VerificationReviewPanel";
import { PageHeading } from "./AdminViews";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

const LANE_TONES = {
  needs_review: "border-emerald-300 bg-emerald-50 text-emerald-950",
  with_documents: "border-emerald-300 bg-emerald-50 text-emerald-950",
  no_documents: "border-rose-200 bg-rose-50 text-rose-900",
  resubmitted: "border-violet-200 bg-violet-50 text-violet-800",
  new: "border-sky-300 bg-sky-50 text-sky-950",
  in_review: "border-amber-300 bg-amber-50 text-amber-950",
  waiting_on_user: "border-zinc-300 bg-zinc-50 text-zinc-900",
  decided: "border-zinc-200 bg-white text-zinc-700",
};

const LANE_HINTS = {
  needs_review: "Resubmitted first, then the longest waiting",
  with_documents: "Uploads ready to check",
  no_documents: "Moves to With documents once they upload",
  resubmitted: "The applicant sent what was asked",
  new: "First-time submissions",
  in_review: "Claimed by an admin",
  waiting_on_user: "More documents requested",
  decided: "Approved, rejected or closed",
};

const sectorLabel = (sector) => (sector === "marketplace" ? "UrMall" : titleCase(sector));

export default function VerificationQueueView({ title, description, cases = [], onOpenCase }) {
  useUiLocale();
  const [lane, setLane] = useState("with_documents");
  const [sector, setSector] = useState("all");
  const [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());

  const verification = useMemo(() => cases.filter((item) => item.queue === "verification"), [cases]);
  const sectorCases = useMemo(() => (sector === "all" ? verification : verification.filter((item) => item.sector === sector)), [sector, verification]);
  const counts = useMemo(() => verificationLaneCounts(sectorCases), [sectorCases]);
  const activeLane = VERIFICATION_LANES.find((entry) => entry.key === lane) || VERIFICATION_LANES[0];
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = sectorCases.filter((item) => inVerificationLane(activeLane, item) && (!needle || getCaseSearchText(item).includes(needle)));
    return sortVerificationQueue(rows, now);
  }, [activeLane, now, search, sectorCases]);
  const sectors = useMemo(() => Array.from(new Set(verification.map((item) => item.sector))).sort(), [verification]);

  return (
    <>
      <PageHeading eyebrow="Operations queue" title={title} description={description} />

      <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {VERIFICATION_LANES.map((entry) => (
          <button
            type="button"
            key={entry.key}
            onClick={() => setLane(entry.key)}
            aria-pressed={lane === entry.key}
            className={`min-h-24 rounded-lg border p-3 text-left transition ${LANE_TONES[entry.key]} ${lane === entry.key ? "ring-2 ring-zinc-950/70" : "opacity-90 hover:opacity-100"}`}
          >
            <span className="block text-[11px] font-black uppercase opacity-70">{translateUi(entry.label)}</span>
            <span className="mt-1 block text-2xl font-black">{counts[entry.key] || 0}</span>
            <span className="mt-0.5 block text-[11px] font-semibold leading-4 opacity-70">{translateUi(LANE_HINTS[entry.key])}</span>
          </button>
        ))}
      </section>

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={translateUi("Search name, case number or type")} className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:bg-white" />
        </label>
        <select value={sector} onChange={(event) => setSector(event.target.value)} className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 outline-none focus:border-emerald-600">
          <option value="all">{translateUi("All sectors")}</option>
          {sectors.map((value) => <option key={value} value={value}>{sectorLabel(value)}</option>)}
        </select>
        <span className="whitespace-nowrap px-2 text-xs font-black text-zinc-500">{visible.length} {translateUi("cases")}</span>
      </div>

      {!visible.length ? (
        <div className="border-y border-zinc-200 bg-white px-5 py-16 text-center sm:rounded-lg sm:border">
          <p className="text-sm font-black text-zinc-900">{translateUi("Nothing here right now")}</p>
          <p className="mt-2 text-sm font-medium text-zinc-500">{translateUi("New submissions and resubmissions appear here automatically.")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden border-y border-zinc-200 bg-white sm:rounded-lg sm:border">
          {visible.map((item) => {
            const stage = verificationStage(item);
            const asked = stage === "waiting_on_user" ? String(item.resolution_note || "").trim() : "";
            return (
              <li key={item.id}>
                <button type="button" onClick={() => onOpenCase(item)} className={`group flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50 ${laneOf(stage) === "resubmitted" ? "border-l-4 border-violet-500" : "border-l-4 border-transparent"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <VerificationStageBadge item={item} />
                      <ReviewRoundChip item={item} />
                      {hasMissingDocuments(item) ? <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-700">{translateUi("No documents yet")}</span> : null}
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-black text-zinc-600">{sectorLabel(item.sector)}</span>
                      <span className="hidden rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-black text-zinc-600 sm:inline-flex">{getCaseCountryLabel(item)}</span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-black text-zinc-950">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-zinc-500">{formatCaseNumber(item.case_number)} · {getCaseTypeLabel(item)}</p>
                    {asked ? <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-zinc-600">{translateUi("Asked")}: {asked}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <WaitLabel item={item} now={now} />
                    <ArrowUpRight className="text-zinc-400 group-hover:text-zinc-900" size={17} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
