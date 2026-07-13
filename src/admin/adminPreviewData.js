const now = Date.now();
const hoursAgo = (hours) => new Date(now - hours * 60 * 60 * 1000).toISOString();
const hoursAhead = (hours) => new Date(now + hours * 60 * 60 * 1000).toISOString();

export const previewAccess = {
  isAdmin: true,
  requiresMfa: false,
  authorityLevel: 5,
  sectors: ["all"],
  permissions: [
    "admin.access", "dashboard.view", "cases.view", "cases.manage", "cases.approve",
    "users.view", "users.manage", "explore.view", "explore.moderate", "marketplace.view",
    "marketplace.verify", "marketplace.moderate", "transport.view", "transport.verify",
    "transport.safety", "verification.view", "verification.manage", "reports.view",
    "reports.manage", "support.view", "support.manage", "finance.view", "finance.manage",
    "notifications.view", "notifications.manage", "notifications.approve", "analytics.view",
    "team.view", "team.manage", "audit.view", "settings.view", "settings.manage",
  ],
  roles: [{
    assignmentId: "preview-assignment",
    key: "chief_admin",
    name: "Chief Admin",
    rank: 90,
    sectors: ["all"],
    regions: ["all"],
    authorityLevel: 5,
  }],
};

export let previewCases = [
  {
    id: "8dbce57b-e46b-4a38-8c28-0dd801f2f101", case_number: 1128, sector: "transport", queue: "verification",
    case_type: "operator_verification", resource_type: "transport_operator_verification", title: "Operator identity review",
    description: "Licence and vehicle ownership documents are ready for manual review.", status: "new", priority: "urgent",
    assignee_user_id: null, created_at: hoursAgo(1.2), updated_at: hoursAgo(1.2), sla_due_at: hoursAhead(0.8),
    metadata: { source: { full_name: "Mohamed Kamara", city: "Freetown", country: "Sierra Leone", country_iso: "SL", display_code: "KT-18426" } },
  },
  {
    id: "8dbce57b-e46b-4a38-8c28-0dd801f2f102", case_number: 1127, sector: "explore", queue: "reports",
    case_type: "content_report", resource_type: "explore_post_report", title: "Reported Swip video",
    description: "Multiple users reported threatening language in this video.", status: "triaged", priority: "critical",
    assignee_user_id: "preview-user", created_at: hoursAgo(2.8), updated_at: hoursAgo(1.5), sla_due_at: hoursAgo(0.3),
    metadata: { source: { reason: "Threatening language", report_count: 6, author_name: "Account under review", country: "Sierra Leone", country_iso: "SL" } },
  },
  {
    id: "8dbce57b-e46b-4a38-8c28-0dd801f2f103", case_number: 1126, sector: "marketplace", queue: "verification",
    case_type: "seller_verification", resource_type: "marketplace_verification", title: "Kallon Home Supplies",
    description: "Business registration and payout identity submitted.", status: "in_review", priority: "high",
    assignee_user_id: "preview-user", created_at: hoursAgo(9), updated_at: hoursAgo(3), sla_due_at: hoursAhead(3),
    metadata: { source: { business_name: "Kallon Home Supplies", city: "Bo", country: "Sierra Leone", country_iso: "SL", request_type: "seller_verification" } },
  },
  {
    id: "8dbce57b-e46b-4a38-8c28-0dd801f2f104", case_number: 1125, sector: "transport", queue: "support",
    case_type: "trip_support", resource_type: "transport_support", title: "Fare dispute after completed trip",
    description: "Passenger says the final fare did not match the confirmed estimate.", status: "assigned", priority: "high",
    assignee_user_id: "support-user", created_at: hoursAgo(14), updated_at: hoursAgo(4), sla_due_at: hoursAhead(5),
    metadata: { source: { passenger_name: "Aminata Jalloh", topic: "Fare dispute", country: "Ghana", country_iso: "GH", trip_id: "KT-TRIP-921" } },
  },
  {
    id: "8dbce57b-e46b-4a38-8c28-0dd801f2f105", case_number: 1124, sector: "marketplace", queue: "support",
    case_type: "seller_case", resource_type: "marketplace_case", title: "Buyer did not receive order",
    description: "Seller requested help tracing a delivery marked completed.", status: "waiting_information", priority: "normal",
    assignee_user_id: "support-user", created_at: hoursAgo(26), updated_at: hoursAgo(6), sla_due_at: hoursAhead(12),
    metadata: { source: { case_type: "order_dispute", country: "Nigeria", country_iso: "NG", order_id: "UR-48320" } },
  },
  {
    id: "8dbce57b-e46b-4a38-8c28-0dd801f2f106", case_number: 1123, sector: "transport", queue: "reports",
    case_type: "area_safety_report", resource_type: "area_report", title: "Road obstruction near Congo Cross",
    description: "Community report awaiting validation before it appears in Area View.", status: "new", priority: "normal",
    assignee_user_id: null, created_at: hoursAgo(5), updated_at: hoursAgo(5), sla_due_at: hoursAhead(19),
    metadata: { source: { report_type: "road_block", address: "Congo Cross, Freetown", country: "Sierra Leone", country_iso: "SL" } },
  },
  {
    id: "8dbce57b-e46b-4a38-8c28-0dd801f2f107", case_number: 1122, sector: "explore", queue: "reports",
    case_type: "profile_report", resource_type: "explore_profile_report", title: "Possible impersonation account",
    description: "Reporter provided links to the original creator profile.", status: "action_proposed", priority: "high",
    assignee_user_id: "risk-user", created_at: hoursAgo(18), updated_at: hoursAgo(2), sla_due_at: hoursAhead(2),
    metadata: { source: { reason: "Impersonation", username: "@dailyfreetown_copy", country: "Sierra Leone", country_iso: "SL" } },
  },
  {
    id: "8dbce57b-e46b-4a38-8c28-0dd801f2f108", case_number: 1121, sector: "explore", queue: "support",
    case_type: "user_voice", resource_type: "user_care_feedback", title: "My Voice concern: safety",
    description: "User submitted a private concern with a voice note and screenshot.", status: "new", priority: "urgent",
    assignee_user_id: null, created_at: hoursAgo(3.5), updated_at: hoursAgo(3.5), sla_due_at: hoursAhead(1.5),
    metadata: { source: { feedback_type: "safety", message: "There is a safety issue around my account.", page_context: "Your Voice", country: "Kenya", country_iso: "KE" } },
  },
];

