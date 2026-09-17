// Admin notification campaigns — the shared model.
//
// One vocabulary for the admin campaign builder, the database validation
// (mirrored in supabase/migrations/20260917120000_admin_campaign_delivery_v2.sql)
// and the KunThai screens that show campaigns. Pure functions only, so every
// rule here is unit tested and identical in the admin app and the user app.

export const CAMPAIGN_SCHEMA_VERSION = 2;

// --- Audience ------------------------------------------------------------------

export const AUDIENCE_PLATFORMS = Object.freeze([
  { value: "all", label: "All KunThai", detail: "Every KunThai account" },
  { value: "explore", label: "Explore", detail: "Explore users (UrFeed, Swip and the Explore notification centre)" },
  { value: "urride", label: "UrRide", detail: "Passengers, operators and transport companies" },
  { value: "urmall", label: "UrMall", detail: "Buyers and sellers" },
]);

export const URRIDE_ROLES = Object.freeze([
  { value: "all", label: "All UrRide", detail: "Passengers, operators and company members" },
  { value: "passenger", label: "Passengers", detail: "Accounts that have booked an UrRide trip" },
  { value: "operator", label: "Operators", detail: "Registered operators with a fleet" },
  { value: "company", label: "Companies", detail: "Company owners and active company members" },
]);

export const URMALL_ROLES = Object.freeze([
  { value: "all", label: "All UrMall", detail: "Buyers and sellers" },
  { value: "buyer", label: "Buyers", detail: "Accounts that have ordered from or messaged an UrMall business" },
  { value: "seller", label: "Sellers", detail: "Business owners and accepted business administrators" },
]);

// Values are marketplace_businesses.business_kind (see businessTypePolicy.js).
// Legacy "hotel" businesses are matched as Real Estate by the database.
export const SELLER_TYPES = Object.freeze([
  { value: "retail", label: "Retail" },
  { value: "restaurant", label: "Restaurant" },
  { value: "property_agent", label: "Real Estate" },
  { value: "vendor", label: "Vendor" },
]);

// Operator services are transport_fleets.service_category; vehicles map onto
// transport_fleets.fleet_type (motorcycle / tricycle / car). A van is a
// delivery fleet stored as "car", a taxi is a transport fleet stored as "car".
export const OPERATOR_SERVICES = Object.freeze([
  { value: "transport", label: "Transport" },
  { value: "delivery", label: "Delivery" },
]);

export const OPERATOR_VEHICLES = Object.freeze({
  transport: Object.freeze([
    { value: "motorbike", label: "Motorbike" },
    { value: "tricycle", label: "Tricycle" },
    { value: "taxi", label: "Taxi" },
  ]),
  delivery: Object.freeze([
    { value: "motorbike", label: "Motorbike" },
    { value: "tricycle", label: "Tricycle" },
    { value: "van", label: "Van" },
  ]),
});

// transport_company_fleets.service_category: Ride only / Delivery only /
// Ride and delivery / Rental.
export const COMPANY_TYPES = Object.freeze([
  { value: "transport", label: "Transport companies" },
  { value: "delivery", label: "Delivery companies" },
  { value: "rental", label: "Rental companies" },
]);

const PLATFORM_VALUES = AUDIENCE_PLATFORMS.map((item) => item.value);
const SELLER_TYPE_VALUES = SELLER_TYPES.map((item) => item.value);
const COMPANY_TYPE_VALUES = COMPANY_TYPES.map((item) => item.value);

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function uniqueAllowed(values, allowed) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => allowed.includes(value)))];
}

export function createEmptyAudience() {
  return {
    platform: "",
    urrideRole: "all",
    urmallRole: "all",
    sellerTypes: [],
    operatorService: "all",
    operatorVehicles: [],
    companyTypes: [],
  };
}

