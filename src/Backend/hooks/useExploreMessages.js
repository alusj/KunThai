import { useEffect, useMemo, useRef, useState } from "react";

import {
  deleteExploreMessage,
  dedupeExploreConversations,
  EXPLORE_MESSAGE_CACHE_CLEARED_EVENT,
  fetchExploreConversations,
  fetchExploreMessages,
  EXPLORE_MESSAGE_EVENT,
  markExploreConversationRead,
  sendExploreMessage,
  setExploreMessageActivity,
  startExploreConversation,
  subscribeToExploreMessages,
} from "../services/explore/messageService";
import { readExploreSettings } from "../services/explore/preferencesService";
import { blockExploreUser } from "../services/explore/safetyService";
import { showToast } from "../services/toastService";

const MESSAGES_MEMORY = new Map();
const MESSAGES_MEMORY_TTL = 120_000;
const MESSAGE_TYPES = ["text", "image", "audio", "video", "location_request", "location_share", "system"];

function normalizeOutgoingMessage(input) {
  if (typeof input === "string") {
    return { body: input.trim(), mediaUrl: "", type: "text" };
  }

  const body = String(input?.body || "").trim();
  const mediaUrl = String(input?.media_url || input?.mediaUrl || "").trim();
  const metadata = input?.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const requestedType = String(input?.type || input?.media_type || "").toLowerCase();
  const type = MESSAGE_TYPES.includes(requestedType)
    ? requestedType
    : mediaUrl
      ? "image"
      : "text";

  return {
    body,
    mediaUrl,
    metadata,
    type: mediaUrl || !["image", "audio", "video"].includes(type) ? type : "text",
  };
}

function getMessagePreview(message) {
  if (message.type === "location_request") return "Location request";
  if (message.type === "location_share") return "Location sharing";
  if (message.body) return message.body;
  if (message.type === "image") return "Photo";
  if (message.type === "audio") return "Voice note";
  if (message.type === "video") return "Video";
  return "Message";
}

function normalizeIncomingMessage(row = {}) {
  return {
    id: row.id,
    conversationId: row.conversation_id || row.conversationId,
    senderId: row.sender_id || row.senderId,
    body: row.body || "",
    type: row.type || row.media_type || "text",
    mediaUrl: row.media_url || row.mediaUrl || "",
    metadata: typeof row.metadata === "string" ? safeParseObject(row.metadata) : row.metadata || {},
    read: Boolean(row.read),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  };
}

function safeParseObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function messagesLookLikeSamePending(localMessage = {}, remoteMessage = {}) {
  const localTime = new Date(localMessage.createdAt || 0).getTime();
  const remoteTime = new Date(remoteMessage.createdAt || 0).getTime();
  const timeClose = Number.isFinite(localTime) && Number.isFinite(remoteTime) && Math.abs(localTime - remoteTime) < 10_000;
  const localIsOptimistic = localMessage.pending ||
    String(localMessage.id || "").startsWith("pending-message") ||
    String(localMessage.id || "").startsWith("message-");

  return Boolean(
    localIsOptimistic &&
      timeClose &&
      localMessage.conversationId === remoteMessage.conversationId &&
      localMessage.senderId === remoteMessage.senderId &&
      (localMessage.body || "") === (remoteMessage.body || "") &&
      (localMessage.type || "text") === (remoteMessage.type || "text") &&
      (localMessage.mediaUrl || "") === (remoteMessage.mediaUrl || ""),
  );
}

