import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

export async function fetchSellerCustomerCare() {
  const business = await readRegisteredBusiness();
  if (!business) {
    return null;
  }

  const { data, error } = await supabase
    .from("marketplace_customer_messages")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);

  const messages = data || [];
  return {
    metrics: {
      unreadMessages: messages.filter((message) => message.unread).length,
      averageResponseTime: messages.length ? "Pending" : "No messages yet",
      responseRate: 0,
      buyerQuestionsWaiting: messages.filter((message) => message.message_type === "question" && message.unread).length,
      negotiationRequests: messages.filter((message) => message.message_type === "negotiation").length,
      supportDisputes: messages.filter((message) => message.support_dispute).length,
    },
    conversations: messages.map((message) => ({
      id: message.id,
      buyerName: message.buyer_name,
      topic: message.topic,
      preview: message.preview,
      time: new Date(message.created_at).toLocaleDateString(),
      unread: message.unread,
      type: message.message_type,
    })),
    supportThreads: messages
      .filter((message) => message.support_dispute)
      .map((message) => ({
        id: message.id,
        title: message.topic || "Support dispute",
        description: message.preview,
        priority: "high",
        time: "Needs review",
      })),
  };
}