/** Clean an audience object so only values valid for its branch survive. */
export function normalizeAudience(audience = {}) {
  const platform = pick(audience.platform, PLATFORM_VALUES, "");
  const result = { ...createEmptyAudience(), platform };
  if (platform === "urride") {
    result.urrideRole = pick(audience.urrideRole, URRIDE_ROLES.map((item) => item.value), "all");
    if (result.urrideRole === "operator") {
      result.operatorService = pick(audience.operatorService, ["all", "transport", "delivery"], "all");
      if (result.operatorService !== "all") {
        result.operatorVehicles = uniqueAllowed(
          audience.operatorVehicles,
          OPERATOR_VEHICLES[result.operatorService].map((item) => item.value),
        );
      }
    }
    if (result.urrideRole === "company") result.companyTypes = uniqueAllowed(audience.companyTypes, COMPANY_TYPE_VALUES);
  }
  if (platform === "urmall") {
    result.urmallRole = pick(audience.urmallRole, URMALL_ROLES.map((item) => item.value), "all");
    if (result.urmallRole === "seller") result.sellerTypes = uniqueAllowed(audience.sellerTypes, SELLER_TYPE_VALUES);
  }
  return result;
}

/** The audience branch: all, explore, urmall.buyer, urride.operator, … */
export function audienceKey(audience = {}) {
  const clean = normalizeAudience(audience);
  if (clean.platform === "all" || clean.platform === "explore") return clean.platform;
  if (clean.platform === "urmall") return `urmall.${clean.urmallRole}`;
  if (clean.platform === "urride") return `urride.${clean.urrideRole}`;
  return "";
}

/**
 * Target paths resolved by public.admin_notification_user_matches_target.
 * Every selection narrows; nothing is ever widened to a sibling subtype.
 */
export function audienceTargetPaths(audience = {}) {
  const clean = normalizeAudience(audience);
  const key = audienceKey(clean);
  if (!key) return [];
  if (key === "all") return ["all"];
  if (key === "explore") return ["explore.general"];
  if (key === "urmall.all") return ["urmall.general"];
  if (key === "urmall.buyer") return ["urmall.buyers"];
  if (key === "urmall.seller") {
    return clean.sellerTypes.length ? clean.sellerTypes.map((type) => `urmall.sellers.${type}`) : ["urmall.sellers.all"];
  }
  if (key === "urride.all") return ["urride.general"];
  if (key === "urride.passenger") return ["urride.passenger"];
  if (key === "urride.company") {
    return clean.companyTypes.length ? clean.companyTypes.map((type) => `urride.company_dashboard.${type}`) : ["urride.company_dashboard.all"];
  }
  if (key === "urride.operator") {
    if (clean.operatorService === "all") return ["urride.operator.all"];
    if (!clean.operatorVehicles.length) return [`urride.operator.${clean.operatorService}.all`];
    return clean.operatorVehicles.map((vehicle) => `urride.operator.${clean.operatorService}.${vehicle}`);
  }
  return [];
}

export function campaignSectorForAudience(audience = {}) {
  const platform = normalizeAudience(audience).platform;
  if (platform === "urmall") return "marketplace";
  if (platform === "urride") return "transport";
  if (platform === "explore") return "explore";
  return "platform";
}

export function describeAudience(audience = {}) {
  const clean = normalizeAudience(audience);
  const labelOf = (list, value) => list.find((item) => item.value === value)?.label || value;
  if (!clean.platform) return "No audience selected";
  if (clean.platform === "all") return "All KunThai users";
  if (clean.platform === "explore") return "Explore users";
  if (clean.platform === "urmall") {
    if (clean.urmallRole !== "seller") return `UrMall → ${labelOf(URMALL_ROLES, clean.urmallRole)}`;
    const types = clean.sellerTypes.length ? clean.sellerTypes.map((type) => labelOf(SELLER_TYPES, type)).join(", ") : "All sellers";
    return `UrMall → Sellers → ${types}`;
  }
  if (clean.urrideRole === "operator") {
    if (clean.operatorService === "all") return "UrRide → Operators → All";
    const vehicles = clean.operatorVehicles.length
      ? clean.operatorVehicles.map((vehicle) => labelOf(OPERATOR_VEHICLES[clean.operatorService], vehicle)).join(", ")
      : "All vehicles";
    return `UrRide → Operators → ${labelOf(OPERATOR_SERVICES, clean.operatorService)} → ${vehicles}`;
  }
  if (clean.urrideRole === "company") {
    const types = clean.companyTypes.length ? clean.companyTypes.map((type) => labelOf(COMPANY_TYPES, type)).join(", ") : "All companies";
    return `UrRide → Companies → ${types}`;
  }
  return `UrRide → ${labelOf(URRIDE_ROLES, clean.urrideRole)}`;
}

// --- Screens and inboxes -----------------------------------------------------------