function mergeMessageList(messages = [], incomingMessage = {}) {
  if (!incomingMessage?.id && !incomingMessage?.conversationId) return messages;
  const exactIndex = messages.findIndex((message) => message.id === incomingMessage.id);
  if (exactIndex >= 0) {
    return messages.map((message, index) => (index === exactIndex ? { ...message, ...incomingMessage, pending: false } : message));
  }

  const pendingIndex = messages.findIndex((message) => messagesLookLikeSamePending(message, incomingMessage));
  if (pendingIndex >= 0) {
    return messages.map((message, index) => (index === pendingIndex ? { ...message, ...incomingMessage, pending: false } : message));
  }

  return [...messages, incomingMessage].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function getOtherParticipant(conversation, currentUserId) {
  const otherId = conversation?.participantIds?.find((id) => id !== currentUserId);
  return conversation?.participants?.[otherId] || { userId: otherId || "" };
}

function formatSharedLocationMessage(location = {}) {
  const label = location.label || location.address || location.name || "Selected location";
  const coordinates = location.coordinatesLabel ||
    (Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))
      ? `${Number(location.lat).toFixed(6)}, ${Number(location.lng).toFixed(6)}`
      : "");
  return `Shared location: ${label}${coordinates ? ` (${coordinates})` : ""}.`;
}

function buildSharedLocationMetadata(location = {}) {
  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);
  return {
    address: location.address || location.label || location.name || "Shared location",
    coordinatesLabel: location.coordinatesLabel || (Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : ""),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    name: location.name || "Shared location",
  };
}

