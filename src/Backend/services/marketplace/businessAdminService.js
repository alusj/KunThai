// UrMall business admins: owners invite other KunThai accounts by their
// KunThai unique ID (KTU-...). The invitee accepts or declines; accepted
// admins carry per-responsibility flags the owner can change at any time,
// and can leave the business themselves.

import supabase from "../../lib/supabaseClient";
import { resolvePublicCode } from "../publicCodeService";
import { assertBusinessCapacity, getCapacityUpgradePlan } from "../businessSubscriptionService";
import { hasBusinessPlans } from "./marketplaceBusinessKinds";

export const ADMIN_RESPONSIBILITIES = [
  { key: "addProducts", label: "Add & manage products", description: "Create and edit product listings for this business." },
  { key: "messageReplies", label: "Reply to messages", description: "Answer buyer messages on behalf of the store." },
  { key: "dashboardAccess", label: "Dashboard information", description: "See orders, activity, and seller board information." },
  { key: "editBusiness", label: "Edit business information", description: "Update the store profile, contact details, location, categories, and opening hours." },
  { key: "manageBilling", label: "Plans & billing", description: "View plans, renewals, capacity, and change the store subscription." },
];

export function normalizeAdminResponsibilities(responsibilities = {}) {
  return {
    addProducts: Boolean(responsibilities.addProducts),
    messageReplies: Boolean(responsibilities.messageReplies),
    dashboardAccess: responsibilities.dashboardAccess !== false,
    editBusiness: Boolean(responsibilities.editBusiness),
    manageBilling: Boolean(responsibilities.manageBilling),
  };
}

export function getAdminCapacityFailureMessage(adminName, planState) {
  const name = String(adminName || "this person").trim() || "this person";
  const requiredPlan = getCapacityUpgradePlan(planState, "admins", 1);
  if (requiredPlan) {
    return `Sorry, we can’t add ${name} because you have not upgraded to ${requiredPlan.displayName || requiredPlan.planCode}.`;
  }
  const planName = planState?.entitlement?.planName || "current";
  return `Sorry, we can’t add ${name} because your ${planName} plan has reached its administrator limit.`;
}

function mapAdminRow(row = {}) {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    invitedBy: row.invited_by,
    status: row.status || "pending",
    responsibilities: normalizeAdminResponsibilities(row.responsibilities),
    adminName: row.admin_name || "KunThai member",
    adminCode: row.admin_code || "",
    businessName: row.business_name || "UrMall business",
    createdAt: row.created_at,
  };
}

async function getCurrentUserId(message = "Sign in to continue.") {
  const { data, error } = await supabase.auth.getUser();
  const userId = data?.user?.id;
  if (error || !userId) throw new Error(message);
  return userId;
}

export async function fetchBusinessAdmins(businessId) {
  if (!businessId) return [];
  const { data, error } = await supabase
    .from("marketplace_business_admins")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Unable to load business admins.");
  return (data || []).map(mapAdminRow);
}

export async function inviteBusinessAdmin(business, kunthaiId) {
  const ownerId = await getCurrentUserId("Sign in before inviting an admin.");
  if (!business?.id) throw new Error("Open a business workspace before inviting an admin.");
  if (hasBusinessPlans(business.businessKind)) {
    await assertBusinessCapacity("urmall", business.id, "admins", 1);
  }

  const resolved = await resolvePublicCode(kunthaiId);
  if (!resolved || resolved.kind !== "kunthai" || !resolved.userId) {
    throw new Error("No KunThai account matches this ID. Ask the person for the KTU code on their profile.");
  }
  if (resolved.userId === ownerId) {
    throw new Error("You already own this business — invite a different KunThai account.");
  }

  const businessName = business.name || business.identity?.businessName || "UrMall business";
  const { data, error } = await supabase
    .from("marketplace_business_admins")
    .insert({
      business_id: business.id,
      user_id: resolved.userId,
      invited_by: ownerId,
      status: "pending",
      admin_name: resolved.title || "KunThai member",
      admin_code: resolved.code || "",
      business_name: businessName,
    })
    .select()
    .maybeSingle();

  if (error) {
    if (String(error.message || "").toLowerCase().includes("duplicate")) {
      throw new Error("This person is already invited or already an admin of this business.");
    }
    throw new Error(error.message || "Unable to send this admin invitation.");
  }

  return mapAdminRow(data);
}

export async function fetchMyAdminRows() {
  const userId = await getCurrentUserId("Sign in to view admin roles.");
  const { data, error } = await supabase
    .from("marketplace_business_admins")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Unable to load your admin roles.");
  return (data || []).map(mapAdminRow);
}

export async function respondToAdminInvite(inviteId, accept) {
  const userId = await getCurrentUserId("Sign in to respond to this invitation.");
  const { data, error } = await supabase
    .from("marketplace_business_admins")
    .update({ status: accept ? "accepted" : "declined", updated_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to update this invitation.");
  return mapAdminRow(data);
}

export async function updateAdminResponsibilities(adminRow, responsibilities) {
  const { data, error } = await supabase
    .from("marketplace_business_admins")
    .update({
      responsibilities: normalizeAdminResponsibilities(responsibilities),
      updated_at: new Date().toISOString(),
    })
    .eq("id", adminRow.id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to update responsibilities.");

  return mapAdminRow(data);
}

export async function removeBusinessAdmin(adminRow) {
  const { error } = await supabase
    .from("marketplace_business_admins")
    .delete()
    .eq("id", adminRow.id);
  if (error) throw new Error(error.message || "Unable to remove this admin.");

  return true;
}

export async function leaveBusinessAdmin(adminRow) {
  const userId = await getCurrentUserId("Sign in to leave this business.");
  const { error } = await supabase
    .from("marketplace_business_admins")
    .delete()
    .eq("id", adminRow.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message || "Unable to leave this business.");

  return true;
}
