import supabase from "../../Backend/lib/supabaseClient";
import { getKunThaiPublicUserId, normalizeKunThaiPublicId } from "../../Backend/services/identityCodeService";
import { getOnboardingProfile } from "../../Backend/services/onboardingService";
import {
  getTransportUploadFile,
  getTransportUploadName,
  getTransportUploadUrl,
  toStoredTransportUpload,
  uploadTransportPublicImage,
  uploadTransportVerificationDocument,
} from "./transportPublicMediaService";
import { storeCountryContext } from "../../data/globalCountryProfiles";

const COMPANY_DRAFT_PREFIX = "kuntai.transport.companyDraft.";
const COMPANY_ACCOUNT_PREFIX = "kuntai.transport.companyAccount.";
const ACTIVE_COMPANY_PREFIX = "kuntai.transport.activeCompany.";
const COMPANY_INVITES_KEY = "kuntai.transport.companyInvites";
const COMPANY_EVENT = "kunthai-transport-company-updated";

export const COMPANY_OPERATOR_ROLES = {
  operator: {
    label: "Operator only",
    description: "Can access only their own operator dashboard and bookings.",
    permissions: {},
  },
  dispatcher: {
    label: "Dispatcher",
    description: "Can open Fleet HQ, view the waiting queue, and coordinate bookings.",
    permissions: {
      view_company_hq: true,
      view_all_bookings: true,
      dispatch_bookings: true,
      view_company_activity: true,
    },
  },
  fleet_manager: {
    label: "Fleet manager",
    description: "Can review fleets, operators, bookings, and company activity.",
    permissions: {
      view_company_hq: true,
      view_all_bookings: true,
      manage_fleets: true,
      view_company_activity: true,
    },
  },
  admin: {
    label: "Company admin",
    description: "Can manage operators, responsibilities, fleets, bookings, and activity.",
    permissions: {
      view_company_hq: true,
      view_all_bookings: true,
      manage_operators: true,
      manage_fleets: true,
      dispatch_bookings: true,
      view_company_activity: true,
    },
  },
};

function safeParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function safeSelectRows(query, fallback = []) {
  try {
    const { data, error } = await query;
    if (error) throw error;
    return data || fallback;
  } catch {
    return fallback;
  }
}

function compact(value = "") {
  return String(value).replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function scopedKey(prefix, userId) {
  return `${prefix}${userId}`;
}

function generateCode(prefix) {
  const random = typeof crypto !== "undefined" && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0xffffffff);
  return `${prefix}-${(random >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`;
}

export function createTransportCompanyFleetCode() {
  return generateCode("KTF");
}

function generateOperatorCode() {
  const random = typeof crypto !== "undefined" && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 90000);
  return String(10000 + (random % 90000));
}

function asUuid(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function buildKunThaiIdCandidates(value) {
  const raw = String(value || "").trim();
  const compactId = compact(raw);
  const normalized = normalizeKunThaiPublicId(raw);
  const normalizedCompact = compact(normalized);
  const body = compactId.startsWith("KTU") ? compactId.slice(3) : compactId;

  return uniqueValues([
    raw.toUpperCase(),
    normalized,
    compactId,
    normalizedCompact,
    body ? `KTU${body}` : "",
    body ? normalizeKunThaiPublicId(body) : "",
  ]);
}

function matchesLookupValue(value, possibleValues = []) {
  const targets = uniqueValues([value, normalizeKunThaiPublicId(value)]).map(compact).filter(Boolean);
  return possibleValues.some((possible) => targets.includes(compact(possible)));
}

function isMissingRpc(error) {
  const message = error?.message?.toLowerCase?.() || "";
  return error?.code === "42883" ||
    error?.code === "PGRST202" ||
    message.includes("could not find the function") ||
    message.includes("schema cache");
}

function isMissingColumn(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes(`'${columnName}' column`) ||
    message.includes(`column "${columnName}"`) ||
    (message.includes(columnName) && message.includes("schema cache"));
}

function isMissingTable(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    (message.includes("schema cache") && message.includes("could not find"));
}

async function updateSelectSingle(tableName, payload, match = {}, optionalColumns = []) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    let query = supabase.from(tableName).update(nextPayload);
    Object.entries(match).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
    const { data, error } = await query.select().maybeSingle();

    if (!error) return data;

    const missingColumn = optionalColumns.find((column) => nextPayload[column] !== undefined && isMissingColumn(error, column));
    if (!missingColumn) throw error;

    const { [missingColumn]: _removed, ...withoutMissingColumn } = nextPayload;
    nextPayload = withoutMissingColumn;
  }

  return null;
}

async function insertSelectSingle(tableName, payload, optionalColumns = []) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { data, error } = await supabase
      .from(tableName)
      .insert(nextPayload)
      .select()
      .maybeSingle();

    if (!error) return data;

    const missingColumn = optionalColumns.find((column) => nextPayload[column] !== undefined && isMissingColumn(error, column));
    if (!missingColumn) throw error;

    const { [missingColumn]: _removed, ...withoutMissingColumn } = nextPayload;
    nextPayload = withoutMissingColumn;
  }

  return null;
}

async function recordCompanyInviteActivity({ companyId, actorUserId, invite, activityType, title, body }) {
  const safeCompanyId = asUuid(companyId || invite?.companyId || invite?.company_id);
  if (!safeCompanyId) return null;

  return insertSelectSingle(
    "transport_company_activities",
    {
      company_id: safeCompanyId,
      actor_user_id: actorUserId || null,
      activity_type: activityType,
      title,
      body,
      metadata: {
        requestId: invite?.requestId || invite?.request_id || "",
        operatorId: invite?.operatorId || invite?.operator_id || "",
        operatorUserId: invite?.userId || invite?.operator_user_id || "",
        operatorPublicId: invite?.publicId || invite?.operator_public_id || invite?.lookupValue || "",
        operatorName: invite?.name || invite?.operator_name || "",
        fleetCode: invite?.fleetCode || invite?.fleet_code || "",
        fleetName: invite?.fleetName || invite?.fleet_name || "",
        status: invite?.status || "",
      },
    },
    ["actor_user_id", "activity_type", "body", "metadata"],
  ).catch((error) => {
    if (!isMissingTable(error)) throw error;
    return null;
  });
}

async function selectSingleByMatch(tableName, match = {}) {
  let query = supabase.from(tableName).select("*");
  Object.entries(match).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveSelectSingleByMatch(tableName, payload, match = {}, optionalColumns = []) {
  const existing = await selectSingleByMatch(tableName, match);
  if (existing?.id) {
    return updateSelectSingle(tableName, payload, { id: existing.id }, optionalColumns);
  }
  return insertSelectSingle(tableName, payload, optionalColumns);
}

function normalizeInviteStatusForDatabase(status = "pending", documents = {}) {
  if (status === "accepted_pending_documents" || documents?.operatorDocumentsRequired || documents?.registrationRequired) {
    return "accepted";
  }
  return ["pending", "accepted", "rejected", "cancelled", "revoked"].includes(status) ? status : "pending";
}

function isOperatorFacingInvite(invite = {}) {
  const status = String(invite.status || "").toLowerCase();
  return !["archived", "cancelled", "canceled", "declined", "rejected", "revoked"].includes(status);
}

function getAccountDisplayName(profile = {}, user = {}) {
  const metadata = user?.user_metadata || {};
  return profile.displayName ||
    profile.fullName ||
    profile.display_name ||
    profile.full_name ||
    metadata.display_name ||
    metadata.full_name ||
    metadata.name ||
    user?.email?.split("@")[0] ||
    "KunThai account";
}

async function getCurrentUser(message = "Sign in to manage a transport company.") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error(message);
  return data.user;
}

function normalizeInvite(invite = {}) {
  return {
    id: invite.id || "",
    requestId: invite.requestId || invite.request_id || `invite-${compact(invite.operator_public_id || invite.publicId || Date.now())}`,
    companyId: invite.companyId || invite.company_id || "",
    companyOwnerUserId: invite.companyOwnerUserId || invite.company_owner_user_id || invite.owner_user_id || "",
    companyName: invite.companyName || invite.company_name || "",
    companyCode: invite.companyCode || invite.company_code || "",
    companyCity: invite.companyCity || invite.company_city || "",
    companyFleetId: invite.companyFleetId || invite.company_fleet_id || "",
    transportFleetId: invite.transportFleetId || invite.transport_fleet_id || "",
    fleetCode: invite.fleetCode || invite.fleet_code || "",
    fleetName: invite.fleetName || invite.fleet_name || "",
    fleetType: invite.fleetType || invite.fleet_type || "",
    plateNumber: invite.plateNumber || invite.plate_number || "",
    operatorId: invite.operatorId || invite.operator_id || "",
    userId: invite.userId || invite.operator_user_id || "",
    publicId: invite.publicId || invite.operator_public_id || "",
    lookupValue: invite.lookupValue || invite.lookup_value || invite.requested_public_id || invite.publicId || invite.operator_public_id || "",
    publicIdAliases: Array.isArray(invite.publicIdAliases || invite.public_id_aliases) ? (invite.publicIdAliases || invite.public_id_aliases) : [],
    name: invite.name || invite.operator_name || "Registered operator",
    city: invite.city || invite.operator_city || "",
    verificationStatus: invite.verificationStatus || invite.verification_status || "pending",
    status: invite.status || "pending",
    documents: safeParse(invite.documents) || invite.documents || {},
    memberId: invite.memberId || invite.member_id || "",
    memberRole: invite.memberRole || invite.member_role || "operator",
    memberStatus: invite.memberStatus || invite.member_status || "active",
    serviceStatus: invite.serviceStatus || invite.service_status || "active",
    permissions: safeParse(invite.permissions) || invite.permissions || {},
    responsibilities: Array.isArray(invite.responsibilities) ? invite.responsibilities : [],
    createdAt: invite.createdAt || invite.created_at || new Date().toISOString(),
    updatedAt: invite.updatedAt || invite.updated_at || invite.createdAt || invite.created_at || new Date().toISOString(),
  };
}

