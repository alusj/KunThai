import supabase from "../../Backend/lib/supabaseClient";

export const OPERATOR_COMPANY_ACCESS_CREDITS = 150;

export async function getOperatorCompanyAccessQuote() {
  const { data, error } = await supabase.rpc("get_transport_operator_company_access");
  if (error) throw new Error(error.message || "Unable to check company access. Reconnect and try again.");
  return Array.isArray(data) ? data[0] : data;
}

export async function acceptCompanyInviteWithAccess(invite, documents, confirmFee = false) {
  let inviteId = invite.id;
  if (!inviteId && invite.companyId && invite.requestId) {
    const { data, error } = await supabase.from("transport_company_operator_invites")
      .select("id").eq("company_id", invite.companyId).eq("request_id", invite.requestId).single();
    if (error) throw error;
    inviteId = data?.id;
  }
  if (!inviteId) throw new Error("Refresh this invitation before accepting it.");
  const { data, error } = await supabase.rpc("accept_transport_company_operator_invite", {
    p_invite_id: inviteId,
    p_documents: documents || {},
    p_confirm_fee: confirmFee === true,
  });
  if (error) throw error;
  window.dispatchEvent(new CustomEvent("kuntai-visibility-credits-updated"));
  return Array.isArray(data) ? data[0] : data;
}
