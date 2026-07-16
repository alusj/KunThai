import supabase from "../../lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "./errors";
import { SPACE_IDENTITY_TYPE, getIdentityKey } from "./identityService";
import { uploadMediaDataUrl } from "./mediaService";
import { resolvePublicCode } from "../publicCodeService";

export const SPACE_CATEGORIES = [
  { id: "business", label: "Business" },
  { id: "brand", label: "Brand" },
  { id: "organization", label: "Organization" },
  { id: "school", label: "School" },
  { id: "community", label: "Community" },
  { id: "ngo", label: "NGO" },
  { id: "government_agency", label: "Government Agency" },
  { id: "religious_organization", label: "Religious Organization" },
  { id: "sports_club", label: "Sports Club" },
  { id: "entertainment", label: "Entertainment" },
  { id: "personal_brand", label: "Personal Brand" },
  { id: "news_media", label: "News & Media" },
  { id: "event", label: "Event" },
];

export const SPACE_ROLES = [
  { id: "owner", label: "Owner" },
  { id: "administrator", label: "Administrator" },
  { id: "moderator", label: "Moderator" },
  { id: "editor", label: "Editor" },
  { id: "customer_support", label: "Customer Support" },
  { id: "analyst", label: "Analyst" },
];

export const SPACE_RESPONSIBILITIES = [
  { key: "canCreatePosts", label: "Create posts", description: "Publish Feed posts, adverts, and Swip videos as the Space." },
  { key: "canReplyComments", label: "Reply to comments", description: "Reply on posts and comment threads as the Space name." },
  { key: "canReplyMessages", label: "Reply to messages", description: "Answer Explore messages using the Space identity." },
  { key: "canManageTeam", label: "Manage team", description: "Invite members, update responsibilities, and remove team members." },
  { key: "canViewInsights", label: "View insights", description: "See Space activity, connections, and content performance counts." },
  { key: "canEditSpace", label: "Edit Space", description: "Update Space profile, contact details, avatar, and cover." },
];

const DEFAULT_DEPARTMENTS = [
  "Marketing",
  "Customer Care",
  "Moderation",
  "Finance",
  "Operations",
  "Events",
  "Media",
  "Security",
];

const ACTIVE_SPACE_KEY = "kunthai.explore.activeIdentity";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getCategoryLabel(category) {
  return SPACE_CATEGORIES.find((item) => item.id === category)?.label || "Space";
}

function getDefaultResponsibilities(role = "member") {
  const normalizedRole = String(role || "member").toLowerCase();
  const all = {
    canCreatePosts: true,
    canReplyComments: true,
    canReplyMessages: true,
    canManageTeam: true,
    canViewInsights: true,
    canEditSpace: true,
  };

  if (normalizedRole === "owner" || normalizedRole === "administrator") return all;
  if (normalizedRole === "editor") {
    return {
      canCreatePosts: true,
      canReplyComments: true,
      canReplyMessages: false,
      canManageTeam: false,
      canViewInsights: true,
      canEditSpace: false,
    };
  }
  if (normalizedRole === "moderator" || normalizedRole === "customer_support") {
    return {
      canCreatePosts: false,
      canReplyComments: true,
      canReplyMessages: true,
      canManageTeam: false,
      canViewInsights: true,
      canEditSpace: false,
    };
  }
  return {
    canCreatePosts: false,
    canReplyComments: false,
    canReplyMessages: false,
    canManageTeam: false,
    canViewInsights: true,
    canEditSpace: false,
  };
}

export function normalizeSpaceResponsibilities(value = {}, role = "member") {
  const defaults = getDefaultResponsibilities(role);
  const source = value && typeof value === "object" ? value : {};
  return SPACE_RESPONSIBILITIES.reduce((items, responsibility) => {
    items[responsibility.key] = source[responsibility.key] == null
      ? Boolean(defaults[responsibility.key])
      : Boolean(source[responsibility.key]);
    return items;
  }, {});
}

