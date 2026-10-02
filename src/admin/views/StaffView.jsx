import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, Search, ShieldCheck, UserMinus, UserPlus, UsersRound, X } from "lucide-react";
import { ADMIN_ROLES, ADMIN_SECTORS, titleCase } from "../adminConfig";
import { grantAdminAccess, revokeAdminAccess } from "../adminService";
import {
  STAFF_DEPARTMENTS,
  STAFF_LEVELS,
  STAFF_STATUS,
  assignableStaffLevels,
  canManageStaffMember,
  departmentLabel,
} from "../operationsConfig";
import { getStaffActivity, listStaff, setStaffStatus, updateStaffProfile } from "../operationsService";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";
import { EmptyState, ErrorState, FieldLabel, KeyValue, LoadingRows, OpsDialog, PrimaryButton, SecondaryButton, StatusBadge, inputClass, textareaClass } from "../components/ops/OpsPrimitives";
import { formatDate, formatDateTimeShort, titleize } from "../components/ops/opsUtils";

function relativeActive(value) {
  if (!value) return "Never";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 5) return "Online now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function LevelLadder({ staff }) {
  const counts = useMemo(() => staff.reduce((map, member) => ({ ...map, [member.level_key]: (map[member.level_key] || 0) + 1 }), {}), [staff]);
  return (
    <section className="mb-5 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Career ladder</p>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {STAFF_LEVELS.map((level) => (
          <li key={level.key} className="rounded-lg border border-zinc-200 px-3 py-2">
            <p className="text-[10px] font-black uppercase text-zinc-400">L{level.rank}</p>
            <p className="text-sm font-black text-zinc-950">{level.name}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">{counts[level.key] || 0} staff · authority ≤ {level.maxAuthority}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs font-medium leading-5 text-zinc-500">
        A role decides <span className="font-black text-zinc-700">what</span> someone can work on. Their level caps <span className="font-black text-zinc-700">how far</span> they can go: restrictions need authority 2, temporary suspensions 3, indefinite suspensions 4. Nobody can change their own access or promote someone to their own level.
      </p>
    </section>
  );
}

