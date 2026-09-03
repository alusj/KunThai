import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineArrowRight,
  HiOutlineBanknotes,
  HiOutlineBriefcase,
  HiOutlineDocumentText,
  HiOutlineHandRaised,
  HiOutlineInboxStack,
} from "react-icons/hi2";

import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_TYPE_LABELS,
  discardDraftApplication,
  fetchApplicationDetail,
  fetchMyApplications,
  fetchQuestionCatalogue,
  startApplication,
} from "../../../../Backend/services/explore/joinKunThaiService";
import SocialScreenHeader from "../shared/SocialScreenHeader";

import JoinApplicationForm from "./JoinApplicationForm";
import JoinApplicationTracker from "./JoinApplicationTracker";
import { JOIN_PATHS } from "./joinNotices";

const PATH_ICONS = {
  investor: HiOutlineBanknotes,
  staff: HiOutlineBriefcase,
  volunteer: HiOutlineHandRaised,
};

const ACCENTS = {
  amber: {
    card: "border-amber-200 bg-gradient-to-br from-white to-amber-50",
    badge: "bg-amber-500",
  },
  sky: {
    card: "border-sky-200 bg-gradient-to-br from-white to-sky-50",
    badge: "bg-sky-700",
  },
  emerald: {
    card: "border-emerald-200 bg-gradient-to-br from-white to-emerald-50",
    badge: "bg-emerald-600",
  },
};

const OPEN_STATUSES = new Set([
  "submitted",
  "under_review",
  "shortlisted",
  "assessment",
  "interview",
  "due_diligence",
  "offer",
]);

function statusTone(status) {
  if (status === "accepted") return "bg-emerald-50 text-emerald-800";
  if (status === "rejected" || status === "withdrawn" || status === "archived") return "bg-slate-100 text-slate-600";
  if (status === "draft") return "bg-amber-50 text-amber-800";
  return "bg-sky-50 text-sky-700";
}

function ApplicationRow({ application, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(application)}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-200"
    >
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-slate-100 text-slate-600">
        <HiOutlineDocumentText className="text-xl" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-slate-950">
          {application.reference || `${APPLICATION_TYPE_LABELS[application.applicationType]} draft`}
        </p>
        <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
          {application.headline || APPLICATION_TYPE_LABELS[application.applicationType]}
        </p>
      </div>
      {application.applicantUnreadCount ? (
        <span className="flex-none rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
          {application.applicantUnreadCount}
        </span>
      ) : null}
      <span className={`flex-none rounded-full px-3 py-1 text-[11px] font-black ${statusTone(application.status)}`}>
        {APPLICATION_STATUS_LABELS[application.status] || application.status}
      </span>
    </button>
  );
}