export function normalizeSpaceSlug(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeSpaceCategory(value = "") {
  const category = String(value || "").trim().toLowerCase();
  return SPACE_CATEGORIES.some((item) => item.id === category) ? category : "business";
}

function isUuid(value = "") {
  return UUID_PATTERN.test(String(value || ""));
}

function toSpaceProfile(row = {}, membership = {}, fallbackUserId = "") {
  const spaceId = row.id || membership.space_id || "";
  const role = membership.role || (row.owner_user_id === fallbackUserId ? "owner" : "");
  const membershipStatus = membership.status || (role ? "active" : "");
  const responsibilities = normalizeSpaceResponsibilities(membership.responsibilities || {}, role || "member");

  return {
    id: getIdentityKey(SPACE_IDENTITY_TYPE, spaceId),
    identityKey: getIdentityKey(SPACE_IDENTITY_TYPE, spaceId),
    identityType: SPACE_IDENTITY_TYPE,
    identityId: spaceId,
    actorType: SPACE_IDENTITY_TYPE,
    actorId: spaceId,
    spaceId,
    userId: fallbackUserId || row.owner_user_id || "",
    ownerUserId: row.owner_user_id || fallbackUserId || "",
    memberRole: role,
    membershipId: membership.id || "",
    membershipStatus,
    responsibilities,
    displayName: row.name || "Space",
    name: row.name || "Space",
    username: row.slug || "",
    email: row.contact_email || "",
    phone: row.phone || "",
    address: row.location || "",
    accountType: "space",
    category: row.category || "business",
    categoryLabel: getCategoryLabel(row.category),
    avatarUrl: row.avatar_url || "",
    avatar_url: row.avatar_url || "",
    coverUrl: row.cover_url || "preset:gradient",
    cover_url: row.cover_url || "preset:gradient",
    bio: row.bio || "",
    websiteUrl: row.website_url || "",
    verified: Boolean(row.verified),
    status: row.status || "active",
    settings: row.settings || {},
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    isSpace: true,
  };
}

async function getAuthUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  return user;
}

async function makeAvailableSpaceSlug(seed) {
  const base = normalizeSpaceSlug(seed) || `space-${Date.now().toString(36)}`;

  for (let index = 0; index < 20; index += 1) {
    const candidate = index ? `${base}-${index + 1}` : base;
    const { data, error } = await supabase
      .from("explore_spaces")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error)) {
        throw new Error("Spaces need the latest KunThai database update.");
      }
      if (isMissingColumn(error, "slug")) {
        throw new Error("Spaces need the latest KunThai database update.");
      }
      throw error;
    }

    if (!data) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

async function uploadSpaceImage(value, type, userId) {
  if (!String(value || "").startsWith("data:")) {
    return value || "";
  }

  return uploadMediaDataUrl(value, type, userId);
}

async function createDefaultDepartments(spaceId, userId) {
  if (!spaceId || !userId) return [];

  const rows = DEFAULT_DEPARTMENTS.map((name) => ({
    space_id: spaceId,
    name,
    created_by: userId,
  }));

  const { data, error } = await supabase
    .from("explore_space_departments")
    .insert(rows)
    .select("*");

  if (error) {
    if (isMissingTable(error)) return [];
    if (error.code === "23505") return [];
    throw error;
  }

  return data || [];
}

async function createSpaceTeamNotification(input = {}) {
  if (!input.user_id) return null;
  const payload = {
    user_id: input.user_id,
    actor_user_id: input.actor_user_id || null,
    actor_type: input.actor_type || "profile",
    actor_id: input.actor_id || null,
    actor_space_id: input.actor_space_id || null,
    actor_name: input.actor_name || "KunThai",
    actor_avatar_url: input.actor_avatar_url || "",
    type: input.type || "system",
    media_type: "space",
    message: input.message || "Space team update",
    priority: "normal",
    category: "system",
    read: false,
  };
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    // No RETURNING: the recipient owns SELECT on this row, so INSERT ...
    // RETURNING for another user fails RLS and the invite notification is
    // silently dropped.
    const { error } = await supabase.from("explore_notifications").insert(nextPayload);
    if (!error) return { id: `local-${Date.now()}`, created_at: new Date().toISOString(), ...nextPayload };
    const missingColumn = [
      "actor_user_id",
      "actor_type",
      "actor_id",
      "actor_space_id",
      "actor_avatar_url",
      "media_type",
      "message",
      "priority",
      "category",
    ].find((column) => isMissingColumn(error, column));
    if (!missingColumn) return null;
    const { [missingColumn]: _removed, ...fallbackPayload } = nextPayload;
    nextPayload = fallbackPayload;
  }

  return null;
}

