import supabase from "../../Backend/lib/supabaseClient";
import { isMissingTable } from "../../Backend/services/explore/errors";
import { getKunThaiPublicUserId, normalizeKunThaiPublicId } from "../../Backend/services/identityCodeService";
import { getOnboardingProfile } from "../../Backend/services/onboardingService";
import { storeCountryContext } from "../../data/westAfricanCountryProfiles";

const COMPANY_DRAFT_PREFIX = "kuntai.transport.companyDraft.";
const COMPANY_ACCOUNT_PREFIX = "kuntai.transport.companyAccount.";
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

async function getCurrentUser(message = "Sign in to manage a transport company.") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error(message);
  return data.user;
}

function normalizeFleet(fleet = {}, index = 0) {
  const fleetCode = fleet.fleetCode || fleet.fleet_code || generateCode("KTF");
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
    operators: Array.isArray(fleet.operators) ? fleet.operators : [],
    status: fleet.status || fleet.verification_status || "pending_review",
  };
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
  window.dispatchEvent(new CustomEvent(COMPANY_EVENT, { detail: normalized }));
  return normalized;
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

    const [{ data: fleets }, { data: invites }] = await Promise.all([
      supabase.from("transport_company_fleets").select("*").eq("company_id", company.id).order("updated_at", { ascending: false }).catch(() => ({ data: [] })),
      supabase.from("transport_company_operator_invites").select("*").eq("company_id", company.id).order("created_at", { ascending: false }).catch(() => ({ data: [] })),
    ]);

    const account = normalizeCompanyAccount({
      company,
      fleets: fleets || [],
      invites: invites || [],
      storageMode: "cloud",
    }, user.id);

    writeLocalCompanyAccount(user.id, account);
    return account;
  } catch (error) {
    if (isMissingTable(error) || localAccount) return localAccount ? normalizeCompanyAccount(localAccount, user.id) : null;
    throw new Error(error.message || "Unable to load company workspace.");
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

    const { data: company, error } = await supabase
      .from("transport_companies")
      .upsert(companyPayload, { onConflict: "owner_user_id" })
      .select()
      .maybeSingle();

    if (error) throw error;

    const companyId = company?.id;
    if (companyId) {
      await Promise.all(normalized.fleets.map((fleet) =>
        supabase.from("transport_company_fleets").upsert({
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
          verification_status: fleet.status || "pending_review",
          updated_at: new Date().toISOString(),
        }, { onConflict: "company_id,fleet_code" }),
      ));
    }

    const cloudAccount = normalizeCompanyAccount({ ...normalized, id: companyId || normalized.id, storageMode: "cloud" }, user.id);
    return writeLocalCompanyAccount(user.id, cloudAccount);
  } catch (error) {
    if (isMissingTable(error)) return localSaved;
    return { ...localSaved, syncWarning: error.message || "Company saved locally. Cloud sync will retry later." };
  }
}

export async function lookupTransportOperatorByKunThaiId(value) {
  const requestedId = normalizeKunThaiPublicId(value);
  const compactId = compact(value);
  const digits = String(value || "").replace(/\D/g, "").slice(-5);

  if (!compactId) return null;

  try {
    const filters = [
      `display_code.eq.${requestedId}`,
      `display_code.eq.${compactId}`,
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

  const user = await supabase.auth.getUser().then((result) => result.data?.user).catch(() => null);
  if (user) {
    const localOperator = safeParse(localStorage.getItem("kuntai.transport.operatorAccount"));
    const localPublicId = getKunThaiPublicUserId({ userId: localOperator?.userId || user.id });
    const localDisplayCode = compact(localOperator?.displayCode);
    if (compact(localPublicId) === compactId || localDisplayCode === compactId || localDisplayCode === compact(requestedId)) {
      return {
        id: localOperator?.id || user.id,
        userId: localOperator?.userId || user.id,
        publicId: localOperator?.displayCode || localPublicId,
        name: localOperator?.form?.name || user.user_metadata?.display_name || user.email || "Registered operator",
        city: localOperator?.form?.city || "",
        phone: localOperator?.form?.phone || "",
        verificationStatus: localOperator?.verificationStatus || "pending",
        source: "local_operator",
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