// A screen is where an in-app presentation may appear. The KunThai app reports
// its current screen through campaignSurfaceStore; these keys are the contract.
export const CAMPAIGN_SCREENS = Object.freeze({
  any: { label: "Anywhere in KunThai", detail: "Whichever KunThai section the person is using" },
  explore: { label: "Explore", detail: "UrFeed, Swip and the rest of Explore" },
  urmall: { label: "Anywhere in UrMall", detail: "Buyer browsing or a seller workspace" },
  "urmall.buyer": { label: "UrMall buyer interface", detail: "UrMall browsing, product and store screens" },
  "urmall.seller": { label: "Seller dashboard", detail: "The UrMall business workspace" },
  urride: { label: "Anywhere in UrRide", detail: "Passenger, operator or company screens" },
  "urride.passenger": { label: "UrRide passenger interface", detail: "UrRide home, bookings and trips" },
  "urride.operator": { label: "Operator dashboard", detail: "The operator dashboard" },
  "urride.company": { label: "Company dashboard", detail: "The transport company workspace" },
});

const SCREENS_BY_AUDIENCE = Object.freeze({
  all: ["any", "explore"],
  explore: ["explore"],
  "urmall.all": ["urmall", "urmall.buyer", "urmall.seller"],
  "urmall.buyer": ["urmall.buyer"],
  "urmall.seller": ["urmall.seller"],
  "urride.all": ["urride", "urride.passenger", "urride.operator", "urride.company"],
  "urride.passenger": ["urride.passenger"],
  "urride.operator": ["urride.operator"],
  "urride.company": ["urride.company"],
});

export function compatibleScreens(audience = {}) {
  return SCREENS_BY_AUDIENCE[audienceKey(audience)] || [];
}

// Inboxes are the notification lists each KunThai interface already has.
export const CAMPAIGN_INBOXES = Object.freeze({
  explore: "Explore notification centre",
  urmall: "UrMall notifications (buyer bell)",
  "urmall.seller": "Seller dashboard notifications",
  urride: "UrRide notifications (passenger header)",
  "urride.operator": "Operator dashboard notifications",
  "urride.company": "Company dashboard notifications",
});

const INBOX_BY_AUDIENCE = Object.freeze({
  all: "explore",
  explore: "explore",
  "urmall.all": "urmall",
  "urmall.buyer": "urmall",
  "urmall.seller": "urmall.seller",
  "urride.all": "urride",
  "urride.passenger": "urride",
  "urride.operator": "urride.operator",
  "urride.company": "urride.company",
});

export function inboxForAudience(audience = {}) {
  return INBOX_BY_AUDIENCE[audienceKey(audience)] || "";
}

// --- Presentation ------------------------------------------------------------------

// Screens that carry KunThai's bottom tab bar. The inline card is placed
// relative to that bar, so it is only offered where the bar exists.
const INLINE_SCREENS = new Set(["any", "explore", "urmall", "urmall.buyer", "urride", "urride.passenger"]);

export const PRESENTATIONS = Object.freeze([
  { value: "inbox", label: "Notification centre", detail: "Stored quietly in the matching inbox", inbox: true, inApp: false },
  { value: "floating", label: "Floating card", detail: "A temporary card over the chosen screen", inbox: false, inApp: true },
  { value: "floating_inbox", label: "Floating card + inbox", detail: "Card on screen and a copy in the inbox", inbox: true, inApp: true },
  { value: "inline", label: "Inline", detail: "A card that sits above the navigation bar", inbox: false, inApp: true, inline: true },
  { value: "inline_inbox", label: "Inline + inbox", detail: "Inline card and a copy in the inbox", inbox: true, inApp: true, inline: true },
  { value: "banner", label: "Banner", detail: "A slim announcement strip", inbox: false, inApp: true },
  { value: "bottom_sheet", label: "Bottom sheet", detail: "A sheet that rises from the bottom", inbox: true, inApp: true },
  { value: "modal", label: "Modal", detail: "A centred card that needs a response", inbox: true, inApp: true },
  { value: "critical", label: "Critical alert", detail: "Safety, security, account or emergency only", inbox: true, inApp: true, critical: true },
]);

// Kept renderable so campaigns sent before this model still display.
export const LEGACY_PRESENTATIONS = Object.freeze(["fullscreen", "urgent"]);