function normalizeCompanyMember(member = {}) {
  return {
    id: member.id || "",
    companyId: member.companyId || member.company_id || "",
    userId: member.userId || member.user_id || "",
    operatorId: member.operatorId || member.operator_id || "",
    publicId: member.publicId || member.public_id || "",
    fullName: member.fullName || member.full_name || "Company member",
    role: member.role || "operator",
    status: member.status || "pending",
    serviceStatus: member.serviceStatus || member.service_status || "active",
    permissions: safeParse(member.permissions) || member.permissions || {},
    responsibilities: Array.isArray(member.responsibilities) ? member.responsibilities : [],
    suspendedAt: member.suspendedAt || member.suspended_at || "",
    joinedAt: member.joinedAt || member.joined_at || "",
    updatedAt: member.updatedAt || member.updated_at || "",
  };
}

function permissionEnabled(member = {}, key) {
  const permissions = safeParse(member.permissions) || member.permissions || {};
  if (permissions?.[key] === true) return true;
  if (member.role === "admin") return true;
  if (member.role === "fleet_manager") {
    return ["view_company_hq", "view_all_bookings", "manage_fleets", "view_company_activity"].includes(key);
  }
  if (member.role === "dispatcher") {
    return ["view_company_hq", "view_all_bookings", "dispatch_bookings", "view_company_activity"].includes(key);
  }
  return false;
}

function buildCompanyAccess(company = {}, member = null, userId = "") {
  const isOwner = Boolean(userId && (company.owner_user_id || company.userId) === userId);
  const normalizedMember = member ? normalizeCompanyMember(member) : null;
  const active = isOwner || (
    normalizedMember?.status === "active" && normalizedMember?.serviceStatus === "active"
  );
  const can = (key) => isOwner || (active && permissionEnabled(normalizedMember || {}, key));

  return {
    isOwner,
    isActiveMember: Boolean(active),
    role: isOwner ? "owner" : normalizedMember?.role || "operator",
    memberId: normalizedMember?.id || "",
    operatorId: normalizedMember?.operatorId || "",
    userId: normalizedMember?.userId || userId || "",
    publicId: normalizedMember?.publicId || "",
    fullName: normalizedMember?.fullName || "",
    memberStatus: normalizedMember?.status || (isOwner ? "active" : "pending"),
    serviceStatus: normalizedMember?.serviceStatus || "active",
    responsibilities: normalizedMember?.responsibilities || [],
    permissions: normalizedMember?.permissions || {},
    // Every active company operator can enter Fleet HQ. RLS and the client
    // workspace still limit basic operators to their own company information.
    canViewCompanyHq: Boolean(active),
    canViewAllBookings: isOwner || can("view_all_bookings"),
    canManageOperators: isOwner || can("manage_operators"),
    canManageFleets: isOwner || can("manage_fleets"),
    canDispatchBookings: isOwner || can("dispatch_bookings"),
    canViewCompanyActivity: isOwner || can("view_company_activity"),
  };
}

function attachMembersToFleets(fleets = [], members = []) {
  const normalizedMembers = (members || []).map(normalizeCompanyMember);
  return (fleets || []).map((fleet) => ({
    ...fleet,
    operators: (fleet.operators || []).map((operator) => {
      const normalized = normalizeInvite(operator);
      const member = normalizedMembers.find((candidate) =>
        (normalized.operatorId && candidate.operatorId === normalized.operatorId) ||
        (normalized.userId && candidate.userId === normalized.userId) ||
        (normalized.publicId && candidate.publicId === normalized.publicId)
      );
      if (!member) return normalized;
      return normalizeInvite({
        ...normalized,
        memberId: member.id,
        memberRole: member.role,
        memberStatus: member.status,
        serviceStatus: member.serviceStatus,
        permissions: member.permissions,
        responsibilities: member.responsibilities,
      });
    }),
  }));
}

function normalizeFleet(fleet = {}, index = 0) {
  const fleetCode = fleet.fleetCode || fleet.fleet_code || createTransportCompanyFleetCode();
  const rawOperators = Array.isArray(fleet.operators)
    ? fleet.operators
    : Array.isArray(safeParse(fleet.operators))
      ? safeParse(fleet.operators)
      : [];

  return {
    id: fleet.id || fleet.localId || `fleet-${index + 1}`,
    localId: fleet.localId || fleet.id || `fleet-${index + 1}`,
    fleetCode,
    operatorId: fleet.operatorId || fleet.operator_id || "",
    transportFleetId: fleet.transportFleetId || fleet.transport_fleet_id || "",
    fleetType: fleet.fleetType || fleet.fleet_type || "Motorbike",
    serviceCategory: fleet.serviceCategory || fleet.service_category || "Ride and delivery",
    fleetName: fleet.fleetName || fleet.fleet_name || "",
    plateNumber: fleet.plateNumber || fleet.plate_number || "",
    make: fleet.make || "",
    model: fleet.model || "",
    year: fleet.year || fleet.manufacture_year || "",
    color: fleet.color || "",
    operatingArea: fleet.operatingArea || fleet.operating_area || "",
    homeBase: fleet.homeBase || fleet.home_base_location || "",
    baseFare: fleet.baseFare ?? fleet.base_fare ?? "",
    pricePerKm: fleet.pricePerKm ?? fleet.price_per_km ?? "",
    pricePerHour: fleet.pricePerHour ?? fleet.price_per_hour ?? "",
    priceHint: fleet.priceHint || fleet.price_hint || "",
    publicFleetPhotos: fleet.publicFleetPhotos || fleet.public_fleet_photos || [],
    documents: fleet.documents || {},
    safetyAnswers: fleet.safetyAnswers || fleet.safety_answers || {},
    operators: rawOperators.map(normalizeInvite),
    status: fleet.status || fleet.verification_status || "pending_review",
    activeStatus: fleet.activeStatus || fleet.active_status || "offline",
    isVisibleToPassengers: Boolean(fleet.isVisibleToPassengers ?? fleet.is_visible_to_passengers ?? false),
  };
}

async function prepareCompanyFleetPublicMedia(fleets = [], ownerUserId) {
  const prepared = [];

  for (const fleet of fleets) {
    const documents = {};
    const publicFleetPhotos = [];
    for (const [key, value] of Object.entries(fleet.documents || {})) {
      const isFleetImage = key.startsWith("Fleet image -");
      const file = getTransportUploadFile(value);
      let publicUrl = getTransportUploadUrl(value);

      if (isFleetImage && file) {
        publicUrl = await uploadTransportPublicImage({
          file,
          ownerUserId,
          scope: `company-${fleet.fleetCode || fleet.localId || "fleet"}`,
          label: key.replace(/^Fleet image - /, ""),
        });
      }

      documents[key] = isFleetImage
        ? toStoredTransportUpload(value, publicUrl)
        : file
          ? await uploadTransportVerificationDocument({
              file,
              ownerUserId,
              scope: `company-${fleet.fleetCode || fleet.localId || "fleet"}`,
              label: key,
            })
          : value?.bucket && value?.path
            ? value
            : getTransportUploadName(value);
      if (isFleetImage && publicUrl) {
        publicFleetPhotos.push({ label: key.replace(/^Fleet image - /, ""), url: publicUrl });
      }
    }

    prepared.push({
      ...fleet,
      documents,
      publicFleetPhotos: publicFleetPhotos.length ? publicFleetPhotos : fleet.publicFleetPhotos || [],
    });
  }

  return prepared;
}

async function prepareCompanyDocuments(documents = {}, ownerUserId) {
  const prepared = {};
  for (const [key, value] of Object.entries(documents || {})) {
    const file = getTransportUploadFile(value);
    prepared[key] = file
      ? await uploadTransportVerificationDocument({
          file,
          ownerUserId,
          scope: "company-registration",
          label: key,
        })
      : value;
  }
  return prepared;
}

export function resolveTransportCompanyOperatorAssignment(company = {}, targetOperator = null) {
  const access = company?.access || {};
  const target = targetOperator || {};
  const targetOperatorId = target.operatorId || access.operatorId || "";
  const targetUserId = target.userId || access.userId || "";
  const targetPublicId = target.publicId || access.publicId || "";

  for (const fleetInput of company?.fleets || []) {
    const fleet = normalizeFleet(fleetInput);
    const operators = (fleet.operators || []).map(normalizeInvite);
    const operator = operators.find((candidate) =>
      (target.id && candidate.id === target.id) ||
      (target.requestId && candidate.requestId === target.requestId) ||
      (targetOperatorId && candidate.operatorId === targetOperatorId) ||
      (targetUserId && candidate.userId === targetUserId) ||
      (targetPublicId && compact(candidate.publicId) === compact(targetPublicId))
    );

    const assignedByFleet = fleet.operatorId && targetOperatorId && fleet.operatorId === targetOperatorId;
    if (!operator && !assignedByFleet) continue;

    return {
      companyId: company.id || "",
      companyFleetId: fleet.id || target.companyFleetId || "",
      transportFleetId: fleet.transportFleetId || operator?.transportFleetId || target.transportFleetId || "",
      fleetCode: fleet.fleetCode,
      fleetName: fleet.fleetName || fleet.fleetType || "Company fleet",
      fleetType: fleet.fleetType,
      serviceCategory: fleet.serviceCategory,
      plateNumber: fleet.plateNumber,
      make: fleet.make,
      model: fleet.model,
      year: fleet.year,
      color: fleet.color,
      operatingArea: fleet.operatingArea || company.city || "",
      homeBase: fleet.homeBase || company.address || "",
      verificationStatus: fleet.status,
      activeStatus: fleet.activeStatus,
      isVisibleToPassengers: fleet.isVisibleToPassengers,
      operatorId: operator?.operatorId || targetOperatorId || fleet.operatorId,
      userId: operator?.userId || targetUserId,
      publicId: operator?.publicId || targetPublicId,
      operatorName: operator?.name || target.name || access.fullName || "Company operator",
      memberRole: operator?.memberRole || target.memberRole || access.role || "operator",
      serviceStatus: operator?.serviceStatus || target.serviceStatus || access.serviceStatus || "active",
    };
  }

  return null;
}

