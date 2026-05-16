import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

async function getSellerBusiness() {
  const business = await readRegisteredBusiness();
  if (!business?.id) {
    throw new Error("No seller business profile was found.");
  }
  return business;
}

export async function createSellerVerificationRequest(payload = {}) {
  const business = await getSellerBusiness();
  const { error } = await supabase.from("marketplace_seller_verification_requests").insert({
    business_id: business.id,
    request_type: payload.requestType || "seller_verification",
    note: payload.note?.trim() || "",
    status: "pending",
  });

  if (error) throw new Error(error.message);
  return true;
}

export async function createSellerCase(payload = {}) {
  const business = await getSellerBusiness();
  const { error } = await supabase.from("marketplace_seller_cases").insert({
    business_id: business.id,
    case_type: payload.caseType || "support",
    title: payload.title?.trim() || "Seller report",
    description: payload.description?.trim() || "",
    priority: payload.priority || "normal",
    status: "open",
  });

  if (error) throw new Error(error.message);
  return true;
}
