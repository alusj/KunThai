// UrMall business admins: owners invite other KunThai accounts by their
// KunThai unique ID (KTU-...). The invitee accepts or declines; accepted
// admins carry per-responsibility flags the owner can change at any time,
// and can leave the business themselves.

import supabase from "../../lib/supabaseClient";
import { createExploreNotification } from "../exploreService";
import { resolvePublicCode } from "../publicCodeService";

export const ADMIN_RESPONSIBILITIES = [
  { key: "addProducts", label: "Add & manage products", description: "Create and edit product listings for this business." },
  { key: "messageReplies", label: "Reply to messages", description: "Answer buyer messages on behalf of the store." },
  { key: "dashboardAccess", label: "Dashboard information", description: "See orders, activity, and seller board information." },
];

function mapAdminRow(row = {}) {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    invitedBy: row.invited_by,
    status: row.status || "pending",
    responsibilities: {
      addProducts: Boolean(row.responsibilities?.addProducts),
      messageReplies: Boolean(row.responsibilities?.messageReplies),
      dashboardAccess: row.responsibilities?.dashboardAccess !== false,
    },
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

  // The notification insert also produces the in-app banner and push through
  // the existing notification pipeline.
  createExploreNotification({
    user_id: resolved.userId,
    type: "system",
    actor_name: businessName,
    message: `${businessName} invited you to become a store admin on UrMall. Open UrMall menu > Admin roles to respond.`,
  }).catch(() => null);

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
      responsibilities: {
        addProducts: Boolean(responsibilities.addProducts),
        messageReplies: Boolean(responsibilities.messageReplies),
        dashboardAccess: Boolean(responsibilities.dashboardAccess),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", adminRow.id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to update responsibilities.");

  createExploreNotification({
    user_id: adminRow.userId,
    type: "system",
    actor_name: adminRow.businessName,
    message: `${adminRow.businessName} updated your admin responsibilities on UrMall.`,
  }).catch(() => null);

  return mapAdminRow(data);
}

export async function removeBusinessAdmin(adminRow) {
  const { error } = await supabase
    .from("marketplace_business_admins")
    .delete()
    .eq("id", adminRow.id);
  if (error) throw new Error(error.message || "Unable to remove this admin.");

  createExploreNotification({
    user_id: adminRow.userId,
    type: "system",
    actor_name: adminRow.businessName,
    message: `You were removed as an admin of ${adminRow.businessName} on UrMall.`,
  }).catch(() => null);
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

  if (adminRow.invitedBy) {
    createExploreNotification({
      user_id: adminRow.invitedBy,
      type: "system",
      actor_name: adminRow.adminName,
      message: `${adminRow.adminName} left the admin role at ${adminRow.businessName}.`,
    }).catch(() => null);
  }
  return true;
}