function attachInvitesToFleets(fleets = [], invites = []) {
  const normalizedInvites = (invites || []).map(normalizeInvite);

  return (fleets || []).map((fleet) => {
    const fleetCode = fleet.fleetCode || fleet.fleet_code || "";
    const fleetId = fleet.id || "";
    const existingOperators = Array.isArray(fleet.operators)
      ? fleet.operators.map(normalizeInvite)
      : Array.isArray(safeParse(fleet.operators))
        ? safeParse(fleet.operators).map(normalizeInvite)
        : [];
    const linkedInvites = normalizedInvites.filter((invite) =>
      invite.companyFleetId === fleetId || (fleetCode && invite.fleetCode === fleetCode)
    );
    const merged = [...existingOperators];

    linkedInvites.forEach((invite) => {
      const existingIndex = merged.findIndex((item) =>
        item.requestId === invite.requestId ||
        (item.publicId && invite.publicId && item.publicId === invite.publicId)
      );
      if (existingIndex < 0) {
        merged.push(invite);
        return;
      }

      const existing = merged[existingIndex];
      merged[existingIndex] = normalizeInvite({
        ...existing,
        ...invite,
        documents: {
          ...(existing.documents || {}),
          ...(invite.documents || {}),
        },
      });
    });

    return { ...fleet, operators: merged };
  });
}

function normalizeCompanyAccount(input = {}, userId = "") {
  const company = input.company || input;
  const companyCode = company.companyCode || company.company_code || generateCode("KTC");
  const normalized = {
    id: company.id || company.localId || companyCode,
    localId: company.localId || company.id || companyCode,
    userId: company.userId || company.owner_user_id || userId,
    companyCode,
    ownerPublicId: company.ownerPublicId || company.owner_public_id || "",
    companyName: company.companyName || company.company_name || "",
    companyType: company.companyType || company.company_type || "Transport company",
    registrationNumber: company.registrationNumber || company.registration_number || "",
    taxId: company.taxId || company.tax_id || "",
    ownerName: company.ownerName || company.owner_name || "",
    phone: company.phone || "",
    email: company.email || "",
    country: company.country || "",
    city: company.city || "",
    address: company.address || "",
    coordinates: company.coordinates || (
      company.latitude != null && company.longitude != null
        ? { latitude: company.latitude, longitude: company.longitude }
        : null
    ),
    operatingAreas: Array.isArray(company.operatingAreas)
      ? company.operatingAreas
      : Array.isArray(company.operating_areas)
        ? company.operating_areas
        : [],
    supportPolicy: company.supportPolicy || company.support_policy || "",
    documents: company.documents || {},
    fleets: (input.fleets || company.fleets || []).map(normalizeFleet),
    invites: input.invites || company.invites || [],
    members: (input.members || company.members || []).map(normalizeCompanyMember),
    activities: input.activities || company.activities || [],
    access: input.access || company.access || buildCompanyAccess(company, input.currentMember || company.currentMember, userId),
    verificationStatus: company.verificationStatus || company.verification_status || "pending",
    accountStatus: company.accountStatus || company.account_status || "draft",
    savedAt: company.savedAt || company.updated_at || company.created_at || new Date().toISOString(),
    storageMode: input.storageMode || company.storageMode || "local",
  };
  if (normalized.country) storeCountryContext(normalized.country);
  return normalized;
}

function writeLocalCompanyAccount(userId, account) {
  const normalized = normalizeCompanyAccount(account, userId);
  localStorage.setItem(scopedKey(COMPANY_ACCOUNT_PREFIX, userId), JSON.stringify(normalized));
  persistCompanyInvites(normalized);
  window.dispatchEvent(new CustomEvent(COMPANY_EVENT, { detail: normalized }));
  return normalized;
}

function getInviteStoreKey(invite = {}) {
  const normalized = normalizeInvite(invite);
  return `${normalized.companyId || normalized.companyCode || normalized.companyName}:${normalized.requestId || normalized.publicId}`;
}

function readLocalInviteStore() {
  const value = safeParse(localStorage.getItem(COMPANY_INVITES_KEY));
  return Array.isArray(value) ? value.map(normalizeInvite) : [];
}

function writeLocalInviteStore(invites = []) {
  localStorage.setItem(COMPANY_INVITES_KEY, JSON.stringify(dedupeInvites(invites)));
}

function upsertLocalInviteStore(invite) {
  const normalized = normalizeInvite(invite);
  const key = getInviteStoreKey(normalized);
  const nextInvites = [
    normalized,
    ...readLocalInviteStore().filter((item) => getInviteStoreKey(item) !== key),
  ];
  writeLocalInviteStore(nextInvites);
  return normalized;
}

function persistCompanyInvites(account) {
  const normalizedAccount = normalizeCompanyAccount(account, account?.userId);
  const invites = (normalizedAccount.fleets || []).flatMap((fleet) =>
    (fleet.operators || []).map((operator) => enrichInvite(operator, normalizedAccount, fleet)),
  );

  if (!invites.length) return;

  const current = readLocalInviteStore();
  const inviteKeys = new Set(invites.map(getInviteStoreKey));
  const unrelated = current.filter((invite) => !inviteKeys.has(getInviteStoreKey(invite)));
  writeLocalInviteStore([...invites, ...unrelated]);
}

function getLocalCompanyAccounts() {
  if (typeof localStorage === "undefined") return [];
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key) => key?.startsWith(COMPANY_ACCOUNT_PREFIX))
    .map((key) => {
      const userId = key.slice(COMPANY_ACCOUNT_PREFIX.length);
      const account = safeParse(localStorage.getItem(key));
      return account ? { key, userId, account: normalizeCompanyAccount(account, userId) } : null;
    })
    .filter(Boolean);
}

function enrichInvite(invite, company = {}, fleet = {}) {
  return normalizeInvite({
    ...invite,
    companyId: invite.companyId || invite.company_id || company.id || company.localId,
    companyOwnerUserId: invite.companyOwnerUserId || invite.company_owner_user_id || company.userId || company.owner_user_id,
    companyName: invite.companyName || company.companyName || company.company_name,
    companyCode: invite.companyCode || company.companyCode || company.company_code,
    companyCity: invite.companyCity || company.city,
    companyFleetId: invite.companyFleetId || invite.company_fleet_id || fleet.id || fleet.localId,
    transportFleetId: invite.transportFleetId || invite.transport_fleet_id || fleet.transportFleetId || fleet.transport_fleet_id,
    fleetCode: invite.fleetCode || invite.fleet_code || fleet.fleetCode || fleet.fleet_code,
    fleetName: invite.fleetName || fleet.fleetName || fleet.fleet_name,
    fleetType: invite.fleetType || fleet.fleetType || fleet.fleet_type,
    plateNumber: invite.plateNumber || fleet.plateNumber || fleet.plate_number,
  });
}

function inviteMatchesOperator(invite, candidates = {}) {
  if (candidates.userId && invite.companyOwnerUserId && invite.companyOwnerUserId === candidates.userId) {
    return false;
  }

  const candidatePublicIds = (candidates.publicIds || []).map(compact).filter(Boolean);
  const invitePublicIds = uniqueValues([
    invite.publicId,
    invite.lookupValue,
    ...(invite.publicIdAliases || []),
  ].flatMap(buildKunThaiIdCandidates)).map(compact).filter(Boolean);
  return Boolean(
    (candidates.userId && invite.userId === candidates.userId) ||
      (candidates.operatorId && invite.operatorId === candidates.operatorId) ||
      invitePublicIds.some((publicId) => candidatePublicIds.includes(publicId)),
  );
}

function getLocalOperatorInvites(candidates = {}) {
  const localAccounts = getLocalCompanyAccounts();
  const ownedCompanyKeys = new Set(
    localAccounts
      .filter(({ account, userId }) => candidates.userId && (account.userId === candidates.userId || userId === candidates.userId))
      .flatMap(({ account }) => [account.id, account.localId, account.companyCode, account.companyName].filter(Boolean)),
  );
  const isOwnedCompanyInvite = (invite) => [invite.companyId, invite.companyCode, invite.companyName]
    .filter(Boolean)
    .some((key) => ownedCompanyKeys.has(key));

  const accountInvites = localAccounts.flatMap(({ account, userId }) => {
    if (candidates.userId && (account.userId === candidates.userId || userId === candidates.userId)) return [];

    return (account.fleets || []).flatMap((fleet) =>
      (fleet.operators || [])
        .map((operator) => enrichInvite(operator, account, fleet))
        .filter((invite) => inviteMatchesOperator(invite, candidates)),
    );
  });
  const storedInvites = readLocalInviteStore().filter((invite) =>
    !isOwnedCompanyInvite(invite) && inviteMatchesOperator(invite, candidates)
  );

  return dedupeInvites([...accountInvites, ...storedInvites]).filter(isOperatorFacingInvite);
}

