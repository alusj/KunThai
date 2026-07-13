import { ArrowUpRight, CircleUserRound } from "lucide-react";
import { formatCaseNumber, formatRelativeTime, titleCase } from "../adminConfig";
import { getCaseCountryLabel, getCaseTypeLabel } from "../adminService";

const priorityStyles = {
  low: "bg-zinc-100 text-zinc-600",
  normal: "bg-sky-50 text-sky-700",
  high: "bg-amber-50 text-amber-800",
  urgent: "bg-orange-50 text-orange-800",
  critical: "bg-red-50 text-red-700",
};

const sectorStyles = {
  explore: "bg-cyan-50 text-cyan-800",
  marketplace: "bg-emerald-50 text-emerald-800",
  transport: "bg-violet-50 text-violet-800",
  platform: "bg-zinc-100 text-zinc-700",
};

export default function CaseTable({ cases = [], onOpen, emptyTitle = "No cases in this queue", emptyMessage = "New work will appear here automatically." }) {
  if (!cases.length) {
    return (
      <div className="border-y border-zinc-200 bg-white px-5 py-16 text-center sm:rounded-lg sm:border">
        <p className="text-sm font-black text-zinc-900">{emptyTitle}</p>
        <p className="mt-2 text-sm font-medium text-zinc-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border-y border-zinc-200 bg-white sm:rounded-lg sm:border">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <thead className="bg-zinc-50 text-[11px] font-black uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Case</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Sector</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Opened</th>
              <th className="w-14 px-4 py-3"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {cases.map((item) => (
              <tr key={item.id} onClick={() => onOpen(item)} className="group cursor-pointer hover:bg-zinc-50">
                <td className="whitespace-nowrap px-4 py-3 text-xs font-black text-zinc-700">{formatCaseNumber(item.case_number)}</td>
                <td className="max-w-sm px-4 py-3">
                  <p className="truncate text-sm font-black text-zinc-950">{item.title}</p>
                  <p className="mt-1 truncate text-xs font-medium text-zinc-500">{titleCase(item.queue)} · {titleCase(item.case_type)}</p>
                </td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-black ${sectorStyles[item.sector] || sectorStyles.platform}`}>{item.sector === "marketplace" ? "UrMall" : titleCase(item.sector)}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-zinc-600">{getCaseCountryLabel(item)}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-black ${priorityStyles[item.priority] || priorityStyles.normal}`}>{titleCase(item.priority)}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-zinc-700">{titleCase(item.status)}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
                    <CircleUserRound size={15} /> {item.assignee_user_id ? "Assigned" : "Unassigned"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-zinc-500">{formatRelativeTime(item.created_at)}</td>
                <td className="px-4 py-3">
                  <button type="button" title="Open case" onClick={(event) => { event.stopPropagation(); onOpen(item); }} className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-950">
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-zinc-100 md:hidden">
        {cases.map((item) => (
          <button type="button" key={item.id} onClick={() => onOpen(item)} className="block w-full px-4 py-4 text-left hover:bg-zinc-50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-zinc-500">{formatCaseNumber(item.case_number)}</p>
                <p className="mt-1 text-sm font-black text-zinc-950">{item.title}</p>
              </div>
              <ArrowUpRight className="shrink-0 text-zinc-400" size={18} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full px-2 py-1 text-[11px] font-black ${sectorStyles[item.sector] || sectorStyles.platform}`}>{item.sector === "marketplace" ? "UrMall" : titleCase(item.sector)}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-black text-zinc-700">{getCaseCountryLabel(item)}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-black text-zinc-700">{getCaseTypeLabel(item)}</span>
              <span className={`rounded-full px-2 py-1 text-[11px] font-black ${priorityStyles[item.priority] || priorityStyles.normal}`}>{titleCase(item.priority)}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-black text-zinc-700">{titleCase(item.status)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
