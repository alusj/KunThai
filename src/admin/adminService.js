import supabase from "../Backend/lib/supabaseClient";
import { GLOBAL_COUNTRY_PROFILES, normalizeCountryIso } from "../data/globalCountryProfiles";
import {
  previewAccess,
  previewAudit,
  previewCampaigns,
  previewCases,
  previewFlags,
  previewTeam,
  previewUsers,
  updatePreviewCase,
  updatePreviewFlag,
} from "./adminPreviewData";

const previewDelay = (value) => new Promise((resolve) => window.setTimeout(() => resolve(structuredClone(value)), 120));
const previewCreditWallets = new Map([
  ["user-1", { user_id: "user-1", balance: 35, lifetime_earned: 50, lifetime_spent: 15 }],
  ["user-2", { user_id: "user-2", balance: 12, lifetime_earned: 32, lifetime_spent: 20 }],
  ["user-3", { user_id: "user-3", balance: 5, lifetime_earned: 5, lifetime_spent: 0 }],
]);
const previewCreditTransactions = new Map();
const GENERAL_COUNTRY_KEY = "__general__";
const COUNTRY_PROFILES_BY_ISO = new Map(GLOBAL_COUNTRY_PROFILES.map((profile) => [profile.iso2, profile]));
export const ADMIN_ACTIVITY_REFRESH_EVENT = "kunthai-admin-activity-refresh";
const USER_CARE_STORAGE = {
  screenshot_url: { bucket: "user-care-screenshots", kind: "image", label: "Screenshot" },
  screenshotUrl: { bucket: "user-care-screenshots", kind: "image", label: "Screenshot" },
  screenshot_path: { bucket: "user-care-screenshots", kind: "image", label: "Screenshot" },
  voice_note_url: { bucket: "user-care-voice-notes", kind: "audio", label: "Voice note" },
  voiceNoteUrl: { bucket: "user-care-voice-notes", kind: "audio", label: "Voice note" },
  voice_note_path: { bucket: "user-care-voice-notes", kind: "audio", label: "Voice note" },
};

export function isAdminPreview() {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("preview") === "chief" || sessionStorage.getItem("kunthai-admin-preview") === "chief";
}

export function enableAdminPreview() {
  if (!import.meta.env.DEV) return;
  sessionStorage.setItem("kunthai-admin-preview", "chief");
  const url = new URL(window.location.href);
  url.searchParams.set("preview", "chief");
  window.history.replaceState({}, "", url);
}

function unwrap(result, fallbackMessage) {
  if (result.error) {
    const error = new Error(result.error.message || fallbackMessage);
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

function requestAdminActivityRefresh(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADMIN_ACTIVITY_REFRESH_EVENT, { detail }));
}

async function runAdminMutation(task, detail = {}) {
  const result = await task();
  requestAdminActivityRefresh(detail);
  return result;
}

function firstText(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function normalizeCountryKey(value = "") {
  const text = String(value || "").trim();
  if (!text) return GENERAL_COUNTRY_KEY;
  const iso2 = normalizeCountryIso(text);
  if (iso2) return iso2;
  return text.length <= 3 ? text.toUpperCase() : text.toLowerCase();
}

function sourceFor(item) {
  return item?.metadata?.source || {};
}

export function getCaseCountry(item = {}) {
  const source = sourceFor(item);
  const rawCode = firstText(
    item.country_iso,
    item.country_code,
    source.country_iso,
    source.country_code,
    source.countryCode,
    source.location_country_iso,
    source.locationCountryIso,
  ).toUpperCase();
  const rawName = firstText(
    item.country_name,
    item.country,
    source.country_name,
    source.countryName,
    source.country,
    source.location_country,
    source.locationCountry,
  );
  const iso2 = normalizeCountryIso(rawCode || rawName);
  const profile = iso2 ? COUNTRY_PROFILES_BY_ISO.get(iso2) : null;
  const code = iso2 || rawCode;
  const name = profile?.name || rawName;
  return { code, name, key: normalizeCountryKey(code || name) };
}

export function getCaseCountryLabel(item = {}) {
  const country = getCaseCountry(item);
  return country.name || country.code || "General";
}

export function matchesCaseCountry(item, countryKey = "all") {
  if (!countryKey || countryKey === "all") return true;
  return getCaseCountry(item).key === countryKey;
}

export function getCountryOptions(cases = []) {
  const options = new Map(GLOBAL_COUNTRY_PROFILES
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((profile) => [profile.iso2, { value: profile.iso2, label: profile.name, code: profile.iso2 }]));
  let hasGeneral = false;
  cases.forEach((item) => {
    const country = getCaseCountry(item);
    if (country.key === GENERAL_COUNTRY_KEY) {
      hasGeneral = true;
      return;
    }
    if (options.has(country.key)) return;
    options.set(country.key, { value: country.key, label: country.name || country.code, code: country.code });
  });
  const ordered = Array.from(options.values());
  if (hasGeneral) ordered.push({ value: GENERAL_COUNTRY_KEY, label: "General / unknown", code: "" });
  return [{ value: "all", label: "All countries", code: "" }, ...ordered];
}

export function getCaseTypeLabel(item = {}) {
  const type = item.case_type || item.resource_type || "";
  if (item.resource_type === "public_data_access_request") return "Data access request";
  if (item.resource_type === "public_account_deletion_request") return "Public account deletion request";
  if (type === "account_deletion_request" || String(item.resource_type || "").includes("account_deletion_request")) return "Account deletion request";
  if (type === "privacy_request") return "Privacy request";
  if (type === "user_voice" || item.resource_type === "user_care_feedback") return "My Voice";
  if (item.resource_type === "explore_post_report" || type === "content_report") return "Reported post";
  if (item.resource_type === "explore_comment_report" || type === "comment_report") return "Reported comment";
  if (item.resource_type === "explore_profile_report" || type === "profile_report") return "Reported profile";
  if (item.resource_type === "area_location_verification" || type === "area_location_review") return "Area View location";
  if (item.resource_type === "area_report" || type === "area_safety_report") return "Area View report";
  if (type === "seller_verification") return "Seller verification";
  if (type === "operator_verification") return "Operator verification";
  if (type === "company_verification") return "Company verification";
  if (type === "fleet_verification") return "Fleet verification";
  return titleCaseForService(type || "case");
}

export function getCaseSearchText(item = {}) {
  const source = sourceFor(item);
  const sourceText = Object.entries(source)
    .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => `${key} ${value}`)
    .join(" ");
  return `${item.case_number || ""} ${item.title || ""} ${item.description || ""} ${item.sector || ""} ${item.queue || ""} ${getCaseTypeLabel(item)} ${getCaseCountryLabel(item)} ${sourceText}`.toLowerCase();
}

