import supabase from "../../Backend/lib/supabaseClient";
import { isMissingTable } from "../../Backend/services/explore/errors";
import { getKunThaiPublicUserId, normalizeKunThaiPublicId } from "../../Backend/services/identityCodeService";
import { getOnboardingProfile } from "../../Backend/services/onboardingService";
import { storeCountryContext } from "../../data/westAfricanCountryProfiles";

const COMPANY_DRAFT_PREFIX = "kuntai.transport.companyDraft.";
const COMPANY_ACCOUNT_PREFIX = "kuntai.transport.companyAccount.";
const COMPANY_INVITES_KEY = "kuntai.transport.companyInvites";
const COMPANY_EVENT = "kunthai-transport-company-updated";

function safeParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
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

async function upsertSelectSingle(tableName, payload, options = {}, optionalColumns = []) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { data, error } = await supabase
      .from(tableName)
      .upsert(nextPayload, options)
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
    createdAt: invite.createdAt || invite.created_at || new Date().toISOString(),
    updatedAt: invite.updatedAt || invite.updated_at || invite.createdAt || invite.created_at || new Date().toISOString(),
  };
}

function normalizeFleet(fleet = {}, index = 0) {
  const fleetCode = fleet.fleetCode || fleet.fleet_code || generateCode("KTF");
  const rawOperators = Array.isArray(fleet.operators)
    ? fleet.operators
    : Array.isArray(safeParse(fleet.operators))
      ? safeParse(fleet.operators)
      : [];

  return {
    id: fleet.id || fleet.localId || `fleet-${index + 1}`,
    localId: fleet.localId || fleet.id || `fleet-${index + 1}`,
    fleetCode,
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
    documents: fleet.documents || {},
    safetyAnswers: fleet.safetyAnswers || fleet.safety_answers || {},
    operators: rawOperators.map(normalizeInvite),
    status: fleet.status || fleet.verification_status || "pending_review",
  };
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
      const exists = merged.some((item) =>
        item.requestId === invite.requestId ||
        (item.publicId && invite.publicId && item.publicId === invite.publicId)
      );
      if (!exists) merged.push(invite);
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
    activities: input.activities || company.activities || [],
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

  return dedupeInvites([...accountInvites, ...storedInvites]);
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

export async function getTransportCompanyAccount() {
  const user = await getCurrentUser();
  const localAccount = safeParse(localStorage.getItem(scopedKey(COMPANY_ACCOUNT_PREFIX, user.id)));

  try {
    const { data: company, error } = await supabase
      .from("transport_companies")
      .select("*")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!company) return localAccount ? normalizeCompanyAccount(localAccount, user.id) : null;

    const [{ data: fleets }, { data: invites }, { data: activities }] = await Promise.all([
      supabase.from("transport_company_fleets").select("*").eq("company_id", company.id).order("updated_at", { ascending: false }).catch(() => ({ data: [] })),
      supabase.from("transport_company_operator_invites").select("*").eq("company_id", company.id).order("created_at", { ascending: false }).catch(() => ({ data: [] })),
      supabase.from("transport_company_activities").select("*").eq("company_id", company.id).order("created_at", { ascending: false }).limit(30).catch(() => ({ data: [] })),
    ]);

    const account = normalizeCompanyAccount({
      company,
      fleets: attachInvitesToFleets(fleets || [], invites || []),
      invites: invites || [],
      activities: activities || [],
      storageMode: "cloud",
    }, user.id);

    writeLocalCompanyAccount(user.id, account);
    return account;
  } catch (error) {
    if (isMissingTable(error) || localAccount) return localAccount ? normalizeCompanyAccount(localAccount, user.id) : null;
    throw new Error(error.message || "Unable to load company workspace.");
  }
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
    const [{ data: companyRows }, { data: fleetRows }] = await Promise.all([
      companyIds.length
        ? supabase.from("transport_companies").select("id, owner_user_id, company_code, company_name, city").in("id", companyIds).catch(() => ({ data: [] }))
        : { data: [] },
      companyIds.length
        ? supabase.from("transport_company_fleets").select("*").in("company_id", companyIds).catch(() => ({ data: [] }))
        : { data: [] },
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

    return dedupeInvites([...cloudInvites, ...localInvites]);
  } catch (error) {
    if (isMissingTable(error)) return dedupeInvites(localInvites);
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

    let query = supabase.from("transport_company_operator_invites").update(payload);
    if (invite.id) {
      query = query.eq("id", invite.id);
    } else {
      if (invite.companyId) query = query.eq("company_id", invite.companyId);
      query = query.eq("request_id", invite.requestId);
    }

    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) return localInvite;

    return upsertLocalInviteStore(normalizeInvite({
      ...localInvite,
      ...data,
      companyName: localInvite.companyName,
      companyCode: localInvite.companyCode,
      fleetName: localInvite.fleetName,
      fleetType: localInvite.fleetType,
      plateNumber: localInvite.plateNumber,
    }));
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
      status: "submitted",
      metadata: entry.metadata,
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

export async function submitOperatorCompanyInviteDocuments(invite, documents = {}) {
  const user = await getCurrentUser("Sign in before submitting operator documents.");
  const profile = await getOnboardingProfile(user).catch(() => null);
  let operator = null;

  try {
    operator = await ensureInvitedOperatorRecord(user, profile || {}, invite || {});
    const savedDocuments = await saveInvitedOperatorDocumentRows(operator?.id, documents, invite || {});
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
  const profile = await getOnboardingProfile(user).catch(() => null);
  const normalized = normalizeCompanyAccount({
    ...account,
    userId: user.id,
    ownerPublicId: account.ownerPublicId || getKunThaiPublicUserId({ ...profile, userId: user.id }),
    accountStatus: "submitted",
    verificationStatus: "pending",
    savedAt: new Date().toISOString(),
  }, user.id);

  const localSaved = writeLocalCompanyAccount(user.id, normalized);
  localStorage.removeItem(scopedKey(COMPANY_DRAFT_PREFIX, user.id));

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
        activity_type: "registration",
        title: "Company registration submitted",
        body: `${normalized.companyName || "Company"} submitted Fleet HQ registration.`,
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
            documents: fleet.documents,
            safety_answers: fleet.safetyAnswers,
            operators: fleet.operators || [],
            verification_status: fleet.status || "pending_review",
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
            "documents",
            "safety_answers",
            "operators",
            "verification_status",
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
    return writeLocalCompanyAccount(user.id, cloudAccount);
  } catch (error) {
    if (isMissingTable(error)) return localSaved;
    throw new Error(error.message || "Company registration could not be saved to Supabase.");
  }
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

export function subscribeTransportCompanyUpdates(onChange) {
  if (typeof window === "undefined" || typeof onChange !== "function") return () => {};
  const handler = (event) => onChange(event.detail);
  window.addEventListener(COMPANY_EVENT, handler);
  return () => window.removeEventListener(COMPANY_EVENT, handler);
}
