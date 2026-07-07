import AppBackTab from "../../../shared/AppBackTab";
import { useEffect, useRef, useState } from "react";
import Avatar from "../../shared/Avatar";
import {
  EXPLORE_MESSAGE_ACTIVITY_EVENT,
  fetchExploreMessageActivity,
  subscribeToExploreMessageActivity,
} from "../../../../Backend/services/explore/messageService";
import { readExploreSettings } from "../../../../Backend/services/explore/preferencesService";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";

const TYPING_FRESH_MS = 12000;
const PRESENCE_FRESH_MS = 45000;
const PRESENCE_HEARTBEAT_MS = 25000;

function getOtherParticipant(conversation, currentUserId) {
  const otherId = conversation.participantIds?.find((id) => id !== currentUserId);
  return conversation.participants?.[otherId] || {};
}

function resolvePresenceLabel(peerActivity) {
  if (!peerActivity) return "";

  const settings = readExploreSettings().messages;
  const age = Date.now() - new Date(peerActivity.updatedAt || 0).getTime();
  if (!Number.isFinite(age) || age < 0) return "";

  if (age < TYPING_FRESH_MS && peerActivity.activity === "typing" && settings.showTypingStatus) {
    return "typing…";
  }
  if (age < TYPING_FRESH_MS && peerActivity.activity === "recording" && settings.allowVoiceNotes) {
    return "recording voice…";
  }
  if (age < PRESENCE_FRESH_MS && settings.showActiveStatus) {
    return "online";
  }
  return "";
}

function usePeerPresence(conversationId, peerUserId, onActivity) {
  const [presenceLabel, setPresenceLabel] = useState("");

  useEffect(() => {
    if (!conversationId) return undefined;
    return subscribeToExploreMessageActivity(conversationId);
  }, [conversationId]);

  // Let the other side know this user has the thread open. setActivity in
  // useExploreMessages already honors the "show active status" preference.
  useEffect(() => {
    if (!conversationId || !onActivity) return undefined;
    onActivity("active");
    const interval = window.setInterval(() => onActivity("active"), PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(interval);
    // onActivity is recreated per render by the parent hook; conversation
    // identity is the meaningful trigger for the heartbeat lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !peerUserId) {
      setPresenceLabel("");
      return undefined;
    }

    function refresh() {
      const match = fetchExploreMessageActivity().find(
        (item) => String(item.conversationId) === String(conversationId) && item.userId === peerUserId,
      );
      setPresenceLabel(resolvePresenceLabel(match));
    }

    refresh();
    window.addEventListener(EXPLORE_MESSAGE_ACTIVITY_EVENT, refresh);
    const interval = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener(EXPLORE_MESSAGE_ACTIVITY_EVENT, refresh);
      window.clearInterval(interval);
    };
  }, [conversationId, peerUserId]);

  return presenceLabel;
}

export default function ConversationScreen({ conversation, currentUserId, messages, onAction, onActivity, onBack, onSend, onViewProfile }) {
  const user = getOtherParticipant(conversation, currentUserId);
  const messagesRef = useRef(null);
  // Read receipts: mark the newest of my messages the other side has read.
  // Honors the "Receipts" preference in Settings on this account.
  const receiptsEnabled = readExploreSettings().messages.readReceipts !== false;
  const lastSeenOwnMessageId = receiptsEnabled
    ? [...messages].reverse().find((message) => message.senderId === currentUserId && message.read && !message.pending)?.id || ""
    : "";
  const presenceLabel = usePeerPresence(conversation?.id, user.userId, onActivity);
  const typingIndicator = presenceLabel === "typing…" || presenceLabel === "recording voice…";

  function openPeerProfile() {
    if (!onViewProfile) return;
    onViewProfile({
      userId: user.userId || "",
      displayName: user.displayName || "Profile",
      username: user.username || "",
      avatarUrl: user.avatarUrl || "",
      accountType: user.accountType || "personal",
    });
  }

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <section className="flex h-dvh min-w-0 flex-col overflow-hidden bg-white">
      <div className="flex min-w-0 items-center gap-3 border-b border-slate-200 px-4 py-3">
        <AppBackTab onBack={onBack} label="Back to inbox" historyKey="explore-conversation" />
        <button
          type="button"
          onClick={openPeerProfile}
          className="kt-pressable relative flex-none rounded-full"
          aria-label={`View ${user.displayName || "this user"}'s profile`}
        >
          <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
          {presenceLabel ? (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          ) : null}
        </button>
        <button type="button" onClick={openPeerProfile} className="kt-pressable min-w-0 rounded-lg text-left">
          <p className="block max-w-full truncate text-left text-sm font-black text-slate-950">
            {user.displayName || "Profile"}
          </p>
          {presenceLabel ? (
            <p
              className={`block max-w-full truncate text-left text-xs font-black ${typingIndicator ? "text-emerald-600" : "text-emerald-500"}`}
              aria-live="polite"
            >
              {presenceLabel}
            </p>
          ) : (
            <p className="block max-w-full truncate text-left text-xs font-bold text-slate-500">
              @{user.username || "user"}
            </p>
          )}
        </button>
      </div>

      <div ref={messagesRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4 kuntai-scrollbar-none">
        {!messages.length ? (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="text-sm font-black text-slate-950">Start the conversation</p>
            <p className="mt-1 text-sm text-slate-500">Say hello, ask a question, or continue from their profile.</p>
          </div>
        ) : null}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.senderId === currentUserId}
            seen={message.id === lastSeenOwnMessageId}
            otherUserName={user.displayName || user.username || "This user"}
            onApproveLocationRequest={() => onAction?.("approveLocationRequest", { message, userId: user.userId })}
            onBlockUser={() => onAction?.("blockUser", { message, userId: user.userId })}
            onDeleteMessage={() => onAction?.("deleteMessage", { message, userId: user.userId })}
            onOpenSharedLocation={() => onAction?.("openSharedLocation", { message, userId: user.userId })}
          />
        ))}
      </div>

      <MessageComposer onAction={onAction} onActivity={onActivity} onSend={onSend} />
    </section>
  );
}
