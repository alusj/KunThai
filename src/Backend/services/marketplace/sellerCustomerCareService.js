import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";
import { uploadMediaDataUrl } from "../explore/mediaService";

function buildConversationKey(businessId, productId, topic = "") {
  return [businessId, productId || "marketplace", topic || "general"].join(":");
}

function groupMessages(messages) {
  const grouped = messages.reduce((acc, message) => {
    const conversationKey = message.conversation_key || buildConversationKey(message.business_id, message.product_id, message.topic);
    // One thread per buyer, mirroring the buyer side (one thread per seller):
    // two buyers must never share a conversation, and one buyer's questions
    // about different products stay in their single thread.
    const key = message.buyer_id || `legacy:${conversationKey}`;
    if (!acc[key]) {
      acc[key] = {
        id: key,
        conversationKey,
        buyerId: message.buyer_id,
        businessId: message.business_id,
        productId: message.product_id,
        buyerName: message.buyer_name || "Buyer",
        topic: message.topic || message.product_name || "UrMall message",
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
      mediaUrl: message.media_url || "",
      mediaType: message.media_type || "text",
      createdAt: message.created_at,
    });
    acc[key].unread = acc[key].unread || Boolean(message.unread && (message.sender_role || "buyer") === "buyer");
    acc[key].supportDispute = acc[key].supportDispute || Boolean(message.support_dispute);
    if (new Date(message.created_at).getTime() >= new Date(acc[key].time).getTime()) {
      // Replies continue the buyer's most recent product context.
      acc[key].time = message.created_at;
      acc[key].preview = message.preview || "";
      acc[key].conversationKey = conversationKey;
      acc[key].productId = message.product_id;
      acc[key].topic = message.topic || message.product_name || "UrMall message";
      acc[key].productName = message.product_name || "";
      acc[key].type = message.message_type;
      acc[key].buyerName = message.buyer_name || acc[key].buyerName || "Buyer";
    }

    return acc;
  }, {});

  return Object.values(grouped)
    .map((conversation) => ({
      ...conversation,
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
    .limit(400);

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

export async function sendSellerMarketplaceMessage(conversation, message, { mediaUrl = "", mediaType = "text" } = {}) {
  const business = await readRegisteredBusiness();
  if (!business) throw new Error("Register a business before replying to buyers.");
  if (!conversation?.conversationKey) throw new Error("Choose a conversation to reply to.");

  let uploadedMediaUrl = "";
  if (mediaUrl) {
    const { data: authData } = await supabase.auth.getUser();
    uploadedMediaUrl = await uploadMediaDataUrl(mediaUrl, "image", authData?.user?.id || business.id);
  }

  const { data, error } = await supabase
    .from("marketplace_customer_messages")
    .insert({
      buyer_id: conversation.buyerId,
      business_id: business.id,
      product_id: conversation.productId || null,
      product_name: conversation.productName || "",
      buyer_name: conversation.buyerName || "Buyer",
      topic: conversation.topic || "UrMall message",
      preview: message.trim(),
      message_type: conversation.type || "message",
      conversation_key: conversation.conversationKey,
      sender_role: "seller",
      unread: true,
      media_url: uploadedMediaUrl,
      media_type: uploadedMediaUrl ? mediaType || "image" : "text",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("marketplace-message-sent"));
  }

  return {
    id: data.id,
    from: "seller",
    text: data.preview || "",
    mediaUrl: data.media_url || "",
    mediaType: data.media_type || "text",
    createdAt: data.created_at,
  };
}

// Live INSERT feed for this seller's buyer messages; returns an unsubscribe function.
export async function subscribeSellerMarketplaceMessages(onMessage) {
  const business = await readRegisteredBusiness();
  if (!business) return () => {};

  const channel = supabase
    .channel(`seller-customer-care-${business.id}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "marketplace_customer_messages", filter: `business_id=eq.${business.id}` },
      (payload) => onMessage?.(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function markSellerConversationRead(conversation) {
  const business = await readRegisteredBusiness();
  if (!business) {
    return;
  }

  // A conversation is one buyer's whole thread, so read receipts are scoped to
  // that buyer only — never to other buyers who share a conversation_key.
  let query = supabase
    .from("marketplace_customer_messages")
    .update({ unread: false })
    .eq("business_id", business.id)
    .eq("unread", true)
    .or("sender_role.eq.buyer,sender_role.is.null");

  if (conversation?.buyerId) {
    query = query.eq("buyer_id", conversation.buyerId);
  } else if (conversation?.conversationKey) {
    query = query.is("buyer_id", null).eq("conversation_key", conversation.conversationKey);
  } else {
    return;
  }

  const { error } = await query;
  if (error) throw new Error(error.message);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("marketplace-seller-messages-updated"));
  }
}