function titleCaseForService(value = "") {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function getAdminAccess() {
  if (isAdminPreview()) return previewDelay(previewAccess);
  const data = unwrap(await supabase.rpc("get_my_admin_access"), "Unable to verify admin access.");
  return data || { isAdmin: false, permissions: [], roles: [], sectors: [] };
}

export async function getDashboardSummary() {
  if (isAdminPreview()) {
    const open = previewCases.filter((item) => !["resolved", "closed"].includes(item.status));
    return previewDelay({
      openCases: open.length,
      urgentCases: open.filter((item) => ["urgent", "critical"].includes(item.priority)).length,
      unassignedCases: open.filter((item) => !item.assignee_user_id).length,
      overdueCases: open.filter((item) => item.sla_due_at && new Date(item.sla_due_at) < new Date()).length,
      resolvedToday: 4,
      bySector: Object.fromEntries(["explore", "marketplace", "transport"].map((sector) => [sector, open.filter((item) => item.sector === sector).length])),
      byQueue: Object.fromEntries(["verification", "reports", "support", "finance"].map((queue) => [queue, open.filter((item) => item.queue === queue).length])),
    });
  }
  return unwrap(await supabase.rpc("admin_dashboard_summary"), "Unable to load the admin summary.");
}

export async function getAdminCases(filters = {}) {
  if (isAdminPreview()) {
    let rows = [...previewCases];
    if (filters.sector) rows = rows.filter((item) => item.sector === filters.sector);
    if (filters.queue) rows = rows.filter((item) => item.queue === filters.queue);
    if (filters.status === "open") rows = rows.filter((item) => !["resolved", "closed"].includes(item.status));
    if (filters.status && filters.status !== "open") rows = rows.filter((item) => item.status === filters.status);
    if (filters.assignee === "me") rows = rows.filter((item) => item.assignee_user_id === "preview-user");
    if (filters.country) rows = rows.filter((item) => matchesCaseCountry(item, filters.country));
    if (filters.search) {
      const search = filters.search.toLowerCase();
      rows = rows.filter((item) => getCaseSearchText(item).includes(search));
    }
    return previewDelay(rows);
  }

  let query = supabase.from("admin_cases").select("*").order("created_at", { ascending: false }).limit(filters.limit || 200);
  if (filters.sector) query = query.eq("sector", filters.sector);
  if (filters.queue) query = query.eq("queue", filters.queue);
  if (filters.status === "open") query = query.not("status", "in", "(resolved,closed)");
  else if (filters.status) query = query.eq("status", filters.status);
  if (filters.assignee === "me") {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) query = query.eq("assignee_user_id", data.user.id);
  }
  if (filters.search) query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  const rows = unwrap(await query, "Unable to load admin cases.") || [];
  return filters.country ? rows.filter((item) => matchesCaseCountry(item, filters.country)) : rows;
}

export async function getCaseActivity(caseId) {
  if (isAdminPreview()) return previewDelay({ events: [], notes: [], approvals: [] });
  const [events, notes, approvals] = await Promise.all([
    supabase.from("admin_case_events").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
    supabase.from("admin_case_notes").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
    supabase.from("admin_approvals").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
  ]);
  return {
    events: unwrap(events, "Unable to load case events.") || [],
    notes: unwrap(notes, "Unable to load case notes.") || [],
    approvals: unwrap(approvals, "Unable to load case approvals.") || [],
  };
}

export async function getCaseActionHistory(caseId, limit = 10) {
  if (!caseId) return [];
  if (isAdminPreview()) {
    return previewDelay([
      {
        id: `preview-action-${caseId}`,
        action_key: "case.status_changed",
        reason: "Preview action",
        created_at: new Date().toISOString(),
        can_undo: true,
        undo_status: "active",
      },
    ]);
  }
  return unwrap(
    await supabase.rpc("admin_get_case_action_history", {
      target_case_uuid: caseId,
      result_limit: limit,
    }),
    "Unable to load case actions.",
  ) || [];
}

