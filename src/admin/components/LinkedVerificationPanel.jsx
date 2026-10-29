import { useEffect, useState } from "react";
import { ArrowUpRight, Building2, CarFront, LoaderCircle, UserRound } from "lucide-react";
import { caseStatusLabel, formatCaseNumber } from "../adminConfig";
import { isLinkedVerificationCase, verificationStatusBadge } from "../adminCaseRules.js";
import { getCaseLinkedVerification } from "../adminService";

const TONES = {
  emerald: "bg-emerald-50 text-emerald-800",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  zinc: "bg-zinc-100 text-zinc-700",
};

// An operator, a vehicle and a company are each verified through their own
// case. This shows the others linked to the case being reviewed, so the
// admin sees where each one stands; a row opens its case.
export default function LinkedVerificationPanel({ item, onOpenCase }) {
  const [linked, setLinked] = useState(undefined);
  const [error, setError] = useState("");
  const caseId = item?.id;
  const enabled = isLinkedVerificationCase(item);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    setLinked(undefined);
    setError("");
    getCaseLinkedVerification(item)
      .then((data) => { if (active) setLinked(data); })
      .catch(() => { if (active) setError("Linked verification could not be loaded."); });
    return () => { active = false; };
    // The case id is what changes the links; the rest of item is not needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, enabled]);

  if (!enabled) return null;
  const rows = linked ? [
    ...(linked.operators || []).map((entry) => ({ ...entry, type: "Operator", icon: UserRound, detail: entry.code || "" })),
    ...(linked.vehicles || []).map((entry) => ({ ...entry, type: entry.kind === "company" ? "Company vehicle" : "Vehicle", icon: CarFront, detail: entry.plate || "" })),
    ...(linked.company ? [{ ...linked.company, type: "Company", icon: Building2, detail: linked.company.code || "" }] : []),
  ] : [];

  return (
    <section className="border-b border-zinc-200 p-4 sm:p-6">
      <h3 className="text-sm font-black text-zinc-950">Linked verification</h3>
      <p className="mt-1 text-xs font-medium leading-5 text-zinc-500">
        The operator, vehicle and company are each verified in their own case. Deciding this case changes only this one.
      </p>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>
        : linked === undefined ? <p className="mt-3 flex items-center gap-2 text-sm font-bold text-zinc-500"><LoaderCircle className="animate-spin" size={14} /> Loading…</p>
          : !rows.length ? <p className="mt-3 text-sm font-semibold text-zinc-500">Nothing linked to this case yet.</p>
            : (
              <ul className="mt-3 divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200">
                {rows.map((row) => {
                  const badge = verificationStatusBadge(row.verificationStatus);
                  const Icon = row.icon;
                  const openable = Boolean(row.case?.id && onOpenCase && !row.current);
                  return (
                    <li key={`${row.type}-${row.id}`}>
                      <button
                        type="button"
                        disabled={!openable}
                        onClick={() => openable && onOpenCase(row.case.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <Icon size={16} className="shrink-0 text-zinc-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-zinc-900">
                            {row.name || row.type}
                            {row.current ? <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-700">This case</span> : null}
                          </span>
                          <span className="block truncate text-[11px] font-semibold text-zinc-500">
                            {[row.type, row.detail, row.case ? `${formatCaseNumber(row.case.number)} · ${caseStatusLabel(row.case.status)}` : "No case yet"].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${TONES[badge.tone]}`}>{badge.label}</span>
                        {openable ? <ArrowUpRight size={15} className="shrink-0 text-zinc-400" /> : <span className="w-[15px] shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
    </section>
  );
}
