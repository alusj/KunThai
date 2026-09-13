import { CURRENT_BUSINESS_TYPES } from "../Backend/services/marketplace/businessTypePolicy.js";
import { getDeliveryFleetOptions, getRideFleetOptions } from "../data/globalTransportCapabilities.js";
import { GLOBAL_COUNTRY_PROFILES } from "../data/globalCountryProfiles.js";

export const CAMPAIGN_STEPS = Object.freeze([
  { id: "campaign", label: "Campaign" },
  { id: "platform", label: "Platform" },
  { id: "audience", label: "Audience" },
  { id: "location", label: "Location" },
  { id: "presentation", label: "Presentation" },
  { id: "content", label: "Content & action" },
  { id: "behaviour", label: "Behaviour" },
  { id: "schedule", label: "Schedule" },
  { id: "preview", label: "Preview" },
  { id: "review", label: "Review" },
]);

export const CAMPAIGN_CATEGORIES = Object.freeze([
  ["announcement", "Announcement"],
  ["promotion", "Promotion"],
  ["safety", "Safety"],
  ["security", "Security"],
  ["account", "Account"],
  ["product_update", "Product update"],
  ["feature_launch", "Feature launch"],
  ["maintenance", "Maintenance"],
  ["policy", "Policy"],
  ["marketplace", "Marketplace"],
  ["seller_update", "Seller update"],
  ["urride_update", "UrRide update"],
  ["operator_update", "Operator update"],
  ["delivery_update", "Delivery update"],
  ["nearby_area", "Nearby Area"],
  ["emergency", "Emergency"],
  ["custom", "Custom"],
]);

export const CAMPAIGN_PRIORITIES = Object.freeze([
  ["normal", "Normal"],
  ["important", "Important"],
  ["high", "High"],
  ["critical", "Critical"],
]);

export const PLATFORM_OPTIONS = Object.freeze([
  ["general", "Entire KunThai", "Every eligible KunThai account"],
  ["urfeed", "UrFeed", "The UrFeed experience"],
  ["swip", "Swip", "The Swip video experience"],
  ["messages", "Messages", "KunThai messaging"],
  ["notifications", "Notifications", "The Notification Centre"],
  ["urmall", "UrMall", "Buyer and seller experiences"],
  ["urride", "UrRide", "Passenger, operator, company and Nearby Area experiences"],
  ["nearby", "Nearby Area", "Nearby Area as a first-class destination"],
  ["explore", "Explore", "All Explore experiences"],
  ["profile", "Profile", "KunThai profiles"],
  ["settings", "Settings", "Account and application settings"],
]);

export const URMALL_AREAS = Object.freeze([
  ["general", "General UrMall"],
  ["buyers", "Buyers"],
  ["sellers", "Sellers"],
  ["buyer_dashboard", "Buyer’s dashboard"],
  ["seller_dashboard", "Seller’s dashboard"],
]);

const BUSINESS_LABELS = Object.freeze({
  retail: "Retail",
  restaurant: "Restaurant",
  property_agent: "Real Estate",
  vendor: "Vendor",
});

export const URMALL_BUSINESS_TYPES = Object.freeze([
  ["all", "General / all business types"],
  ...CURRENT_BUSINESS_TYPES.map((value) => [value, BUSINESS_LABELS[value] || value]),
]);

export const URRIDE_AREAS = Object.freeze([
  ["general", "General UrRide"],
  ["passenger", "Passenger / user"],
  ["operator", "Operator"],
  ["operator_dashboard", "Operator’s dashboard"],
  ["company_dashboard", "Company’s dashboard"],
  ["nearby", "Nearby Area"],
]);

function rideTargetValue(option) {
  if (option.value === "Motorcycle") return "motorbike";
  if (option.value === "Car") return "taxi";
  return String(option.value || "").toLowerCase();
}

function deliveryTargetValue(option) {
  if (option.value === "Motorcycle") return "motorbike";
  if (option.value === "Car") return "van";
  return String(option.value || "").toLowerCase();
}

export const URRIDE_TRANSPORT_TYPES = Object.freeze([
  ["all", "General / all transport operators"],
  ...getRideFleetOptions({ country: "Sierra Leone" }).map((option) => [rideTargetValue(option), option.label]),
]);