export function readActiveExploreIdentity() {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVE_SPACE_KEY) || "{}");
    if (value?.type === SPACE_IDENTITY_TYPE && value?.id) {
      return { type: SPACE_IDENTITY_TYPE, id: value.id, key: getIdentityKey(SPACE_IDENTITY_TYPE, value.id) };
    }
  } catch {
    // Invalid persisted identity falls back to the personal profile.
  }

  return { type: "profile", id: "", key: "" };
}

export function writeActiveExploreIdentity(identity = {}) {
  try {
    const type = identity.type || identity.identityType || "profile";
    const id = identity.id || identity.identityId || identity.spaceId || "";
    if (type === SPACE_IDENTITY_TYPE && id) {
      localStorage.setItem(ACTIVE_SPACE_KEY, JSON.stringify({ type, id }));
      return;
    }

    localStorage.removeItem(ACTIVE_SPACE_KEY);
  } catch {
    // Local persistence is only a convenience.
  }
}

export async function createExploreSpace(input = {}) {
  const user = await getAuthUser();
  if (!user?.id) {
    throw new Error("Sign in before creating a Space.");
  }

  const name = String(input.name || "").trim();
  if (name.length < 2) {
    throw new Error("Add a real Space name.");
  }

  const slug = await makeAvailableSpaceSlug(input.slug || name);
  const avatarUrl = await uploadSpaceImage(input.avatarUrl || input.avatar_url || "", "profile", user.id);
  const coverUrl = await uploadSpaceImage(input.coverUrl || input.cover_url || "preset:gradient", "profile-cover", user.id);
  const payload = {
    owner_user_id: user.id,
    name,
    slug,
    category: normalizeSpaceCategory(input.category),
    bio: String(input.bio || "").trim(),
    avatar_url: avatarUrl,
    cover_url: coverUrl || "preset:gradient",
    contact_email: String(input.email || input.contactEmail || "").trim(),
    phone: String(input.phone || "").trim(),
    website_url: String(input.websiteUrl || input.website_url || "").trim(),
    location: String(input.location || input.address || "").trim(),
    status: "active",
    settings: input.settings && typeof input.settings === "object" ? input.settings : {},
  };

  const { data, error } = await supabase
    .from("explore_spaces")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (isMissingTable(error)) {
      throw new Error("Spaces need the latest KunThai database update.");
    }
    throw error;
  }

  await createDefaultDepartments(data.id, user.id).catch(() => []);

  return toSpaceProfile(data, { role: "owner", status: "active", space_id: data.id }, user.id);
}

function mapMemberRow(row = {}, profile = {}) {
  const role = row.role || "member";
  return {
    id: row.id || "",
    spaceId: row.space_id || "",
    userId: row.user_id || "",
    role,
    roleLabel: SPACE_ROLES.find((item) => item.id === role)?.label || "Member",
    status: row.status || "pending",
    departmentId: row.department_id || "",
    invitedBy: row.invited_by || "",
    memberName: row.member_name || profile.display_name || profile.full_name || "KunThai member",
    memberUsername: profile.username || "",
    memberAvatarUrl: profile.avatar_url || "",
    memberCode: row.member_code || "",
    responsibilities: normalizeSpaceResponsibilities(row.responsibilities || {}, role),
    createdAt: row.created_at || "",
    acceptedAt: row.accepted_at || "",
  };
}