export async function undoCaseAction(caseId, auditLogId, reason = "") {
  if (isAdminPreview()) {
    return runAdminMutation(
      () => previewDelay(updatePreviewCase(caseId, { status: "in_review", resolution_code: null, resolution_note: null })),
      { action: "case.action_undone", caseId, auditLogId },
    );
  }
  return runAdminMutation(
    async () => unwrap(
      await supabase.rpc("admin_undo_case_action", {
        target_case_uuid: caseId,
        target_audit_log_uuid: auditLogId || null,
        undo_reason: reason,
      }),
      "Unable to undo this case action.",
    ),
    { action: "case.action_undone", caseId, auditLogId },
  );
}

export async function getAdminAccountControl(userId) {
  if (!userId) return null;
  if (isAdminPreview()) return previewDelay(null);
  const { data, error } = await supabase
    .from("platform_account_controls")
    .select("user_id, status, reason, restricted_sectors, expires_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to load account access.");
  return data || null;
}

function collectCaseEvidence(value, path = [], collected = []) {
  if (!value) return collected;

  if (typeof value === "string") {
    if (/^(https?:|data:image\/)/i.test(value)) {
      collected.push({ label: path.join(" / ") || "Attachment", url: value });
    } else {
      const storage = USER_CARE_STORAGE[path.at(-1)] || null;
      if (storage && value.trim()) {
        collected.push({
          label: storage.label || path.join(" / ") || "Attachment",
          bucket: storage.bucket,
          path: value,
          kind: storage.kind,
        });
      }
    }
    return collected;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCaseEvidence(item, [...path, String(index + 1)], collected));
    return collected;
  }

  if (typeof value !== "object") return collected;

  const bucket = value.bucket || value.storageBucket || "";
  const storagePath = value.path || value.storagePath || "";
  if (bucket && storagePath) {
    collected.push({
      label: value.fileName || value.name || path.join(" / ") || "Verification document",
      bucket,
      path: storagePath,
      contentType: value.contentType || "",
      kind: inferMediaKind(value.contentType || storagePath),
    });
  }

  Object.entries(value).forEach(([key, child]) => {
    if (["bucket", "storageBucket", "path", "storagePath"].includes(key)) return;
    collectCaseEvidence(child, [...path, key], collected);
  });
  return collected;
}

export async function getAdminCaseEvidence(item) {
  const references = collectCaseEvidence(item?.metadata?.source || {});
  const deduped = Array.from(new Map(references.map((entry) => [entry.url || `${entry.bucket}:${entry.path}`, entry])).values());

  return Promise.all(deduped.map(async (entry) => {
    if (entry.url) return entry;
    const { data, error } = await supabase.storage.from(entry.bucket).createSignedUrl(entry.path, 60 * 60);
    return {
      ...entry,
      url: error ? "" : data?.signedUrl || "",
      kind: entry.kind || inferMediaKind(entry.contentType || entry.path),
      unavailable: error?.message || "",
    };
  }));
}