export function presentationMeta(type) {
  return PRESENTATIONS.find((item) => item.value === type) || null;
}

export function presentationIsInApp(type) {
  return Boolean(presentationMeta(type)?.inApp) || LEGACY_PRESENTATIONS.includes(type);
}

export function presentationIncludesInbox(type) {
  const meta = presentationMeta(type);
  return meta ? meta.inbox : LEGACY_PRESENTATIONS.includes(type);
}

/** Presentations an admin may choose for this audience, screen and priority. */
export function compatiblePresentations(audience = {}, { canCritical = false, screen = "" } = {}) {
  const screens = compatibleScreens(audience);
  if (!screens.length) return [];
  return PRESENTATIONS.filter((item) => {
    if (item.critical && !canCritical) return false;
    if (!item.inline) return true;
    const candidates = screen ? [screen] : screens;
    return candidates.some((candidate) => INLINE_SCREENS.has(candidate));
  });
}

export function screenSupportsPresentation(screen, type) {
  const meta = presentationMeta(type);
  if (!meta?.inApp) return !screen;
  if (meta.inline) return INLINE_SCREENS.has(screen);
  return Boolean(CAMPAIGN_SCREENS[screen]);
}

export const OPENING_ANIMATIONS = Object.freeze([
  ["none", "None"], ["fade", "Fade"], ["slide_up", "Slide up"], ["slide_down", "Slide down"],
  ["slide_left", "Slide left"], ["slide_right", "Slide right"], ["scale", "Scale"], ["spring", "Spring"],
]);

export const CLOSING_ANIMATIONS = Object.freeze([
  ["none", "None"], ["fade", "Fade"], ["slide_down", "Slide down"], ["slide_up", "Slide up"],
  ["slide_left", "Slide left"], ["slide_right", "Slide right"], ["scale", "Scale"],
]);

const LEGACY_OPENING = { premium_fade: "fade", glass_rise: "slide_up", soft_zoom: "scale", spotlight: "spring", slide_blur: "slide_left" };
const LEGACY_CLOSING = { soft_fade: "fade", scale_away: "scale", slide_down: "slide_down", swipe_away: "slide_up", blur_dissolve: "fade" };

export function normalizeOpeningAnimation(value) {
  const key = LEGACY_OPENING[value] || value;
  return OPENING_ANIMATIONS.some(([option]) => option === key) ? key : "fade";
}

export function normalizeClosingAnimation(value) {
  const key = LEGACY_CLOSING[value] || value;
  return CLOSING_ANIMATIONS.some(([option]) => option === key) ? key : "fade";
}

export const POSITION_OPTIONS = Object.freeze({
  floating: [["top", "Top"], ["bottom", "Bottom"], ["top_right", "Top right (desktop)"], ["bottom_right", "Bottom right (desktop)"]],
  banner: [["top", "Top"], ["bottom", "Bottom"]],
});

export const WIDTH_OPTIONS = Object.freeze([["compact", "Compact (360px)"], ["standard", "Standard (440px)"], ["wide", "Wide (640px)"]]);

// Which settings make sense for each presentation. The builder shows only these.
const CONTROLS = Object.freeze({
  inbox: [],
  floating: ["position", "width", "mobileWidth", "closeButton", "autoDismiss", "animation", "frequency"],
  floating_inbox: ["position", "width", "mobileWidth", "closeButton", "autoDismiss", "animation", "frequency"],
  inline: ["closeButton", "animation"],
  inline_inbox: ["closeButton", "animation"],
  banner: ["position", "closeButton", "autoDismiss", "animation", "frequency"],
  bottom_sheet: ["overlay", "backdropDismiss", "closeButton", "animation", "frequency"],
  modal: ["width", "overlay", "backdropDismiss", "closeButton", "animation", "frequency"],
  critical: ["animation"],
});

export function presentationControls(type) {
  return CONTROLS[type] || [];
}

export const FREQUENCY_OPTIONS = Object.freeze([
  ["once", "Once"],
  ["once_per_session", "Once per session until dismissed"],
  ["daily", "At most once a day until dismissed"],
]);

const LEGACY_FREQUENCY = { every_open: "once_per_session", until_action: "once_per_session", custom: "daily" };

