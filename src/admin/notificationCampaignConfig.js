import {
  CAMPAIGN_SCHEMA_VERSION,
  audienceKey,
  audienceTargetPaths,
  buildCampaignAction,
  campaignSectorForAudience,
  compatiblePresentations,
  compatibleScreens,
  createDefaultPresentation,
  createEmptyAction,
  createEmptyAudience,
  inboxForAudience,
  isSafeExternalUrl,
  isValidTimeZone,
  normalizeAudience,
  normalizeClosingAnimation,
  normalizeFrequency,
  normalizeOpeningAnimation,
  presentationIncludesInbox,
  presentationIsInApp,
  presentationMeta,
  screenSupportsPresentation,
  utcIsoToZonedLocal,
  validateCampaignAction,
  zonedLocalToUtcIso,
} from "../Backend/services/campaigns/campaignModel.js";
import { GLOBAL_COUNTRY_PROFILES } from "../data/globalCountryProfiles.js";

// Admin campaign builder: form state, per-step validation and the payload
// sent to admin_create_campaign / admin_update_campaign. The database repeats
// every check in admin_validate_campaign_spec.

export const CAMPAIGN_STEPS = Object.freeze([
  { id: "campaign", label: "Campaign" },
  { id: "audience", label: "Audience" },
  { id: "presentation", label: "Presentation" },
  { id: "content", label: "Content" },
  { id: "action", label: "Action" },
  { id: "schedule", label: "Schedule" },
  { id: "preview", label: "Preview & test" },
  { id: "review", label: "Review & send" },
]);

export const CAMPAIGN_CATEGORIES = Object.freeze([
  ["announcement", "Announcement"],
  ["product_update", "Product update"],
  ["feature_launch", "Feature launch"],
  ["promotion", "Promotion"],
  ["marketplace", "Marketplace"],
  ["seller_update", "Seller update"],
  ["urride_update", "UrRide update"],
  ["operator_update", "Operator update"],
  ["delivery_update", "Delivery update"],
  ["maintenance", "Maintenance"],
  ["policy", "Policy"],
  ["account", "Account"],
  ["safety", "Safety"],
  ["security", "Security"],
  ["emergency", "Emergency"],
]);

export const CRITICAL_CATEGORIES = Object.freeze(["safety", "security", "account", "emergency"]);
const ALWAYS_DISMISSIBLE_CATEGORIES = Object.freeze(["promotion", "marketplace"]);

export const CAMPAIGN_PRIORITIES = Object.freeze([
  ["low", "Low"],
  ["normal", "Normal"],
  ["important", "Important"],
  ["high", "High"],
  ["critical", "Critical"],
]);

export const AUDIENCE_SEGMENTS = Object.freeze([
  ["new_users", "New accounts", "Created in the last 30 days"],
  ["active_users", "Active", "Signed in during the last 30 days"],
  ["inactive_users", "Inactive", "No sign-in for 90 days"],
  ["verified_users", "Verified", "Verified email or phone"],
  ["unverified_users", "Unverified", "No verified email or phone"],
]);

export const CAMPAIGN_ICONS = Object.freeze([
  ["bell", "Bell"],
  ["megaphone", "Megaphone"],
  ["sparkles", "Sparkles"],
  ["gift", "Gift"],
  ["info", "Information"],
  ["shield", "Shield"],
  ["store", "Store"],
  ["car", "Vehicle"],
  ["calendar", "Calendar"],
]);

export const CAMPAIGN_COUNTRIES = Object.freeze(
  GLOBAL_COUNTRY_PROFILES.map((country) => ({ iso2: country.iso2, name: country.name })).sort((a, b) => a.name.localeCompare(b.name)),
);

export const TIME_ZONE_OPTIONS = Object.freeze(
  [
    "UTC",
    "Africa/Freetown",
    "Africa/Lagos",
    "Africa/Accra",
    "Africa/Monrovia",
    "Africa/Conakry",
    "Africa/Abidjan",
    "Africa/Dakar",
    "Africa/Banjul",
    "Africa/Nairobi",
    "Africa/Johannesburg",
    "Europe/London",
    "Europe/Paris",
    "America/New_York",
    "America/Toronto",
    "Asia/Dubai",
  ].filter(isValidTimeZone),
);

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function createEmptyCampaignForm() {
  return {
    campaign: { name: "", description: "", category: "announcement", priority: "normal", tags: [] },
    audience: createEmptyAudience(),
    audienceMode: "everyone",
    users: [],
    segments: [],
    locationMode: "all",
    locations: [],
    presentation: { ...createDefaultPresentation("inbox"), dismissible: true },
    channels: ["in_app"],
    content: { title: "", body: "", icon: "bell", badge: "", mediaUrl: "" },
    action: createEmptyAction(),
    schedule: { mode: "now", startAt: "", endMode: "after", endAfterDays: 7, endAt: "", timeZone: browserTimeZone() },
  };
}

