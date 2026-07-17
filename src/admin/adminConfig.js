export const ADMIN_SECTORS = [
  { value: "all", label: "All sectors" },
  { value: "explore", label: "Explore" },
  { value: "marketplace", label: "UrMall" },
  { value: "transport", label: "Transport" },
];

export const ADMIN_ROLES = [
  { key: "super_admin", name: "Super Admin", rank: 100, authority: 5 },
  { key: "chief_admin", name: "Chief Admin", rank: 90, authority: 5 },
  { key: "operations_lead", name: "Operations Lead", rank: 75, authority: 4 },
  { key: "explore_manager", name: "Explore Manager", rank: 60, authority: 4 },
  { key: "marketplace_manager", name: "UrMall Manager", rank: 60, authority: 4 },
  { key: "transport_manager", name: "Transport Manager", rank: 60, authority: 4 },
  { key: "risk_officer", name: "Risk and Fraud Officer", rank: 50, authority: 3 },
  { key: "finance_officer", name: "Finance Officer", rank: 45, authority: 3 },
  { key: "reports_officer", name: "Reports and Safety Officer", rank: 40, authority: 2 },
  { key: "verification_officer", name: "Verification Officer", rank: 40, authority: 2 },
  { key: "support_officer", name: "Support Officer", rank: 35, authority: 2 },
  { key: "notification_officer", name: "Notification Officer", rank: 35, authority: 2 },
  { key: "technical_admin", name: "Technical Admin", rank: 55, authority: 3 },
  { key: "auditor", name: "Auditor", rank: 25, authority: 1 },
  { key: "analyst", name: "Analyst", rank: 20, authority: 1 },
];

export const ADMIN_NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { id: "overview", label: "Command center", icon: "LayoutDashboard", permission: "dashboard.view" },
      { id: "my-work", label: "My work", icon: "Inbox", permission: "cases.view" },
      { id: "users", label: "Users", icon: "Users", permission: "users.view" },
    ],
  },
  {
    label: "Sectors",
    items: [
      { id: "explore", label: "Explore", icon: "Compass", permission: "explore.view", sector: "explore" },
      { id: "marketplace", label: "UrMall", icon: "Store", permission: "marketplace.view", sector: "marketplace" },
      { id: "transport", label: "Transport", icon: "CarFront", permission: "transport.view", sector: "transport" },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "verification", label: "Verification", icon: "BadgeCheck", permission: "verification.view" },
      { id: "reports", label: "Reports and safety", icon: "ShieldAlert", permission: "reports.view" },
      { id: "support", label: "Support and disputes", icon: "LifeBuoy", permission: "support.view" },
      { id: "notifications", label: "Notifications", icon: "BellRing", permission: "notifications.view" },
      { id: "finance", label: "Finance", icon: "Landmark", permission: "finance.view" },
      { id: "analytics", label: "Analytics", icon: "ChartNoAxesCombined", permission: "analytics.view" },
    ],
  },
  {
    label: "Governance",
    items: [
      { id: "team", label: "Admin team", icon: "UserCog", permission: "team.view" },
      { id: "actions", label: "Action history", icon: "History", permission: "dashboard.view" },
      { id: "audit", label: "Audit log", icon: "ScrollText", permission: "audit.view" },
      { id: "settings", label: "Settings", icon: "Settings", permission: "settings.view" },
    ],
  },
];

export const CASE_STATUSES = [
  "new",
  "triaged",
  "assigned",
  "in_review",
  "waiting_information",
  "action_proposed",
  "approval_required",
  "actioned",
  "appeal_window",
  "resolved",
  "closed",
  "reopened",
];

export const CASE_DECISIONS = [
  { key: "approve", label: "Approve" },
  { key: "reject", label: "Reject" },
  { key: "dismiss", label: "Dismiss" },
  { key: "remove", label: "Remove content" },
  { key: "restrict", label: "Restrict" },
  { key: "suspend", label: "Suspend" },
  { key: "resolve", label: "Resolve" },
  { key: "request_information", label: "Request information" },
];

export function titleCase(value = "") {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatCaseNumber(value) {
  return `KT-${String(value || 0).padStart(6, "0")}`;
}

export function formatDateTime(value) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatRelativeTime(value) {
  if (!value) return "Unknown";
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

export function canAccess(access, permission, sector = null) {
  if (!access?.permissions?.includes(permission)) return false;
  if (!sector || access.sectors?.includes("all")) return true;
  return access.sectors?.includes(sector) || access.roles?.some((role) => role.sectors?.includes("all") || role.sectors?.includes(sector));
}