export function normalizeFrequency(value) {
  const key = LEGACY_FREQUENCY[value] || value;
  return FREQUENCY_OPTIONS.some(([option]) => option === key) ? key : "once";
}

/**
 * Whether a delivered in-app campaign may be shown again right now.
 * `sessionSeen` says whether it was already shown in this browser session.
 */
export function campaignFrequencyAllows(row = {}, frequency = "once", { sessionSeen = false, now = Date.now() } = {}) {
  if (row.dismissed_at || row.status === "archived") return false;
  const count = Number(row.presentation_count || 0);
  if (frequency === "once") return count === 0 && !sessionSeen;
  if (frequency === "once_per_session") return !sessionSeen;
  if (frequency === "daily") {
    if (sessionSeen) return false;
    const last = new Date(row.last_presented_at || 0).getTime();
    return !last || now - last >= 24 * 3_600_000;
  }
  return false;
}

export function createDefaultPresentation(type = "inbox") {
  const bottomSheet = type === "bottom_sheet";
  const modal = type === "modal" || type === "critical";
  return {
    type,
    screen: "",
    position: type === "banner" ? "top" : "top",
    width: modal ? "standard" : "standard",
    mobileWidth: "inset",
    overlay: bottomSheet || modal,
    backdropDismiss: bottomSheet,
    closeButton: type !== "critical",
    autoDismissSeconds: 0,
    frequency: "once",
    openingAnimation: bottomSheet ? "slide_up" : modal ? "scale" : "fade",
    closingAnimation: bottomSheet ? "slide_down" : "fade",
    animationDurationMs: 320,
  };
}

/** Settings as the renderer uses them: unknown or irrelevant values fall back to defaults. */
export function resolvePresentationSettings(displayConfig = {}, presentationType = "") {
  const saved = displayConfig?.presentation || {};
  const type = presentationType || saved.type || "inbox";
  const defaults = createDefaultPresentation(type);
  const controls = new Set(presentationControls(type));
  const positions = (POSITION_OPTIONS[type === "banner" ? "banner" : "floating"] || []).map(([value]) => value);
  const duration = Number(saved.animationDurationMs);
  const autoDismiss = Number(saved.autoDismissSeconds);
  const canDismiss = displayConfig?.behaviour?.canDismiss !== false && type !== "critical";
  return {
    type,
    screen: saved.screen || "",
    position: controls.has("position") && positions.includes(saved.position) ? saved.position : defaults.position,
    width: controls.has("width") && WIDTH_OPTIONS.some(([value]) => value === saved.width) ? saved.width : defaults.width,
    mobileWidth: controls.has("mobileWidth") && ["inset", "full"].includes(saved.mobileWidth) ? saved.mobileWidth : defaults.mobileWidth,
    overlay: controls.has("overlay") && typeof saved.overlay === "boolean" ? saved.overlay : defaults.overlay,
    backdropDismiss: canDismiss && controls.has("backdropDismiss") && typeof saved.backdropDismiss === "boolean" ? saved.backdropDismiss : canDismiss && defaults.backdropDismiss,
    closeButton: canDismiss && (controls.has("closeButton") && typeof saved.closeButton === "boolean" ? saved.closeButton : defaults.closeButton),
    canDismiss,
    autoDismissSeconds: controls.has("autoDismiss") && Number.isFinite(autoDismiss) ? Math.max(0, Math.min(120, Math.round(autoDismiss))) : 0,
    frequency: normalizeFrequency(saved.frequency || displayConfig?.behaviour?.frequency),
    openingAnimation: normalizeOpeningAnimation(saved.openingAnimation),
    closingAnimation: normalizeClosingAnimation(saved.closingAnimation),
    animationDurationMs: Number.isFinite(duration) ? Math.max(0, Math.min(1200, Math.round(duration))) : defaults.animationDurationMs,
  };
}

// --- Where a delivered campaign belongs ----------------------------------------------

const LEGACY_PATH_SCREEN = [
  [/^urmall\.(sellers|seller_dashboard)/, "urmall.seller"],
  [/^urmall\.(buyers|buyer_dashboard)/, "urmall.buyer"],
  [/^urmall\./, "urmall"],
  [/^urride\.(operator|operator_dashboard)/, "urride.operator"],
  [/^urride\.company_dashboard/, "urride.company"],
  [/^urride\.passenger/, "urride.passenger"],
  [/^(urride|nearby_area)\./, "urride"],
  [/^(explore|platform)\./, "explore"],
];