// --- Keeping choices consistent -------------------------------------------------------

/** Apply an audience change and repair every dependent choice. */
export function withAudience(form, patch, { canCritical = false } = {}) {
  const audience = normalizeAudience({ ...form.audience, ...patch });
  return withPresentation({ ...form, audience }, {}, { canCritical });
}

/** Apply a presentation change, falling back to a compatible type and screen. */
export function withPresentation(form, patch = {}, { canCritical = false } = {}) {
  const next = { ...form.presentation, ...patch };
  const allowed = compatiblePresentations(form.audience, { canCritical }).map((item) => item.value);
  let type = allowed.includes(next.type) ? next.type : "inbox";
  if (patch.type && patch.type !== form.presentation.type) {
    Object.assign(next, createDefaultPresentation(type), { dismissible: form.presentation.dismissible }, patch);
  }
  const screens = compatibleScreens(form.audience).filter((screen) => screenSupportsPresentation(screen, type));
  let screen = next.screen;
  if (!presentationIsInApp(type)) screen = "";
  else if (!screens.includes(screen)) screen = screens[0] || "";
  if (presentationIsInApp(type) && !screen) type = "inbox";
  const critical = type === "critical";
  return {
    ...form,
    campaign: critical ? { ...form.campaign, priority: "critical" } : form.campaign,
    presentation: { ...next, type, screen: presentationIsInApp(type) ? screen : "", dismissible: critical ? false : next.dismissible !== false },
  };
}

// --- Validation ----------------------------------------------------------------------

export function validateCampaignStep(stepId, form, { canCritical = false, now = Date.now() } = {}) {
  const { campaign, audience, presentation, content, schedule } = form;
  if (stepId === "campaign") {
    if (!campaign.name.trim()) return "Give the campaign an internal name.";
    if (campaign.name.trim().length > 80) return "Keep the campaign name under 80 characters.";
    if (campaign.description.length > 300) return "Keep the internal description under 300 characters.";
    if (campaign.tags.length > 8) return "Use at most 8 tags.";
    if (campaign.priority === "critical" && !canCritical) return "You do not have permission to create critical campaigns.";
    if (campaign.priority === "critical" && !CRITICAL_CATEGORIES.includes(campaign.category)) {
      return "Critical priority is only for safety, security, account or emergency campaigns.";
    }
    return "";
  }
  if (stepId === "audience") {
    if (!audienceKey(audience)) return "Choose who this campaign is for.";
    if (form.audienceMode === "users" && !form.users.length) return "Add at least one KunThai ID.";
    if (form.audienceMode !== "users" && form.locationMode === "countries") {
      if (!form.locations.length) return "Choose at least one country, or target all locations.";
      if (form.locations.some((location) => !location.entireCountry && !location.cities.length)) {
        return "Choose at least one city for each country limited to cities.";
      }
    }
    return "";
  }
  if (stepId === "presentation") {
    const allowed = compatiblePresentations(audience, { canCritical }).map((item) => item.value);
    if (!allowed.includes(presentation.type)) return "That presentation is not available for this audience.";
    if (presentationIsInApp(presentation.type)) {
      if (!compatibleScreens(audience).includes(presentation.screen) || !screenSupportsPresentation(presentation.screen, presentation.type)) {
        return "Choose the KunThai screen where this appears.";
      }
    }
    if (presentation.type === "critical" && (campaign.priority !== "critical" || !CRITICAL_CATEGORIES.includes(campaign.category))) {
      return "Critical alerts need Critical priority and a safety, security, account or emergency category.";
    }
    if (!presentation.dismissible && ALWAYS_DISMISSIBLE_CATEGORIES.includes(campaign.category)) {
      return "Promotional and marketplace campaigns must be dismissible.";
    }
    return "";
  }
  if (stepId === "content") {
    if (!content.title.trim()) return "Add a title.";
    if (content.title.trim().length > 120) return "Keep the title under 120 characters.";
    if (!content.body.trim()) return "Add the message.";
    if (content.body.trim().length > 1000) return "Keep the message under 1,000 characters.";
    if (content.badge.length > 16) return "Keep the badge under 16 characters.";
    if (content.mediaUrl.trim() && !isSafeExternalUrl(content.mediaUrl.trim())) return "Images must use a full https:// link.";
    return "";
  }
  if (stepId === "action") {
    return validateCampaignAction(form.action, audience.platform);
  }
  if (stepId === "schedule") {
    if (!isValidTimeZone(schedule.timeZone)) return "Choose a valid time zone.";
    const start = schedule.mode === "later" ? zonedLocalToUtcIso(schedule.startAt, schedule.timeZone) : null;
    if (schedule.mode === "later") {
      if (!start) return "Choose when the campaign starts.";
      if (new Date(start).getTime() <= now + 60_000) return "The start time must be at least a minute from now.";
    }
    if (schedule.endMode === "at") {
      const end = zonedLocalToUtcIso(schedule.endAt, schedule.timeZone);
      if (!end) return "Choose when the campaign ends.";
      if (new Date(end).getTime() <= (start ? new Date(start).getTime() : now)) return "The end time must be after the start time.";
    }
    if (schedule.endMode === "after") {
      const days = Number(schedule.endAfterDays);
      if (!Number.isInteger(days) || days < 1 || days > 90) return "End the campaign after 1 to 90 days.";
    }
    return "";
  }
  return "";
}

