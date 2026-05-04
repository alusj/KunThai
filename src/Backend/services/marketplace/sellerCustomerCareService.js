import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

function buildConversationKey(businessId, productId, topic = "") {
  return [businessId, productId || "marketplace", topic || "general"].join(":");
}

function groupMessages(messages) {
  const grouped = messages.reduce((acc, message) => {
    const key = message.conversation_key || buildConversationKey(message.business_id, message.product_id, message.topic);
    if (!acc[key]) {
      acc[key] = {
        id: key,
        conversationKey: key,
        buyerId: message.buyer_id,
        businessId: message.business_id,
        productId: message.product_id,
        buyerName: message.buyer_name || "Buyer",
        topic: message.topic || message.product_name || "Marketplace message",
        productName: message.product_name || "",
        preview: "",
        time: message.created_at,
        unread: false,
        type: message.message_type,
        supportDispute: false,
        messages: [],
      };
    }

    acc[key].messages.push({
      id: message.id,
      from: message.sender_role || "buyer",
      text: message.preview || "",
      createdAt: message.created_at,
    });
    acc[key].unread = acc[key].unread || Boolean(message.unread && (message.sender_role || "buyer") === "buyer");
    acc[key].supportDispute = acc[key].supportDispute || Boolean(message.support_dispute);
    if (new Date(message.created_at).getTime() >= new Date(acc[key].time).getTime()) {
      acc[key].time = message.created_at;
      acc[key].preview = message.preview || "";
    }

    return acc;
  }, {});

  return Object.values(grouped)
    .map((conversation) => ({
      ...conversation,
      time: new Date(conversation.time).toLocaleDateString(),
      messages: conversation.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    }))
    .sort((a, b) => new Date(b.messages.at(-1)?.createdAt || 0) - new Date(a.messages.at(-1)?.createdAt || 0));
}

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
    .limit(50);

  if (error) throw new Error(error.message);

  const messages = data || [];
  const conversations = groupMessages(messages);

  return {
    metrics: {
      unreadMessages: conversations.filter((conversation) => conversation.unread).length,
      averageResponseTime: messages.length ? "Pending" : "No messages yet",
      responseRate: 0,
      buyerQuestionsWaiting: conversations.filter((message) => message.type === "question" && message.unread).length,
      negotiationRequests: conversations.filter((message) => message.type === "negotiation").length,
      supportDisputes: conversations.filter((message) => message.supportDispute).length,
    },
    conversations,
    supportThreads: conversations
      .filter((message) => message.supportDispute)
      .map((message) => ({
        id: message.id,
        title: message.topic || "Support dispute",
        description: message.preview,
        priority: "high",
        time: "Needs review",
      })),
  };
}

export async function sendSellerMarketplaceMessage(conversation, message) {
  const business = await readRegisteredBusiness();
  if (!business) throw new Error("Register a business before replying to buyers.");
  if (!conversation?.conversationKey) throw new Error("Choose a conversation to reply to.");

  const { error } = await supabase.from("marketplace_customer_messages").insert({
    buyer_id: conversation.buyerId,
    business_id: business.id,
    product_id: conversation.productId || null,
    product_name: conversation.productName || "",
    buyer_name: conversation.buyerName || "Buyer",
    topic: conversation.topic || "Marketplace message",
    preview: message.trim(),
    message_type: conversation.type || "message",
    conversation_key: conversation.conversationKey,
    sender_role: "seller",
    unread: true,
  });

  if (error) throw new Error(error.message);
}