export const URRIDE_DELIVERY_TYPES = Object.freeze([
  ["all", "General / all delivery operators"],
  ...getDeliveryFleetOptions({ country: "Sierra Leone" }).map((option) => [deliveryTargetValue(option), option.label]),
]);

export const URRIDE_COMPANY_TYPES = Object.freeze([
  ["all", "General / all companies"],
  ["transport", "Transport companies"],
  ["delivery", "Delivery companies"],
]);

export const AUDIENCE_SEGMENTS = Object.freeze([
  ["new_users", "New users", "Accounts created in the last 30 days"],
  ["active_users", "Active users", "Signed in during the last 30 days"],
  ["inactive_users", "Inactive users", "No sign-in during the last 90 days"],
  ["verified_users", "Verified users", "Verified email or phone"],
  ["unverified_users", "Unverified users", "No verified email or phone"],
  ["premium_users", "Premium users", "Own or administer an active Pro/Premium business"],
  ["buyers", "Buyers", "Accounts with recorded UrMall buyer activity"],
  ["sellers", "Sellers", "UrMall owners and active business administrators"],
  ["operators", "Operators", "Registered UrRide operators"],
  ["companies", "Companies", "UrRide owners and active company administrators"],
]);

export const PRESENTATION_OPTIONS = Object.freeze([
  ["inbox", "Notification Centre", "Stored in the user’s notification inbox"],
  ["floating", "Floating card", "A temporary premium overlay without inbox storage"],
  ["floating_inbox", "Floating card + inbox", "Immediate overlay and inbox copy"],
  ["inline", "Inline", "Displayed on the targeted KunThai surface"],
  ["inline_inbox", "Inline + inbox", "Inline placement and inbox copy"],
  ["banner", "Banner", "A slim premium announcement banner"],
  ["bottom_sheet", "Bottom sheet", "A mobile announcement sheet"],
  ["modal", "Modal", "A centred announcement card"],
  ["fullscreen", "Full screen", "A major feature or platform announcement"],
  ["urgent", "Urgent", "A persistent high-priority presentation"],
  ["critical", "Critical alert", "Restricted to genuine safety, security, account or emergency messages"],
]);

export const OPENING_ANIMATIONS = Object.freeze([
  ["premium_fade", "Premium Fade"],
  ["glass_rise", "Glass Rise"],
  ["soft_zoom", "Soft Zoom"],
  ["slide_blur", "Slide & Blur"],
  ["spotlight", "Spotlight"],
]);

export const CLOSING_ANIMATIONS = Object.freeze([
  ["soft_fade", "Soft Fade"],
  ["scale_away", "Scale Away"],
  ["slide_down", "Slide Down"],
  ["blur_dissolve", "Blur Dissolve"],
  ["swipe_away", "Swipe Away"],
]);

export const CTA_LABEL_SUGGESTIONS = Object.freeze([
  "View", "Learn More", "Open", "Explore", "Shop Now", "View Offer", "Get Started",
  "Update Now", "Verify Now", "Complete Setup", "Apply Now", "Join Now", "Book Now", "See Details",
]);

export const CTA_DESTINATIONS = Object.freeze([
  ["internal", "Internal KunThai screen"],
  ["external", "External URL"],
  ["profile", "User profile"],
  ["urfeed_post", "UrFeed post"],
  ["swip_video", "Swip video"],
  ["urmall", "UrMall"],
  ["urmall_product", "UrMall product"],
  ["urmall_store", "UrMall store"],
  ["urmall_seller", "UrMall seller dashboard"],
  ["urride", "UrRide"],
  ["urride_booking", "UrRide booking"],
  ["operator_dashboard", "Operator dashboard"],
  ["company_dashboard", "Company dashboard"],
  ["nearby_area", "Nearby Area"],
  ["settings", "Settings"],
  ["verification", "Verification screen"],
]);

export const FREQUENCY_OPTIONS = Object.freeze([
  ["once", "Once"],
  ["once_per_session", "Once per session"],
  ["every_open", "Every app opening until dismissed"],
  ["daily", "Daily"],
  ["custom", "Custom interval"],
  ["until_action", "Until action completed"],
]);