export function firstCampaignError(form, options = {}) {
  for (const step of CAMPAIGN_STEPS) {
    const message = validateCampaignStep(step.id, form, options);
    if (message) return { step: step.id, message };
  }
  return null;
}

// --- Payload ---------------------------------------------------------------------------

export function campaignStartIso(form) {
  return form.schedule.mode === "later" ? zonedLocalToUtcIso(form.schedule.startAt, form.schedule.timeZone) : null;
}

export function campaignEndIso(form, now = Date.now()) {
  const { schedule } = form;
  if (schedule.endMode === "at") return zonedLocalToUtcIso(schedule.endAt, schedule.timeZone);
  if (schedule.endMode === "after") {
    const start = campaignStartIso(form);
    const base = start ? new Date(start).getTime() : now;
    return new Date(base + Math.max(1, Number(schedule.endAfterDays) || 7) * 86_400_000).toISOString();
  }
  return null;
}

export function buildCampaignPayload(form, now = Date.now()) {
  const audience = normalizeAudience(form.audience);
  const targetPaths = audienceTargetPaths(audience);
  const specificUsers = form.audienceMode === "users";
  const locations = !specificUsers && form.locationMode === "countries" ? form.locations : [];
  const segments = !specificUsers ? form.segments : [];
  const type = form.presentation.type;
  const dismissible = ALWAYS_DISMISSIBLE_CATEGORIES.includes(form.campaign.category) ? true : type === "critical" ? false : form.presentation.dismissible !== false;
  const { actionTarget, actionData } = buildCampaignAction(form.action);
  const mediaUrl = form.content.mediaUrl.trim();
  const presentation = {
    type,
    screen: presentationIsInApp(type) ? form.presentation.screen : "",
    includeInbox: presentationIncludesInbox(type),
    position: form.presentation.position,
    width: form.presentation.width,
    mobileWidth: form.presentation.mobileWidth,
    overlay: form.presentation.overlay,
    backdropDismiss: dismissible && form.presentation.backdropDismiss,
    closeButton: dismissible && form.presentation.closeButton,
    autoDismissSeconds: Math.max(0, Math.min(120, Math.round(Number(form.presentation.autoDismissSeconds) || 0))),
    frequency: normalizeFrequency(form.presentation.frequency),
    openingAnimation: normalizeOpeningAnimation(form.presentation.openingAnimation),
    closingAnimation: normalizeClosingAnimation(form.presentation.closingAnimation),
    animationDurationMs: Math.max(0, Math.min(1200, Math.round(Number(form.presentation.animationDurationMs) || 0))),
  };

  const configuration = {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    audience,
    targetPaths,
    locations,
    inbox: inboxForAudience(audience),
    presentation,
    content: { icon: form.content.icon, badge: form.content.badge.trim() },
    media: mediaUrl ? { kind: "image", url: mediaUrl } : { kind: "none", url: "" },
    action: { ...form.action, actionTarget, actionData },
    behaviour: { canDismiss: dismissible, frequency: presentation.frequency },
    schedule: { mode: form.schedule.mode, timeZone: form.schedule.timeZone },
    campaign: { description: form.campaign.description.trim(), tags: form.campaign.tags },
    editor: JSON.parse(JSON.stringify(form)),
  };

  return {
    campaignName: form.campaign.name.trim(),
    title: form.content.title.trim(),
    body: form.content.body.trim(),
    sector: campaignSectorForAudience(audience),
    audience: specificUsers ? "specific_users" : segments.length ? "segments" : "all",
    priority: form.campaign.priority,
    filter: {
      targets: targetPaths,
      segments,
      userIds: specificUsers ? form.users.map((user) => user.user_id).filter(Boolean) : [],
      kunthaiIds: specificUsers ? form.users.map((user) => user.public_id).filter(Boolean) : [],
      locations,
    },
    schedule: campaignStartIso(form),
    channels: form.channels.length ? form.channels : ["in_app"],
    presentation: type,
    category: form.campaign.category,
    actionTarget,
    actionData,
    expiresAt: campaignEndIso(form, now),
    configuration,
  };
}