export const previewTeam = [
  { assignment_id: "team-1", user_id: "preview-user", email: "chief@kunthai.test", display_name: "Chief Operations", role_key: "chief_admin", role_name: "Chief Admin", sector_scopes: ["all"], region_scopes: ["all"], authority_level: 5, status: "active", created_at: hoursAgo(720) },
  { assignment_id: "team-2", user_id: "risk-user", email: "safety@kunthai.test", display_name: "Safety Desk", role_key: "reports_officer", role_name: "Reports and Safety Officer", sector_scopes: ["explore", "transport"], region_scopes: ["SL"], authority_level: 3, status: "active", created_at: hoursAgo(400) },
  { assignment_id: "team-3", user_id: "support-user", email: "support@kunthai.test", display_name: "Support Desk", role_key: "support_officer", role_name: "Support Officer", sector_scopes: ["all"], region_scopes: ["SL"], authority_level: 2, status: "active", created_at: hoursAgo(300) },
];

export const previewCampaigns = [
  { id: "campaign-1", title: "Transport service notice", body: "Scheduled maintenance may affect live trip updates tonight.", sector: "transport", audience_type: "sector_users", priority: "high", status: "scheduled", scheduled_at: hoursAhead(4), created_at: hoursAgo(3), delivery_count: 0, failure_count: 0 },
  { id: "campaign-2", title: "Seller safety reminder", body: "Keep all order communication inside UrMall.", sector: "marketplace", audience_type: "sector_users", priority: "normal", status: "completed", scheduled_at: null, created_at: hoursAgo(50), delivery_count: 1284, failure_count: 9 },
];

export const previewAudit = [
  { id: "audit-1", action_key: "case.decision_applied", sector: "explore", resource_type: "explore_post_report", reason: "Content violated threats policy", actor_role_keys: ["chief_admin"], created_at: hoursAgo(1.5) },
  { id: "audit-2", action_key: "team.access_granted", sector: "platform", resource_type: "admin_assignment", reason: "Assigned to the support rotation", actor_role_keys: ["chief_admin"], created_at: hoursAgo(12) },
  { id: "audit-3", action_key: "notification.campaign_approved", sector: "transport", resource_type: "notification_campaign", reason: "", actor_role_keys: ["chief_admin"], created_at: hoursAgo(28) },
];

export let previewFlags = [
  { flag_key: "content_moderation", name: "Automated content moderation", description: "Automated Explore media and text safety checks.", sector: "explore", enabled: true, updated_at: hoursAgo(10) },
  { flag_key: "seller_onboarding", name: "Seller onboarding", description: "Allow new UrMall business registrations.", sector: "marketplace", enabled: true, updated_at: hoursAgo(120) },
  { flag_key: "transport_onboarding", name: "Transport onboarding", description: "Allow new operator and company registrations.", sector: "transport", enabled: true, updated_at: hoursAgo(120) },
  { flag_key: "notification_broadcasts", name: "Notification broadcasts", description: "Allow approved administrators to schedule campaigns.", sector: "platform", enabled: true, updated_at: hoursAgo(80) },
  { flag_key: "financial_actions", name: "Financial actions", description: "Enabled after the payment provider is connected.", sector: "platform", enabled: false, updated_at: hoursAgo(200) },
];

export const previewUsers = [
  { user_id: "user-1", email: "mohamed@example.com", phone: "+232 76 000 101", display_name: "Mohamed Kamara", username: "mohamedk", account_type: "operator", account_status: "active", created_at: hoursAgo(900) },
  { user_id: "user-2", email: "kallon@example.com", phone: "+232 77 000 210", display_name: "Kallon Home Supplies", username: "kallonhome", account_type: "business", account_status: "warned", status_reason: "Repeated late dispatch", created_at: hoursAgo(650) },
  { user_id: "user-3", email: "aminata@example.com", phone: "+232 31 000 411", display_name: "Aminata Jalloh", username: "aminataj", account_type: "personal", account_status: "active", created_at: hoursAgo(200) },
];

export function updatePreviewCase(id, patch) {
  let updated = null;
  previewCases = previewCases.map((item) => {
    if (item.id !== id) return item;
    updated = { ...item, ...patch, updated_at: new Date().toISOString() };
    return updated;
  });
  return updated;
}

export function updatePreviewFlag(key, enabled) {
  previewFlags = previewFlags.map((item) => item.flag_key === key ? { ...item, enabled, updated_at: new Date().toISOString() } : item);
  return previewFlags.find((item) => item.flag_key === key);
}