export default function JoinKunThaiScreen({ hideHeader = false }) {
  const [view, setView] = useState("hub");
  const [applications, setApplications] = useState([]);
  const [catalogue, setCatalogue] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyPath, setBusyPath] = useState("");
  const [error, setError] = useState("");

  const loadApplications = useCallback(async () => {
    setError("");
    try {
      setApplications(await fetchMyApplications());
    } catch (loadError) {
      setError(loadError.message || "Could not load your applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  async function openApplication(application) {
    setError("");
    setBusyPath(application.applicationType);
    try {
      const [nextCatalogue, nextDetail] = await Promise.all([
        fetchQuestionCatalogue(application.applicationType),
        fetchApplicationDetail(application.id),
      ]);
      setCatalogue(nextCatalogue);
      setDetail(nextDetail);
      setView(nextDetail.application.status === "draft" ? "form" : "tracker");
    } catch (openError) {
      setError(openError.message || "Could not open that application.");
    } finally {
      setBusyPath("");
    }
  }

  async function beginPath(applicationType) {
    setError("");
    setBusyPath(applicationType);
    try {
      const application = await startApplication(applicationType);
      const [nextCatalogue, nextDetail] = await Promise.all([
        fetchQuestionCatalogue(applicationType),
        fetchApplicationDetail(application.id),
      ]);
      setCatalogue(nextCatalogue);
      setDetail(nextDetail);
      setApplications((current) =>
        current.some((item) => item.id === application.id) ? current : [application, ...current],
      );
      setView("form");
    } catch (startError) {
      setError(startError.message || "Could not open that application.");
    } finally {
      setBusyPath("");
    }
  }

  function backToHub() {
    setView("hub");
    setDetail(null);
    loadApplications();
  }

  async function discardDraft() {
    if (!detail?.application?.id) return;
    try {
      await discardDraftApplication(detail.application.id);
      backToHub();
    } catch (discardError) {
      setError(discardError.message || "Could not discard that draft.");
    }
  }

  const drafts = applications.filter((item) => item.status === "draft");
  const openApplications = applications.filter((item) => OPEN_STATUSES.has(item.status));
  const closedApplications = applications.filter(
    (item) => !OPEN_STATUSES.has(item.status) && item.status !== "draft",
  );

  return (
    <div className="min-h-full bg-slate-50">
      {!hideHeader ? (
        <SocialScreenHeader title="Join KunThai" subtitle="Invest, build, or volunteer with KunThai." />
      ) : null}

      <div className="w-full space-y-5 px-4 py-4 sm:px-6 lg:px-8">
        {error ? (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-700">{error}</p>
        ) : null}

        {view === "form" && detail && catalogue ? (
          <JoinApplicationForm
            catalogue={catalogue}
            detail={detail}
            onCancel={backToHub}
            onDetailChange={setDetail}
            onDiscard={discardDraft}
            onSubmitted={async (application) => {
              const next = await fetchApplicationDetail(application.id);
              setDetail(next);
              setView("tracker");
              loadApplications();
            }}
          />
        ) : null}

        {view === "tracker" && detail ? (
          <JoinApplicationTracker
            catalogue={catalogue}
            detail={detail}
            onBack={backToHub}
            onDetailChange={setDetail}
          />
        ) : null}

        {view === "hub" ? (
          <>
            <section className="rounded-[28px] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-sm sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Join KunThai</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Help build the future of KunThai.</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Three ways in. Each one has its own application, its own review, and a thread where you can talk to the
                KunThai team about it.
              </p>
            </section>

            <div className="grid gap-3 lg:grid-cols-3">
              {JOIN_PATHS.map((path) => {
                const Icon = PATH_ICONS[path.type];
                const accent = ACCENTS[path.accent];
                const existing = applications.find(
                  (item) => item.applicationType === path.type && (item.status === "draft" || OPEN_STATUSES.has(item.status)),
                );
                return (
                  <button
                    key={path.type}
                    type="button"
                    disabled={Boolean(busyPath)}
                    onClick={() => (existing ? openApplication(existing) : beginPath(path.type))}
                    className={`rounded-[26px] border p-5 text-left shadow-sm transition hover:shadow-md disabled:opacity-60 ${accent.card}`}
                  >
                    <span className={`grid h-12 w-12 place-items-center rounded-2xl text-white ${accent.badge}`}>
                      <Icon className="text-2xl" />
                    </span>
                    <h3 className="mt-4 text-lg font-black text-slate-950">{path.title}</h3>
                    <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-600">{path.description}</p>
                    <p className="mt-4 flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-slate-700">
                      {busyPath === path.type
                        ? "Opening…"
                        : existing
                          ? existing.status === "draft"
                            ? "Continue your draft"
                            : "View your application"
                          : "Start"}
                      <HiOutlineArrowRight className="text-base" />
                    </p>
                  </button>
                );
              })}
            </div>

            <section>
              <div className="mb-3 flex items-center gap-2 px-1">
                <HiOutlineInboxStack className="text-lg text-sky-700" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">My Applications</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-500">Track everything you have sent to KunThai.</p>
                </div>
              </div>

              {loading ? (
                <p className="rounded-[24px] bg-white p-5 text-sm font-bold text-slate-500 shadow-sm">Loading…</p>
              ) : !applications.length ? (
                <p className="rounded-[24px] border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500">
                  You have not applied yet. Choose a path above to begin.
                </p>
              ) : (
                <div className="space-y-4">
                  {drafts.length ? (
                    <div className="space-y-2">
                      <p className="px-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Drafts</p>
                      {drafts.map((item) => <ApplicationRow key={item.id} application={item} onOpen={openApplication} />)}
                    </div>
                  ) : null}
                  {openApplications.length ? (
                    <div className="space-y-2">
                      <p className="px-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">In review</p>
                      {openApplications.map((item) => <ApplicationRow key={item.id} application={item} onOpen={openApplication} />)}
                    </div>
                  ) : null}
                  {closedApplications.length ? (
                    <div className="space-y-2">
                      <p className="px-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Closed</p>
                      {closedApplications.map((item) => <ApplicationRow key={item.id} application={item} onOpen={openApplication} />)}
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