function AddStaffDialog({ access, onClose, onDone }) {
  const currentRank = Math.max(...(access.roles || []).map((role) => role.rank || 0), 0);
  const isSuper = access.roles?.some((role) => role.key === "super_admin");
  const roles = ADMIN_ROLES.filter((role) => isSuper || role.rank < currentRank);
  const [form, setForm] = useState({ email: "", roleKey: roles.find((role) => role.key === "support_officer")?.key || roles[roles.length - 1]?.key || "", sectors: ["all"], authority: 2, expiresAt: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!form.email.includes("@")) { setError("Enter the email of their KunThai account."); return; }
    if (form.reason.trim().length < 5) { setError("Give a reason of at least 5 characters."); return; }
    setBusy(true); setError("");
    try {
      await grantAdminAccess({ ...form, regions: ["all"], responsibilities: [], expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null, reason: form.reason.trim() });
      onDone();
    } catch (nextError) {
      setError(inlineErrorMessage(nextError, "Access could not be granted."));
      setBusy(false);
    }
  }

  function toggleSector(value) {
    setForm((current) => {
      if (value === "all") return { ...current, sectors: ["all"] };
      const withoutAll = current.sectors.filter((item) => item !== "all");
      const sectors = withoutAll.includes(value) ? withoutAll.filter((item) => item !== value) : [...withoutAll, value];
      return { ...current, sectors: sectors.length ? sectors : ["all"] };
    });
  }

  return (
    <OpsDialog eyebrow="Staff" title="Add a staff member" onClose={onClose} busy={busy} footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton busy={busy} onClick={submit}><UserPlus size={15} /> Grant access</PrimaryButton></>}>
      <div className="space-y-4">
        <div><FieldLabel htmlFor="staff-email">KunThai account email</FieldLabel><input id="staff-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} /></div>
        <div>
          <FieldLabel htmlFor="staff-role">Role</FieldLabel>
          <select id="staff-role" value={form.roleKey} onChange={(event) => { const role = ADMIN_ROLES.find((item) => item.key === event.target.value); setForm((current) => ({ ...current, roleKey: event.target.value, authority: Math.min(role?.authority || current.authority, 5) })); }} className={inputClass}>
            {roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-zinc-800">Sectors</legend>
          <div className="grid grid-cols-2 gap-2">{ADMIN_SECTORS.map((sector) => <label key={sector.value} className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold"><input type="checkbox" checked={form.sectors.includes(sector.value)} onChange={() => toggleSector(sector.value)} className="accent-emerald-700" /> {sector.label}</label>)}</div>
        </fieldset>
        <div>
          <FieldLabel htmlFor="staff-authority" hint="Capped later by their level">Authority {form.authority}</FieldLabel>
          <input id="staff-authority" type="range" min="1" max="5" value={form.authority} onChange={(event) => setForm((current) => ({ ...current, authority: Number(event.target.value) }))} className="w-full accent-emerald-700" />
        </div>
        <div><FieldLabel htmlFor="staff-expires" hint="Optional">Access expires</FieldLabel><input id="staff-expires" type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} className={inputClass} /></div>
        <div><FieldLabel htmlFor="staff-reason">Reason</FieldLabel><textarea id="staff-reason" rows={3} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className={textareaClass} /></div>
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold leading-5 text-sky-900">They start at the level that matches this authority. Open their profile afterwards to set their level, department and title.</p>
        {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      </div>
    </OpsDialog>
  );
}

function StaffDrawer({ member, access, currentUserId, staff, onClose, onChanged }) {
  const manageable = canManageStaffMember(access, member, currentUserId);
  const levels = assignableStaffLevels(access);
  const [profile, setProfile] = useState({ levelKey: member.level_key, department: member.department, jobTitle: member.job_title || "", managerUserId: member.manager_user_id || "", reason: "" });
  const [statusForm, setStatusForm] = useState({ status: member.status === "active" ? "restricted" : "active", reason: "", until: "" });
  const [activity, setActivity] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  useEffect(() => {
    let active = true;
    getStaffActivity(member.user_id, 60).then((rows) => { if (active) setActivity(rows); }).catch(() => { if (active) setActivity([]); });
    return () => { active = false; };
  }, [member.user_id]);

  async function run(key, task, message) {
    setBusy(key); setError("");
    try { await task(); setFlash(message); onChanged(); } catch (nextError) { setError(inlineErrorMessage(nextError, "That change could not be saved.")); } finally { setBusy(""); }
  }

  const status = STAFF_STATUS[member.status] || STAFF_STATUS.active;
  const levelOptions = levels.some((level) => level.key === member.level_key) ? levels : [STAFF_LEVELS.find((level) => level.key === member.level_key), ...levels].filter(Boolean);

  return (
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-zinc-950/45" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="flex items-start gap-3 border-b border-zinc-200 px-5 py-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-zinc-100 text-base font-black text-zinc-700">{(member.display_name || "A").slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-black text-zinc-950">{member.display_name}</h2>
            <p className="truncate text-xs font-semibold text-zinc-500">{member.job_title || member.level_name} · {departmentLabel(member.department)}</p>
            <div className="mt-1.5 flex flex-wrap gap-2"><StatusBadge tone={status.tone}>{status.label}</StatusBadge><StatusBadge tone="sky">{member.level_name}</StatusBadge></div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {flash ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{flash}</p> : null}
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

          <section className="rounded-lg border border-zinc-200 p-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <KeyValue label="Staff ID">{member.staff_number}</KeyValue>
              <KeyValue label="KunThai ID">{member.public_id}</KeyValue>
              <KeyValue label="Email">{member.email}</KeyValue>
              <KeyValue label="Reports to">{member.manager_name}</KeyValue>
              <KeyValue label="Added">{`${formatDate(member.created_at)}${member.added_by_name ? ` by ${member.added_by_name}` : ""}`}</KeyValue>
              <KeyValue label="Last active">{member.last_active_at ? formatDateTimeShort(member.last_active_at) : "Never"}</KeyValue>
              <KeyValue label="Actions (30 days)">{String(member.actions_30d || 0)}</KeyValue>
              {member.status !== "active" ? <KeyValue label="Status reason">{member.status_reason}{member.status_until ? ` (until ${formatDateTimeShort(member.status_until)})` : ""}</KeyValue> : null}
            </dl>
          </section>

          <section>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">Roles and permissions</p>
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {(member.roles || []).map((role) => (
                <li key={role.assignmentId} className="flex items-center gap-3 px-3 py-2.5">
                  <ShieldCheck size={16} className={role.status === "active" ? "text-emerald-700" : "text-zinc-300"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-zinc-900">{role.name}</p>
                    <p className="text-[11px] font-semibold text-zinc-500">Authority {role.authorityLevel} · {(role.sectors || []).map((sector) => (sector === "marketplace" ? "UrMall" : titleCase(sector))).join(", ")}{role.expiresAt ? ` · expires ${formatDate(role.expiresAt)}` : ""}</p>
                  </div>
                  {role.status === "active" && manageable ? (
                    <button
                      type="button"
                      title="Revoke this role"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        const reason = window.prompt(`Reason for revoking ${role.name}?`);
                        if (reason?.trim().length >= 5) run(`revoke-${role.assignmentId}`, () => revokeAdminAccess(role.assignmentId, reason.trim()), `${role.name} revoked.`);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    >
                      <UserMinus size={15} />
                    </button>
                  ) : <span className="text-[11px] font-bold text-zinc-400">{titleize(role.status)}</span>}
                </li>
              ))}
            </ul>
          </section>

          {manageable ? (
            <section className="rounded-lg border border-zinc-200 p-4">
              <p className="text-sm font-black text-zinc-950">Level, department and title</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><FieldLabel htmlFor="sp-level">Level</FieldLabel><select id="sp-level" value={profile.levelKey} onChange={(event) => setProfile((current) => ({ ...current, levelKey: event.target.value }))} className={inputClass}>{levelOptions.map((level) => <option key={level.key} value={level.key}>L{level.rank} · {level.name}</option>)}</select></div>
                <div><FieldLabel htmlFor="sp-dept">Department</FieldLabel><select id="sp-dept" value={profile.department} onChange={(event) => setProfile((current) => ({ ...current, department: event.target.value }))} className={inputClass}>{STAFF_DEPARTMENTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></div>
                <div><FieldLabel htmlFor="sp-title" hint="Optional">Job title</FieldLabel><input id="sp-title" maxLength={80} value={profile.jobTitle} onChange={(event) => setProfile((current) => ({ ...current, jobTitle: event.target.value }))} placeholder="e.g. Trust & Safety Specialist" className={inputClass} /></div>
                <div><FieldLabel htmlFor="sp-manager" hint="Optional">Reports to</FieldLabel><select id="sp-manager" value={profile.managerUserId} onChange={(event) => setProfile((current) => ({ ...current, managerUserId: event.target.value }))} className={inputClass}><option value="">Nobody</option>{staff.filter((item) => item.user_id !== member.user_id).map((item) => <option key={item.user_id} value={item.user_id}>{item.display_name} ({item.level_name})</option>)}</select></div>
              </div>
              <div className="mt-3"><FieldLabel htmlFor="sp-reason">Reason for the change</FieldLabel><input id="sp-reason" value={profile.reason} onChange={(event) => setProfile((current) => ({ ...current, reason: event.target.value }))} placeholder="e.g. Promotion after Q3 review" className={inputClass} /></div>
              <div className="mt-3 flex justify-end">
                <PrimaryButton busy={busy === "profile"} disabled={profile.reason.trim().length < 5} onClick={() => run("profile", () => updateStaffProfile({ userId: member.user_id, ...profile, reason: profile.reason.trim() }), "Profile updated.")}>Save changes</PrimaryButton>
              </div>
            </section>
          ) : null}

          {manageable ? (
            <section className="rounded-lg border border-zinc-200 p-4">
              <p className="text-sm font-black text-zinc-950">Access status</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Object.entries(STAFF_STATUS).filter(([key]) => key !== member.status).map(([key, item]) => (
                  <label key={key} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${statusForm.status === key ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"}`}>
                    <input type="radio" name="staff-status" checked={statusForm.status === key} onChange={() => setStatusForm((current) => ({ ...current, status: key }))} className="mt-0.5 accent-zinc-900" />
                    <span><span className="block text-sm font-black text-zinc-900">{item.label}</span><span className="block text-[11px] font-medium text-zinc-500">{item.detail}</span></span>
                  </label>
                ))}
              </div>
              {statusForm.status === "restricted" || statusForm.status === "suspended" ? (
                <div className="mt-3"><FieldLabel htmlFor="ss-until" hint="Optional">Until</FieldLabel><input id="ss-until" type="datetime-local" value={statusForm.until} onChange={(event) => setStatusForm((current) => ({ ...current, until: event.target.value }))} className={inputClass} /></div>
              ) : null}
              <div className="mt-3"><FieldLabel htmlFor="ss-reason">Reason</FieldLabel><textarea id="ss-reason" rows={2} value={statusForm.reason} onChange={(event) => setStatusForm((current) => ({ ...current, reason: event.target.value }))} className={textareaClass} /></div>
              <div className="mt-3 flex justify-end">
                <PrimaryButton
                  tone={statusForm.status === "active" ? "emerald" : "red"}
                  busy={busy === "status"}
                  disabled={statusForm.reason.trim().length < 5}
                  onClick={() => {
                    if (statusForm.status !== "active" && !window.confirm(`${STAFF_STATUS[statusForm.status].label}: ${member.display_name}? ${STAFF_STATUS[statusForm.status].detail}`)) return;
                    run("status", () => setStaffStatus({ userId: member.user_id, status: statusForm.status, reason: statusForm.reason.trim(), until: statusForm.until ? new Date(statusForm.until).toISOString() : null }), "Status changed.");
                  }}
                >
                  Set to {STAFF_STATUS[statusForm.status]?.label}
                </PrimaryButton>
              </div>
            </section>
          ) : (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-500">
              {member.user_id === currentUserId ? "This is you. Nobody can change their own access." : "You can view this profile. Changes need team management access and a higher level than theirs."}
            </p>
          )}

          <section>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">Recent activity</p>
            {activity === null ? <div className="flex items-center gap-2 text-sm font-bold text-zinc-500"><LoaderCircle className="animate-spin" size={15} /> Loading…</div>
              : activity.length ? (
                <ol className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                  {activity.map((entry) => (
                    <li key={entry.id} className="px-3 py-2.5">
                      <p className="text-sm font-black text-zinc-900">{titleize(String(entry.action_key).replaceAll(".", " "))}</p>
                      <p className="text-[11px] font-semibold text-zinc-500">{[entry.reason, formatDateTimeShort(entry.created_at)].filter(Boolean).join(" · ")}</p>
                    </li>
                  ))}
                </ol>
              ) : <EmptyState title="No admin activity yet" />}
          </section>
        </div>
      </aside>
    </div>
  );
}

export default function StaffView({ access, user }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [adding, setAdding] = useState(false);
  const canAdd = access.permissions.includes("team.manage");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setStaff(await listStaff()); } catch (nextError) { setError(inlineErrorMessage(nextError, "Staff could not be loaded.")); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return staff.filter((member) => (!department || member.department === department)
      && (!status || member.status === status)
      && (!needle || [member.display_name, member.email, member.staff_number, member.public_id, member.job_title].some((value) => String(value || "").toLowerCase().includes(needle))));
  }, [department, search, staff, status]);
  const selected = staff.find((member) => member.user_id === selectedId);

  return (
    <>
      <header className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><UsersRound size={21} /></span>
          <div>
            <p className="text-xs font-black uppercase text-emerald-700">Access governance</p>
            <h1 className="mt-0.5 text-2xl font-black text-zinc-950 sm:text-3xl">Staff and roles</h1>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-zinc-600">Everyone with admin access, their level, department, roles, status and what they have done. Every change here is audited.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-black text-zinc-700 hover:bg-zinc-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
          {canAdd ? <button type="button" onClick={() => setAdding(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800"><UserPlus size={16} /> Add staff</button> : null}
        </div>
      </header>

      {staff.length ? <LevelLadder staff={staff} /> : null}

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-zinc-100 p-3 sm:flex-row">
          <label className="relative flex-1"><span className="sr-only">Search staff</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, staff ID or KunThai ID" className={`${inputClass} pl-9`} /></label>
          <select value={department} onChange={(event) => setDepartment(event.target.value)} className={`${inputClass} sm:w-52`}><option value="">All departments</option>{STAFF_DEPARTMENTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} sm:w-40`}><option value="">Any status</option>{Object.entries(STAFF_STATUS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select>
        </div>
        {error ? <ErrorState message={error} onRetry={load} />
          : loading && !staff.length ? <LoadingRows rows={5} />
            : !visible.length ? <EmptyState title="No staff match" />
              : (
                <ul className="divide-y divide-zinc-100">
                  {visible.map((member) => {
                    const memberStatus = STAFF_STATUS[member.status] || STAFF_STATUS.active;
                    return (
                      <li key={member.user_id}>
                        <button type="button" onClick={() => setSelectedId(member.user_id)} className="grid w-full gap-2 px-4 py-3 text-left hover:bg-zinc-50 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-sm font-black text-zinc-700">{(member.display_name || "A").slice(0, 1).toUpperCase()}</span>
                            <span className="min-w-0"><span className="block truncate text-sm font-black text-zinc-950">{member.display_name}{member.user_id === user?.id ? <span className="ml-1 text-[11px] font-bold text-zinc-400">(you)</span> : null}</span><span className="block truncate text-[11px] font-semibold text-zinc-500">{member.staff_number} · {member.email}</span></span>
                          </span>
                          <span className="min-w-0"><span className="block text-sm font-black text-zinc-800">L{member.level_rank} · {member.level_name}</span><span className="block truncate text-[11px] font-semibold text-zinc-500">{member.job_title || departmentLabel(member.department)}</span></span>
                          <span className="min-w-0 truncate text-xs font-semibold text-zinc-600">{(member.roles || []).filter((role) => role.status === "active").map((role) => role.name).join(", ") || "No active role"}</span>
                          <span className="flex items-center gap-3 md:justify-end"><StatusBadge tone={memberStatus.tone}>{memberStatus.label}</StatusBadge><span className="whitespace-nowrap text-[11px] font-semibold text-zinc-400">{relativeActive(member.last_active_at)}</span></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
      </section>

      {selected ? <StaffDrawer key={`${selected.user_id}-${selected.status}-${selected.level_key}`} member={selected} access={access} currentUserId={user?.id} staff={staff} onClose={() => setSelectedId("")} onChanged={load} /> : null}
      {adding ? <AddStaffDialog access={access} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} /> : null}
    </>
  );
}