function inferMediaKind(value = "") {
  const text = String(value || "").toLowerCase();
  if (/^image\//.test(text) || /\.(png|jpe?g|webp|gif|heic|heif|avif)(\?|$)/i.test(text)) return "image";
  if (/^video\//.test(text) || /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(text)) return "video";
  if (/^audio\//.test(text) || /\.(mp3|m4a|wav|ogg|webm)(\?|$)/i.test(text)) return "audio";
  return "document";
}

function mediaItem(url, label, fallbackKind = "") {
  if (!url) return null;
  return { url, label, kind: fallbackKind || inferMediaKind(url) };
}

async function signedMedia(bucket, path, label, kind) {
  if (!bucket || !path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return { label, kind, url: error ? "" : data?.signedUrl || "", unavailable: error?.message || "" };
}

async function fetchSingle(table, column, value) {
  if (!value) return null;
  const { data, error } = await supabase.from(table).select("*").eq(column, value).maybeSingle();
  if (error) return null;
  return data || null;
}

function normalizePostContent(post, report = {}) {
  if (!post) return null;
  return {
    id: post.id,
    type: "post",
    title: post.post_type === "video" || post.feed_scope === "swip" ? "Reported Swip video" : "Reported post",
    description: post.body || "This post has no text caption.",
    meta: [
      post.author_name ? `Author: ${post.author_name}` : "",
      post.author_username ? `@${post.author_username}` : "",
      post.category ? `Category: ${post.category}` : "",
      report.reason ? `Report reason: ${report.reason}` : "",
    ].filter(Boolean),
    media: [
      mediaItem(post.image_url, "Post image", "image"),
      mediaItem(post.video_url, "Post video", "video"),
      mediaItem(post.audio_url, "Post audio", "audio"),
    ].filter(Boolean),
    source: post,
  };
}

function normalizeCommentContent(comment, parentPost = null, report = {}) {
  if (!comment) return null;
  return {
    id: comment.id,
    type: "comment",
    title: "Reported comment",
    description: comment.body || "This comment has no text body.",
    meta: [
      comment.author_name ? `Author: ${comment.author_name}` : "",
      comment.author_username ? `@${comment.author_username}` : "",
      parentPost?.body ? `Parent post: ${parentPost.body.slice(0, 90)}` : "",
      report.reason ? `Report reason: ${report.reason}` : "",
    ].filter(Boolean),
    media: [mediaItem(comment.audio_url, "Comment audio", "audio")].filter(Boolean),
    source: comment,
  };
}

function normalizeProfileContent(profile, report = {}) {
  if (!profile) return null;
  return {
    id: profile.user_id,
    type: "profile",
    title: "Reported profile",
    description: profile.bio || "This profile has no bio.",
    meta: [
      profile.display_name ? `Name: ${profile.display_name}` : "",
      profile.username ? `@${profile.username}` : "",
      profile.account_type ? `Account: ${profile.account_type}` : "",
      report.reason ? `Report reason: ${report.reason}` : "",
    ].filter(Boolean),
    media: [
      mediaItem(profile.avatar_url, "Profile image", "image"),
      profile.cover_url?.startsWith?.("preset:") ? null : mediaItem(profile.cover_url, "Profile cover", "image"),
    ].filter(Boolean),
    source: profile,
  };
}

async function normalizeUserVoiceContent(row = {}) {
  const screenshot = await signedMedia("user-care-screenshots", row.screenshot_url, "Screenshot", "image");
  const voice = await signedMedia("user-care-voice-notes", row.voice_note_url, "Voice note", "audio");
  return {
    id: row.id,
    type: "my_voice",
    title: row.subject || row.feedback_type ? `My Voice: ${titleCaseForService(row.subject || row.feedback_type)}` : "My Voice concern",
    description: row.message || "The user submitted an attachment without a written message.",
    meta: [
      row.feedback_type ? `Type: ${row.feedback_type}` : "",
      row.status ? `Status: ${row.status}` : "",
      row.page_context ? `Page: ${row.page_context}` : "",
      row.contact_email ? `Email: ${row.contact_email}` : "",
    ].filter(Boolean),
    media: [screenshot, voice].filter(Boolean),
    source: row,
  };
}

function mapUrlFor(row = {}) {
  const lat = Number(row.lat ?? row.latitude);
  const lng = Number(row.lng ?? row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function coordinateLabelFor(row = {}) {
  const lat = Number(row.lat ?? row.latitude);
  const lng = Number(row.lng ?? row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `Lat ${lat.toFixed(6)} / Lng ${lng.toFixed(6)}`;
}

function normalizeAreaLocationContent(row = {}) {
  const metadata = row.metadata || {};
  return {
    id: row.id,
    type: "area_location",
    title: row.name || row.place_name ? `Area View location: ${row.name || row.place_name}` : "Area View location request",
    description: row.description || row.landmark || row.address || "A user submitted a missing Area View location for admin review.",
    meta: [
      row.category ? `Category: ${row.category}` : "",
      row.type ? `Type: ${row.type}` : "",
      row.status ? `Status: ${row.status}` : "",
      row.visibility ? `Visibility: ${row.visibility}` : "",
      row.address ? `Address: ${row.address}` : "",
      row.landmark ? `Landmark: ${row.landmark}` : "",
      row.phone ? `Phone: ${row.phone}` : "",
      coordinateLabelFor(row),
      metadata.source ? `Source: ${metadata.source}` : "",
    ].filter(Boolean),
    media: [],
    mapUrl: mapUrlFor(row),
    source: row,
  };
}

function normalizeAreaReportContent(row = {}) {
  return {
    id: row.id,
    type: "area_report",
    title: row.title || row.report_type ? `Area View report: ${titleCaseForService(row.title || row.report_type)}` : "Area View safety report",
    description: row.description || row.message || "A user submitted an Area View safety report for validation.",
    meta: [
      row.report_type ? `Type: ${titleCaseForService(row.report_type)}` : "",
      row.severity ? `Severity: ${titleCaseForService(row.severity)}` : "",
      row.status ? `Status: ${titleCaseForService(row.status)}` : "",
      row.road_name ? `Road: ${row.road_name}` : "",
      row.area_name ? `Area: ${row.area_name}` : "",
      coordinateLabelFor(row),
      row.expires_at ? `Expires: ${row.expires_at}` : "",
    ].filter(Boolean),
    media: [],
    mapUrl: mapUrlFor(row),
    source: row,
  };
}

function deletionMetric(source = {}, key, label) {
  const value = Number(source[key] || 0);
  return value ? `${label}: ${value}` : "";
}

function recentDeletionSummary(source = {}) {
  const parts = [];
  if (Array.isArray(source.recent_messages) && source.recent_messages.length) {
    parts.push(`Recent message: ${source.recent_messages[0].topic || source.recent_messages[0].preview || source.recent_messages[0].buyer_name || "Buyer message"}`);
  }
  if (Array.isArray(source.recent_orders) && source.recent_orders.length) {
    parts.push(`Recent order: ${source.recent_orders[0].status || "order"} ${source.recent_orders[0].total_amount || ""}`.trim());
  }
  if (Array.isArray(source.recent_bookings) && source.recent_bookings.length) {
    parts.push(`Recent booking: ${source.recent_bookings[0].listing_name || source.recent_bookings[0].status || "booking request"}`);
  }
  if (Array.isArray(source.recent_trips) && source.recent_trips.length) {
    parts.push(`Recent trip: ${source.recent_trips[0].status || source.recent_trips[0].title || "transport trip"}`);
  }
  return parts;
}

function normalizeAccountDeletionContent(source = {}, item = {}) {
  const surface = source.surface || (item.sector === "marketplace" ? "UrMall" : "UrRide");
  const accountName = source.business_name || source.account_name || item.title || "KunThai account";
  return {
    id: item.resource_id || source.id || item.id,
    type: "account_deletion_request",
    title: `${surface} deletion request: ${accountName}`,
    description: [
      source.reason || item.description || "The user requested account deletion from the app.",
      ...recentDeletionSummary(source),
    ].filter(Boolean).join("\n"),
    meta: [
      source.business_kind ? `Business type: ${titleCaseForService(source.business_kind)}` : "",
      source.verification_status ? `Verification: ${titleCaseForService(source.verification_status)}` : "",
      source.readiness_score ? `Setup score: ${source.readiness_score}%` : "",
      source.country || source.city ? `Location: ${[source.city, source.country].filter(Boolean).join(", ")}` : "",
      deletionMetric(source, "orders_count", "Orders"),
      deletionMetric(source, "messages_count", "Messages"),
      deletionMetric(source, "bookings_count", "Bookings"),
      deletionMetric(source, "products_count", "Products"),
      deletionMetric(source, "menu_items_count", "Menu items"),
      deletionMetric(source, "hotel_rooms_count", "Hotel rooms"),
      deletionMetric(source, "property_listings_count", "Property listings"),
      deletionMetric(source, "trips_count", "Trips"),
      deletionMetric(source, "support_tickets_count", "Support tickets"),
    ].filter(Boolean),
    media: [
      mediaItem(source.logo_url, "Business logo", "image"),
      mediaItem(source.banner_url, "Business banner", "image"),
    ].filter(Boolean),
    source,
  };
}

function normalizePublicPrivacyContent(source = {}, item = {}) {
  const isDeletion = source.request_type === "account_deletion" || item.resource_type === "public_account_deletion_request";
  return {
    id: item.resource_id || source.id || item.id,
    type: isDeletion ? "account_deletion_request" : "data_access_request",
    title: `${isDeletion ? "Account deletion" : "Data access"} request: ${source.full_name || "KunThai user"}`,
    description: source.details || item.description || "Submitted from the public KunThai Policy Center.",
    meta: [
      source.reference ? `Reference: ${source.reference}` : "",
      source.account_email ? `Account email: ${source.account_email}` : "",
      source.account_phone ? `Account phone: ${source.account_phone}` : "",
      source.country ? `Country: ${source.country}` : "",
      source.verification_status ? `Verification: ${titleCaseForService(source.verification_status)}` : "",
      source.created_at ? `Submitted: ${source.created_at}` : "",
    ].filter(Boolean),
    media: [],
    source,
  };
}

function fallbackCaseContent(item = {}) {
  const source = sourceFor(item);
  return [{
    id: item.resource_id || item.id,
    type: item.resource_type || item.case_type || "case",
    title: getCaseTypeLabel(item),
    description: item.description || source.reason || source.message || source.body || "The original source record is attached to this case.",
    meta: Object.entries(source)
      .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
      .slice(0, 6)
      .map(([key, value]) => `${titleCaseForService(key)}: ${value}`),
    media: [],
    source,
  }];
}

function previewCaseContent(item = {}) {
  if (item.resource_type === "explore_post_report") {
    return [{
      id: "preview-post",
      type: "post",
      title: "Reported Swip video",
      description: "Preview content: a reported post appears here with its media and report reason.",
      meta: ["Author: Account under review", "Report reason: Threatening language"],
      media: [],
      source: sourceFor(item),
    }];
  }
  if (item.resource_type === "user_care_feedback") {
    return [{
      id: "preview-my-voice",
      type: "my_voice",
      title: "My Voice concern",
      description: "Preview concern from Your Voice with its screenshot or voice note shown inline when present.",
      meta: ["Type: Safety", "Status: Open"],
      media: [],
      source: sourceFor(item),
    }];
  }
  if (item.resource_type === "area_location_verification") {
    return [normalizeAreaLocationContent(sourceFor(item))];
  }
  if (item.resource_type === "area_report") {
    return [normalizeAreaReportContent(sourceFor(item))];
  }
  if (item.case_type === "account_deletion_request" || String(item.resource_type || "").includes("account_deletion_request")) {
    return [item.resource_type === "public_account_deletion_request"
      ? normalizePublicPrivacyContent(sourceFor(item), item)
      : normalizeAccountDeletionContent(sourceFor(item), item)];
  }
  if (item.resource_type === "public_data_access_request" || item.case_type === "privacy_request") return [normalizePublicPrivacyContent(sourceFor(item), item)];
  return fallbackCaseContent(item);
}

export async function getAdminCaseContent(item) {
  if (!item?.id) return [];
  if (isAdminPreview()) return previewDelay(previewCaseContent(item));

  const source = sourceFor(item);
  let content = null;
  if (item.resource_type === "explore_post_report") {
    const report = source.post_id ? source : await fetchSingle("explore_post_reports", "id", item.resource_id);
    const post = await fetchSingle("explore_posts", "id", report?.post_id);
    content = normalizePostContent(post, report || source);
  } else if (item.resource_type === "explore_comment_report") {
    const report = source.comment_id ? source : await fetchSingle("explore_comment_reports", "id", item.resource_id);
    const comment = await fetchSingle("explore_post_comments", "id", report?.comment_id);
    const post = await fetchSingle("explore_posts", "id", comment?.post_id);
    content = normalizeCommentContent(comment, post, report || source);
  } else if (item.resource_type === "explore_profile_report") {
    const report = source.reported_user_id ? source : await fetchSingle("explore_profile_reports", "id", item.resource_id);
    const profile = await fetchSingle("explore_profiles", "user_id", report?.reported_user_id);
    content = normalizeProfileContent(profile, report || source);
  } else if (item.resource_type === "user_care_feedback" || item.case_type === "user_voice") {
    const row = await fetchSingle("user_care_feedback", "id", source.id || item.resource_id);
    content = await normalizeUserVoiceContent(row || source);
  } else if (item.resource_type === "area_location_verification") {
    const row = await fetchSingle("nearby_area_locations", "id", source.id || item.resource_id);
    content = normalizeAreaLocationContent(row || source);
  } else if (item.resource_type === "area_report") {
    const row = await fetchSingle("nearby_area_reports", "id", source.id || item.resource_id);
    content = normalizeAreaReportContent(row || source);
  } else if (item.resource_type === "public_account_deletion_request" || item.resource_type === "public_data_access_request") {
    content = normalizePublicPrivacyContent(source, item);
  } else if (item.case_type === "account_deletion_request" || String(item.resource_type || "").includes("account_deletion_request")) {
    content = normalizeAccountDeletionContent(source, item);
  }

  return content ? [content] : fallbackCaseContent(item);
}

export async function claimCase(caseId) {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay(updatePreviewCase(caseId, { assignee_user_id: "preview-user", status: "assigned" })), { action: "case.claimed", caseId });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_claim_case", { case_uuid: caseId }), "Unable to claim this case."), { action: "case.claimed", caseId });
}

export async function transitionCase(caseId, status, note = "") {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay(updatePreviewCase(caseId, { status, resolution_note: note || null })), { action: "case.status_changed", caseId });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_transition_case", { case_uuid: caseId, next_status: status, transition_note: note }), "Unable to update this case."), { action: "case.status_changed", caseId });
}

export async function applyCaseDecision(caseId, decision, reason) {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay(updatePreviewCase(caseId, { status: decision === "request_information" ? "waiting_information" : "resolved", resolution_code: decision, resolution_note: reason })), { action: "case.decision_applied", caseId });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_apply_case_decision", { case_uuid: caseId, decision_key: decision, decision_reason: reason }), "Unable to apply this decision."), { action: "case.decision_applied", caseId });
}

export async function reviewCaseApproval(approvalId, approved, reason, caseId = "") {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay(updatePreviewCase(caseId, { status: approved ? "resolved" : "in_review" })), { action: approved ? "case.approval_granted" : "case.approval_rejected", caseId });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_review_approval", { approval_uuid: approvalId, approve_action: approved, review_reason: reason }), "Unable to review this approval."), { action: approved ? "case.approval_granted" : "case.approval_rejected", caseId });
}

export async function addCaseNote(caseId, body, visibility = "internal") {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay({ id: crypto.randomUUID(), case_id: caseId, body, visibility, created_at: new Date().toISOString() }), { action: "case.note_added", caseId });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_add_case_note", { case_uuid: caseId, note_body: body, note_visibility: visibility }), "Unable to add the note."), { action: "case.note_added", caseId });
}

export async function searchAdminUsers(input = "") {
  const options = typeof input === "string" ? { search: input } : (input || {});
  const search = String(options.search || "").trim();
  const wantsPage = typeof input === "object" && input !== null;
  if (isAdminPreview()) {
    const value = search.toLowerCase();
    let rows = previewUsers.filter((item) => !value || `${item.display_name} ${item.email} ${item.phone} ${item.username}`.toLowerCase().includes(value));
    if (options.status && options.status !== "all") rows = rows.filter((item) => (item.account_status || "active") === options.status);
    if (options.accountType && options.accountType !== "all") rows = rows.filter((item) => (item.account_type || "personal") === options.accountType);
    if (options.sort === "oldest") rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (options.sort === "name") rows.sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
    else if (options.sort === "last_active") rows.sort((a, b) => new Date(b.last_sign_in_at || b.created_at) - new Date(a.last_sign_in_at || a.created_at));
    else rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = rows.length;
    const offset = Math.max(0, Number(options.offset) || 0);
    const limit = Math.max(1, Math.min(Number(options.limit) || 50, 100));
    rows = rows.slice(offset, offset + limit).map((item) => ({ ...item, total_count: total }));
    return previewDelay(wantsPage ? { rows, total } : rows);
  }
  const result = await supabase.rpc("admin_search_users_v2", {
    search_text: search,
    account_status_filter: options.status && options.status !== "all" ? options.status : null,
    account_type_filter: options.accountType && options.accountType !== "all" ? options.accountType : null,
    sort_key: options.sort || "newest",
    result_limit: Math.max(1, Math.min(Number(options.limit) || 50, 100)),
    result_offset: Math.max(0, Number(options.offset) || 0),
  });
  if (!result.error) {
    const rows = result.data || [];
    const total = Number(rows[0]?.total_count || 0);
    return wantsPage ? { rows, total } : rows;
  }
  const fallbackRows = unwrap(await supabase.rpc("admin_search_users", { search_text: search, result_limit: 100 }), "Unable to search users.") || [];
  return wantsPage ? { rows: fallbackRows, total: fallbackRows.length } : fallbackRows;
}

export async function getAdminUserWorkspace(userId) {
  if (!userId) return null;
  if (isAdminPreview()) {
    const user = previewUsers.find((item) => item.user_id === userId) || previewUsers[0];
    const wallet = previewCreditWallets.get(userId) || { user_id: userId, balance: 0, lifetime_earned: 0, lifetime_spent: 0 };
    const transactions = previewCreditTransactions.get(userId) || [
      { id: `preview-credit-${userId}`, user_id: userId, amount: wallet.lifetime_earned || 0, balance_after: wallet.balance || 0, transaction_type: "invite_reward", surface: "platform", metadata: { reason: "Verified invite rewards" }, created_at: new Date(Date.now() - 36e5 * 72).toISOString() },
    ];
    const cases = previewCases.filter((item) => item.subject_user_id === userId || item.reporter_user_id === userId);
    const content = [
      { id: `preview-post-${userId}`, surface: "explore", type: "post", title: `${user.display_name || "User"}'s latest post`, summary: "A recent Explore post available to administrators with the appropriate scope.", status: "published", media_url: null, created_at: new Date(Date.now() - 36e5 * 8).toISOString() },
      ...(user.account_type === "business" ? [{ id: `preview-product-${userId}`, surface: "marketplace", type: "product", title: "Featured marketplace product", summary: "An active UrMall product listing associated with this account.", status: "active", media_url: null, created_at: new Date(Date.now() - 36e5 * 22).toISOString() }] : []),
      ...(user.account_type === "operator" ? [{ id: `preview-operator-${userId}`, surface: "transport", type: "operator", title: user.display_name, summary: "Verified transport operator profile and fleet workspace.", status: "verified", media_url: null, created_at: user.created_at }] : []),
    ];
    return previewDelay({
      user: { ...user, email_verified: true, phone_verified: Boolean(user.phone), profile_verified: user.account_type !== "personal", last_sign_in_at: new Date(Date.now() - 36e5 * 3).toISOString(), restricted_sectors: user.account_status === "warned" ? ["all"] : [] },
      wallet,
      transactions,
      cases,
      content,
      audit: previewAudit.filter((item) => item.resource_id === userId || item.resource_type === "user"),
      summary: { content_count: content.length, case_count: cases.length, open_case_count: cases.filter((item) => !["resolved", "closed"].includes(item.status)).length },
    });
  }
  return unwrap(await supabase.rpc("admin_get_user_workspace", { target_user_id: userId }), "Unable to load this user workspace.");
}

export async function grantAdminVisibilityCredits(input) {
  const requestId = input.requestId || crypto.randomUUID();
  if (isAdminPreview()) {
    return runAdminMutation(() => previewDelay((() => {
      const amount = Math.max(1, Math.min(Number(input.amount) || 0, 1000));
      const previous = previewCreditWallets.get(input.userId) || { user_id: input.userId, balance: 0, lifetime_earned: 0, lifetime_spent: 0 };
      const wallet = { ...previous, balance: previous.balance + amount, lifetime_earned: previous.lifetime_earned + amount, updated_at: new Date().toISOString() };
      previewCreditWallets.set(input.userId, wallet);
      const transaction = { id: requestId, user_id: input.userId, amount, balance_after: wallet.balance, transaction_type: "admin_adjustment", surface: "platform", reference_type: "admin_credit_grant", reference_id: requestId, metadata: { reason: input.reason, adminGrant: true }, created_at: new Date().toISOString() };
      previewCreditTransactions.set(input.userId, [transaction, ...(previewCreditTransactions.get(input.userId) || [])]);
      return { status: "granted", amount, wallet, transaction };
    })()), { action: "visibility_credit.granted", userId: input.userId });
  }
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_grant_visibility_credits", {
    target_user_id: input.userId,
    credit_amount: Number(input.amount),
    grant_reason: input.reason,
    grant_request_id: requestId,
  }), "Unable to grant Visibility Credits."), { action: "visibility_credit.granted", userId: input.userId });
}