function legacyScreens(displayConfig = {}) {
  const paths = displayConfig.targetPaths || displayConfig.targets || [];
  if (!paths.length || paths.includes("all")) return ["any"];
  return [...new Set(paths.map((path) => LEGACY_PATH_SCREEN.find(([pattern]) => pattern.test(path))?.[1]).filter(Boolean))];
}

/** The screens a delivered row may appear on. */
export function campaignRowScreens(row = {}) {
  const config = row.display_config || row.displayConfig || {};
  const screen = config.presentation?.screen;
  if (screen && CAMPAIGN_SCREENS[screen]) return [screen];
  return legacyScreens(config);
}

/**
 * The person's current place in KunThai, e.g.
 * { page: "marketplace", role: "seller", businessKind: "restaurant" }.
 */
export function surfaceScreenKeys(surface = {}) {
  const page = surface.page || "explore";
  if (page === "marketplace") {
    const role = surface.role === "seller" ? "seller" : "buyer";
    return ["any", "urmall", `urmall.${role}`];
  }
  if (page === "transport") {
    const role = ["operator", "company"].includes(surface.role) ? surface.role : "passenger";
    return ["any", "urride", `urride.${role}`];
  }
  return ["any", "explore"];
}

export function campaignRowMatchesSurface(row = {}, surface = {}) {
  const screens = campaignRowScreens(row);
  const here = new Set(surfaceScreenKeys(surface));
  if (!screens.some((screen) => here.has(screen))) return false;

  // A seller with several businesses only sees a type-targeted card on the
  // workspace of a matching business.
  const sellerTypes = (row.display_config || row.displayConfig || {}).audience?.sellerTypes || [];
  if (screens.includes("urmall.seller") && sellerTypes.length && surface.businessKind) {
    const kind = surface.businessKind === "hotel" ? "property_agent" : surface.businessKind;
    return sellerTypes.includes(kind);
  }
  return true;
}

/** The inbox a delivered row belongs to. Legacy rows fall back to their sector. */
export function campaignRowInbox(row = {}) {
  const config = row.display_config || row.displayConfig || {};
  if (config.inbox && CAMPAIGN_INBOXES[config.inbox]) return config.inbox;
  const screens = legacyScreens(config);
  if (config.targetPaths?.length) {
    if (screens.every((screen) => screen === "urmall.seller")) return "urmall.seller";
    if (screens.every((screen) => screen === "urride.operator")) return "urride.operator";
    if (screens.every((screen) => screen === "urride.company")) return "urride.company";
  }
  const sector = String(row.sector || row.workspace || "platform").toLowerCase();
  if (sector === "marketplace") return "urmall";
  if (sector === "transport") return "urride";
  return "explore";
}

export function campaignRowInInbox(row = {}) {
  const config = row.display_config || row.displayConfig || {};
  if (config.presentation?.includeInbox === false) return false;
  if (row.presentation && presentationMeta(row.presentation)) return presentationIncludesInbox(row.presentation);
  return true;
}

export function isCampaignDelivery(row = {}) {
  return Boolean(row.campaign_id) || row.notification_type === "admin_test";
}

const SECTION_LABELS = { marketplace: "UrMall update", transport: "UrRide update", explore: "Explore update" };

/** What a presentation shows, taken only from the delivered row. */
export function campaignContentFromRow(row = {}) {
  const config = row.display_config || {};
  const mediaUrl = config.media?.kind !== "none" && isSafeExternalUrl(config.media?.url) ? config.media.url : "";
  return {
    title: row.title || "",
    body: row.body || "",
    badge: String(config.content?.badge || "").slice(0, 16),
    icon: config.content?.icon || "bell",
    mediaUrl,
    hasAction: Boolean(row.action_target),
    actionLabel: row.action_data?.actionLabel || config.action?.label || "View",
    secondaryLabel: row.action_data?.secondaryLabel || "",
    sectionLabel: SECTION_LABELS[row.sector] || "KunThai update",
  };
}

/** Whether a card already on screen may stay there (frequency is not re-checked). */
export function campaignRowStillPresentable(row, surface = {}, now = Date.now()) {
  if (!row || row.status !== "unread" || row.dismissed_at) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false;
  return campaignRowMatchesSurface(row, surface);
}

