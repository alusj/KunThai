import supabase from "../Backend/lib/supabaseClient";
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
const GENERAL_COUNTRY_KEY = "__general__";
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

function firstText(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function normalizeCountryKey(value = "") {
  const text = String(value || "").trim();
  if (!text) return GENERAL_COUNTRY_KEY;
  return text.length <= 3 ? text.toUpperCase() : text.toLowerCase();
}

function sourceFor(item) {
  return item?.metadata?.source || {};
}

export function getCaseCountry(item = {}) {
  const source = sourceFor(item);
  const code = firstText(
    item.country_iso,
    item.country_code,
    source.country_iso,
    source.country_code,
    source.countryCode,
    source.location_country_iso,
    source.locationCountryIso,
  ).toUpperCase();
  const name = firstText(
    item.country_name,
    item.country,
    source.country_name,
    source.countryName,
    source.country,
    source.location_country,
    source.locationCountry,
  );
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
  const options = new Map();
  let hasGeneral = false;
  cases.forEach((item) => {
    const country = getCaseCountry(item);
    if (country.key === GENERAL_COUNTRY_KEY) {
      hasGeneral = true;
      return;
    }
    options.set(country.key, { value: country.key, label: country.name || country.code, code: country.code });
  });
  const ordered = Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  if (hasGeneral) ordered.push({ value: GENERAL_COUNTRY_KEY, label: "General / unknown", code: "" });
  return [{ value: "all", label: "All countries", code: "" }, ...ordered];
}

export function getCaseTypeLabel(item = {}) {
  const type = item.case_type || item.resource_type || "";
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
  }

  return content ? [content] : fallbackCaseContent(item);
}

export async function claimCase(caseId) {
  if (isAdminPreview()) return previewDelay(updatePreviewCase(caseId, { assignee_user_id: "preview-user", status: "assigned" }));
  return unwrap(await supabase.rpc("admin_claim_case", { case_uuid: caseId }), "Unable to claim this case.");
}

export async function transitionCase(caseId, status, note = "") {
  if (isAdminPreview()) return previewDelay(updatePreviewCase(caseId, { status, resolution_note: note || null }));
  return unwrap(await supabase.rpc("admin_transition_case", { case_uuid: caseId, next_status: status, transition_note: note }), "Unable to update this case.");
}

export async function applyCaseDecision(caseId, decision, reason) {
  if (isAdminPreview()) return previewDelay(updatePreviewCase(caseId, { status: decision === "request_information" ? "waiting_information" : "resolved", resolution_code: decision, resolution_note: reason }));
  return unwrap(await supabase.rpc("admin_apply_case_decision", { case_uuid: caseId, decision_key: decision, decision_reason: reason }), "Unable to apply this decision.");
}

export async function reviewCaseApproval(approvalId, approved, reason, caseId = "") {
  if (isAdminPreview()) return previewDelay(updatePreviewCase(caseId, { status: approved ? "resolved" : "in_review" }));
  return unwrap(await supabase.rpc("admin_review_approval", { approval_uuid: approvalId, approve_action: approved, review_reason: reason }), "Unable to review this approval.");
}

export async function addCaseNote(caseId, body, visibility = "internal") {
  if (isAdminPreview()) return previewDelay({ id: crypto.randomUUID(), case_id: caseId, body, visibility, created_at: new Date().toISOString() });
  return unwrap(await supabase.rpc("admin_add_case_note", { case_uuid: caseId, note_body: body, note_visibility: visibility }), "Unable to add the note.");
}

export async function searchAdminUsers(search = "") {
  if (isAdminPreview()) {
    const value = search.toLowerCase();
    return previewDelay(previewUsers.filter((item) => !value || `${item.display_name} ${item.email} ${item.phone} ${item.username}`.toLowerCase().includes(value)));
  }
  return unwrap(await supabase.rpc("admin_search_users", { search_text: search, result_limit: 50 }), "Unable to search users.") || [];
}