export async function setAdminUserStatus(input) {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay({ user_id: input.userId, status: input.status, reason: input.reason, restricted_sectors: input.sectors, expires_at: input.expiresAt || null }), { action: "user.status_changed", userId: input.userId });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_set_user_status", {
    target_user_id: input.userId,
    next_status: input.status,
    action_reason: input.reason,
    target_sectors: input.sectors,
    status_expires_at: input.expiresAt || null,
  }), "Unable to update the account status."), { action: "user.status_changed", userId: input.userId });
}

export async function getAdminTeam() {
  if (isAdminPreview()) return previewDelay(previewTeam);
  return unwrap(await supabase.rpc("admin_list_team"), "Unable to load the admin team.") || [];
}

export async function grantAdminAccess(input) {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay(input), { action: "team.access_granted" });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_grant_access", {
    target_email: input.email,
    target_role_key: input.roleKey,
    target_sectors: input.sectors,
    target_regions: input.regions,
    target_authority: input.authority,
    reason: input.reason,
  }), "Unable to grant admin access."), { action: "team.access_granted" });
}

export async function revokeAdminAccess(assignmentId, reason) {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay({ id: assignmentId, status: "revoked" }), { action: "team.access_revoked", assignmentId });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_revoke_access", { assignment_uuid: assignmentId, reason }), "Unable to revoke admin access."), { action: "team.access_revoked", assignmentId });
}