export async function updateExploreSpace(spaceId, patch = {}) {
  const user = await getAuthUser();
  if (!user?.id || !spaceId) {
    throw new Error("Sign in before updating this Space.");
  }

  const current = await fetchExploreSpace(spaceId);
  if (!current?.spaceId) {
    throw new Error("Space could not be found.");
  }

  const payload = {};
  if (patch.name != null) payload.name = String(patch.name || "").trim();
  if (patch.slug != null) payload.slug = normalizeSpaceSlug(patch.slug);
  if (patch.category != null) payload.category = normalizeSpaceCategory(patch.category);
  if (patch.bio != null) payload.bio = String(patch.bio || "").trim();
  if (patch.email != null || patch.contactEmail != null) payload.contact_email = String(patch.email || patch.contactEmail || "").trim();
  if (patch.phone != null) payload.phone = String(patch.phone || "").trim();
  if (patch.websiteUrl != null || patch.website_url != null) payload.website_url = String(patch.websiteUrl || patch.website_url || "").trim();
  if (patch.location != null || patch.address != null) payload.location = String(patch.location || patch.address || "").trim();
  if (patch.avatarUrl != null || patch.avatar_url != null) {
    payload.avatar_url = await uploadSpaceImage(patch.avatarUrl || patch.avatar_url || "", "profile", user.id);
  }
  if (patch.coverUrl != null || patch.cover_url != null) {
    payload.cover_url = await uploadSpaceImage(patch.coverUrl || patch.cover_url || "preset:gradient", "profile-cover", user.id);
  }

  if (!Object.keys(payload).length) {
    return current;
  }

  const { data, error } = await supabase
    .from("explore_spaces")
    .update(payload)
    .eq("id", spaceId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? toSpaceProfile(data, { role: current.memberRole, status: "active", space_id: data.id }, user.id) : current;
}

export async function updateExploreSpaceStatus(spaceId, status = "active") {
  const user = await getAuthUser();
  if (!user?.id || !spaceId) {
    throw new Error("Sign in before updating this Space.");
  }

  const nextStatus = String(status || "").trim().toLowerCase();
  if (!["active", "paused"].includes(nextStatus)) {
    throw new Error("Choose a valid Space status.");
  }

  const current = await fetchExploreSpace(spaceId);
  if (!current?.spaceId) {
    throw new Error("Space could not be found.");
  }
  if (current.memberRole !== "owner" && current.memberRole !== "administrator") {
    throw new Error("Only a Space owner or administrator can change this status.");
  }

  const { data, error } = await supabase
    .from("explore_spaces")
    .update({ status: nextStatus })
    .eq("id", spaceId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? toSpaceProfile(data, { role: current.memberRole, status: "active", space_id: data.id, responsibilities: current.responsibilities }, user.id) : current;
}

export async function deleteExploreSpace(spaceId) {
  const user = await getAuthUser();
  if (!user?.id || !spaceId) {
    throw new Error("Sign in before deleting this Space.");
  }

  const current = await fetchExploreSpace(spaceId);
  if (!current?.spaceId) {
    throw new Error("Space could not be found.");
  }
  if (current.ownerUserId !== user.id && current.memberRole !== "owner") {
    throw new Error("Only the Space owner can delete this Space.");
  }

  const { data, error } = await supabase
    .from("explore_spaces")
    .update({ status: "deleted" })
    .eq("id", spaceId)
    .eq("owner_user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Space could not be deleted.");
  return toSpaceProfile(data, { role: "owner", status: "active", space_id: data.id }, user.id);
}

export async function fetchExploreSpace(spaceIdOrSlug) {
  const value = String(spaceIdOrSlug || "").trim();
  if (!value) return null;

  const user = await getAuthUser().catch(() => null);
  let query = supabase.from("explore_spaces").select("*").limit(1);
  query = isUuid(value) ? query.eq("id", value) : query.eq("slug", normalizeSpaceSlug(value));
  const { data, error } = await query.maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }

  if (!data) return null;

  let member = null;
  if (user?.id) {
    const { data: memberRow, error: memberError } = await supabase
      .from("explore_space_members")
      .select("id, role, status, department_id, space_id, responsibilities")
      .eq("space_id", data.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!memberError) {
      member = memberRow;
    }
  }

  return toSpaceProfile(data, member || {}, user?.id || data.owner_user_id || "");
}

export async function fetchMyExploreSpaces() {
  const user = await getAuthUser();
  if (!user?.id) return [];

  const { data: memberRows, error: memberError } = await supabase
    .from("explore_space_members")
    .select("id, space_id, role, status, department_id, responsibilities, updated_at, created_at")
    .eq("user_id", user.id)
    .in("status", ["active", "pending"])
    .order("updated_at", { ascending: false });

  if (memberError) {
    if (isMissingTable(memberError)) return [];
    throw memberError;
  }

  const memberships = memberRows || [];
  const spaceIds = memberships.map((item) => item.space_id).filter(Boolean);
  if (!spaceIds.length) return [];

  const { data: spaces, error: spacesError } = await supabase
    .from("explore_spaces")
    .select("*")
    .in("id", spaceIds)
    .neq("status", "deleted");

  if (spacesError) {
    if (isMissingTable(spacesError)) return [];
    throw spacesError;
  }

  const membershipBySpace = new Map(memberships.map((membership) => [membership.space_id, membership]));
  return (spaces || [])
    .map((space) => toSpaceProfile(space, membershipBySpace.get(space.id) || {}, user.id))
    .sort((first, second) => {
      const firstTime = Date.parse(membershipBySpace.get(first.spaceId)?.updated_at || first.updatedAt || "");
      const secondTime = Date.parse(membershipBySpace.get(second.spaceId)?.updated_at || second.updatedAt || "");
      return (Number.isFinite(secondTime) ? secondTime : 0) - (Number.isFinite(firstTime) ? firstTime : 0);
    });
}

export async function fetchExploreSpaceDepartments(spaceId) {
  if (!spaceId) return [];

  const { data, error } = await supabase
    .from("explore_space_departments")
    .select("*")
    .eq("space_id", spaceId)
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  return data || [];
}

export async function fetchExploreSpaceMembers(spaceId) {
  if (!spaceId) return [];

  const { data, error } = await supabase
    .from("explore_space_members")
    .select("id, space_id, user_id, role, status, department_id, responsibilities, invited_by, member_name, member_code, accepted_at, created_at")
    .eq("space_id", spaceId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  const rows = data || [];
  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
  let profilesByUserId = new Map();

  if (userIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from("explore_profiles")
      .select("user_id, display_name, username, avatar_url")
      .in("user_id", userIds);
    if (!profilesError) {
      profilesByUserId = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
    }
  }

  return rows.map((row) => mapMemberRow(row, profilesByUserId.get(row.user_id) || {}));
}

export async function inviteExploreSpaceMember(spaceId, input = {}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Sign in before inviting a Space team member.");
  if (!spaceId) throw new Error("Open a Space before adding a team member.");

  const kunthaiId = String(input.kunthaiId || input.kunThaiId || input.memberCode || "").trim();
  const resolved = await resolvePublicCode(kunthaiId);
  if (!resolved || resolved.kind !== "kunthai" || !resolved.userId) {
    throw new Error("No KunThai account matches this ID. Ask the person for the KTU code on their profile.");
  }
  if (resolved.userId === user.id) {
    throw new Error("You are already on this Space team.");
  }

  const role = SPACE_ROLES.some((item) => item.id === input.role) ? input.role : "moderator";
  const responsibilities = normalizeSpaceResponsibilities(input.responsibilities || {}, role);
  const payload = {
    space_id: spaceId,
    user_id: resolved.userId,
    role,
    department_id: input.departmentId || input.department_id || null,
    status: "pending",
    invited_by: user.id,
    responsibilities,
    member_name: resolved.title || "KunThai member",
    member_code: resolved.code || kunthaiId,
  };

  const { data, error } = await supabase
    .from("explore_space_members")
    .insert(payload)
    .select("id, space_id, user_id, role, status, department_id, responsibilities, invited_by, member_name, member_code, accepted_at, created_at")
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) throw new Error("Spaces need the latest KunThai database update.");
    if (isMissingColumn(error, "responsibilities")) throw new Error("Space team responsibilities need the latest database update.");
    if (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate")) {
      throw new Error("This person is already invited or already on this Space team.");
    }
    throw error;
  }

  const space = await fetchExploreSpace(spaceId).catch(() => null);
  createSpaceTeamNotification({
    user_id: resolved.userId,
    type: "system",
    actor_type: SPACE_IDENTITY_TYPE,
    actor_id: spaceId,
    actor_space_id: spaceId,
    actor_name: space?.displayName || "Space",
    actor_avatar_url: space?.avatarUrl || "",
    message: `${space?.displayName || "A Space"} invited you to join its Explore team. Open your profile to respond.`,
  }).catch(() => null);

  return mapMemberRow(data, { display_name: resolved.title || "KunThai member" });
}