function dedupeInvites(invites = []) {
  const byKey = new Map();
  invites.forEach((invite) => {
    const normalized = normalizeInvite(invite);
    const key = `${normalized.companyId || normalized.companyName}:${normalized.requestId || normalized.publicId}`;
    const existing = byKey.get(key);
    if (!existing || new Date(normalized.updatedAt) > new Date(existing.updatedAt)) {
      byKey.set(key, normalized);
    }
  });
  return Array.from(byKey.values()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function patchLocalOperatorInvite(invite, patch = {}) {
  let updatedInvite = null;
  const nextDocuments = {
    ...(invite.documents || {}),
    ...(patch.documents || {}),
  };

  getLocalCompanyAccounts().forEach(({ key, userId, account }) => {
    let changed = false;
    const fleets = (account.fleets || []).map((fleet) => {
      const operators = (fleet.operators || []).map((operator) => {
        const current = enrichInvite(operator, account, fleet);
        const sameInvite =
          (invite.id && current.id === invite.id) ||
          (invite.companyId && current.companyId === invite.companyId && current.requestId === invite.requestId) ||
          current.requestId === invite.requestId;

        if (!sameInvite) return operator;

        changed = true;
        updatedInvite = enrichInvite(
          {
            ...operator,
            ...patch,
            requestId: operator.requestId || operator.request_id || invite.requestId,
            operatorId: patch.operatorId || operator.operatorId || operator.operator_id || invite.operatorId,
            userId: patch.userId || operator.userId || operator.operator_user_id || invite.userId,
            verificationStatus: patch.verificationStatus || operator.verificationStatus || operator.verification_status || invite.verificationStatus,
            documents: nextDocuments,
            updatedAt: new Date().toISOString(),
          },
          account,
          fleet,
        );
        return updatedInvite;
      });

      return changed ? { ...fleet, operators } : fleet;
    });

    if (changed) {
      const nextAccount = normalizeCompanyAccount({ ...account, fleets, savedAt: new Date().toISOString() }, userId);
      localStorage.setItem(key, JSON.stringify(nextAccount));
      window.dispatchEvent(new CustomEvent(COMPANY_EVENT, { detail: nextAccount }));
    }
  });

  return upsertLocalInviteStore(updatedInvite || normalizeInvite({ ...invite, ...patch, documents: nextDocuments, updatedAt: new Date().toISOString() }));
}

export async function getTransportCompanyDraft() {
  const user = await getCurrentUser("Sign in to continue your company registration.");
  return safeParse(localStorage.getItem(scopedKey(COMPANY_DRAFT_PREFIX, user.id)));
}

export async function saveTransportCompanyDraft(draft) {
  const user = await getCurrentUser("Sign in before saving your company registration.");
  const payload = { ...draft, userId: user.id, savedAt: new Date().toISOString() };
  localStorage.setItem(scopedKey(COMPANY_DRAFT_PREFIX, user.id), JSON.stringify(payload));
  return payload;
}

export async function setActiveTransportCompanyId(companyId) {
  const user = await getCurrentUser();
  if (companyId) localStorage.setItem(scopedKey(ACTIVE_COMPANY_PREFIX, user.id), companyId);
  else localStorage.removeItem(scopedKey(ACTIVE_COMPANY_PREFIX, user.id));
  window.dispatchEvent(new CustomEvent(COMPANY_EVENT, { detail: { activeCompanyId: companyId } }));
  return companyId;
}

export async function getTransportCompanyAccounts() {
  const user = await getCurrentUser();

  try {
    const { data: ownedCompanies, error: ownerError } = await supabase
      .from("transport_companies")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("updated_at", { ascending: false });

    if (ownerError) throw ownerError;
    const { data: memberships, error: membershipError } = await supabase
      .from("transport_company_members")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["active", "suspended"])
      .order("updated_at", { ascending: false });
    if (membershipError) throw membershipError;

    const ownedIds = new Set((ownedCompanies || []).map((company) => company.id));
    const memberCompanyIds = (memberships || []).map((member) => member.company_id).filter((id) => id && !ownedIds.has(id));
    const memberCompanies = memberCompanyIds.length
      ? await safeSelectRows(supabase.from("transport_companies").select("*").in("id", memberCompanyIds))
      : [];
    const companies = [...(ownedCompanies || []), ...(memberCompanies || [])];

    if (!companies.length) {
      localStorage.removeItem(scopedKey(COMPANY_ACCOUNT_PREFIX, user.id));
      return [];
    }
    const accounts = await Promise.all(companies.map(async (company) => {
      const currentMember = (memberships || []).find((member) => member.company_id === company.id) || null;
      const access = buildCompanyAccess(company, currentMember, user.id);
      const [fleets, invites, activities, members] = await Promise.all([
        safeSelectRows(supabase.from("transport_company_fleets").select("*").eq("company_id", company.id).order("updated_at", { ascending: false })),
        safeSelectRows(supabase.from("transport_company_operator_invites").select("*").eq("company_id", company.id).order("created_at", { ascending: false })),
        safeSelectRows(supabase.from("transport_company_activities").select("*").eq("company_id", company.id).order("created_at", { ascending: false }).limit(30)),
        safeSelectRows(supabase.from("transport_company_members").select("*").eq("company_id", company.id).order("updated_at", { ascending: false })),
      ]);
      return normalizeCompanyAccount({
        company,
        fleets: attachMembersToFleets(attachInvitesToFleets(fleets || [], invites || []), members || []),
        invites: invites || [], activities: activities || [], members: members || [], currentMember, access, storageMode: "cloud",
      }, user.id);
    }));

    return accounts;
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message || "Unable to load company workspace.");
  }
}

export async function getTransportCompanyAccount() {
  const user = await getCurrentUser();
  const accounts = await getTransportCompanyAccounts();
  if (!accounts.length) return null;
  const activeId = localStorage.getItem(scopedKey(ACTIVE_COMPANY_PREFIX, user.id));
  const account = accounts.find((company) => company.id === activeId) || accounts[0];
  if (account.id !== activeId) localStorage.setItem(scopedKey(ACTIVE_COMPANY_PREFIX, user.id), account.id);
  writeLocalCompanyAccount(user.id, account);
  return account;
}

