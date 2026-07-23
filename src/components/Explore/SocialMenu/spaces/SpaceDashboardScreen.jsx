import { useEffect, useRef, useState } from "react";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineBellAlert,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocument,
  HiOutlineEllipsisHorizontal,
  HiOutlineEye,
  HiOutlinePauseCircle,
  HiOutlinePencilSquare,
  HiOutlinePlayCircle,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUserMinus,
  HiOutlineUsers,
} from "react-icons/hi2";

import {
  SPACE_RESPONSIBILITIES,
  SPACE_ROLES,
  deleteExploreSpace,
  fetchExploreSpaceDepartments,
  fetchExploreSpaceMembers,
  inviteExploreSpaceMember,
  leaveExploreSpace,
  normalizeSpaceResponsibilities,
  removeExploreSpaceMember,
  updateExploreSpaceMember,
  updateExploreSpaceStatus,
} from "../../../../Backend/services/exploreService";
import { useExploreFollowStats } from "../../../../Backend/hooks/useExploreFollowStats";
import { resolvePublicCode, detectPublicCodeKind } from "../../../../Backend/services/publicCodeService";
import { showToast } from "../../../../Backend/services/toastService";
import Avatar from "../../shared/Avatar";
import EmptyState from "../../shared/EmptyState";

const INVITE_INITIAL = {
  kunthaiId: "",
  role: "moderator",
  departmentId: "",
  responsibilities: normalizeSpaceResponsibilities({}, "moderator"),
};

function canManageTeam(space = {}) {
  return space.memberRole === "owner" || space.memberRole === "administrator" || Boolean(space.responsibilities?.canManageTeam);
}