const OVERLAY_RANK = { critical: 9, urgent: 8, fullscreen: 7, modal: 6, bottom_sheet: 5, floating_inbox: 4, floating: 3, banner: 2 };

/**
 * Choose what to present on this screen right now.
 * Returns { overlay, inline } rows (either may be null).
 */
export function selectCampaignPresentations(rows = [], surface = {}, {
  now = Date.now(),
  seenThisSession = () => false,
  preferences = {},
} = {}) {
  const alwaysShown = new Set(["account", "payment", "safety", "security", "emergency"]);
  const candidates = rows.filter((row) => {
    if (!isCampaignDelivery(row) || row.status !== "unread" || row.dismissed_at) return false;
    if (!presentationIsInApp(row.presentation)) return false;
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false;
    if (row.snoozed_until && new Date(row.snoozed_until).getTime() > now) return false;
    if (preferences.in_app_enabled === false && !alwaysShown.has(row.category)) return false;
    return campaignRowMatchesSurface(row, surface);
  });

  const byNewest = (first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0);
  const inline = candidates
    .filter((row) => ["inline", "inline_inbox"].includes(row.presentation))
    .sort(byNewest)[0] || null;
  const overlay = candidates
    .filter((row) => !["inline", "inline_inbox"].includes(row.presentation))
    .filter((row) => preferences.floating_enabled !== false || row.priority === "critical" || alwaysShown.has(row.category))
    .filter((row) => {
      const settings = resolvePresentationSettings(row.display_config || {}, row.presentation);
      return campaignFrequencyAllows(row, settings.frequency, { sessionSeen: seenThisSession(row), now });
    })
    .sort((first, second) => (OVERLAY_RANK[second.presentation] || 0) - (OVERLAY_RANK[first.presentation] || 0) || byNewest(first, second))[0] || null;
  return { overlay, inline };
}

// --- Actions ---------------------------------------------------------------------------

// Every destination here is handled by openUnifiedNotification.
export const ACTION_SCREENS = Object.freeze([
  { value: "notifications", label: "Explore notification centre", platforms: ["all", "explore"] },
  { value: "explore:urfeed", label: "UrFeed", platforms: ["all", "explore"] },
  { value: "explore:swip-tab", label: "Swip", platforms: ["all", "explore"] },
  { value: "messages", label: "Explore messages", platforms: ["all", "explore"] },
  { value: "settings", label: "Settings", platforms: ["all", "explore", "urmall", "urride"] },
  { value: "verification", label: "Profile & verification", platforms: ["all", "explore", "urmall", "urride"] },
  { value: "urmall", label: "UrMall home", platforms: ["all", "urmall"] },
  { value: "urmall:orders", label: "UrMall orders", platforms: ["all", "urmall"] },
  { value: "urmall:messages", label: "UrMall messages", platforms: ["all", "urmall"] },
  { value: "urmall:business", label: "Seller dashboard", platforms: ["all", "urmall"] },
  { value: "urmall:business-messages", label: "Seller customer care", platforms: ["all", "urmall"] },
  { value: "urride", label: "UrRide home", platforms: ["all", "urride"] },
  { value: "urride:notifications", label: "UrRide notifications", platforms: ["all", "urride"] },
  { value: "urride:trips", label: "UrRide trips", platforms: ["all", "urride"] },
  { value: "urride:operator-dashboard", label: "Operator dashboard", platforms: ["all", "urride"] },
  { value: "urride:company-dashboard", label: "Company dashboard", platforms: ["all", "urride"] },
  { value: "urride:nearby-area", label: "Nearby Area", platforms: ["all", "urride"] },
]);

export const ACTION_ENTITIES = Object.freeze([
  { value: "explore:post", label: "UrFeed post", idLabel: "Post ID", dataKey: "postId" },
  { value: "explore:swip", label: "Swip video", idLabel: "Post ID", dataKey: "postId" },
  { value: "profile", label: "KunThai profile", idLabel: "User ID", dataKey: "userId" },
  { value: "urmall:product", label: "UrMall product", idLabel: "Product ID", dataKey: "productId" },
  { value: "urmall:store", label: "UrMall store", idLabel: "Business ID", dataKey: "businessId" },
]);

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createEmptyAction() {
  return { type: "none", label: "View", screen: "", entityKind: "urmall:product", entityId: "", url: "", secondaryLabel: "" };
}