async function getOperatorInviteCandidates(operatorAccount = null) {
  const user = await getCurrentUser("Sign in to view company registration requests.");
  const profile = await getOnboardingProfile(user).catch(() => null);
  let operatorRecord = operatorAccount?.id
    ? {
        id: operatorAccount.id,
        user_id: operatorAccount.userId || user.id,
        display_code: operatorAccount.displayCode || operatorAccount.publicId,
        operator_code: operatorAccount.operatorId,
        verification_status: operatorAccount.verificationStatus,
      }
    : null;

  if (!operatorRecord?.id) {
    try {
      const { data, error } = await supabase
        .from("transport_operators")
        .select("id, user_id, display_code, operator_code, verification_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      operatorRecord = data || operatorRecord;
    } catch (error) {
      if (!isMissingTable(error)) {
        // Local and public account matches still allow pending invitations to surface.
      }
    }
  }

  const profilePublicId = getKunThaiPublicUserId({ ...(profile || {}), userId: user.id });
  const publicIds = uniqueValues([
    operatorAccount?.publicId,
    operatorAccount?.displayCode,
    operatorAccount?.operatorId ? `KT-${operatorAccount.operatorId}` : "",
    operatorRecord?.display_code,
    operatorRecord?.operator_code ? `KT-${operatorRecord.operator_code}` : "",
    profile?.publicUserId,
    profile?.public_user_id,
    profile?.kunThaiId,
    profile?.kunthai_id,
    profilePublicId,
  ].flatMap(buildKunThaiIdCandidates));

  return {
    user,
    userId: user.id,
    operatorId: operatorAccount?.id || operatorRecord?.id || "",
    verificationStatus: operatorAccount?.verificationStatus || operatorRecord?.verification_status || "pending",
    publicIds,
  };
}

export async function getOperatorCompanyInvites(operatorAccount = null) {
  const candidates = await getOperatorInviteCandidates(operatorAccount);
  const localInvites = getLocalOperatorInvites(candidates);

  try {
    const filters = [
      candidates.userId ? `operator_user_id.eq.${candidates.userId}` : "",
      candidates.operatorId ? `operator_id.eq.${candidates.operatorId}` : "",
      ...candidates.publicIds.map((publicId) => `operator_public_id.eq.${publicId}`),
    ].filter(Boolean).join(",");

    const { data: inviteRows, error } = await supabase
      .from("transport_company_operator_invites")
      .select("*")
      .or(filters)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const companyIds = uniqueValues((inviteRows || []).map((invite) => invite.company_id));
    const [companyRows, fleetRows] = await Promise.all([
      companyIds.length
        ? safeSelectRows(supabase.from("transport_companies").select("id, owner_user_id, company_code, company_name, city").in("id", companyIds))
        : [],
      companyIds.length
        ? safeSelectRows(supabase.from("transport_company_fleets").select("*").in("company_id", companyIds))
        : [],
    ]);

    const companiesById = new Map((companyRows || []).map((company) => [company.id, company]));
    const fleetsById = new Map((fleetRows || []).map((fleet) => [fleet.id, fleet]));
    const fleetsByCode = new Map((fleetRows || []).map((fleet) => [`${fleet.company_id}:${fleet.fleet_code}`, fleet]));
    const cloudInvites = (inviteRows || [])
      .map((invite) => {
        const fleet = fleetsById.get(invite.company_fleet_id) || fleetsByCode.get(`${invite.company_id}:${invite.fleet_code}`) || {};
        return enrichInvite(invite, companiesById.get(invite.company_id) || {}, fleet);
      })
      .filter((invite) => inviteMatchesOperator(invite, candidates));

    return dedupeInvites([...cloudInvites, ...localInvites]).filter(isOperatorFacingInvite);
  } catch (error) {
    if (isMissingTable(error)) return dedupeInvites(localInvites).filter(isOperatorFacingInvite);
    throw new Error(error.message || "Unable to load company registration requests.");
  }
}

export async function updateOperatorCompanyInvite(invite, patch = {}) {
  const user = await getCurrentUser("Sign in to respond to this company request.");
  const documents = {
    ...(invite.documents || {}),
    ...(patch.documents || {}),
  };
  const nextPatch = {
    ...patch,
    userId: patch.userId || invite.userId || user.id,
    documents,
    updatedAt: new Date().toISOString(),
  };
  const localInvite = patchLocalOperatorInvite(invite, nextPatch);

  try {
    const payload = {
      status: normalizeInviteStatusForDatabase(nextPatch.status || invite.status || "pending", documents),
      verification_status: nextPatch.verificationStatus || invite.verificationStatus || "pending",
      documents,
      updated_at: new Date().toISOString(),
    };
    const operatorId = asUuid(nextPatch.operatorId || invite.operatorId);
    const userId = asUuid(nextPatch.userId || invite.userId || user.id);
    if (operatorId) payload.operator_id = operatorId;
    if (userId) payload.operator_user_id = userId;

    const inviteRowId = asUuid(invite.id);
    const companyId = asUuid(invite.companyId || invite.company_id);
    let hasInviteSelector = false;
    let query = supabase.from("transport_company_operator_invites").update(payload);
    if (inviteRowId) {
      query = query.eq("id", inviteRowId);
      hasInviteSelector = true;
    } else {
      if (companyId) {
        query = query.eq("company_id", companyId);
        hasInviteSelector = true;
      }
      if (invite.requestId) {
        query = query.eq("request_id", invite.requestId);
        hasInviteSelector = true;
      }
      if (!companyId && !invite.requestId && invite.fleetCode) {
        query = query.eq("fleet_code", invite.fleetCode);
        hasInviteSelector = true;
      }
      if (!companyId && !invite.requestId && userId) {
        query = query.eq("operator_user_id", userId);
        hasInviteSelector = true;
      }
      if (!companyId && !invite.requestId && !userId && invite.publicId) {
        query = query.eq("operator_public_id", invite.publicId);
        hasInviteSelector = true;
      }
    }

    if (!hasInviteSelector) return localInvite;

    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) return localInvite;

    const normalizedInvite = normalizeInvite({
      ...localInvite,
      ...data,
      companyName: localInvite.companyName,
      companyCode: localInvite.companyCode,
      fleetName: localInvite.fleetName,
      fleetType: localInvite.fleetType,
      plateNumber: localInvite.plateNumber,
    });

    if (payload.status === "rejected") {
      await recordCompanyInviteActivity({
        companyId: data.company_id || companyId,
        actorUserId: user.id,
        invite: normalizedInvite,
        activityType: "operator_invite_rejected",
        title: "Operator invitation rejected",
        body: `${normalizedInvite.name || "An operator"} rejected the company invitation for ${normalizedInvite.fleetName || normalizedInvite.fleetType || "a fleet"}.`,
      }).catch(() => null);
    } else if (payload.status === "accepted") {
      const documentsSubmitted = Boolean(documents.operatorDocumentsSubmitted);
      const documentsPending = Boolean(documents.operatorDocumentsRequired || documents.registrationRequired);
      const reusedDocuments = Boolean(documents.reusedExistingDocuments);
      const activityType = documentsSubmitted
        ? "operator_invite_documents_submitted"
        : documentsPending
          ? "operator_invite_accepted_pending_documents"
          : "operator_invite_accepted";
      const title = documentsSubmitted ? "Operator documents submitted" : "Operator invitation accepted";
      const body = documentsSubmitted
        ? `${normalizedInvite.name || "An operator"} submitted operator documents for ${normalizedInvite.fleetName || normalizedInvite.fleetType || "a fleet"}.`
        : documentsPending
          ? `${normalizedInvite.name || "An operator"} accepted the company invitation for ${normalizedInvite.fleetName || normalizedInvite.fleetType || "a fleet"}. Operator documents are still required.`
          : `${normalizedInvite.name || "An operator"} accepted the company invitation for ${normalizedInvite.fleetName || normalizedInvite.fleetType || "a fleet"}.${reusedDocuments ? " Existing operator documents will be reused." : ""}`;

      await recordCompanyInviteActivity({
        companyId: data.company_id || companyId,
        actorUserId: user.id,
        invite: normalizedInvite,
        activityType,
        title,
        body,
      }).catch(() => null);
    }

    return upsertLocalInviteStore(normalizedInvite);
  } catch (error) {
    if (isMissingTable(error)) return localInvite;
    throw new Error(error.message || "Unable to update this company request.");
  }
}

function getOperatorCodeFromInvite(invite = {}) {
  const digits = String(invite.operatorId || invite.publicId || invite.lookupValue || "")
    .replace(/\D/g, "")
    .slice(-5);
  return /^\d{5}$/.test(digits) ? digits : generateOperatorCode();
}

function keepReviewedOperatorStatus(status = "") {
  return ["verified", "verified_recommended", "recommended"].includes(status)
    ? status
    : "verification_pending";
}

function normalizeInviteDocumentEntries(documents = {}, invite = {}) {
  const now = new Date().toISOString();
  return Object.entries(documents)
    .map(([key, document]) => {
      const value = typeof document === "string" ? { fileName: document, label: key } : document || {};
      const fileName = value.fileName || value.name || "";
      if (!fileName) return null;

      return {
        key,
        documentType: value.documentType || value.label || key,
        fileName,
        fileUrl: value.fileUrl || value.url || "",
        storageBucket: value.bucket || "",
        storagePath: value.path || "",
        contentType: value.contentType || "",
        uploadedAt: value.uploadedAt || now,
        metadata: {
          source: "company_invite",
          requestId: invite.requestId || invite.request_id || "",
          companyId: invite.companyId || invite.company_id || "",
          companyName: invite.companyName || invite.company_name || "",
          fleetName: invite.fleetName || invite.fleet_name || "",
          fieldKey: key,
        },
      };
    })
    .filter(Boolean);
}

async function ensureInvitedOperatorRecord(user, profile = {}, invite = {}) {
  const now = new Date().toISOString();
  const publicId = invite.publicId || invite.lookupValue || getKunThaiPublicUserId({ ...(profile || {}), userId: user.id });
  const displayName = invite.name || getAccountDisplayName(profile, user);
  const phone = invite.phone || profile?.phone || profile?.phone_number || "";
  const city = invite.city || profile?.city || profile?.address || "";
  const optionalColumns = [
    "phone",
    "city",
    "display_code",
    "documents_skipped",
    "verification_status",
    "account_status",
    "profile_completed_at",
    "updated_at",
  ];

  const { data: existing, error: existingError } = await supabase
    .from("transport_operators")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const payload = {
      full_name: existing.full_name || displayName || "Operator",
      phone: existing.phone || phone,
      city: existing.city || city,
      display_code: existing.display_code || publicId,
      documents_skipped: false,
      verification_status: keepReviewedOperatorStatus(existing.verification_status),
      account_status: existing.account_status === "approved" ? existing.account_status : "documents_submitted",
      profile_completed_at: existing.profile_completed_at || now,
      updated_at: now,
    };

    return updateSelectSingle("transport_operators", payload, { id: existing.id }, optionalColumns);
  }

  const seedCode = getOperatorCodeFromInvite(invite);
  const codeAttempts = uniqueValues([seedCode, ...Array.from({ length: 8 }, generateOperatorCode)]);
  let lastError = null;

  for (const operatorCode of codeAttempts) {
    try {
      return await insertSelectSingle(
        "transport_operators",
        {
          user_id: user.id,
          operator_code: operatorCode,
          display_code: publicId,
          full_name: displayName || "Operator",
          phone,
          city,
          documents_skipped: false,
          verification_status: "verification_pending",
          account_status: "documents_submitted",
          profile_completed_at: now,
          updated_at: now,
        },
        optionalColumns,
      );
    } catch (error) {
      lastError = error;
      if (error?.code !== "23505") break;
    }
  }

  throw lastError || new Error("Unable to create operator verification profile.");
}

async function saveInvitedOperatorDocumentRows(operatorId, documents = {}, invite = {}) {
  const entries = normalizeInviteDocumentEntries(documents, invite);
  if (!operatorId || !entries.length) return [];

  const { data: existingRows, error: existingError } = await supabase
    .from("transport_operator_documents")
    .select("*")
    .eq("operator_id", operatorId);

  if (existingError) throw existingError;

  const existingByType = new Map(
    (existingRows || []).map((row) => [compact(row.document_type), row]),
  );
  const optionalColumns = ["file_name", "file_url", "document_url", "status", "metadata", "uploaded_at", "updated_at"];
  const savedRows = [];

  for (const entry of entries) {
    const payload = {
      operator_id: operatorId,
      document_type: entry.documentType,
      file_name: entry.fileName,
      file_url: entry.fileUrl || null,
      document_url: entry.fileUrl || null,
      status: "verification_pending",
      metadata: {
        ...entry.metadata,
        storageBucket: entry.storageBucket || "",
        storagePath: entry.storagePath || "",
        contentType: entry.contentType || "",
      },
      uploaded_at: entry.uploadedAt,
      updated_at: new Date().toISOString(),
    };
    const existing = existingByType.get(compact(entry.documentType));
    const saved = existing?.id
      ? await updateSelectSingle("transport_operator_documents", payload, { id: existing.id }, optionalColumns)
      : await insertSelectSingle("transport_operator_documents", payload, optionalColumns);
    savedRows.push(saved || payload);
  }

  return savedRows;
}

// Creates (or refreshes) the invited user's transport_operators row without any
// documents, so accepting an invitation immediately links the operator and lets
// the backend provision the company fleet. Documents stay a later, optional step.
export async function ensureInvitedOperatorProfile(invite = {}) {
  const user = await getCurrentUser("Sign in to accept this company request.");
  const profile = await getOnboardingProfile(user).catch(() => null);

  try {
    return await ensureInvitedOperatorRecord(user, profile || {}, invite || {});
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message || "Unable to prepare your operator profile for this company.");
  }
}