export default function SpaceDashboardScreen({
  onOpenMessages,
  onOpenNotifications,
  onOpenEdit,
  onOpenProfile,
  onSpaceRemoved,
  onSpaceUpdated,
  onSwitchProfile,
  personalProfile,
  space,
}) {
  const [members, setMembers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [actionOpen, setActionOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState(INVITE_INITIAL);
  const [savingInvite, setSavingInvite] = useState(false);
  const [inviteLookup, setInviteLookup] = useState({ status: "idle", name: "", message: "" });
  const [busyAction, setBusyAction] = useState("");
  const menuRef = useRef(null);
  const manageTeam = canManageTeam(space);
  const canEditSpace = space?.responsibilities?.canEditSpace || space?.memberRole === "owner" || space?.memberRole === "administrator";
  const canChangeStatus = space?.memberRole === "owner" || space?.memberRole === "administrator";
  const isOwner = space?.memberRole === "owner" || space?.ownerUserId === personalProfile?.userId;
  const { stats } = useExploreFollowStats(space || "");

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!space?.spaceId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [memberRows, departmentRows] = await Promise.all([
          fetchExploreSpaceMembers(space.spaceId),
          fetchExploreSpaceDepartments(space.spaceId),
        ]);
        if (alive) {
          setMembers(memberRows);
          setDepartments(departmentRows);
        }
      } catch (error) {
        if (alive) setFeedback(error.message || "Unable to load Space team.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [space?.spaceId]);

  useEffect(() => {
    if (!actionOpen) return undefined;
    function close(event) {
      if (!menuRef.current?.contains(event.target)) setActionOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [actionOpen]);

  function getSpaceUrl() {
    const url = new URL(window.location.href);
    url.hash = `space-${space?.spaceId || space?.username || "space"}`;
    return url.toString();
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }

  async function runSpaceAction(actionKey, action) {
    if (busyAction) return;
    setBusyAction(actionKey);
    setActionOpen(false);
    setFeedback("");
    try {
      await action();
    } catch (error) {
      if (error?.name === "AbortError") return;
      const message = error.message || "Unable to complete this Space action.";
      setFeedback(message);
      showToast(message, "danger");
    } finally {
      setBusyAction("");
    }
  }

  async function shareSpace() {
    const url = getSpaceUrl();
    const shareData = {
      title: `${space.displayName || "Space"} on KunThai`,
      text: space.bio || `Connect with @${space.username || "space"} on KunThai Explore`,
      url,
    };

    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await writeClipboard(url);
    showToast("Space link copied.", "success");
  }

  async function copySpaceLink() {
    await writeClipboard(getSpaceUrl());
    showToast("Space link copied.", "success");
  }

  async function copySpaceHandle() {
    await writeClipboard(space.username ? `@${space.username}` : space.displayName || "Space");
    showToast("Space handle copied.", "success");
  }

  async function toggleSpaceStatus() {
    const nextStatus = space.status === "paused" ? "active" : "paused";
    const updated = await updateExploreSpaceStatus(space.spaceId, nextStatus);
    onSpaceUpdated?.(updated);
    showToast(nextStatus === "paused" ? "Space paused." : "Space reactivated.", "success");
  }

  async function leaveSpace() {
    const confirmed = window.confirm(`Leave ${space.displayName || "this Space"}? You will lose access to its dashboard until you are invited again.`);
    if (!confirmed) return;
    await leaveExploreSpace(space.spaceId);
    onSpaceRemoved?.(space);
    showToast("You left the Space.", "success");
  }

  async function deleteSpace() {
    const confirmed = window.confirm(`Delete ${space.displayName || "this Space"}? It will be removed from discovery and team dashboards.`);
    if (!confirmed) return;
    await deleteExploreSpace(space.spaceId);
    onSpaceRemoved?.(space);
    showToast("Space deleted.", "success");
  }

  function setInviteRole(role) {
    setInvite((current) => ({
      ...current,
      role,
      responsibilities: normalizeSpaceResponsibilities(current.responsibilities, role),
    }));
  }

  function toggleInviteResponsibility(key) {
    setInvite((current) => ({
      ...current,
      responsibilities: {
        ...current.responsibilities,
        [key]: !current.responsibilities[key],
      },
    }));
  }

  // Live KunThai ID detection before sending the Space invitation.
  useEffect(() => {
    const code = String(invite.kunthaiId || "").trim();
    if (!code) {
      setInviteLookup({ status: "idle", name: "", message: "" });
      return undefined;
    }
    if (detectPublicCodeKind(code) !== "kunthai") {
      setInviteLookup({ status: "invalid", name: "", message: "Enter a KunThai ID that starts with KTU." });
      return undefined;
    }

    let alive = true;
    setInviteLookup({ status: "checking", name: "", message: "Checking this KunThai ID..." });
    const timer = window.setTimeout(async () => {
      try {
        const result = await resolvePublicCode(code);
        if (!alive) return;
        if (result?.userId) {
          setInviteLookup({ status: "found", name: result.title || "KunThai member", message: "" });
        } else {
          setInviteLookup({ status: "notFound", name: "", message: "No KunThai account matches this ID." });
        }
      } catch {
        if (alive) setInviteLookup({ status: "notFound", name: "", message: "Unable to check this ID right now." });
      }
    }, 450);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [invite.kunthaiId]);

  async function submitInvite(event) {
    event.preventDefault();
    if (!space?.spaceId || savingInvite) return;
    setSavingInvite(true);
    setFeedback("");
    try {
      const created = await inviteExploreSpaceMember(space.spaceId, invite);
      setMembers((current) => [created, ...current.filter((member) => member.id !== created.id)]);
      setInvite(INVITE_INITIAL);
      setInviteOpen(false);
      showToast("Space team invitation sent.", "success");
    } catch (error) {
      setFeedback(error.message || "Unable to invite this member.");
      showToast(error.message || "Unable to invite this member.", "danger");
    } finally {
      setSavingInvite(false);
    }
  }

  async function updateMember(member, patch) {
    try {
      const updated = await updateExploreSpaceMember(member.id, {
        ...patch,
        currentRole: member.role,
      });
      setMembers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      showToast("Team member updated.", "success");
    } catch (error) {
      showToast(error.message || "Unable to update this member.", "danger");
    }
  }

  async function removeMember(member) {
    try {
      const removed = await removeExploreSpaceMember(member.id);
      setMembers((current) => current.filter((item) => item.id !== removed.id));
      showToast("Team member removed.", "success");
    } catch (error) {
      showToast(error.message || "Unable to remove this member.", "danger");
    }
  }

  if (!space?.spaceId) {
    return <EmptyState title="No Space selected" message="Choose a Space from your profile to open its dashboard." />;
  }

  return (
    <div className="w-full space-y-4 px-4 py-4 sm:px-6 lg:px-8">
      <section className="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={personalProfile?.displayName} src={personalProfile?.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{personalProfile?.displayName || "Your profile"}</p>
            <p className="truncate text-xs font-bold text-slate-500">Personal profile minimized while this Space is active</p>
          </div>
        </div>
        <button type="button" onClick={() => onSwitchProfile?.()} className="h-10 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
          Switch back
        </button>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={space.displayName} src={space.avatarUrl} size="lg" />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Space dashboard</p>
              <h2 className="mt-1 truncate text-2xl font-black text-slate-950">{space.displayName}</h2>
              <p className="mt-1 truncate text-sm font-bold text-slate-500">@{space.username || "space"} · {space.categoryLabel || "A Space"} · {space.memberRole || "member"}</p>
            </div>
          </div>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setActionOpen((current) => !current)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-700"
              aria-label="Open Space dashboard actions"
            >
              <HiOutlineEllipsisHorizontal />
            </button>
            {actionOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-sm font-black shadow-xl">
                <ActionMenuButton icon={HiOutlineEye} label="View Space profile" onClick={() => { setActionOpen(false); onOpenProfile?.(); }} />
                <ActionMenuButton icon={HiOutlineChatBubbleLeftRight} label="Messages" onClick={() => { setActionOpen(false); onOpenMessages?.(); }} />
                <ActionMenuButton icon={HiOutlineBellAlert} label="Notifications" onClick={() => { setActionOpen(false); onOpenNotifications?.(); }} />
                <MenuDivider />
                <ActionMenuButton icon={HiOutlineArrowTopRightOnSquare} label="Share Space" onClick={() => runSpaceAction("share", shareSpace)} disabled={Boolean(busyAction)} />
                <ActionMenuButton icon={HiOutlineClipboardDocument} label="Copy Space link" onClick={() => runSpaceAction("copy-link", copySpaceLink)} disabled={Boolean(busyAction)} />
                <ActionMenuButton icon={HiOutlineClipboardDocument} label="Copy @handle" onClick={() => runSpaceAction("copy-handle", copySpaceHandle)} disabled={Boolean(busyAction)} />
                {manageTeam ? (
                  <>
                    <MenuDivider />
                    <ActionMenuButton icon={HiOutlinePlus} label="Add team member" onClick={() => { setInviteOpen(true); setActionOpen(false); }} />
                  </>
                ) : null}
                {canEditSpace ? (
                  <ActionMenuButton icon={HiOutlinePencilSquare} label="Edit Space" onClick={() => { setActionOpen(false); onOpenEdit?.(); }} />
                ) : null}
                {canChangeStatus ? (
                  <ActionMenuButton
                    icon={space.status === "paused" ? HiOutlinePlayCircle : HiOutlinePauseCircle}
                    label={space.status === "paused" ? "Reactivate Space" : "Pause Space"}
                    onClick={() => runSpaceAction("status", toggleSpaceStatus)}
                    disabled={Boolean(busyAction)}
                  />
                ) : null}
                {!isOwner ? (
                  <>
                    <MenuDivider />
                    <ActionMenuButton icon={HiOutlineArrowRightOnRectangle} label="Leave Space" onClick={() => runSpaceAction("leave", leaveSpace)} tone="danger" disabled={Boolean(busyAction)} />
                  </>
                ) : null}
                {isOwner ? (
                  <>
                    <MenuDivider />
                    <ActionMenuButton icon={HiOutlineTrash} label="Delete Space" onClick={() => runSpaceAction("delete", deleteSpace)} tone="danger" disabled={Boolean(busyAction)} />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Feed" value={stats?.feed || 0} />
          <Metric label="Swip" value={stats?.swip || 0} />
          <Metric label="Connections" value={stats?.followers || 0} />
          <Metric label="Team" value={members.filter((member) => member.status === "active").length} />
        </div>

        {feedback && !inviteOpen ? <p className="mt-4 text-sm font-bold text-rose-600">{feedback}</p> : null}
      </section>

      {inviteOpen ? (
        <form onSubmit={submitInvite} className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Team invitation</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">Add team member</h3>
            </div>
            <button type="button" onClick={() => setInviteOpen(false)} className="h-10 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700">
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Field label="KunThai ID">
              <input value={invite.kunthaiId} onChange={(event) => setInvite((current) => ({ ...current, kunthaiId: event.target.value }))} placeholder="KTU-..." className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200" />
              {inviteLookup.status === "found" ? (
                <p className="mt-1.5 text-xs font-black text-emerald-600">✓ {inviteLookup.name}</p>
              ) : inviteLookup.status === "checking" ? (
                <p className="mt-1.5 text-xs font-bold text-slate-500">{inviteLookup.message}</p>
              ) : inviteLookup.message ? (
                <p className="mt-1.5 text-xs font-bold text-rose-600">{inviteLookup.message}</p>
              ) : null}
            </Field>
            <Field label="Role">
              <select value={invite.role} onChange={(event) => setInviteRole(event.target.value)} className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none">
                {SPACE_ROLES.filter((role) => role.id !== "owner").map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
              </select>
            </Field>
            <Field label="Department">
              <select value={invite.departmentId} onChange={(event) => setInvite((current) => ({ ...current, departmentId: event.target.value }))} className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none">
                <option value="">No department</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </Field>
          </div>

          <ResponsibilityGrid values={invite.responsibilities} onToggle={toggleInviteResponsibility} />

          {feedback ? <p className="mt-3 text-sm font-bold text-rose-600">{feedback}</p> : null}
          <button type="submit" disabled={savingInvite || inviteLookup.status !== "found"} className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white disabled:bg-slate-300">
            {savingInvite ? "Sending invitation" : "Send invitation"}
          </button>
        </form>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineUsers /></span>
          <div>
            <h3 className="text-lg font-black text-slate-950">Team</h3>
            <p className="text-sm font-semibold text-slate-500">Members and their assigned responsibilities.</p>
          </div>
        </div>

        {loading ? <p className="text-sm font-bold text-slate-500">Loading team...</p> : null}
        {!loading && !members.length ? <EmptyState title="No team members yet" message="Invite trusted people with their KunThai ID." /> : null}
        <div className="space-y-3">
          {members.map((member) => (
            <MemberRow key={member.id} canManage={manageTeam} member={member} onRemove={removeMember} onUpdate={updateMember} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-slate-100" />;
}

function ActionMenuButton({ disabled = false, icon: Icon, label, onClick, tone = "default" }) {
  const toneClass = tone === "danger"
    ? "text-rose-700 hover:bg-rose-50 disabled:text-rose-300"
    : "text-slate-700 hover:bg-slate-100 disabled:text-slate-300";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition disabled:cursor-not-allowed ${toneClass}`}
    >
      <Icon className="text-lg" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3 text-center">
      <p className="text-xl font-black text-slate-950">{Number(value || 0)}</p>
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
    </div>
  );
}

function Field({ children, label }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ResponsibilityGrid({ onToggle, values }) {
  return (
    <div className="mt-4 grid gap-2 md:grid-cols-2">
      {SPACE_RESPONSIBILITIES.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onToggle(item.key)}
          className={`rounded-2xl border px-3 py-3 text-left ${values[item.key] ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}
        >
          <span className="block text-sm font-black">{item.label}</span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{item.description}</span>
        </button>
      ))}
    </div>
  );
}

function MemberRow({ canManage, member, onRemove, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    role: member.role,
    responsibilities: member.responsibilities,
  }));

  useEffect(() => {
    setDraft({ role: member.role, responsibilities: member.responsibilities });
  }, [member.role, member.responsibilities]);

  function toggle(key) {
    setDraft((current) => ({
      ...current,
      responsibilities: {
        ...current.responsibilities,
        [key]: !current.responsibilities[key],
      },
    }));
  }

  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={member.memberName} src={member.memberAvatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{member.memberName}</p>
            <p className="truncate text-xs font-bold text-slate-500">{member.memberCode || member.memberUsername || member.userId} · {member.status}</p>
          </div>
        </div>
        {canManage && member.role !== "owner" ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing((current) => !current)} className="h-10 rounded-2xl bg-white px-3 text-xs font-black text-slate-700">
              {editing ? "Close" : "Edit"}
            </button>
            <button type="button" onClick={() => onRemove(member)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-700" aria-label="Remove team member">
              <HiOutlineUserMinus />
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-4">
          <Field label="Role">
            <select
              value={draft.role}
              onChange={(event) => {
                const role = event.target.value;
                setDraft((current) => ({
                  ...current,
                  role,
                  responsibilities: normalizeSpaceResponsibilities(current.responsibilities, role),
                }));
              }}
              className="h-12 w-full rounded-2xl bg-white px-4 text-sm font-bold text-slate-900 outline-none"
            >
              {SPACE_ROLES.filter((role) => role.id !== "owner").map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
            </select>
          </Field>
          <ResponsibilityGrid values={draft.responsibilities} onToggle={toggle} />
          <button type="button" onClick={() => { onUpdate(member, draft); setEditing(false); }} className="mt-4 h-11 w-full rounded-2xl bg-slate-950 text-sm font-black text-white">
            Save responsibilities
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {SPACE_RESPONSIBILITIES.filter((item) => member.responsibilities[item.key]).map((item) => (
            <span key={item.key} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-600">{item.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