export function actionScreensForPlatform(platform) {
  return ACTION_SCREENS.filter((item) => !platform || item.platforms.includes(platform));
}

/** Turn the builder's action into the stored action_target / action_data. */
export function buildCampaignAction(action = {}) {
  const label = String(action.label || "").trim().slice(0, 40) || "View";
  const secondaryLabel = String(action.secondaryLabel || "").trim().slice(0, 40);
  const extra = secondaryLabel ? { secondaryLabel } : {};
  if (action.type === "screen" && ACTION_SCREENS.some((item) => item.value === action.screen)) {
    return { actionTarget: action.screen, actionData: { actionLabel: label, ...extra } };
  }
  if (action.type === "entity") {
    const entity = ACTION_ENTITIES.find((item) => item.value === action.entityKind);
    const id = String(action.entityId || "").trim();
    if (entity && UUID_PATTERN.test(id)) {
      return { actionTarget: entity.value, actionData: { actionLabel: label, [entity.dataKey]: id, ...extra } };
    }
  }
  if (action.type === "external") {
    const url = String(action.url || "").trim();
    if (isSafeExternalUrl(url)) return { actionTarget: "external", actionData: { actionLabel: label, url, ...extra } };
  }
  return { actionTarget: "", actionData: extra };
}

export function isSafeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateCampaignAction(action = {}, platform = "") {
  if (!action || action.type === "none") return "";
  if (!String(action.label || "").trim()) return "Add the button text people will tap.";
  if (action.type === "screen") {
    const screen = ACTION_SCREENS.find((item) => item.value === action.screen);
    if (!screen) return "Choose the KunThai screen this button opens.";
    if (platform && !screen.platforms.includes(platform)) return "That screen is not available to this audience.";
    return "";
  }
  if (action.type === "entity") {
    if (!ACTION_ENTITIES.some((item) => item.value === action.entityKind)) return "Choose what this button opens.";
    if (!UUID_PATTERN.test(String(action.entityId || "").trim())) return "Paste a valid KunThai ID (UUID) for the item.";
    return "";
  }
  if (action.type === "external") {
    return isSafeExternalUrl(action.url) ? "" : "External links must be a full https:// address.";
  }
  return "Choose what happens when people tap the notification.";
}

// --- Scheduling ------------------------------------------------------------------------

function zoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second));
  return asUtc - date.getTime();
}

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return Boolean(timeZone);
  } catch {
    return false;
  }
}

/** "2026-09-20T14:00" wall-clock time in `timeZone` → UTC ISO string. */
export function zonedLocalToUtcIso(localValue, timeZone = "UTC") {
  const match = String(localValue || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const guess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  // Two passes settle the offset across daylight-saving boundaries.
  let utc = guess - zoneOffsetMs(new Date(guess), zone);
  utc = guess - zoneOffsetMs(new Date(utc), zone);
  return new Date(utc).toISOString();
}

/** UTC ISO string → "YYYY-MM-DDTHH:mm" in `timeZone` (for datetime-local inputs). */
export function utcIsoToZonedLocal(iso, timeZone = "UTC") {
  const date = new Date(iso || "");
  if (Number.isNaN(date.getTime())) return "";
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const shifted = new Date(date.getTime() + zoneOffsetMs(date, zone));
  return shifted.toISOString().slice(0, 16);
}

// --- Status and analytics ------------------------------------------------------------

export function campaignDisplayStatus(campaign = {}, now = Date.now()) {
  const status = campaign.status || "draft";
  if (status === "pending_approval") return campaign.scheduled_at ? "awaiting_approval" : "awaiting_approval";
  if (status === "approved") return "ready";
  if (status === "completed") {
    const expires = campaign.expires_at ? new Date(campaign.expires_at).getTime() : null;
    return expires !== null && expires <= now ? "completed" : "active";
  }
  return status;
}

export const DISPLAY_STATUS_LABELS = Object.freeze({
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  ready: "Approved · ready to send",
  scheduled: "Scheduled",
  sending: "Sending",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
});

/** A percentage, or null when there is nothing to divide by. Never invented. */
export function campaignRate(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) return null;
  return Math.round((top / bottom) * 1000) / 10;
}