export async function setAdminUserStatus(input) {
  if (isAdminPreview()) return previewDelay({ user_id: input.userId, status: input.status, reason: input.reason, restricted_sectors: input.sectors, expires_at: input.expiresAt || null });
  return unwrap(await supabase.rpc("admin_set_user_status", {
    target_user_id: input.userId,
    next_status: input.status,
    action_reason: input.reason,
    target_sectors: input.sectors,
    status_expires_at: input.expiresAt || null,
  }), "Unable to update the account status.");
}

export async function getAdminTeam() {
  if (isAdminPreview()) return previewDelay(previewTeam);
  return unwrap(await supabase.rpc("admin_list_team"), "Unable to load the admin team.") || [];
}

export async function grantAdminAccess(input) {
  if (isAdminPreview()) return previewDelay(input);
  return unwrap(await supabase.rpc("admin_grant_access", {
    target_email: input.email,
    target_role_key: input.roleKey,
    target_sectors: input.sectors,
    target_regions: input.regions,
    target_authority: input.authority,
    reason: input.reason,
  }), "Unable to grant admin access.");
}

export async function revokeAdminAccess(assignmentId, reason) {
  if (isAdminPreview()) return previewDelay({ id: assignmentId, status: "revoked" });
  return unwrap(await supabase.rpc("admin_revoke_access", { assignment_uuid: assignmentId, reason }), "Unable to revoke admin access.");
}

export async function getNotificationCampaigns() {
  if (isAdminPreview()) return previewDelay(previewCampaigns);
  return unwrap(await supabase.from("admin_notification_campaigns").select("*").order("created_at", { ascending: false }).limit(100), "Unable to load campaigns.") || [];
}

export async function createNotificationCampaign(input) {
  if (isAdminPreview()) return previewDelay({ id: crypto.randomUUID(), ...input, status: input.schedule ? "pending_approval" : "draft", created_at: new Date().toISOString(), delivery_count: 0, failure_count: 0 });
  return unwrap(await supabase.rpc("admin_create_campaign", {
    campaign_title: input.title,
    campaign_body: input.body,
    campaign_sector: input.sector,
    campaign_audience: input.audience,
    campaign_priority: input.priority,
    campaign_filter: input.filter || {},
    campaign_schedule: input.schedule || null,
  }), "Unable to create the campaign.");
}

export async function approveNotificationCampaign(campaignId) {
  if (isAdminPreview()) return previewDelay({ id: campaignId, status: "approved" });
  return unwrap(await supabase.rpc("admin_approve_campaign", { campaign_uuid: campaignId }), "Unable to approve the campaign.");
}

export async function publishNotificationCampaign(campaignId) {
  if (isAdminPreview()) return previewDelay({ id: campaignId, status: "completed", sent_at: new Date().toISOString(), delivery_count: 3842, failure_count: 0 });
  return unwrap(await supabase.rpc("admin_publish_campaign", { campaign_uuid: campaignId }), "Unable to publish the campaign.");
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
      read_at: null,
      created_at: item.created_at,
      metadata: {},
    })));
  }
  return unwrap(
    await supabase
      .from("admin_activity_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100))),
    "Unable to load admin activity notifications.",
  ) || [];
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

export function subscribeToAdminActivityNotifications(userId, onChange) {
  if (!userId || isAdminPreview()) return () => {};
  const channel = supabase
    .channel(`admin-activity-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "admin_activity_notifications", filter: `recipient_user_id=eq.${userId}` },
      (payload) => onChange?.(payload.new),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function getFeatureFlags() {
  if (isAdminPreview()) return previewDelay(previewFlags);
  return unwrap(await supabase.from("admin_feature_flags").select("*").order("sector").order("name"), "Unable to load feature controls.") || [];
}

export async function updateFeatureFlag(flagKey, enabled, reason) {
  if (isAdminPreview()) return previewDelay(updatePreviewFlag(flagKey, enabled));
  return unwrap(await supabase.rpc("admin_update_feature_flag", { target_flag_key: flagKey, next_enabled: enabled, next_configuration: null, change_reason: reason }), "Unable to update the feature flag.");
}