export async function submitOperatorCompanyInviteDocuments(invite, documents = {}) {
  const user = await getCurrentUser("Sign in before submitting operator documents.");
  const profile = await getOnboardingProfile(user).catch(() => null);
  let operator = null;

  try {
    operator = await ensureInvitedOperatorRecord(user, profile || {}, invite || {});
    const preparedDocuments = { ...documents };
    const operatorPhoto = documents.operatorPhoto;
    const operatorPhotoFile = getTransportUploadFile(operatorPhoto);
    let operatorPhotoUrl = getTransportUploadUrl(operatorPhoto);
    if (operatorPhotoFile) {
      operatorPhotoUrl = await uploadTransportPublicImage({
        file: operatorPhotoFile,
        ownerUserId: user.id,
        scope: "operator",
        label: "selfie",
      });
      preparedDocuments.operatorPhoto = {
        ...operatorPhoto,
        file: undefined,
        fileUrl: operatorPhotoUrl,
        visibility: "passenger",
      };
    }
    if (operatorPhotoUrl) {
      const { error: photoError } = await supabase
        .from("transport_operators")
        .update({ public_selfie_url: operatorPhotoUrl })
        .eq("id", operator.id)
        .eq("user_id", user.id);
      if (photoError && !isMissingColumn(photoError, "public_selfie_url")) throw photoError;
    }
    for (const [key, value] of Object.entries(preparedDocuments)) {
      if (key === "operatorPhoto") continue;
      const file = getTransportUploadFile(value);
      if (!file) continue;
      preparedDocuments[key] = await uploadTransportVerificationDocument({
        file,
        ownerUserId: user.id,
        scope: "invited-operator",
        label: key,
      });
    }
    const savedDocuments = await saveInvitedOperatorDocumentRows(operator?.id, preparedDocuments, invite || {});
    return { operator, documents: savedDocuments, storageMode: "cloud" };
  } catch (error) {
    if (isMissingTable(error)) {
      return {
        operator,
        documents: [],
        storageMode: "local",
        warning: "Operator documents were attached to the invitation locally because the verification tables are not available.",
      };
    }
    throw new Error(error.message || "Unable to save operator documents.");
  }
}