export async function getNotificationCampaigns() {
  if (isAdminPreview()) return previewDelay(previewCampaigns);
  return unwrap(await supabase.from("admin_notification_campaigns").select("*").order("created_at", { ascending: false }).limit(100), "Unable to load campaigns.") || [];
}

export async function createNotificationCampaign(input) {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay({ id: crypto.randomUUID(), ...input, status: input.schedule ? "pending_approval" : "draft", created_at: new Date().toISOString(), delivery_count: 0, failure_count: 0 }), { action: "notification.campaign_created" });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_create_campaign", {
    campaign_title: input.title,
    campaign_body: input.body,
    campaign_sector: input.sector,
    campaign_audience: input.audience,
    campaign_priority: input.priority,
    campaign_filter: input.filter || {},
    campaign_schedule: input.schedule || null,
  }), "Unable to create the campaign."), { action: "notification.campaign_created" });
}

export async function approveNotificationCampaign(campaignId) {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay({ id: campaignId, status: "approved" }), { action: "notification.campaign_approved", campaignId });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_approve_campaign", { campaign_uuid: campaignId }), "Unable to approve the campaign."), { action: "notification.campaign_approved", campaignId });
}

export async function publishNotificationCampaign(campaignId) {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay({ id: campaignId, status: "completed", sent_at: new Date().toISOString(), delivery_count: 3842, failure_count: 0 }), { action: "notification.campaign_published", campaignId });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_publish_campaign", { campaign_uuid: campaignId }), "Unable to publish the campaign."), { action: "notification.campaign_published", campaignId });
}