export const EXPIRATION_OPTIONS = Object.freeze([
  ["never", "Never"],
  ["1h", "1 hour"],
  ["6h", "6 hours"],
  ["24h", "24 hours"],
  ["3d", "3 days"],
  ["7d", "7 days"],
  ["custom", "Custom"],
]);

export const ADMIN_NOTIFICATION_CITY_SUGGESTIONS = Object.freeze({
  SL: ["Freetown", "Bo", "Kenema", "Makeni", "Koidu"],
  NG: ["Lagos", "Abuja", "Kano", "Port Harcourt", "Ibadan"],
  GH: ["Accra", "Kumasi", "Tamale", "Takoradi", "Cape Coast"],
  LR: ["Monrovia", "Gbarnga", "Kakata", "Buchanan", "Ganta"],
  GN: ["Conakry", "Nzerekore", "Kankan", "Kindia", "Labe"],
  CI: ["Abidjan", "Bouake", "Yamoussoukro", "San-Pedro", "Korhogo"],
  SN: ["Dakar", "Thies", "Saint-Louis", "Kaolack", "Ziguinchor"],
  GM: ["Banjul", "Serrekunda", "Brikama", "Bakau", "Farafenni"],
  ML: ["Bamako", "Sikasso", "Segou", "Mopti", "Kayes"],
  BF: ["Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Ouahigouya", "Banfora"],
  BJ: ["Cotonou", "Porto-Novo", "Parakou", "Abomey-Calavi", "Djougou"],
  TG: ["Lome", "Sokode", "Kara", "Atakpame", "Kpalime"],
  NE: ["Niamey", "Zinder", "Maradi", "Agadez", "Tahoua"],
  GW: ["Bissau", "Bafata", "Gabu", "Cacheu", "Bolama"],
  CV: ["Praia", "Mindelo", "Assomada", "Espargos", "Tarrafal"],
  MR: ["Nouakchott", "Nouadhibou", "Kiffa", "Rosso", "Kaedi"],
  ZA: ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Gqeberha"],
  KE: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
  US: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"],
  CA: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"],
  GB: ["London", "Birmingham", "Manchester", "Glasgow", "Liverpool"],
  FR: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice"],
  DE: ["Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt"],
  BR: ["Sao Paulo", "Rio de Janeiro", "Brasilia", "Salvador", "Fortaleza"],
  IN: ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai"],
  AE: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Al Ain"],
  JP: ["Tokyo", "Yokohama", "Osaka", "Nagoya", "Sapporo"],
  AU: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
  TH: ["Bangkok", "Chiang Mai", "Phuket", "Pattaya", "Khon Kaen"],
});

export const CAMPAIGN_COUNTRIES = Object.freeze(GLOBAL_COUNTRY_PROFILES.map((country) => ({
  iso2: country.iso2,
  name: country.name,
  cities: ADMIN_NOTIFICATION_CITY_SUGGESTIONS[country.iso2] || [country.cityPlaceholder].filter(Boolean),
})));

const SIMPLE_TARGET_PATHS = Object.freeze({
  urfeed: "explore.urfeed",
  swip: "explore.swip",
  messages: "explore.messages",
  notifications: "platform.notifications",
  nearby: "nearby_area.general",
  explore: "explore.general",
  profile: "explore.profile",
  settings: "platform.settings",
});

function addOperatorPaths(paths, base, services = {}) {
  const selectedServices = services.selected || [];
  if (!selectedServices.length || selectedServices.includes("all")) {
    paths.push(`${base}.all`);
    return;
  }
  selectedServices.forEach((service) => {
    const types = services[service] || [];
    if (!types.length || types.includes("all")) paths.push(`${base}.${service}.all`);
    else types.forEach((type) => paths.push(`${base}.${service}.${type}`));
  });
}