export async function saveTransportCompanyAccount(account) {
  const user = await getCurrentUser("Sign in before submitting your company registration.");
  const addOperatorMode = account?.actionMode === "add_operator";
  const profile = await getOnboardingProfile(user).catch(() => null);
  let normalized = normalizeCompanyAccount({
    ...account,
    userId: user.id,
    ownerPublicId: account.ownerPublicId || getKunThaiPublicUserId({ ...profile, userId: user.id }),
    accountStatus: "submitted",
    verificationStatus: "pending",
    savedAt: new Date().toISOString(),
  }, user.id);
  normalized = {
    ...normalized,
    documents: await prepareCompanyDocuments(normalized.documents, user.id),
    fleets: await prepareCompanyFleetPublicMedia(normalized.fleets, user.id),
  };

  try {
    const companyPayload = {
      owner_user_id: user.id,
      company_code: normalized.companyCode,
      owner_public_id: normalized.ownerPublicId,
      company_name: normalized.companyName,
      company_type: normalized.companyType,
      registration_number: normalized.registrationNumber,
      tax_id: normalized.taxId,
      owner_name: normalized.ownerName,
      phone: normalized.phone,
      email: normalized.email,
      country: normalized.country,
      city: normalized.city,
      address: normalized.address,
      latitude: normalized.coordinates?.latitude ?? normalized.coordinates?.lat ?? null,
      longitude: normalized.coordinates?.longitude ?? normalized.coordinates?.lng ?? null,
      operating_areas: normalized.operatingAreas,
      support_policy: normalized.supportPolicy,
      documents: normalized.documents,
      verification_status: "pending",
      account_status: "submitted",
      updated_at: new Date().toISOString(),
    };

    const company = await saveSelectSingleByMatch(
      "transport_companies",
      companyPayload,
      { owner_user_id: user.id },
      [
        "owner_public_id",
        "company_type",
        "registration_number",
        "tax_id",
        "owner_name",
        "phone",
        "email",
        "country",
        "city",
        "address",
        "latitude",
        "longitude",
        "operating_areas",
        "support_policy",
        "documents",
        "verification_status",
        "account_status",
        "updated_at",
      ],
    );

    const companyId = company?.id;
    if (!companyId) {
      throw new Error("Company registration could not be saved to Supabase. Please try again.");
    }

    await saveSelectSingleByMatch(
      "transport_company_members",
      {
        company_id: companyId,
        user_id: user.id,
        public_id: normalized.ownerPublicId,
        full_name: normalized.ownerName,
        role: "owner",
        status: "active",
        invited_by: user.id,
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { company_id: companyId, user_id: user.id },
      ["public_id", "full_name", "role", "status", "invited_by", "joined_at", "updated_at"],
    ).catch((error) => {
      if (!isMissingTable(error)) throw error;
      return null;
    });

    await insertSelectSingle(
      "transport_company_activities",
      {
        company_id: companyId,
        actor_user_id: user.id,
        activity_type: addOperatorMode ? "operator_invite_created" : "registration",
        title: addOperatorMode ? "Operator invitation created" : "Company registration submitted",
        body: addOperatorMode
          ? `${normalized.companyName || "Company"} added a new fleet operator request.`
          : `${normalized.companyName || "Company"} submitted Fleet HQ registration.`,
        metadata: {
          companyCode: normalized.companyCode,
          fleetCount: normalized.fleets.length,
          inviteCount: normalized.fleets.reduce((sum, fleet) => sum + (fleet.operators || []).length, 0),
        },
      },
      ["actor_user_id", "activity_type", "body", "metadata"],
    ).catch((error) => {
      if (!isMissingTable(error)) throw error;
      return null;
    });

    if (companyId) {
      const fleetResults = await Promise.all(normalized.fleets.map((fleet) =>
        saveSelectSingleByMatch(
          "transport_company_fleets",
          {
            company_id: companyId,
            fleet_code: fleet.fleetCode,
            service_category: fleet.serviceCategory,
            fleet_type: fleet.fleetType,
            fleet_name: fleet.fleetName,
            plate_number: fleet.plateNumber,
            make: fleet.make,
            model: fleet.model,
            manufacture_year: fleet.year ? Number(fleet.year) : null,
            color: fleet.color,
            operating_area: fleet.operatingArea,
            home_base_location: fleet.homeBase,
            base_fare: fleet.baseFare ? Number(fleet.baseFare) : null,
            price_per_km: fleet.pricePerKm ? Number(fleet.pricePerKm) : null,
            price_per_hour: fleet.pricePerHour ? Number(fleet.pricePerHour) : null,
            price_hint: fleet.priceHint || "",
            public_fleet_photos: fleet.publicFleetPhotos || [],
            documents: fleet.documents,
            safety_answers: fleet.safetyAnswers,
            operators: fleet.operators || [],
            verification_status: fleet.status || "pending_review",
            is_visible_to_passengers: Boolean(fleet.isVisibleToPassengers),
            updated_at: new Date().toISOString(),
          },
          { company_id: companyId, fleet_code: fleet.fleetCode },
          [
            "service_category",
            "fleet_type",
            "fleet_name",
            "plate_number",
            "make",
            "model",
            "manufacture_year",
            "color",
            "operating_area",
            "home_base_location",
            "base_fare",
            "price_per_km",
            "price_per_hour",
            "price_hint",
            "public_fleet_photos",
            "documents",
            "safety_answers",
            "operators",
            "verification_status",
            "is_visible_to_passengers",
            "updated_at",
          ],
        ).then((data) => ({ data, error: null })).catch((error) => ({ data: null, error })),
      ));

      const fleetIdByCode = new Map();
      fleetResults.forEach(({ data, error }) => {
        if (error) throw error;
        if (data?.fleet_code) fleetIdByCode.set(data.fleet_code, data.id);
      });

      const inviteRows = normalized.fleets.flatMap((fleet) =>
        (fleet.operators || []).map((operator) => {
          const invite = normalizeInvite(operator);
          const requestId = invite.requestId || `${fleet.fleetCode}-${compact(invite.publicId)}`;
          const documents = invite.documents || {};
          return {
            company_id: companyId,
            company_fleet_id: fleetIdByCode.get(fleet.fleetCode) || null,
            fleet_code: fleet.fleetCode,
            request_id: requestId,
            operator_id: asUuid(invite.operatorId),
            operator_user_id: asUuid(invite.userId),
            operator_public_id: invite.publicId || invite.lookupValue,
            operator_name: invite.name,
            operator_city: invite.city,
            verification_status: invite.verificationStatus,
            status: normalizeInviteStatusForDatabase(invite.status, documents),
            documents,
            updated_at: new Date().toISOString(),
          };
        }).filter((invite) => invite.operator_public_id || invite.operator_user_id || invite.operator_id),
      );

      if (inviteRows.length) {
        const inviteResults = await Promise.all(inviteRows.map((invite) =>
          saveSelectSingleByMatch(
            "transport_company_operator_invites",
            invite,
            { company_id: companyId, request_id: invite.request_id },
            [
              "company_fleet_id",
              "fleet_code",
              "operator_id",
              "operator_user_id",
              "operator_public_id",
              "operator_name",
              "operator_city",
              "verification_status",
              "status",
              "documents",
              "updated_at",
            ],
          ).then((data) => ({ data, error: null })).catch((error) => ({ data: null, error })),
        ));
        const inviteError = inviteResults.find((result) => result.error)?.error;
        if (inviteError) throw inviteError;
      }
    }

    const cloudAccount = normalizeCompanyAccount({ ...normalized, id: companyId || normalized.id, storageMode: "cloud" }, user.id);
    localStorage.removeItem(scopedKey(COMPANY_DRAFT_PREFIX, user.id));
    return writeLocalCompanyAccount(user.id, cloudAccount);
  } catch (error) {
    if (isMissingTable(error)) {
      throw new Error("Transport company tables are not installed in Supabase. Run the latest database migration, then submit again.");
    }
    throw new Error(error.message || "Company registration could not be saved to Supabase.");
  }
}

export async function updateTransportCompanyOperatorAvailability(assignment, active) {
  const companyFleetId = asUuid(assignment?.companyFleetId || assignment?.company_fleet_id);
  if (!companyFleetId) throw new Error("Company fleet assignment is missing.");

  const { data, error } = await supabase.rpc("set_transport_company_operator_availability", {
    company_fleet_uuid: companyFleetId,
    active: Boolean(active),
  });
  if (error) throw new Error(error.message || "Unable to update company fleet availability.");

  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function lookupTransportOperatorByKunThaiId(value) {
  const requestedId = normalizeKunThaiPublicId(value);
  const compactId = compact(value);
  const digits = String(value || "").replace(/\D/g, "").slice(-5);
  const idCandidates = buildKunThaiIdCandidates(value);

  if (!compactId) return null;

  try {
    const filters = [
      ...idCandidates.map((candidate) => `display_code.eq.${candidate}`),
      digits.length === 5 ? `operator_code.eq.${digits}` : "",
    ].filter(Boolean).join(",");

    const { data, error } = await supabase
      .from("transport_operators")
      .select("id, user_id, full_name, phone, city, display_code, operator_code, verification_status")
      .or(filters)
      .limit(1);

    if (error) throw error;
    const operator = data?.[0];
    if (operator) {
      return {
        id: operator.id,
        userId: operator.user_id,
        publicId: operator.display_code || `KT-${operator.operator_code}` || getKunThaiPublicUserId({ userId: operator.user_id }),
        lookupValue: requestedId,
        publicIdAliases: uniqueValues([
          operator.display_code,
          operator.operator_code ? `KT-${operator.operator_code}` : "",
          requestedId,
        ].flatMap(buildKunThaiIdCandidates)),
        name: operator.full_name || "Registered operator",
        city: operator.city || "",
        phone: operator.phone || "",
        verificationStatus: operator.verification_status || "pending",
        source: "transport_operator",
      };
    }
  } catch (error) {
    if (!isMissingTable(error)) {
      // Continue to local fallback; invite lookup should remain usable while offline.
    }
  }

  try {
    const { data, error } = await supabase.rpc("lookup_kunthai_account_by_public_id", {
      input_public_id: requestedId,
    });

    if (error) throw error;

    const account = Array.isArray(data) ? data[0] : data;
    if (account?.user_id) {
      return {
        id: "",
        userId: account.user_id,
        publicId: account.public_id || requestedId,
        lookupValue: requestedId,
        publicIdAliases: uniqueValues([account.public_id, requestedId].flatMap(buildKunThaiIdCandidates)),
        name: account.full_name || account.display_name || account.username || "KunThai account",
        city: account.city || account.address || "",
        phone: account.phone || "",
        verificationStatus: "pending",
        source: "kunthai_account",
      };
    }
  } catch (error) {
    if (!isMissingRpc(error) && !isMissingTable(error)) {
      // Fall back to local/current account matching when the hardened lookup is unavailable.
    }
  }

  const user = await supabase.auth.getUser().then((result) => result.data?.user).catch(() => null);
  if (user) {
    const localOperator = safeParse(localStorage.getItem("kuntai.transport.operatorAccount"));
    const localPublicId = getKunThaiPublicUserId({ userId: localOperator?.userId || user.id });
    if (matchesLookupValue(value, [localPublicId, localOperator?.displayCode])) {
      return {
        id: localOperator?.id || "",
        userId: localOperator?.userId || user.id,
        publicId: localOperator?.displayCode || localPublicId,
        lookupValue: requestedId,
        publicIdAliases: uniqueValues([localOperator?.displayCode, localPublicId, requestedId].flatMap(buildKunThaiIdCandidates)),
        name: localOperator?.form?.name || getAccountDisplayName({}, user),
        city: localOperator?.form?.city || "",
        phone: localOperator?.form?.phone || "",
        verificationStatus: localOperator?.verificationStatus || "pending",
        source: "local_operator",
      };
    }

    const profile = await getOnboardingProfile(user).catch(() => null);
    const accountPublicId = getKunThaiPublicUserId({ ...(profile || {}), userId: user.id });
    if (matchesLookupValue(value, [
      accountPublicId,
      profile?.publicUserId,
      profile?.public_user_id,
      profile?.kunThaiId,
      profile?.kunthai_id,
    ])) {
      return {
        id: "",
        userId: user.id,
        publicId: accountPublicId,
        lookupValue: requestedId,
        publicIdAliases: uniqueValues([
          accountPublicId,
          profile?.publicUserId,
          profile?.public_user_id,
          profile?.kunThaiId,
          profile?.kunthai_id,
          requestedId,
        ].flatMap(buildKunThaiIdCandidates)),
        name: getAccountDisplayName(profile || {}, user),
        city: profile?.city || "",
        phone: profile?.phone || "",
        verificationStatus: "pending",
        source: "current_kunthai_account",
      };
    }
  }

  return null;
}

export async function updateTransportCompanyAccount(patch) {
  const user = await getCurrentUser("Sign in to update company workspace.");
  const current = await getTransportCompanyAccount();
  const next = normalizeCompanyAccount({ ...(current || {}), ...patch, savedAt: new Date().toISOString() }, user.id);
  return writeLocalCompanyAccount(user.id, next);
}

function findCompanyOperatorMember(company = {}, operator = {}) {
  return (company.members || []).map(normalizeCompanyMember).find((member) =>
    (operator.memberId && member.id === operator.memberId) ||
    (operator.operatorId && member.operatorId === operator.operatorId) ||
    (operator.userId && member.userId === operator.userId) ||
    (operator.publicId && member.publicId === operator.publicId)
  );
}

async function recordCompanyManagementActivity(companyId, userId, type, title, body, metadata = {}) {
  return insertSelectSingle(
    "transport_company_activities",
    {
      company_id: companyId,
      actor_user_id: userId,
      activity_type: type,
      title,
      body,
      metadata,
    },
    ["actor_user_id", "activity_type", "body", "metadata"],
  );
}

export async function manageTransportCompanyOperator(companyAccount, operator, action, options = {}) {
  const user = await getCurrentUser("Sign in to manage company operators.");
  const company = companyAccount?.id ? companyAccount : await getTransportCompanyAccount();
  if (!company?.id || !company?.access?.canManageOperators) {
    throw new Error("Only the company creator or an authorized admin can manage operators.");
  }

  const member = findCompanyOperatorMember(company, operator);
  if (!member?.id) throw new Error("This operator membership is not ready yet. Refresh Fleet HQ and try again.");
  if (member.role === "owner") throw new Error("The company creator cannot be changed from the operator action menu.");

  const now = new Date().toISOString();
  let memberPatch = null;
  let activity = null;

  if (action === "responsibility") {
    const role = COMPANY_OPERATOR_ROLES[options.role] ? options.role : "operator";
    const preset = COMPANY_OPERATOR_ROLES[role];
    memberPatch = {
      role,
      permissions: preset.permissions,
      responsibilities: Array.isArray(options.responsibilities) ? options.responsibilities : [preset.label],
      service_status: "active",
      status: "active",
      suspended_at: null,
      managed_by: user.id,
      updated_at: now,
    };
    activity = {
      type: "operator_responsibility_updated",
      title: "Operator responsibility updated",
      body: `${operator.name || member.fullName} is now ${preset.label.toLowerCase()}.`,
      metadata: { memberId: member.id, operatorId: operator.operatorId || member.operatorId, role },
    };
  } else if (action === "suspend") {
    memberPatch = {
      service_status: "suspended",
      suspended_at: now,
      managed_by: user.id,
      updated_at: now,
    };
    activity = {
      type: "operator_service_suspended",
      title: "Operator service suspended",
      body: `${operator.name || member.fullName}'s company service access was suspended.`,
      metadata: { memberId: member.id, operatorId: operator.operatorId || member.operatorId },
    };
  } else if (action === "restore") {
    memberPatch = {
      service_status: "active",
      status: "active",
      suspended_at: null,
      managed_by: user.id,
      updated_at: now,
    };
    activity = {
      type: "operator_service_restored",
      title: "Operator service restored",
      body: `${operator.name || member.fullName}'s company service access was restored.`,
      metadata: { memberId: member.id, operatorId: operator.operatorId || member.operatorId },
    };
  } else if (action === "remove") {
    memberPatch = {
      status: "removed",
      service_status: "removed",
      managed_by: user.id,
      updated_at: now,
    };
    activity = {
      type: "operator_removed",
      title: "Operator removed from company",
      body: `${operator.name || member.fullName} was removed from Fleet HQ. Their personal KunThai account was not deleted.`,
      metadata: { memberId: member.id, operatorId: operator.operatorId || member.operatorId },
    };
  } else {
    throw new Error("Unsupported operator action.");
  }

  const { error: memberError } = await supabase
    .from("transport_company_members")
    .update(memberPatch)
    .eq("id", member.id)
    .eq("company_id", company.id);
  if (memberError) throw memberError;

  if (["suspend", "remove"].includes(action) && (operator.operatorId || member.operatorId)) {
    const { error: fleetError } = await supabase
      .from("transport_fleets")
      .update({ active_status: "offline", is_visible_to_passengers: false, updated_at: now })
      .eq("operator_id", operator.operatorId || member.operatorId);
    if (fleetError) throw fleetError;
  }

  if (action === "remove") {
    let inviteQuery = supabase
      .from("transport_company_operator_invites")
      .update({ status: "revoked", updated_at: now })
      .eq("company_id", company.id);
    if (operator.id) inviteQuery = inviteQuery.eq("id", operator.id);
    else if (operator.operatorId || member.operatorId) inviteQuery = inviteQuery.eq("operator_id", operator.operatorId || member.operatorId);
    else inviteQuery = inviteQuery.eq("operator_user_id", operator.userId || member.userId);
    const { error: inviteError } = await inviteQuery;
    if (inviteError) throw inviteError;
  }

  await recordCompanyManagementActivity(
    company.id,
    user.id,
    activity.type,
    activity.title,
    activity.body,
    activity.metadata,
  ).catch(() => null);

  return getTransportCompanyAccount();
}

export async function manageTransportCompanyFleet(companyAccount, fleet, action, options = {}) {
  const user = await getCurrentUser("Sign in to manage company fleets.");
  const company = companyAccount?.id ? companyAccount : await getTransportCompanyAccount();
  if (!company?.id || !company?.access?.canManageFleets) {
    throw new Error("Only the company creator or an authorized fleet manager can manage fleets.");
  }

  const companyFleetId = asUuid(fleet?.id);
  if (!companyFleetId) {
    throw new Error("This fleet record is not synced to Supabase yet. Refresh Fleet HQ and try again.");
  }

  const now = new Date().toISOString();
  const fleetLabel = fleet.fleetName || fleet.fleetType || fleet.fleetCode || "Company fleet";

  // Passenger-facing runtime fleet goes offline for both actions.
  const { error: runtimeError } = await supabase
    .from("transport_fleets")
    .update({ active_status: "offline", is_visible_to_passengers: false, updated_at: now })
    .eq("company_fleet_id", companyFleetId);
  if (runtimeError && !isMissingColumn(runtimeError, "company_fleet_id")) throw new Error(runtimeError.message);

  let activity = null;

  if (action === "removeOperator") {
    const { error: inviteError } = await supabase
      .from("transport_company_operator_invites")
      .update({ status: "revoked", updated_at: now })
      .eq("company_fleet_id", companyFleetId)
      .in("status", ["pending", "accepted"]);
    if (inviteError && !isMissingTable(inviteError)) throw new Error(inviteError.message);

    const revokedOperators = (normalizeFleet(fleet).operators || []).map((entry) => ({
      ...entry,
      status: ["pending", "accepted", "accepted_pending_documents"].includes(String(entry.status || "").toLowerCase())
        ? "revoked"
        : entry.status,
      updatedAt: now,
    }));

    const { error: fleetError } = await supabase
      .from("transport_company_fleets")
      .update({
        operator_id: null,
        operators: revokedOperators,
        is_visible_to_passengers: false,
        updated_at: now,
      })
      .eq("id", companyFleetId)
      .eq("company_id", company.id);
    if (fleetError) throw new Error(fleetError.message);

    activity = {
      type: "fleet_operator_removed",
      title: "Fleet operator removed",
      body: `${options.operatorName || "The assigned operator"} was removed from ${fleetLabel}. The fleet is offline until a new operator is assigned.`,
      metadata: { companyFleetId, fleetCode: fleet.fleetCode || "" },
    };
  } else if (action === "delete") {
    const { error: deleteError } = await supabase
      .from("transport_company_fleets")
      .delete()
      .eq("id", companyFleetId)
      .eq("company_id", company.id);
    if (deleteError) throw new Error(deleteError.message);

    activity = {
      type: "fleet_deleted",
      title: "Fleet deleted",
      body: `${fleetLabel} was deleted from Fleet HQ. Its operator invitations were withdrawn and the fleet no longer serves passengers.`,
      metadata: { companyFleetId, fleetCode: fleet.fleetCode || "" },
    };
  } else {
    throw new Error("Unsupported fleet action.");
  }

  await recordCompanyManagementActivity(
    company.id,
    user.id,
    activity.type,
    activity.title,
    activity.body,
    activity.metadata,
  ).catch(() => null);

  return getTransportCompanyAccount();
}

export async function leaveTransportCompany(companyAccount = null) {
  const user = await getCurrentUser("Sign in to leave this company.");
  const company = companyAccount?.id ? companyAccount : await getTransportCompanyAccount();
  const access = company?.access || {};

  if (!company?.id || !access.memberId) {
    throw new Error("Your active company membership could not be found. Refresh Fleet HQ and try again.");
  }
  if (access.isOwner) {
    throw new Error("The company creator cannot leave from an operator account. Transfer or close the company first.");
  }

  const now = new Date().toISOString();
  const { error: memberError } = await supabase
    .from("transport_company_members")
    .update({
      status: "removed",
      service_status: "removed",
      updated_at: now,
    })
    .eq("id", access.memberId)
    .eq("company_id", company.id)
    .eq("user_id", user.id);
  if (memberError) throw memberError;

  if (access.operatorId) {
    await supabase
      .from("transport_fleets")
      .update({ active_status: "offline", is_visible_to_passengers: false, updated_at: now })
      .eq("operator_id", access.operatorId)
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error && !isMissingTable(error)) throw error;
      });
  }

  await recordCompanyManagementActivity(
    company.id,
    user.id,
    "operator_left_company",
    "Operator left company",
    `${access.fullName || "An operator"} left ${company.companyName || "the company"}. Their personal KunThai account was not deleted.`,
    { memberId: access.memberId, operatorId: access.operatorId || null },
  ).catch(() => null);

  localStorage.removeItem(scopedKey(COMPANY_ACCOUNT_PREFIX, user.id));
  return null;
}