export async function getAuditLog() {
  if (isAdminPreview()) return previewDelay(previewAudit);
  return unwrap(await supabase.rpc("admin_get_audit_log", { result_limit: 250 }), "Unable to load audit history.") || [];
}

export async function getAdminActivityNotifications(limit = 20) {
  if (isAdminPreview()) {
    return previewDelay(previewAudit.slice(0, limit).map((item) => ({
      id: `preview-${item.id}`,
      notification_type: "admin_action",
      title: `Admin action: ${item.action_key}`,
      body: item.reason || item.resource_type || "Preview activity",
      priority: "normal",
      action_key: item.action_key,
      sector: item.sector,
      actor_user_id: "preview-user",
      audit_log_id: item.id,
      case_id: item.case_id || null,
      resource_type: item.resource_type,
      resource_id: item.resource_id || null,
      action_status: "active",
      read_at: null,
      created_at: item.created_at,
      metadata: { actorName: "Preview Admin", selfAction: true },
    })));
  }
  const rows = unwrap(
    await supabase
      .from("admin_activity_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100))),
    "Unable to load admin activity notifications.",
  ) || [];
  return rows.filter((item) => !item.archived_at);
}

export async function markAdminActivityNotificationsRead(ids = null) {
  if (isAdminPreview()) return previewDelay(0);
  return unwrap(
    await supabase.rpc("admin_mark_activity_notifications_read", {
      notification_ids: Array.isArray(ids) && ids.length ? ids : null,
    }),
    "Unable to mark admin notifications as read.",
  );
}

export async function updateAdminActivityNotification(notificationId, action) {
  if (isAdminPreview()) {
    const patch = { id: notificationId };
    if (action === "read") patch.read_at = new Date().toISOString();
    if (action === "unread") patch.read_at = null;
    if (action === "archive") {
      patch.archived_at = new Date().toISOString();
      patch.action_status = "dismissed";
    }
    if (action === "restore") {
      patch.archived_at = null;
      patch.action_status = "active";
    }
    return previewDelay(patch);
  }
  return unwrap(
    await supabase.rpc("admin_update_activity_notification", {
      notification_uuid: notificationId,
      next_action: action,
    }),
    "Unable to update this notification.",
  );
}

export async function undoAdminActivityAction(notificationId, reason = "") {
  if (isAdminPreview()) {
    return previewDelay({
      status: "undo_requested",
      message: "Preview undo request recorded for review.",
      notificationId,
    });
  }
  return runAdminMutation(
    async () => unwrap(
      await supabase.rpc("admin_undo_activity_action", {
        notification_uuid: notificationId,
        undo_reason: reason,
      }),
      "Unable to undo this action.",
    ),
    { action: "admin_action.undo_requested", notificationId },
  );
}

export function subscribeToAdminActivityNotifications(userId, onChange) {
  if (!userId || isAdminPreview()) return () => {};
  const channel = supabase
    .channel(`admin-activity-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "admin_activity_notifications", filter: `recipient_user_id=eq.${userId}` },
      (payload) => onChange?.(payload.new, "INSERT"),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "admin_activity_notifications", filter: `recipient_user_id=eq.${userId}` },
      (payload) => onChange?.(payload.new, "UPDATE"),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function getFeatureFlags() {
  if (isAdminPreview()) return previewDelay(previewFlags);
  return unwrap(await supabase.from("admin_feature_flags").select("*").order("sector").order("name"), "Unable to load feature controls.") || [];
}

export async function updateFeatureFlag(flagKey, enabled, reason) {
  if (isAdminPreview()) return runAdminMutation(() => previewDelay(updatePreviewFlag(flagKey, enabled)), { action: "settings.feature_flag_updated", flagKey });
  return runAdminMutation(async () => unwrap(await supabase.rpc("admin_update_feature_flag", { target_flag_key: flagKey, next_enabled: enabled, next_configuration: null, change_reason: reason }), "Unable to update the feature flag."), { action: "settings.feature_flag_updated", flagKey });
}