function parseLocationFromMessageBody(body = "") {
  const match = String(body || "").match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function friendlyMessageError(err) {
  const message = String(err?.message || "");
  if (message.toLowerCase().includes("uuid") || message.includes("__")) {
    return "We could not open that conversation. Please try starting the chat again.";
  }
  return message || "Unable to load messages.";
}

function mergeConversationUpdate(existing = {}, row = {}) {
  return {
    ...existing,
    id: row.id || existing.id,
    participantIds: row.participant_ids || row.participantIds || existing.participantIds || [],
    participants: { ...(existing.participants || {}), ...(row.participants || {}) },
    request: row.request ?? existing.request ?? false,
    updatedAt: row.updated_at || row.updatedAt || existing.updatedAt || new Date().toISOString(),
  };
}

export function useExploreMessages(currentProfile, initialRecipient) {
  const currentUserId = currentProfile?.userId || "";
  const memory = MESSAGES_MEMORY.get(currentUserId) || {};
  const [activeConversation, setActiveConversation] = useState(null);
  const [conversations, setConversationState] = useState(() => dedupeExploreConversations(memory.conversations || []));
  const [loading, setLoading] = useState(() => Boolean(currentUserId && !memory.conversations?.length));
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [pendingMessageKeys, setPendingMessageKeys] = useState(new Set());
  const conversationsRef = useRef(conversations);
  const activeConversationRef = useRef(activeConversation);

  function setConversationList(nextValue) {
    setConversationState((current) => {
      const resolved = typeof nextValue === "function" ? nextValue(current) : nextValue;
      const deduped = dedupeExploreConversations(resolved || []);
      conversationsRef.current = deduped;
      return deduped;
    });
  }

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    const cached = MESSAGES_MEMORY.get(currentUserId) || {};
    const nextConversations = dedupeExploreConversations(cached.conversations || []);
    conversationsRef.current = nextConversations;
    setConversationState(nextConversations);
    setActiveConversation(null);
    setMessages([]);
    setPendingMessageKeys(new Set());
    setError("");
    setLoading(Boolean(currentUserId && !nextConversations.length));
  }, [currentUserId]);

  useEffect(() => {
    function clearMessageMemory() {
      MESSAGES_MEMORY.clear();
      conversationsRef.current = [];
      setConversationState([]);
      setActiveConversation(null);
      setMessages([]);
      setPendingMessageKeys(new Set());
    }

    window.addEventListener(EXPLORE_MESSAGE_CACHE_CLEARED_EVENT, clearMessageMemory);
    return () => window.removeEventListener(EXPLORE_MESSAGE_CACHE_CLEARED_EVENT, clearMessageMemory);
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const currentMemory = MESSAGES_MEMORY.get(currentUserId) || {};
    const messagesByConversation = { ...(currentMemory.messagesByConversation || {}) };

    if (activeConversation?.id) {
      messagesByConversation[activeConversation.id] = messages;
    }

    MESSAGES_MEMORY.set(currentUserId, {
      ...currentMemory,
      conversations: dedupeExploreConversations(conversations),
      messagesByConversation,
      savedAt: Date.now(),
    });
  }, [activeConversation?.id, conversations, currentUserId, messages]);

  function cacheConversationMessages(conversationId, nextMessages) {
    if (!currentUserId || !conversationId) return;
    const currentMemory = MESSAGES_MEMORY.get(currentUserId) || {};
    MESSAGES_MEMORY.set(currentUserId, {
      ...currentMemory,
      messagesByConversation: {
        ...(currentMemory.messagesByConversation || {}),
        [conversationId]: nextMessages,
      },
      savedAt: Date.now(),
    });
  }

  async function reload() {
    if (!currentUserId) {
      setConversationList([]);
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const cached = MESSAGES_MEMORY.get(currentUserId);
      const hasCachedConversations = Boolean(cached?.conversations?.length || conversationsRef.current.length);
      const fresh = cached?.conversations?.length && Date.now() - cached.savedAt < MESSAGES_MEMORY_TTL;

      if (cached?.conversations) {
        setConversationList(cached.conversations);
        if (activeConversation?.id && cached.messagesByConversation?.[activeConversation.id]) {
          setMessages(cached.messagesByConversation[activeConversation.id]);
        }
        setLoading(false);
      }

      if (fresh) {
        if (activeConversation?.id && !cached.messagesByConversation?.[activeConversation.id]) {
          const nextMessages = await fetchExploreMessages(activeConversation.id, currentUserId);
          setMessages(nextMessages);
          cacheConversationMessages(activeConversation.id, nextMessages);
        }
        return;
      }

      if (!hasCachedConversations) {
        setLoading(true);
      }
      setError("");
      const nextConversations = await fetchExploreConversations(currentUserId);
      setConversationList(nextConversations);
      if (activeConversation?.id) {
        const nextMessages = await fetchExploreMessages(activeConversation.id, currentUserId);
        setMessages(nextMessages);
        cacheConversationMessages(activeConversation.id, nextMessages);
      }
    } catch (err) {
      setError(friendlyMessageError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // reload is intentionally scoped to the active user/conversation state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, activeConversation?.id]);

  useEffect(() => {
    if (initialRecipient?.userId || initialRecipient?.username) {
      startExploreConversation(currentProfile, initialRecipient).then(async (conversation) => {
        const nextMessages = await fetchExploreMessages(conversation.id, currentUserId);
        setMessages(nextMessages);
        cacheConversationMessages(conversation.id, nextMessages);
        setActiveConversation(conversation);
        setConversationList(await fetchExploreConversations(currentUserId));
      }).catch((err) => setError(friendlyMessageError(err)));
    }
    // Only the target recipient identity should open the initial chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecipient?.userId, initialRecipient?.username]);

  useEffect(() => {
    function syncConversationsQuietly() {
      fetchExploreConversations(currentUserId)
        .then(setConversationList)
        .catch((err) => setError(friendlyMessageError(err)));
    }

    function applyIncomingMessage(incomingMessage) {
      if (!incomingMessage?.conversationId) return false;
      const preview = getMessagePreview(incomingMessage);
      const conversationKnown = conversationsRef.current.some((conversation) => conversation.id === incomingMessage.conversationId);

      setConversationList((current) => {
        if (!conversationKnown) return current;

        return current
          .map((conversation) => {
            if (conversation.id !== incomingMessage.conversationId) return conversation;
            const unreadCount = incomingMessage.senderId !== currentUserId
              ? Number(conversation.unreadCount || 0) + (activeConversationRef.current?.id === incomingMessage.conversationId ? 0 : 1)
              : Number(conversation.unreadCount || 0);
            return {
              ...conversation,
              preview,
              lastMessage: incomingMessage,
              unreadCount,
              updatedAt: incomingMessage.createdAt,
            };
          })
          .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      });

      if (activeConversationRef.current?.id === incomingMessage.conversationId) {
        setMessages((current) => {
          const nextMessages = mergeMessageList(current, incomingMessage);
          cacheConversationMessages(incomingMessage.conversationId, nextMessages);
          return nextMessages;
        });
      }

      if (!conversationKnown) syncConversationsQuietly();
      return true;
    }

    function handleMessageEvent(payload = {}) {
      const detail = payload?.detail || payload;
      const incomingRow = detail?.message || detail?.new;
      const table = detail?.table || "";
      const eventType = String(detail?.eventType || "").toUpperCase();

      if (table === "explore_conversation_members") {
        syncConversationsQuietly();
        return;
      }

      if (table === "explore_conversations") {
        const conversationId = incomingRow?.id || detail?.old?.id;
        if (eventType === "DELETE") {
          setConversationList((current) => current.filter((conversation) => conversation.id !== conversationId));
          return;
        }

        const existing = conversationsRef.current.find((conversation) => conversation.id === conversationId);
        if (existing && incomingRow?.id) {
          const updated = mergeConversationUpdate(existing, incomingRow);
          setConversationList((current) => [updated, ...current.filter((conversation) => conversation.id !== updated.id)]);
        }
        syncConversationsQuietly();
        return;
      }

      if (detail?.type === "delete" || eventType === "DELETE") {
        const messageId = detail?.messageId || detail?.old?.id;
        const conversationId = detail?.conversationId || detail?.old?.conversation_id || detail?.old?.conversationId;
        if (messageId && activeConversationRef.current?.id === conversationId) {
          setMessages((current) => {
            const nextMessages = current.filter((message) => message.id !== messageId);
            cacheConversationMessages(conversationId, nextMessages);
            return nextMessages;
          });
        }
        syncConversationsQuietly();
        return;
      }

      if (incomingRow?.conversation_id || incomingRow?.conversationId) {
        applyIncomingMessage(normalizeIncomingMessage(incomingRow));
        return;
      }

      reload();
    }

    const unsubscribeRealtime = subscribeToExploreMessages(currentUserId, handleMessageEvent);
    window.addEventListener(EXPLORE_MESSAGE_EVENT, handleMessageEvent);
    window.addEventListener("storage", handleMessageEvent);
    return () => {
      unsubscribeRealtime();
      window.removeEventListener(EXPLORE_MESSAGE_EVENT, handleMessageEvent);
      window.removeEventListener("storage", handleMessageEvent);
    };
    // The realtime channel stays stable for the active user; refs provide current UI state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => {
    if (!activeConversation?.id || !currentUserId || !readExploreSettings().messages.readReceipts) {
      return;
    }

    markExploreConversationRead(activeConversation.id, currentUserId).then(() => fetchExploreConversations(currentUserId).then(setConversationList));
  }, [activeConversation?.id, currentUserId, messages.length]);

  async function openConversation(conversation) {
    const cachedMessages = MESSAGES_MEMORY.get(currentUserId)?.messagesByConversation?.[conversation.id] || [];
    setMessages(cachedMessages);
    setActiveConversation(conversation);
    try {
      setError("");
      const nextMessages = await fetchExploreMessages(conversation.id, currentUserId);
      setMessages(nextMessages);
      cacheConversationMessages(conversation.id, nextMessages);
      if (readExploreSettings().messages.readReceipts) {
        await markExploreConversationRead(conversation.id, currentUserId);
      }
      setConversationList(await fetchExploreConversations(currentUserId));
    } catch (err) {
      setError(friendlyMessageError(err));
    }
  }

  function closeConversation() {
    setActivity("active");
    setActiveConversation(null);
    setMessages([]);
    reload();
  }

  async function sendMessage(body) {
    const draft = normalizeOutgoingMessage(body);
    const conversationId = activeConversation?.id;
    const signature = [conversationId || "", currentUserId, draft.type, draft.body, draft.mediaUrl].join("|");

    if (!conversationId || (!draft.body && !draft.mediaUrl) || pendingMessageKeys.has(signature)) {
      return { ok: false, duplicate: pendingMessageKeys.has(signature) };
    }

    const tempMessage = {
      id: `pending-message-${Date.now()}`,
      conversationId,
      senderId: currentUserId,
      body: draft.body,
      type: draft.type,
      mediaUrl: draft.mediaUrl,
      metadata: draft.metadata,
      read: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    const preview = getMessagePreview(tempMessage);

    setError("");
    setPendingMessageKeys((current) => new Set(current).add(signature));
    setMessages((current) => [...current, tempMessage]);
    setConversationList((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, preview, lastMessage: tempMessage, updatedAt: tempMessage.createdAt }
          : conversation,
      ),
    );

    try {
      const created = await sendExploreMessage(conversationId, currentProfile, body, { optimisticManaged: true });
      if (created) {
        setMessages((current) => {
          const nextMessages = mergeMessageList(current.filter((message) => message.id !== tempMessage.id), created);
          cacheConversationMessages(conversationId, nextMessages);
          return nextMessages;
        });
        setConversationList(await fetchExploreConversations(currentUserId));
      }
      return { ok: true, message: created || tempMessage };
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== tempMessage.id));
      setError("Message failed. Try again.");
      return { ok: false, error: friendlyMessageError(err) };
    } finally {
      setPendingMessageKeys((current) => {
        const next = new Set(current);
        next.delete(signature);
        return next;
      });
    }
  }

  async function deleteConversationMessage(message) {
    const messageId = message?.id;
    const conversationId = message?.conversationId || activeConversation?.id;
    if (!messageId || !conversationId) return { ok: false, error: "Unable to identify this message." };

    const previousMessages = messages;
    const nextMessages = previousMessages.filter((item) => item.id !== messageId);
    setMessages(nextMessages);
    cacheConversationMessages(conversationId, nextMessages);

    try {
      await deleteExploreMessage(message, currentUserId, {
        forEveryone: message.senderId === currentUserId,
      });
      showToast(message.senderId === currentUserId ? "Message deleted." : "Message hidden from this chat.", "info", {
        title: "Message action",
      });
      setConversationList(await fetchExploreConversations(currentUserId));
      return { ok: true };
    } catch (err) {
      setMessages(previousMessages);
      cacheConversationMessages(conversationId, previousMessages);
      return { ok: false, error: friendlyMessageError(err) };
    }
  }

  function setActivity(activity) {
    const settings = readExploreSettings().messages;
    if (activity === "typing" && !settings.showTypingStatus) return;
    if (activity === "recording" && !settings.allowVoiceNotes) return;
    if (activity === "active" && !settings.showActiveStatus) return;
    setExploreMessageActivity(activeConversation?.id, currentUserId, activity);
  }

  function openMessageAreaView(action = "shareLocation", onLocationPicked = null) {
    const title = action === "approveLocationRequest" ? "Share requested location" : "Share my location";
    window.dispatchEvent(new CustomEvent("kuntai-open-area-view", {
      detail: {
        action,
        autoRoute: false,
        conversationId: activeConversation?.id,
        destination: {
          id: `explore-message-${action}`,
          name: title,
          label: title,
          address: "Use Locate Me or Drop Pin to choose the location for this conversation.",
          type: "message-location",
          status: "private",
        },
        mode: "businessLocationPicker",
        onLocationPicked,
        pickerLabels: {
          historyKey: "explore-message-location-picker",
          backLabel: "Back to messages",
          eyebrow: "Explore message",
          headerCurrentTitle: "Share current location",
          headerDropTitle: "Drop a pin",
          cardEyebrow: "Private location",
          currentHeading: "Your current location",
          dropHeading: "Choose a map point",
          dropInstruction: "Move the map until the pin sits on the location you want to share, then send it.",
          currentPreparing: "Your current location is being prepared.",
          currentStatus: "Confirming your current location...",
          dropStatus: "Move the map until the pin is exactly where you want to share.",
          currentName: "Shared current location",
          droppedName: "Shared pinned location",
        },
        pickerStart: "current",
        returnTo: "explore-messages",
        source: "explore-message",
      },
    }));
  }

  function openSharedLocation(message = {}) {
    const metadata = message.metadata || {};
    const parsedBodyLocation = parseLocationFromMessageBody(message.body);
    const lat = Number(metadata.lat ?? metadata.latitude ?? parsedBodyLocation?.lat);
    const lng = Number(metadata.lng ?? metadata.longitude ?? parsedBodyLocation?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showToast("This shared location does not include a map point yet.", "warning");
      return { ok: false };
    }

    window.dispatchEvent(new CustomEvent("kuntai-open-area-view", {
      detail: {
        autoRoute: true,
        destination: {
          id: `message-location-${message.id || Date.now()}`,
          name: metadata.name || "Shared location",
          label: metadata.name || "Shared location",
          address: metadata.address || message.body || "Shared from Explore messages",
          type: "message-location",
          status: "private",
          lat,
          lng,
        },
        returnTo: "explore-messages",
        source: "explore-message-location",
      },
    }));

    return { ok: true };
  }

  async function handleConversationAction(action, payload = {}) {
    if (!activeConversation?.id) return { ok: false, error: "Open a conversation first." };
    const otherUser = getOtherParticipant(activeConversation, currentUserId);
    const myName = currentProfile?.displayName || currentProfile?.name || currentProfile?.username || "This user";
    const otherName = otherUser.displayName || otherUser.username || "this contact";

    if (action === "shareLocation") {
      openMessageAreaView("shareLocation", (location) =>
        sendMessage({
          type: "location_share",
          body: formatSharedLocationMessage(location),
          metadata: buildSharedLocationMetadata(location),
        }),
      );
      return { ok: true };
    }

    if (action === "requestLocation") {
      return sendMessage({
        type: "location_request",
        body: `${myName} is requesting your location.`,
      });
    }

    if (action === "approveLocationRequest") {
      openMessageAreaView("approveLocationRequest", (location) =>
        sendMessage({
          type: "location_share",
          body: formatSharedLocationMessage(location),
          metadata: buildSharedLocationMetadata(location),
        }),
      );
      return { ok: true };
    }

    if (action === "openSharedLocation") {
      return openSharedLocation(payload.message);
    }

    if (action === "blockUser") {
      const targetUserId = payload.userId || otherUser.userId;
      if (!targetUserId) return { ok: false, error: "Unable to identify this account." };
      await blockExploreUser(targetUserId, "blocked from Explore messages");
      showToast(`${otherName} has been blocked from Explore messages.`, "success");
      return { ok: true };
    }

    if (action === "deleteMessage") {
      return deleteConversationMessage(payload.message);
    }

    return { ok: false, error: "This message action is not available." };
  }

  const visibleConversations = useMemo(() => dedupeExploreConversations(conversations), [conversations]);
  const requests = useMemo(() => visibleConversations.filter((conversation) => conversation.request === true), [visibleConversations]);
  const inbox = useMemo(() => visibleConversations.filter((conversation) => conversation.request !== true), [visibleConversations]);

  return {
    activeConversation,
    closeConversation,
    conversations: visibleConversations,
    error,
    inbox,
    loading,
    messages,
    openConversation,
    reload,
    requests,
    handleConversationAction,
    sendMessage,
    setActivity,
  };
}
