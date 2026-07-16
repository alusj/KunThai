import supabase from "../lib/supabaseClient";
import { isMissingTable } from "./explore/errors";

export const STARTER_VISIBILITY_CREDITS = 5;
export const MINIMUM_VERIFIED_INVITES = 5;

export const VISIBILITY_PACKAGES = [
  {
    id: "starter",
    label: "5 verified invites",
    shortLabel: "5 invites",
    credits: 5,
    invites: 5,
    helper: "Basic visibility for a small local push.",
  },
  {
    id: "growth",
    label: "10 verified invites",
    shortLabel: "10 invites",
    credits: 10,
    invites: 10,
    helper: "More visibility for a stronger launch.",
  },
  {
    id: "market",
    label: "20 verified invites",
    shortLabel: "20 invites",
    credits: 20,
    invites: 20,
    helper: "Best for countrywide or targeted promotion.",
  },
  {
    id: "custom",
    label: "Custom invite target",
    shortLabel: "Custom",
    credits: 5,
    invites: 5,
    helper: "Choose your own verified invite target.",
  },
];

export const PROMOTION_DAY_OPTIONS = [
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
];

export const PROMOTION_VIEW_GOALS = [
  { value: 250, label: "250 views" },
  { value: 500, label: "500 views" },
  { value: 1000, label: "1,000 views" },
  { value: 0, label: "No fixed cap" },
];

export function getVisibilityPackage(packageId) {
  return VISIBILITY_PACKAGES.find((item) => item.id === packageId) || VISIBILITY_PACKAGES[0];
}

export function normalizeInviteGoal(value) {
  const goal = Math.round(Number(value) || MINIMUM_VERIFIED_INVITES);
  return Math.max(MINIMUM_VERIFIED_INVITES, Math.min(goal, 1000));
}

export function getPackageInviteGoal(packageId, customInvites) {
  if (packageId === "custom") return normalizeInviteGoal(customInvites);
  return getVisibilityPackage(packageId).invites;
}

export function getPackageCreditGoal(packageId, customInvites) {
  if (packageId === "custom") return normalizeInviteGoal(customInvites);
  return getVisibilityPackage(packageId).credits;
}

export function calculateMarketplacePromotionCost({
  audienceType = "general",
  durationDays = 3,
  reachScope = "nearby",
  viewGoal = 250,
} = {}) {
  const days = Math.max(1, Math.min(Number(durationDays) || 3, 90));
  const views = Math.max(0, Number(viewGoal) || 0);
  const reachMultiplier = reachScope === "countrywide" ? 3 : 1;
  const audienceMultiplier = audienceType === "targeted" ? 2 : 1;
  const durationCredits = days * 2 * reachMultiplier;
  const viewCredits = views > 0 ? Math.ceil(views / 250) * reachMultiplier : reachMultiplier;
  return Math.max(MINIMUM_VERIFIED_INVITES, durationCredits + viewCredits + (audienceMultiplier - 1) * 5);
}

export function buildInviteUrl(code) {
  const origin = typeof window === "undefined" ? "https://kunthai.com" : window.location.origin;
  return `${origin}/#invite/${encodeURIComponent(code || "")}`;
}

export function buildShareMessage({ inviteUrl, inviteGoal, surface = "KunThai" } = {}) {
  return [
    `Join me on ${surface}.`,
    `My visibility task needs ${normalizeInviteGoal(inviteGoal)} verified people to join through this link.`,
    inviteUrl,
  ].filter(Boolean).join("\n");
}

function mapWallet(row) {
  return {
    balance: Number(row?.balance || 0),
    lifetimeEarned: Number(row?.lifetime_earned || 0),
    lifetimeSpent: Number(row?.lifetime_spent || 0),
    starterAwardedAt: row?.starter_awarded_at || null,
  };
}

function mapReferralLink(row) {
  if (!row) return null;
  const inviteUrl = buildInviteUrl(row.code);
  return {
    id: row.id,
    code: row.code,
    surface: row.surface,
    resourceId: row.resource_id,
    requiredInvites: Number(row.required_invites || MINIMUM_VERIFIED_INVITES),
    verifiedInvites: Number(row.verified_invites || 0),
    status: row.status || "active",
    inviteUrl,
    shareMessage: buildShareMessage({
      inviteUrl,
      inviteGoal: row.required_invites,
      surface: row.surface === "urmall_promotion" ? "KunThai UrMall" : "KunThai",
    }),
  };
}

export async function ensureVisibilityWallet(surface = "platform") {
  const { data, error } = await supabase.rpc("ensure_visibility_wallet", { p_surface: surface });
  if (error) {
    if (isMissingTable(error)) {
      return {
        balance: STARTER_VISIBILITY_CREDITS,
        lifetimeEarned: STARTER_VISIBILITY_CREDITS,
        lifetimeSpent: 0,
        starterAwardedAt: new Date().toISOString(),
        unavailable: true,
      };
    }
    throw new Error(error.message);
  }
  return mapWallet(data);
}

export async function createReferralInviteTask({ requiredInvites = MINIMUM_VERIFIED_INVITES, resourceId = null, surface = "platform" } = {}) {
  const { data, error } = await supabase.rpc("create_referral_invite_link", {
    p_surface: surface,
    p_resource_id: resourceId,
    p_required_invites: normalizeInviteGoal(requiredInvites),
  });

  if (error) throw new Error(error.message);
  return mapReferralLink(data);
}

export function mapPromotionTask(row) {
  return mapReferralLink(row);
}