export async function respondExploreSpaceInvite(spaceOrMembership, accept = true) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Sign in to respond to this Space invitation.");

  const membershipId = typeof spaceOrMembership === "string"
    ? spaceOrMembership
    : spaceOrMembership?.membershipId || spaceOrMembership?.id || "";
  if (!membershipId) throw new Error("This Space invitation could not be found.");

  const { data, error } = await supabase
    .from("explore_space_members")
    .update({
      status: accept ? "active" : "removed",
      accepted_at: accept ? new Date().toISOString() : null,
    })
    .eq("id", membershipId)
    .eq("user_id", user.id)
    .select("id, space_id, user_id, role, status, department_id, responsibilities, invited_by, member_name, member_code, accepted_at, created_at")
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) throw new Error("Spaces need the latest KunThai database update.");
    throw error;
  }
  if (!data) throw new Error("This Space invitation could not be updated.");
  if (!accept) return mapMemberRow(data);

  const space = await fetchExploreSpace(data.space_id);
  if (data.invited_by) {
    createSpaceTeamNotification({
      user_id: data.invited_by,
      type: "system",
      actor_name: data.member_name || "KunThai member",
      message: `${data.member_name || "A KunThai member"} accepted the invitation to join ${space?.displayName || "your Space"}.`,
    }).catch(() => null);
  }
  return space;
}

