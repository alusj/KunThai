import { useEffect, useRef, useState } from "react";
import { friendlyErrorMessage } from "../../../../Backend/services/friendlyErrorService";

import { decorateShareUrl } from "../../../../Backend/services/visibilityCreditService";
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
import KunThaiIdHelpButton from "../../../shared/KunThaiIdHelpButton";
import { t as i18nText } from "../../../../i18n/index";

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
  const [inviteLookup, setInviteLookup] = useState({ status: i18nText("ui.literals.k1adbcc344b31"), name: "", message: "" });
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
        if (alive) setFeedback(error.message || i18nText("ui.literals.k69ebed906fb7"));
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
      const message = friendlyErrorMessage(error, "Unable to complete this Space action.");
      setFeedback(message);
      showToast(message, "danger");
    } finally {
      setBusyAction("");
    }
  }

  async function shareSpace() {
    const url = await decorateShareUrl(getSpaceUrl());
    const shareData = {
      title: i18nText("ui.literals.k383a4e679b44", { value0: space.displayName || "Space" }),
      text: space.bio || `Connect with @${space.username || "space"} on KunThai Explore`,
      url,
    };

    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await writeClipboard(url);
    showToast(i18nText("ui.literals.k7590b20d3a81"), "success");
  }

  async function copySpaceLink() {
    await writeClipboard(await decorateShareUrl(getSpaceUrl()));
    showToast(i18nText("ui.literals.k7590b20d3a81"), "success");
  }

  async function copySpaceHandle() {
    await writeClipboard(space.username ? `@${space.username}` : space.displayName || "Space");
    showToast(i18nText("ui.literals.kbbb4a1bda5cb"), "success");
  }

  async function toggleSpaceStatus() {
    const nextStatus = space.status === "paused" ? "active" : "paused";
    const updated = await updateExploreSpaceStatus(space.spaceId, nextStatus);
    onSpaceUpdated?.(updated);
    showToast(nextStatus === "paused" ? i18nText("ui.literals.k453afb3387cc") : i18nText("ui.literals.kfff27083fbb3"), "success");
  }

  async function leaveSpace() {
    const confirmed = window.confirm(i18nText("ui.literals.k1b61aa6f825c", { value0: space.displayName || "this Space" }));
    if (!confirmed) return;
    await leaveExploreSpace(space.spaceId);
    onSpaceRemoved?.(space);
    showToast(i18nText("ui.literals.kd3a45d03936f"), "success");
  }

  async function deleteSpace() {
    const confirmed = window.confirm(i18nText("ui.literals.kd730fa14b309", { value0: space.displayName || "this Space" }));
    if (!confirmed) return;
    await deleteExploreSpace(space.spaceId);
    onSpaceRemoved?.(space);
    showToast(i18nText("ui.literals.k44e1941bbb1d"), "success");
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
      setInviteLookup({ status: i18nText("ui.literals.k1adbcc344b31"), name: "", message: "" });
      return undefined;
    }
    if (detectPublicCodeKind(code) !== "kunthai") {
      setInviteLookup({ status: i18nText("ui.literals.k81f344a7686a"), name: "", message: i18nText("ui.literals.kf9f1334b2e12") });
      return undefined;
    }

    let alive = true;
    setInviteLookup({ status: i18nText("ui.literals.k28cfb479fbfa"), name: "", message: i18nText("ui.literals.kbb7beca612f9") });
    const timer = window.setTimeout(async () => {
      try {
        const result = await resolvePublicCode(code);
        if (!alive) return;
        if (result?.userId) {
          setInviteLookup({ status: i18nText("ui.literals.k2739bb260ce4"), name: result.title || "KunThai member", message: "" });
        } else {
          setInviteLookup({ status: "notFound", name: "", message: i18nText("ui.literals.k5cbfe2afa764") });
        }
      } catch {
        if (alive) setInviteLookup({ status: "notFound", name: "", message: i18nText("ui.literals.kb50907521924") });
      }
    }, 320);

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
      showToast(i18nText("ui.literals.k8891f9f7e891"), "success");
    } catch (error) {
      setFeedback(error.message || i18nText("ui.literals.k077d6829745d"));
      showToast(error.message || i18nText("ui.literals.k077d6829745d"), "danger");
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
      showToast(i18nText("ui.literals.k07fed9d9b325"), "success");
    } catch (error) {
      showToast(error.message || i18nText("ui.literals.ke599ffc2a9ed"), "danger");
    }
  }

  async function removeMember(member) {
    try {
      const removed = await removeExploreSpaceMember(member.id);
      setMembers((current) => current.filter((item) => item.id !== removed.id));
      showToast(i18nText("ui.literals.k58c478a9139e"), "success");
    } catch (error) {
      showToast(error.message || i18nText("ui.literals.k91824074dedf"), "danger");
    }
  }

  if (!space?.spaceId) {
    return <EmptyState title={i18nText("ui.literals.k36c742c56be4")} message={i18nText("ui.literals.k6d2cc3e947cb")} />;
  }

  return (
    <div className="w-full space-y-4 px-4 py-4 sm:px-6 lg:px-8">
      <section className="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={personalProfile?.displayName} src={personalProfile?.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{personalProfile?.displayName || i18nText("ui.literals.kc1c9cbe6993c")}</p>
            <p className="truncate text-xs font-bold text-slate-500">{i18nText("ui.literals.k4a600015c2e1")}</p>
          </div>
        </div>
        <button type="button" onClick={() => onSwitchProfile?.()} className="h-10 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
          {i18nText("ui.literals.kc480264d9d16")}
        </button>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={space.displayName} src={space.avatarUrl} size="lg" />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.k8e816a3bc9ca")}</p>
              <h2 className="mt-1 truncate text-2xl font-black text-slate-950">{space.displayName}</h2>
              <p className="mt-1 truncate text-sm font-bold text-slate-500">@{space.username || i18nText("ui.literals.k0803df4ff165")} · {space.categoryLabel || i18nText("ui.literals.k85da38276a71")} · {space.memberRole || i18nText("ui.literals.k6467baa3b187")}</p>
            </div>
          </div>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setActionOpen((current) => !current)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-700"
              aria-label={i18nText("ui.literals.k41ee3ef1eb6d")}
            >
              <HiOutlineEllipsisHorizontal />
            </button>
            {actionOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-sm font-black shadow-xl">
                <ActionMenuButton icon={HiOutlineEye} label={i18nText("ui.literals.k9bac7cd4522b")} onClick={() => { setActionOpen(false); onOpenProfile?.(); }} />
                <ActionMenuButton icon={HiOutlineChatBubbleLeftRight} label={i18nText("ui.literals.kf1702b468627")} onClick={() => { setActionOpen(false); onOpenMessages?.(); }} />
                <ActionMenuButton icon={HiOutlineBellAlert} label={i18nText("ui.literals.k753a22b2eb61")} onClick={() => { setActionOpen(false); onOpenNotifications?.(); }} />
                <MenuDivider />
                <ActionMenuButton icon={HiOutlineArrowTopRightOnSquare} label={i18nText("ui.literals.kc1b1acd75d2a")} onClick={() => runSpaceAction("share", shareSpace)} disabled={Boolean(busyAction)} />
                <ActionMenuButton icon={HiOutlineClipboardDocument} label={i18nText("ui.literals.k87f6b3e56531")} onClick={() => runSpaceAction("copy-link", copySpaceLink)} disabled={Boolean(busyAction)} />
                <ActionMenuButton icon={HiOutlineClipboardDocument} label={i18nText("ui.literals.kf52fae16aaff")} onClick={() => runSpaceAction("copy-handle", copySpaceHandle)} disabled={Boolean(busyAction)} />
                {manageTeam ? (
                  <>
                    <MenuDivider />
                    <ActionMenuButton icon={HiOutlinePlus} label={i18nText("ui.literals.kdcdef30768ba")} onClick={() => { setInviteOpen(true); setActionOpen(false); }} />
                  </>
                ) : null}
                {canEditSpace ? (
                  <ActionMenuButton icon={HiOutlinePencilSquare} label={i18nText("ui.literals.kd4ba413cc57e")} onClick={() => { setActionOpen(false); onOpenEdit?.(); }} />
                ) : null}
                {canChangeStatus ? (
                  <ActionMenuButton
                    icon={space.status === "paused" ? HiOutlinePlayCircle : HiOutlinePauseCircle}
                    label={space.status === "paused" ? i18nText("ui.literals.kd1c123937ea2") : i18nText("ui.literals.kb4745cbe8974")}
                    onClick={() => runSpaceAction("status", toggleSpaceStatus)}
                    disabled={Boolean(busyAction)}
                  />
                ) : null}
                {!isOwner ? (
                  <>
                    <MenuDivider />
                    <ActionMenuButton icon={HiOutlineArrowRightOnRectangle} label={i18nText("ui.literals.k0754220ef676")} onClick={() => runSpaceAction("leave", leaveSpace)} tone="danger" disabled={Boolean(busyAction)} />
                  </>
                ) : null}
                {isOwner ? (
                  <>
                    <MenuDivider />
                    <ActionMenuButton icon={HiOutlineTrash} label={i18nText("ui.literals.k365b660df399")} onClick={() => runSpaceAction("delete", deleteSpace)} tone="danger" disabled={Boolean(busyAction)} />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label={i18nText("ui.literals.kff1928e5d29b")} value={stats?.feed || 0} />
          <Metric label="Swip" value={stats?.swip || 0} />
          <Metric label={i18nText("ui.literals.k8f3509b64e0e")} value={stats?.followers || 0} />
          <Metric label={i18nText("ui.literals.k218887269ad5")} value={members.filter((member) => member.status === "active").length} />
        </div>

        {feedback && !inviteOpen ? <p className="mt-4 text-sm font-bold text-rose-600">{feedback}</p> : null}
      </section>

      {inviteOpen ? (
        <form onSubmit={submitInvite} className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.kea6339dfe385")}</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">{i18nText("ui.literals.kdcdef30768ba")}</h3>
            </div>
            <button type="button" onClick={() => setInviteOpen(false)} className="h-10 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700">
              {i18nText("ui.literals.kbbfa773e5a63")}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Field label="KunThai ID" action={<KunThaiIdHelpButton subject="team member" tone="sky" />}>
              <input value={invite.kunthaiId} onChange={(event) => setInvite((current) => ({ ...current, kunthaiId: event.target.value.toUpperCase() }))} placeholder="KTU-XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label={i18nText("ui.literals.k77243a6fff0d")} className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold uppercase tracking-wide text-slate-900 outline-none transition focus:bg-white focus:ring-4 focus:ring-sky-100" />
              {inviteLookup.status === "found" ? (
                <p aria-live="polite" className="kt-modal-enter mt-1.5 text-xs font-black text-emerald-600">✓ {inviteLookup.name}</p>
              ) : inviteLookup.status === "checking" ? (
                <p aria-live="polite" className="kt-modal-enter mt-1.5 text-xs font-bold text-slate-500">{inviteLookup.message}</p>
              ) : inviteLookup.message ? (
                <p aria-live="polite" className="kt-modal-enter mt-1.5 text-xs font-bold text-rose-600">{inviteLookup.message}</p>
              ) : null}
            </Field>
            <Field label={i18nText("ui.literals.kc3f104d13657")}>
              <select value={invite.role} onChange={(event) => setInviteRole(event.target.value)} className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none">
                {SPACE_ROLES.filter((role) => role.id !== "owner").map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
              </select>
            </Field>
            <Field label={i18nText("ui.literals.kdb40106a4051")}>
              <select value={invite.departmentId} onChange={(event) => setInvite((current) => ({ ...current, departmentId: event.target.value }))} className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none">
                <option value="">{i18nText("ui.literals.k71b96c4a6c1e")}</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </Field>
          </div>

          <ResponsibilityGrid values={invite.responsibilities} onToggle={toggleInviteResponsibility} />

          {feedback ? <p className="mt-3 text-sm font-bold text-rose-600">{feedback}</p> : null}
          <button type="submit" disabled={savingInvite || inviteLookup.status !== "found"} className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white disabled:bg-slate-300">
            {savingInvite ? i18nText("ui.literals.k69b0298ac2e1") : i18nText("ui.literals.kabb6cb2d460a")}
          </button>
        </form>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineUsers /></span>
          <div>
            <h3 className="text-lg font-black text-slate-950">{i18nText("ui.literals.k218887269ad5")}</h3>
            <p className="text-sm font-semibold text-slate-500">{i18nText("ui.literals.kfe80d7fc2c05")}</p>
          </div>
        </div>

        {loading ? <p className="text-sm font-bold text-slate-500">{i18nText("ui.literals.kd5e4b7e1dc4e")}</p> : null}
        {!loading && !members.length ? <EmptyState title={i18nText("ui.literals.k19c467e9da23")} message={i18nText("ui.literals.k1237e9277750")} /> : null}
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

function Field({ action = null, children, label }) {
  if (!action) {
    return (
      <label className="block">
        <span className="mb-2 block min-h-8 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
        {children}
      </label>
    );
  }

  return (
    <div className="block">
      <span className="mb-2 flex min-h-8 items-center justify-between gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
        {action}
      </span>
      {children}
    </div>
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
              {editing ? i18nText("ui.literals.kbbfa773e5a63") : i18nText("ui.literals.k5301648dcf6b")}
            </button>
            <button type="button" onClick={() => onRemove(member)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-700" aria-label={i18nText("ui.literals.k3ebbe90bf87b")}>
              <HiOutlineUserMinus />
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-4">
          <Field label={i18nText("ui.literals.kc3f104d13657")}>
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
            {i18nText("ui.literals.k3ba77987ef9c")}
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
