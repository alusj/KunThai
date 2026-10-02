import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, ChevronDown, Copy, LoaderCircle, MessageSquarePlus, RefreshCw, X } from "lucide-react";
import {
  ENFORCEMENT_STATUS,
  HISTORY_ACTION_LABELS,
  TARGET_TYPES,
  availableEnforcementActions,
  businessKindLabel,
  canNotifyOwner,
  canWriteNotes,
  reasonLabel,
  targetLabel,
} from "../../operationsConfig";
import { addInternalNote, getDirectoryDetail } from "../../operationsService";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";
import EnforcementDialog from "./EnforcementDialog";
import NotifyOwnerDialog from "./NotifyOwnerDialog";
import { EmptyState, ErrorState, KeyValue, PrimaryButton, StatusBadge, textareaClass } from "./OpsPrimitives";
import { formatDate, formatDateTimeShort, titleize } from "./opsUtils";

function recordOf(targetType, detail) {
  if (!detail) return {};
  if (targetType === "marketplace_business") return detail.business || {};
  if (targetType === "transport_operator") return detail.operator || {};
  return detail.company || {};
}


function ActionsMenu({ access, targetType, status, onAction, onNotify }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const actions = availableEnforcementActions(access, targetType, status);
  const notify = canNotifyOwner(access, targetType);
  useEffect(() => {
    if (!open) return undefined;
    function close(event) { if (!ref.current?.contains(event.target)) setOpen(false); }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  if (!actions.length && !notify) return null;
  const toneText = { amber: "text-amber-800", orange: "text-orange-700", red: "text-red-700", emerald: "text-emerald-700" };
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-950 px-3 text-xs font-black text-white hover:bg-zinc-800">
        Actions <ChevronDown size={14} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-xl">
          {notify ? (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onNotify(); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-bold text-zinc-800 hover:bg-zinc-50">
              <BellRing size={15} /> Send notification
            </button>
          ) : null}
          {notify && actions.length ? <div className="my-1 border-t border-zinc-100" /> : null}
          {actions.map((action) => (
            <button key={action.key} type="button" role="menuitem" onClick={() => { setOpen(false); onAction(action.key); }} className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-bold hover:bg-zinc-50 ${toneText[action.tone] || "text-zinc-800"}`}>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-zinc-200 px-3 py-2">
          <p className="text-lg font-black text-zinc-950">{Number(value || 0).toLocaleString()}</p>
          <p className="text-[11px] font-bold text-zinc-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

function OwnerCard({ owner }) {
  if (!owner) return null;
  return (
    <section className="rounded-lg border border-zinc-200 p-4">
      <p className="text-[11px] font-black uppercase tracking-wide text-zinc-400">Owner</p>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2">
        <KeyValue label="Name">{owner.name}</KeyValue>
        <KeyValue label="KunThai ID">{owner.publicId}</KeyValue>
        <KeyValue label="Email">{owner.email}</KeyValue>
        <KeyValue label="Phone">{owner.phone}</KeyValue>
        <KeyValue label="Joined">{formatDate(owner.joinedAt)}</KeyValue>
        <KeyValue label="Last sign-in">{formatDateTimeShort(owner.lastSignInAt)}</KeyValue>
        <KeyValue label="Account status">{titleize(owner.accountStatus)}</KeyValue>
      </dl>
    </section>
  );
}

function SimpleTable({ columns, rows, empty }) {
  if (!rows?.length) return <EmptyState title={empty} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead className="bg-zinc-50 text-[11px] font-black uppercase tracking-wide text-zinc-500">
          <tr>{columns.map((column) => <th key={column.key} className="px-3 py-2">{column.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((column) => <td key={column.key} className="px-3 py-2 font-semibold text-zinc-800">{column.render ? column.render(row) : row[column.key] ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewTab({ targetType, detail }) {
  const record = recordOf(targetType, detail);
  if (targetType === "marketplace_business") {
    const stats = detail.stats || {};
    return (
      <div className="space-y-4">
        <StatGrid items={[["Products", stats.products], ["Active products", stats.activeProducts], ["Orders", stats.orders], ["Orders (30 days)", stats.orders30d], ["Bookings", stats.bookings], ["Menu items", stats.menuItems], ["Property listings", stats.propertyListings], ["Reviews", stats.reviews]]} />
        <section className="rounded-lg border border-zinc-200 p-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <KeyValue label="Business ID">{record.public_business_id || record.id}</KeyValue>
            <KeyValue label="Type">{businessKindLabel(record.business_kind)}</KeyValue>
            <KeyValue label="Location">{[record.city, record.country].filter(Boolean).join(", ")}</KeyValue>
            <KeyValue label="Verification">{titleize(record.verification_status || "pending")}</KeyValue>
            <KeyValue label="Phone">{record.phone}</KeyValue>
            <KeyValue label="Email">{record.email}</KeyValue>
            <KeyValue label="Created">{formatDate(record.created_at)}</KeyValue>
            <KeyValue label="Last updated">{formatDateTimeShort(record.updated_at)}</KeyValue>
            <KeyValue label="Delegated admins">{String(stats.admins ?? 0)}</KeyValue>
          </dl>
          {record.description ? <p className="mt-3 text-sm font-medium leading-6 text-zinc-600">{record.description}</p> : null}
        </section>
        <OwnerCard owner={detail.owner} />
      </div>
    );
  }
  if (targetType === "transport_operator") {
    const stats = detail.stats || {};
    return (
      <div className="space-y-4">
        <StatGrid items={[["Vehicles", detail.fleets?.length], ["Trips", stats.trips], ["Completed", stats.completedTrips], ["Trips (30 days)", stats.trips30d]]} />
        <section className="rounded-lg border border-zinc-200 p-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <KeyValue label="Operator code">{record.operator_code}</KeyValue>
            <KeyValue label="Phone">{record.phone}</KeyValue>
            <KeyValue label="Location">{[record.city, record.country || record.country_iso].filter(Boolean).join(", ")}</KeyValue>
            <KeyValue label="Verification">{titleize(record.verification_status || "pending")}</KeyValue>
            <KeyValue label="Registration">{titleize(record.account_status || "draft")}</KeyValue>
            <KeyValue label="Registered">{formatDate(record.created_at)}</KeyValue>
          </dl>
        </section>
        <section>
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">Vehicles</p>
          <SimpleTable
            empty="No vehicles registered"
            rows={detail.fleets}
            columns={[
              { key: "name", label: "Vehicle", render: (row) => <span>{row.name}<span className="block text-[11px] text-zinc-500">{row.vehicle || row.plate}</span></span> },
              { key: "fleetType", label: "Type", render: (row) => titleize(row.fleetType) },
              { key: "service", label: "Service", render: (row) => titleize(row.service) },
              { key: "company", label: "Company", render: (row) => row.company || "Solo" },
              { key: "activeStatus", label: "Status", render: (row) => titleize(row.activeStatus) },
            ]}
          />
        </section>
        {detail.documents?.length ? (
          <section>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">Documents</p>
            <SimpleTable rows={detail.documents} empty="No documents" columns={[
              { key: "type", label: "Document", render: (row) => titleize(row.type) },
              { key: "status", label: "Status", render: (row) => titleize(row.status) },
              { key: "uploadedAt", label: "Uploaded", render: (row) => formatDate(row.uploadedAt) },
            ]} />
          </section>
        ) : null}
        <OwnerCard owner={detail.owner} />
      </div>
    );
  }
  const stats = detail.stats || {};
  return (
    <div className="space-y-4">
      <StatGrid items={[["Operators", stats.operators], ["Vehicles", stats.fleets], ["Trips", stats.trips], ["Trips (30 days)", stats.trips30d]]} />
      <section className="rounded-lg border border-zinc-200 p-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <KeyValue label="Company ID">{record.company_code}</KeyValue>
          <KeyValue label="Type">{record.company_type}</KeyValue>
          <KeyValue label="Registration no.">{record.registration_number}</KeyValue>
          <KeyValue label="Location">{[record.city, record.country].filter(Boolean).join(", ")}</KeyValue>
          <KeyValue label="Services">{(stats.services || []).map(titleize).join(", ")}</KeyValue>
          <KeyValue label="Verification">{titleize(record.verification_status || "pending")}</KeyValue>
          <KeyValue label="Registration">{titleize(record.account_status || "draft")}</KeyValue>
          <KeyValue label="Created">{formatDate(record.created_at)}</KeyValue>
        </dl>
      </section>
      <section>
        <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">Operators</p>
        <SimpleTable rows={detail.operators} empty="No operators yet" columns={[
          { key: "name", label: "Operator", render: (row) => <span>{row.name}<span className="block text-[11px] text-zinc-500">{row.code}</span></span> },
          { key: "fleets", label: "Vehicles" },
          { key: "enforcementStatus", label: "Status", render: (row) => <StatusBadge tone={ENFORCEMENT_STATUS[row.enforcementStatus]?.tone}>{ENFORCEMENT_STATUS[row.enforcementStatus]?.label || "Active"}</StatusBadge> },
        ]} />
      </section>
      <OwnerCard owner={detail.owner} />
    </div>
  );
}

function ActivityTab({ targetType, detail }) {
  if (targetType === "marketplace_business") {
    return (
      <div className="space-y-5">
        <section>
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">Recent products</p>
          <SimpleTable rows={detail.listings} empty="No products" columns={[
            { key: "name", label: "Product" },
            { key: "status", label: "Status", render: (row) => titleize(row.status) },
            { key: "price", label: "Price", render: (row) => (row.price ? `${row.currency || ""} ${row.price}`.trim() : "—") },
            { key: "createdAt", label: "Added", render: (row) => formatDate(row.createdAt) },
          ]} />
        </section>
        <section>
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">Recent orders</p>
          <SimpleTable rows={detail.orders} empty="No orders" columns={[
            { key: "id", label: "Order", render: (row) => String(row.id).slice(0, 8) },
            { key: "status", label: "Status", render: (row) => titleize(row.status) },
            { key: "total", label: "Total", render: (row) => (row.total ? `${row.currency || ""} ${row.total}`.trim() : "—") },
            { key: "createdAt", label: "Placed", render: (row) => formatDateTimeShort(row.createdAt) },
          ]} />
        </section>
        <section>
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">Seller cases and reports</p>
          <SimpleTable rows={detail.reports} empty="No reports" columns={[
            { key: "status", label: "Status", render: (row) => titleize(row.status || row.case_status || "open") },
            { key: "type", label: "Type", render: (row) => titleize(row.case_type || row.type || row.category || "case") },
            { key: "created_at", label: "Opened", render: (row) => formatDate(row.created_at) },
          ]} />
        </section>
      </div>
    );
  }
  return (
    <section>
      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">Recent trips</p>
      <SimpleTable rows={detail.recentTrips} empty="No trips yet" columns={[
        { key: "status", label: "Status", render: (row) => titleize(row.status) },
        { key: "route", label: "Route", render: (row) => <span className="line-clamp-2">{[row.pickup, row.destination].filter(Boolean).join(" → ") || "—"}</span> },
        { key: "fare", label: "Fare", render: (row) => (row.fare ? `${row.currency || ""} ${row.fare}`.trim() : "—") },
        { key: "createdAt", label: "Requested", render: (row) => formatDateTimeShort(row.createdAt) },
      ]} />
    </section>
  );
}

function EnforcementTab({ governance }) {
  const history = governance?.history || [];
  if (!history.length) return <EmptyState title="No enforcement history" detail="Warnings, restrictions, suspensions and restorations will appear here permanently." />;
  return (
    <ol className="space-y-3">
      {history.map((item) => (
        <li key={item.id} className="rounded-lg border border-zinc-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={item.action === "restoration" ? "emerald" : item.action === "warning" ? "amber" : item.action === "restriction" ? "orange" : "red"}>{HISTORY_ACTION_LABELS[item.action] || item.action}</StatusBadge>
            <span className="text-xs font-bold text-zinc-600">{reasonLabel(item.reasonCode)}</span>
            <span className="ml-auto text-[11px] font-semibold text-zinc-400">{formatDateTimeShort(item.createdAt)} · {item.performedBy}</span>
          </div>
          {item.capabilities?.length ? <p className="mt-2 text-xs font-semibold text-zinc-600">Paused: {item.capabilities.map(titleize).join(", ")}</p> : null}
          {item.endsAt ? <p className="mt-1 text-xs font-semibold text-zinc-600">Until {formatDateTimeShort(item.endsAt)}</p> : null}
          <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-5 text-zinc-800">{item.publicMessage}</p>
          {item.internalNote ? <p className="mt-2 rounded-md bg-zinc-50 px-2 py-1.5 text-xs font-semibold text-zinc-600"><span className="font-black">Internal:</span> {item.internalNote}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function NotesTab({ governance, canWrite, onAdd }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add() {
    if (body.trim().length < 3) return;
    setBusy(true); setError("");
    try { await onAdd(body.trim()); setBody(""); } catch (nextError) { setError(inlineErrorMessage(nextError, "The note could not be saved.")); } finally { setBusy(false); }
  }
  const notes = governance?.notes || [];
  return (
    <div className="space-y-3">
      {canWrite ? (
        <div className="rounded-lg border border-zinc-200 p-3">
          <textarea rows={3} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add an internal note. Staff only, never shown to the owner." className={textareaClass} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-zinc-400">Notes are permanent and cannot be edited.</p>
            <PrimaryButton busy={busy} disabled={body.trim().length < 3} onClick={add}><MessageSquarePlus size={15} /> Add note</PrimaryButton>
          </div>
          {error ? <p role="alert" className="mt-2 text-xs font-bold text-red-700">{error}</p> : null}
        </div>
      ) : null}
      {notes.length ? notes.map((note) => (
        <article key={note.id} className="rounded-lg border border-zinc-200 p-3">
          <p className="whitespace-pre-wrap text-sm font-medium leading-5 text-zinc-800">{note.body}</p>
          <p className="mt-2 text-[11px] font-semibold text-zinc-400">{note.author} · {formatDateTimeShort(note.createdAt)}</p>
        </article>
      )) : <EmptyState title="No internal notes" />}
    </div>
  );
}

function NoticesTab({ governance }) {
  const notices = governance?.notices || [];
  if (!notices.length) return <EmptyState title="No notices sent" detail="Direct notifications sent to the owner from this console appear here." />;
  return (
    <ol className="space-y-3">
      {notices.map((notice) => (
        <li key={notice.id} className="rounded-lg border border-zinc-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-zinc-900">{notice.title}</p>
            {notice.priority !== "normal" ? <StatusBadge tone={notice.priority === "urgent" ? "red" : "amber"}>{titleize(notice.priority)}</StatusBadge> : null}
            <StatusBadge tone={notice.readAt ? "emerald" : "zinc"}>{notice.readAt ? "Read" : "Unread"}</StatusBadge>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-5 text-zinc-600">{notice.body}</p>
          <p className="mt-2 text-[11px] font-semibold text-zinc-400">{notice.sentBy} · {formatDateTimeShort(notice.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}

function AuditTab({ governance }) {
  const entries = governance?.audit || [];
  if (!entries.length) return <EmptyState title="No admin actions recorded" />;
  return (
    <ol className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-sm font-black text-zinc-900">{titleize(String(entry.actionKey || "").replaceAll(".", " "))}</span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-500">{entry.reason}</span>
          <span className="text-[11px] font-semibold text-zinc-400">{entry.actor} · {formatDateTimeShort(entry.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "enforcement", label: "Enforcement" },
  { key: "notes", label: "Notes" },
  { key: "notices", label: "Notices" },
  { key: "audit", label: "Audit" },
];

export default function DirectoryDrawer({ targetType, id, access, onClose, onChanged, initialDialog = null, initialLabel = "" }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState(initialDialog); // { kind: "enforce", action } | { kind: "notify" }
  const [flash, setFlash] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      setDetail(await getDirectoryDetail(targetType, id));
    } catch (nextError) {
      setError(inlineErrorMessage(nextError, "This record could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [id, targetType]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    function onKey(event) { if (event.key === "Escape" && !dialog) onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog, onClose]);

  const record = recordOf(targetType, detail);
  const label = detail ? targetLabel(targetType, record) : initialLabel || targetLabel(targetType, record);
  const status = detail?.governance?.status || "active";
  const statusMeta = ENFORCEMENT_STATUS[status] || ENFORCEMENT_STATUS.active;
  const state = detail?.governance?.state;

  async function afterChange(message) {
    setDialog(null);
    setFlash(message);
    window.setTimeout(() => setFlash(""), 4000);
    await load(true);
    onChanged?.();
  }

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-zinc-950/45" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-white shadow-2xl" aria-label={`${TARGET_TYPES[targetType]?.noun} details`}>
        <header className="border-b border-zinc-200 px-4 py-3 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">{TARGET_TYPES[targetType]?.title}</p>
              <h2 className="mt-0.5 truncate text-lg font-black text-zinc-950">{loading && !detail ? "Loading…" : label}</h2>
              {detail ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
                  {state?.ends_at ? <span className="text-[11px] font-semibold text-zinc-500">until {formatDateTimeShort(state.ends_at)}</span> : null}
                  <button type="button" onClick={() => navigator.clipboard?.writeText(id)} className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-zinc-700" title="Copy internal ID"><Copy size={12} /> {String(id).slice(0, 8)}</button>
                </div>
              ) : null}
            </div>
            {detail ? (
              <ActionsMenu
                access={access}
                targetType={targetType}
                status={status}
                onAction={(action) => setDialog({ kind: "enforce", action })}
                onNotify={() => setDialog({ kind: "notify" })}
              />
            ) : null}
            <button type="button" aria-label="Refresh" onClick={() => load(true)} className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><RefreshCw size={16} /></button>
            <button type="button" aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
          </div>
          {state && status !== "active" ? (
            <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-xs font-semibold leading-5 text-orange-900">
              <span className="font-black">{reasonLabel(state.reason_code)}:</span> {state.public_message}
              {state.capabilities?.length && state.status === "restricted" ? ` · Paused: ${state.capabilities.map(titleize).join(", ")}` : ""}
            </p>
          ) : null}
          <nav className="-mb-3 mt-3 flex gap-1 overflow-x-auto" aria-label="Sections">
            {TABS.map((item) => (
              <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-black ${tab === item.key ? "border-emerald-700 text-emerald-800" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}>
                {item.label}
                {item.key === "enforcement" && detail?.governance?.history?.length ? <span className="ml-1 text-zinc-400">{detail.governance.history.length}</span> : null}
                {item.key === "notes" && detail?.governance?.notes?.length ? <span className="ml-1 text-zinc-400">{detail.governance.notes.length}</span> : null}
              </button>
            ))}
          </nav>
        </header>

        {flash ? <p role="status" className="mx-4 mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 sm:mx-6">{flash}</p> : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {loading && !detail ? (
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-500"><LoaderCircle className="animate-spin" size={16} /> Loading details…</div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => load()} />
          ) : detail ? (
            tab === "overview" ? <OverviewTab targetType={targetType} detail={detail} />
              : tab === "activity" ? <ActivityTab targetType={targetType} detail={detail} />
                : tab === "enforcement" ? <EnforcementTab governance={detail.governance} />
                  : tab === "notes" ? (
                    <NotesTab
                      governance={detail.governance}
                      canWrite={canWriteNotes(access, targetType)}
                      onAdd={async (body) => { await addInternalNote(targetType, id, body); await afterChange("Note added."); }}
                    />
                  )
                    : tab === "notices" ? <NoticesTab governance={detail.governance} />
                      : <AuditTab governance={detail.governance} />
          ) : null}
        </div>
      </aside>

      {dialog?.kind === "enforce" ? (
        <EnforcementDialog
          targetType={targetType}
          target={{ id, label }}
          action={dialog.action}
          onClose={() => setDialog(null)}
          onDone={() => afterChange("Decision applied. The owner has been notified.")}
        />
      ) : null}
      {dialog?.kind === "notify" ? (
        <NotifyOwnerDialog
          targetType={targetType}
          target={{ id, label, ownerName: detail?.owner?.name }}
          onClose={() => setDialog(null)}
          onDone={() => afterChange("Notice sent.")}
        />
      ) : null}
    </div>
  );
}
