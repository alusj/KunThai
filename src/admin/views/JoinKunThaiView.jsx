import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Briefcase, HandHeart, Inbox, LoaderCircle, RefreshCw, Search } from "lucide-react";

import { canAccess, formatDateTime, formatRelativeTime, titleCase } from "../adminConfig";
import { getJoinApplications, JOIN_OPEN_STATUSES, JOIN_STATUSES } from "../joinKunThaiAdminService";
import JoinApplicationDrawer from "../components/JoinApplicationDrawer";
import { PageHeading } from "./AdminViews";

const TABS = [
  { key: "all", label: "Overview", icon: Inbox },
  { key: "staff", label: "Staff", icon: Briefcase },
  { key: "volunteer", label: "Volunteers", icon: HandHeart },
  { key: "investor", label: "Investors", icon: Banknote },
];

const STATUS_TONES = {
  submitted: "bg-sky-50 text-sky-800 ring-sky-200",
  under_review: "bg-amber-50 text-amber-800 ring-amber-200",
  shortlisted: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  assessment: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  interview: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  due_diligence: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  offer: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  accepted: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  rejected: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  withdrawn: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  archived: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="min-h-24 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase text-zinc-500">{label}</p>
        {Icon ? <Icon size={17} className="text-zinc-300" /> : null}
      </div>
      <p className="mt-2 text-3xl font-black text-zinc-950">{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-zinc-500">{detail}</p> : null}
    </div>
  );
}

export default function JoinKunThaiView({ access }) {
  const [tab, setTab] = useState("all");
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [applications, setApplications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const canManage = canAccess(access, "join.manage");
  const canDecide = canAccess(access, "join.decide");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const rows = await getJoinApplications({ limit: 400 });
      setApplications(rows);
      setSelected((current) => (current ? rows.find((row) => row.id === current.id) || current : null));
    } catch (loadError) {
      setError(loadError.message || "Unable to load Join KunThai applications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const open = applications.filter((row) => JOIN_OPEN_STATUSES.includes(row.status));
    return {
      newApplications: applications.filter((row) => row.status === "submitted").length,
      underReview: applications.filter((row) => row.status === "under_review").length,
      shortlisted: applications.filter((row) => row.status === "shortlisted").length,
      interviews: applications.filter((row) => ["interview", "due_diligence"].includes(row.status)).length,
      offers: applications.filter((row) => row.status === "offer").length,
      open: open.length,
      unread: applications.reduce((total, row) => total + (row.admin_unread_count || 0), 0),
    };
  }, [applications]);

  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    return applications.filter((row) => {
      if (tab !== "all" && row.application_type !== tab) return false;
      if (status === "open" && !JOIN_OPEN_STATUSES.includes(row.status)) return false;
      if (status !== "open" && status !== "all" && row.status !== status) return false;
      if (!text) return true;
      return [row.reference, row.display_name, row.headline, row.contact_email, row.country]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(text));
    });
  }, [applications, search, status, tab]);

  return (
    <>
      <PageHeading
        eyebrow="Recruitment and investment"
        title="Join KunThai"
        description="Staff, volunteer, and investor applications. Scores and suggestions are aids for the reviewer; every decision is made by a person."
        action={
          <button
            type="button"
            onClick={() => load(true)}
            className="flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-black text-zinc-700 hover:bg-zinc-50"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      {error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="New applications" value={counts.newApplications} detail="Awaiting first review" />
        <Metric label="Under review" value={counts.underReview} />
        <Metric label="Shortlisted" value={counts.shortlisted} />
        <Metric label="Interviews and diligence" value={counts.interviews} />
        <Metric label="Offers" value={counts.offers} detail={counts.unread ? `${counts.unread} unread messages` : ""} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const total = item.key === "all" ? applications.length : applications.filter((row) => row.application_type === item.key).length;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex h-10 items-center gap-2 rounded-md px-3 text-sm font-black ${
                tab === item.key ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <Icon size={15} /> {item.label}
              <span className={tab === item.key ? "text-zinc-300" : "text-zinc-400"}>{total}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <span className="sr-only">Search applications</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by reference, name, email, or country"
            className="h-10 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-600"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm font-black outline-none focus:border-emerald-600 sm:w-56"
        >
          <option value="open">Open applications</option>
          <option value="all">Every status</option>
          {JOIN_STATUSES.map((value) => (
            <option key={value} value={value}>{titleCase(value)}</option>
          ))}
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {loading ? (
          <p className="flex items-center gap-2 p-5 text-sm font-bold text-zinc-500">
            <LoaderCircle className="animate-spin" size={16} /> Loading applications…
          </p>
        ) : !visible.length ? (
          <p className="p-8 text-center text-sm font-bold text-zinc-400">No applications match this view.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {visible.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-black text-zinc-950">{row.reference}</p>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-600">
                        {titleCase(row.application_type)}
                      </span>
                      {row.priority !== "normal" ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">
                          {row.priority}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-bold text-zinc-700">
                      {row.display_name || "Applicant"}
                      {row.headline ? ` · ${row.headline}` : ""}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-zinc-400">
                      {row.country || "Country not given"} · submitted {formatDateTime(row.submitted_at)} · updated {formatRelativeTime(row.last_activity_at)}
                    </p>
                  </div>
                  {row.reviewer_score !== null && row.reviewer_score !== undefined ? (
                    <span className="flex-none text-sm font-black text-zinc-500">{Math.round(row.reviewer_score)}</span>
                  ) : null}
                  {row.admin_unread_count ? (
                    <span className="flex-none rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                      {row.admin_unread_count}
                    </span>
                  ) : null}
                  <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${STATUS_TONES[row.status] || "bg-zinc-100 text-zinc-600 ring-zinc-200"}`}>
                    {titleCase(row.status)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <JoinApplicationDrawer
          application={selected}
          canManage={canManage}
          canDecide={canDecide}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setApplications((current) => current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
            setSelected((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
          }}
        />
      ) : null}
    </>
  );
}