export async function updateExploreSpaceMember(memberId, patch = {}) {
  if (!memberId) throw new Error("Choose a team member to update.");
  const role = SPACE_ROLES.some((item) => item.id === patch.role) ? patch.role : null;
  const payload = {};
  if (role) payload.role = role;
  if (patch.departmentId !== undefined || patch.department_id !== undefined) {
    payload.department_id = patch.departmentId || patch.department_id || null;
  }
  if (patch.responsibilities) {
    payload.responsibilities = normalizeSpaceResponsibilities(patch.responsibilities, role || patch.currentRole || "member");
  }

  const { data, error } = await supabase
    .from("explore_space_members")
    .update(payload)
    .eq("id", memberId)
    .select("id, space_id, user_id, role, status, department_id, responsibilities, invited_by, member_name, member_code, accepted_at, created_at")
    .maybeSingle();

  if (error) throw error;
  return mapMemberRow(data || {});
}

export async function removeExploreSpaceMember(memberId) {
  if (!memberId) throw new Error("Choose a team member to remove.");
  const { data, error } = await supabase
    .from("explore_space_members")
    .update({ status: "removed" })
    .eq("id", memberId)
    .select("id, space_id, user_id, role, status, department_id, responsibilities, invited_by, member_name, member_code, accepted_at, created_at")
    .maybeSingle();

  if (error) throw error;
  return mapMemberRow(data || {});
}

export async function leaveExploreSpace(spaceId) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Sign in before leaving this Space.");
  if (!spaceId) throw new Error("Choose a Space to leave.");

  const current = await fetchExploreSpace(spaceId);
  if (!current?.spaceId) throw new Error("Space could not be found.");
  if (current.ownerUserId === user.id || current.memberRole === "owner") {
    throw new Error("The owner cannot leave their Space. Delete it or transfer ownership first.");
  }

  const { data, error } = await supabase
    .from("explore_space_members")
    .update({ status: "removed" })
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .select("id, space_id, user_id, role, status, department_id, responsibilities, invited_by, member_name, member_code, accepted_at, created_at")
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) throw new Error("Spaces need the latest KunThai database update.");
    throw error;
  }
  if (!data) throw new Error("Space membership could not be updated.");
  return mapMemberRow(data);
}

export async function fetchExploreSpacesForDiscovery(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 200));
  const { data, error } = await supabase
    .from("explore_spaces")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  let blockedSpaceIds = new Set();
  if (authData?.user?.id) {
    const { data: blocks, error: blockError } = await supabase
      .from("explore_identity_blocks")
      .select("target_space_id")
      .eq("blocker_user_id", authData.user.id)
      .eq("target_type", SPACE_IDENTITY_TYPE);

    if (blockError && !isMissingTable(blockError)) {
      throw blockError;
    }

    blockedSpaceIds = new Set((blocks || []).map((row) => row.target_space_id).filter(Boolean));
  }

  return (data || [])
    .filter((space) => !blockedSpaceIds.has(space.id))
    .map((space) => toSpaceProfile(space, {}, authData?.user?.id || ""));
}

export function isExploreSpaceProfile(profile = {}) {
  return profile.identityType === SPACE_IDENTITY_TYPE || Boolean(profile.spaceId || profile.isSpace);
}