/** Whether publishing needs the "no location limit" acknowledgement. */
export function isWorldwideCampaign(payload = {}) {
  if (payload.audience === "specific_users" || payload.audience_type === "specific_users") return false;
  const filter = payload.filter || payload.audience_filter || {};
  return (filter.targets || []).includes("all") || !(filter.locations || []).length;
}

// --- Editing an existing campaign ------------------------------------------------------

function legacyAudience(campaign) {
  const paths = campaign.configuration?.targetPaths || campaign.audience_filter?.targets || [];
  const first = paths[0] || "all";
  if (first === "all") return { ...createEmptyAudience(), platform: "all" };
  if (/^urmall\.(sellers|seller_dashboard)/.test(first)) {
    const types = paths.map((path) => path.split(".")[2]).filter((type) => type && type !== "all");
    return normalizeAudience({ platform: "urmall", urmallRole: "seller", sellerTypes: types });
  }
  if (/^urmall\.(buyers|buyer_dashboard)/.test(first)) return normalizeAudience({ platform: "urmall", urmallRole: "buyer" });
  if (first.startsWith("urmall.")) return normalizeAudience({ platform: "urmall", urmallRole: "all" });
  if (/^urride\.(operator|operator_dashboard)/.test(first)) return normalizeAudience({ platform: "urride", urrideRole: "operator" });
  if (first.startsWith("urride.company_dashboard")) return normalizeAudience({ platform: "urride", urrideRole: "company" });
  if (first.startsWith("urride.passenger")) return normalizeAudience({ platform: "urride", urrideRole: "passenger" });
  if (first.startsWith("urride.") || first.startsWith("nearby_area.")) return normalizeAudience({ platform: "urride", urrideRole: "all" });
  return { ...createEmptyAudience(), platform: "explore" };
}

export function campaignToEditorForm(campaign = {}) {
  const base = createEmptyCampaignForm();
  const saved = campaign.configuration?.editor;
  if (campaign.configuration?.schemaVersion >= CAMPAIGN_SCHEMA_VERSION && saved?.campaign && saved?.audience) {
    const form = {
      ...base,
      ...saved,
      campaign: { ...base.campaign, ...saved.campaign },
      presentation: { ...base.presentation, ...saved.presentation },
      content: { ...base.content, ...saved.content },
      action: { ...base.action, ...saved.action },
      schedule: { ...base.schedule, ...saved.schedule },
    };
    // A schedule that has already passed must be chosen again.
    if (campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > Date.now()) {
      form.schedule = { ...form.schedule, mode: "later", startAt: utcIsoToZonedLocal(campaign.scheduled_at, form.schedule.timeZone) };
    } else if (form.schedule.mode === "later") {
      form.schedule = { ...form.schedule, startAt: "" };
    }
    return form;
  }

  const legacyType = presentationMeta(campaign.presentation) ? campaign.presentation : "inbox";
  const form = {
    ...base,
    campaign: {
      ...base.campaign,
      name: campaign.campaign_name || campaign.title || "",
      category: CAMPAIGN_CATEGORIES.some(([value]) => value === campaign.category) ? campaign.category : "announcement",
      priority: CAMPAIGN_PRIORITIES.some(([value]) => value === campaign.priority) ? campaign.priority : "normal",
    },
    audience: legacyAudience(campaign),
    content: { ...base.content, title: campaign.title || "", body: campaign.body || "" },
  };
  return withPresentation(form, { type: legacyType });
}