export function buildNotificationTargetPaths(targeting = {}) {
  const platforms = targeting.platforms || [];
  if (platforms.includes("general")) return ["all"];
  const paths = [];
  platforms.forEach((platform) => {
    if (SIMPLE_TARGET_PATHS[platform]) paths.push(SIMPLE_TARGET_PATHS[platform]);
  });

  if (platforms.includes("urmall")) {
    const areas = targeting.urmallAreas?.length ? targeting.urmallAreas : ["general"];
    areas.forEach((area) => {
      if (["sellers", "seller_dashboard"].includes(area)) {
        const types = targeting.urmallBusinessTypes?.length ? targeting.urmallBusinessTypes : ["all"];
        if (types.includes("all")) paths.push(`urmall.${area}.all`);
        else types.forEach((type) => paths.push(`urmall.${area}.${type}`));
      } else paths.push(`urmall.${area}`);
    });
  }

  if (platforms.includes("urride")) {
    const areas = targeting.urrideAreas?.length ? targeting.urrideAreas : ["general"];
    areas.forEach((area) => {
      if (area === "operator") addOperatorPaths(paths, "urride.operator", targeting.operatorServices);
      else if (area === "operator_dashboard") addOperatorPaths(paths, "urride.operator_dashboard", targeting.operatorDashboardServices);
      else if (area === "company_dashboard") {
        const types = targeting.companyTypes?.length ? targeting.companyTypes : ["all"];
        if (types.includes("all")) paths.push("urride.company_dashboard.all");
        else types.forEach((type) => paths.push(`urride.company_dashboard.${type}`));
      } else paths.push(`urride.${area}`);
    });
  }
  return [...new Set(paths)];
}

export function presentationIncludesInbox(presentation, displayConfig = {}) {
  if (typeof displayConfig.includeInbox === "boolean") return displayConfig.includeInbox;
  return !["floating", "inline"].includes(presentation);
}

export function campaignMatchesMainPage(displayConfig = {}, page = "explore") {
  const paths = displayConfig.targetPaths || displayConfig.targets || [];
  if (!paths.length || paths.includes("all")) return true;
  if (page === "marketplace") return paths.some((path) => path.startsWith("urmall."));
  if (page === "transport") return paths.some((path) => path.startsWith("urride.") || path.startsWith("nearby_area."));
  return paths.some((path) => path.startsWith("explore.") || path.startsWith("platform."));
}