export async function getTransportCompanyBookingQueue(companyAccount = null) {
  const company = companyAccount?.id ? companyAccount : await getTransportCompanyAccount();
  const canViewAllBookings = Boolean(company?.access?.canViewAllBookings);
  const ownOperatorId = company?.access?.operatorId || "";
  if (!company?.id || (!canViewAllBookings && !ownOperatorId)) return [];

  const companyOperators = [
    ...(company.invites || []),
    ...(company.fleets || []).flatMap((fleet) => fleet.operators || []),
  ].map(normalizeInvite);
  const assignedCompanyFleets = (company.fleets || [])
    .map(normalizeFleet)
    .filter((fleet) => {
      if (!fleet.transportFleetId) return false;
      if (canViewAllBookings) return true;
      if (fleet.operatorId === ownOperatorId) return true;
      return (fleet.operators || []).some((operator) => operator.operatorId === ownOperatorId && operator.status === "accepted");
    });
  const runtimeFleetIds = uniqueValues(assignedCompanyFleets.map((fleet) => fleet.transportFleetId));
  if (!runtimeFleetIds.length) return [];

  const { data: fleets, error: fleetError } = await supabase
    .from("transport_fleets")
    .select("id, operator_id, fleet_name, plate_number")
    .in("id", runtimeFleetIds);
  if (fleetError) throw fleetError;
  if (!fleets?.length) return [];

  const { data: trips, error: tripError } = await supabase
    .from("transport_trips")
    .select("*")
    .in("fleet_id", fleets.map((fleet) => fleet.id))
    .in("status", ["pending_confirmation", "waiting_operator", "requested", "accepted", "arrived", "start_requested", "in_progress", "paused"])
    .order("created_at", { ascending: false });
  if (tripError) throw tripError;

  const fleetById = new Map(fleets.map((fleet) => [fleet.id, fleet]));
  const operatorById = new Map(companyOperators.map((invite) => [invite.operatorId, invite]));
  (company.members || []).map(normalizeCompanyMember).forEach((member) => {
    if (!member.operatorId || operatorById.has(member.operatorId)) return;
    operatorById.set(member.operatorId, { name: member.fullName, publicId: member.publicId });
  });
  return (trips || []).map((trip) => {
    const fleet = fleetById.get(trip.fleet_id) || {};
    const operator = operatorById.get(fleet.operator_id) || {};
    return {
      id: trip.id,
      fleetId: trip.fleet_id,
      operatorId: fleet.operator_id,
      operatorName: operator.name || company.access?.fullName || "Company operator",
      fleetName: fleet.fleet_name || operator.fleetName || "Company fleet",
      plateNumber: fleet.plate_number || operator.plateNumber || "",
      passengerName: trip.passenger_name || "Passenger",
      name: trip.passenger_name || "Passenger",
      pickup: trip.pickup_label || "Pickup pending",
      destination: trip.destination_label || "Destination pending",
      route: `${trip.pickup_label || "Pickup pending"} to ${trip.destination_label || "Destination pending"}`,
      status: trip.status || "waiting_operator",
      tripType: trip.trip_type || trip.trip_mode || "ride",
      requestType: trip.trip_type === "delivery" || trip.trip_mode === "delivery" ? "Delivery" : "Passenger ride",
      bookingMethod: trip.booking_method || "distance",
      contactPhone: trip.contact_phone || "",
      packageDescription: trip.package_description || "",
      note: trip.trip_note || "No additional note.",
      fare: trip.fare_amount ? `${trip.fare_currency || ""} ${Number(trip.fare_amount).toLocaleString()}`.trim() : "Fare pending",
      time: trip.updated_at ? new Date(trip.updated_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
      createdAt: trip.created_at || "",
      updatedAt: trip.updated_at || trip.created_at || "",
      raw: trip,
    };
  });
}

export function subscribeTransportCompanyUpdates(onChange) {
  if (typeof window === "undefined" || typeof onChange !== "function") return () => {};
  const handler = (event) => onChange(event.detail);
  window.addEventListener(COMPANY_EVENT, handler);

  const channel = supabase
    .channel(`transport-company-updates-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_companies" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_company_fleets" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_company_operator_invites" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_company_activities" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_company_members" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_fleets" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_trips" }, onChange)
    .subscribe();

  return () => {
    window.removeEventListener(COMPANY_EVENT, handler);
    supabase.removeChannel(channel);
  };
}