export function expirationDateFromPreset(preset, customValue = "", now = Date.now()) {
  if (preset === "never") return null;
  if (preset === "custom") return customValue ? new Date(customValue).toISOString() : null;
  const durations = { "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000, "3d": 259_200_000, "7d": 604_800_000 };
  return durations[preset] ? new Date(now + durations[preset]).toISOString() : null;
}

export function campaignSectorForTargets(paths = []) {
  if (!paths.length || paths.includes("all")) return "platform";
  const sectors = new Set(paths.map((path) => path.startsWith("urmall.") ? "marketplace" : path.startsWith("urride.") || path.startsWith("nearby_area.") ? "transport" : path.startsWith("explore.") ? "explore" : "platform"));
  return sectors.size === 1 ? [...sectors][0] : "platform";
}

export function notificationActionFromCta(cta = {}) {
  if (!cta.enabled) return { actionTarget: "", actionData: {} };
  const value = String(cta.value || "").trim();
  const targets = {
    internal: value || "notifications",
    external: "external",
    profile: "profile",
    urfeed_post: "explore:post",
    swip_video: "explore:swip",
    urmall: "urmall",
    urmall_product: "urmall:product",
    urmall_store: "urmall:store",
    urmall_seller: "urmall:business",
    urride: "urride:notifications",
    urride_booking: "urride:bookings",
    operator_dashboard: "urride:operator-dashboard",
    company_dashboard: "urride:company-dashboard",
    nearby_area: "urride:nearby-area",
    settings: "settings",
    verification: "verification",
  };
  const dataKeys = { external: "url", profile: "userId", urfeed_post: "postId", swip_video: "postId", urmall_product: "productId", urmall_store: "businessId", urride_booking: "bookingId" };
  return {
    actionTarget: targets[cta.destination] || value,
    actionData: {
      actionLabel: String(cta.label || "View").trim() || "View",
      ...(dataKeys[cta.destination] && value ? { [dataKeys[cta.destination]]: value } : {}),
    },
  };
}

export function isWorldwideCampaign(payload = {}) {
  return (payload.filter?.targets || []).includes("all") || !(payload.filter?.locations || []).length;
}

export function createEmptyCampaignForm() {
  const timezone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC";
  return {
    campaignName: "",
    title: "",
    body: "",
    priority: "normal",
    category: "announcement",
    media: { kind: "none", url: "" },
    targeting: {
      platforms: [],
      urmallAreas: [],
      urmallBusinessTypes: ["all"],
      urrideAreas: [],
      operatorServices: { selected: [], transport: ["all"], delivery: ["all"] },
      operatorDashboardServices: { selected: [], transport: ["all"], delivery: ["all"] },
      companyTypes: ["all"],
    },
    audienceMode: "everyone",
    segments: [],
    users: [],
    locationMode: "worldwide",
    locations: [],
    presentation: "inbox",
    openingAnimation: "premium_fade",
    closingAnimation: "soft_fade",
    channels: ["in_app"],
    cta: { enabled: false, label: "View", destination: "internal", value: "" },
    clickBehaviour: "details",
    frequency: "once",
    frequencyHours: 24,
    canDismiss: true,
    snooze: "none",
    expirationPreset: "7d",
    customExpiration: "",
    scheduleMode: "draft",
    scheduledAt: "",
    timezone,
    recipientLocalTime: false,
  };
}

export function buildCampaignPayload(form, now = Date.now()) {
  const targetPaths = buildNotificationTargetPaths(form.targeting);
  const audience = form.audienceMode === "users" ? "specific_users" : form.audienceMode === "segments" ? "segments" : "all";
  const locations = form.locationMode === "specific" ? form.locations : [];
  const { actionTarget, actionData } = notificationActionFromCta(form.cta);
  const canDismiss = ["promotion", "marketplace"].includes(form.category) ? true : form.canDismiss !== false;
  const includeInbox = presentationIncludesInbox(form.presentation);
  const editor = JSON.parse(JSON.stringify({ ...form, canDismiss }));
  const configuration = {
    schemaVersion: 1,
    targetPaths,
    locations,
    media: form.media,
    presentation: {
      type: form.presentation,
      openingAnimation: form.openingAnimation,
      closingAnimation: form.closingAnimation,
      includeInbox,
    },
    action: { ...form.cta, actionTarget, actionData },
    behaviour: {
      clickBehaviour: form.clickBehaviour,
      frequency: form.frequency,
      frequencyHours: Number(form.frequencyHours || 24),
      canDismiss,
      snooze: form.snooze,
    },
    schedule: {
      mode: form.scheduleMode,
      timezone: form.timezone,
      recipientLocalTime: false,
    },
    editor,
  };
  return {
    campaignName: form.campaignName.trim() || form.title.trim(),
    title: form.title.trim(),
    body: form.body.trim(),
    sector: campaignSectorForTargets(targetPaths),
    audience,
    priority: form.priority,
    filter: {
      targets: targetPaths,
      segments: audience === "segments" ? form.segments : [],
      userIds: audience === "specific_users" ? form.users.map((user) => user.user_id).filter(Boolean) : [],
      kunthaiIds: audience === "specific_users" ? form.users.map((user) => user.public_id).filter(Boolean) : [],
      locations,
    },
    schedule: form.scheduleMode === "schedule" && form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
    channels: form.channels.length ? form.channels : ["in_app"],
    presentation: form.presentation,
    category: form.category,
    actionTarget,
    actionData,
    expiresAt: expirationDateFromPreset(form.expirationPreset, form.customExpiration, now),
    configuration,
  };
}

export function campaignToEditorForm(campaign = {}) {
  const saved = campaign.configuration?.editor;
  if (saved && typeof saved === "object") return { ...createEmptyCampaignForm(), ...saved };
  const form = createEmptyCampaignForm();
  return {
    ...form,
    campaignName: campaign.campaign_name || campaign.title || "",
    title: campaign.title || "",
    body: campaign.body || "",
    priority: campaign.priority || "normal",
    category: campaign.category || "announcement",
    presentation: campaign.presentation || "inbox",
    channels: campaign.channels || ["in_app"],
    scheduledAt: campaign.scheduled_at ? String(campaign.scheduled_at).slice(0, 16) : "",
    scheduleMode: campaign.scheduled_at ? "schedule" : "draft",
    expirationPreset: campaign.expires_at ? "custom" : "never",
    customExpiration: campaign.expires_at ? String(campaign.expires_at).slice(0, 16) : "",
  };
}
