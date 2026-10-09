import AppBackTab from "../../../shared/AppBackTab";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Avatar from "../../shared/Avatar";
import {
  EXPLORE_MESSAGE_ACTIVITY_EVENT,
  fetchExploreMessageActivity,
  subscribeToExploreMessageActivity,
} from "../../../../Backend/services/explore/messageService";
import { canShowSeenFor, readExploreSettings } from "../../../../Backend/services/explore/preferencesService";
import { useKeyboardAwareConversation } from "../../../../Backend/hooks/useKeyboardAwareConversation";
import { useHideAiAssistant } from "../../../../Backend/services/ai/aiScreenContext";
import { useI18n } from "../../../../i18n";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";
import { t as i18nText } from "../../../../i18n/index";
import MessagePrivacyNotice from "../../../shared/MessagePrivacyNotice";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";
import { PRESENCE_LABEL_KEYS } from "../../../../Backend/services/explore/messageInboxModels.js";

// Scrolling this close to the top of a thread loads the page before it.
const LOAD_OLDER_THRESHOLD_PX = 80;

const TYPING_FRESH_MS = 12000;
const PRESENCE_FRESH_MS = 45000;
const PRESENCE_HEARTBEAT_MS = 25000;

function getOtherParticipant(conversation, currentUserId) {
  if (conversation?.counterpart) return conversation.counterpart;
  const otherId = conversation.participantIds?.find((id) => id !== currentUserId);
  return conversation.participants?.[otherId] || {};
}

function resolvePresenceLabel(peerActivity) {
  if (!peerActivity) return "";

  const settings = readExploreSettings().messages;
  const age = Date.now() - new Date(peerActivity.updatedAt || 0).getTime();
  if (!Number.isFinite(age) || age < 0) return "";

  if (age < TYPING_FRESH_MS && peerActivity.activity === "typing" && settings.showTypingStatus) {
    return "typing";
  }
  if (age < TYPING_FRESH_MS && peerActivity.activity === "recording" && settings.allowVoiceNotes) {
    return "recording";
  }
  if (age < PRESENCE_FRESH_MS && settings.showActiveStatus && ["active", "typing", "recording"].includes(peerActivity.activity)) {
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

export default function ConversationScreen({
  conversation,
  currentUserId,
  hasOlderMessages = false,
  loading = false,
  loadingOlderMessages = false,
  messages,
  onAction,
  onActivity,
  onBack,
  onLoadOlder,
  onSend,
  onViewProfile,
  replyingAs = "",
}) {
  // KAI is not offered in Explore messages.
  useHideAiAssistant();
  const { t } = useI18n();
  const user = getOtherParticipant(conversation, currentUserId);
  const peerIsSpace = user.accountType === "space" || Boolean(user.spaceId && !user.userId);
  // In a Space inbox every team reply is "ours"; elsewhere only my own.
  const isMine = (message) => (conversation?.spaceInbox
    ? message.senderId !== conversation.customerId
    : message.senderId === currentUserId);
  // Name the teammate behind a Space reply that someone else on the team sent.
  const teammateLabel = (message) => {
    if (!conversation?.spaceInbox || message.senderId === currentUserId || !isMine(message)) return "";
    const staffName = message.metadata?.actor?.staffName || "";
    return staffName ? translateUi("Sent by {value0}", { value0: staffName }) : translateUi("Sent by your team");
  };
  const messagesRef = useRef(null);
  // Read receipts: mark the newest of my messages the other side has read.
  // "Seen" shows only when both this account and the other person share receipts.
  const peerUserId = user.userId;
  const [receiptsEnabled, setReceiptsEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    setReceiptsEnabled(false);
    canShowSeenFor(peerUserId).then((value) => { if (active) setReceiptsEnabled(value === true); }).catch(() => {});
    return () => { active = false; };
  }, [peerUserId]);
  const lastSeenOwnMessageId = receiptsEnabled
    ? [...messages].reverse().find((message) => isMine(message) && message.read && !message.pending)?.id || ""
    : "";
  const presenceState = usePeerPresence(conversation?.id, user.userId, onActivity);
  const presenceLabel = presenceState ? i18nText(`exploreMessagesFix.${PRESENCE_LABEL_KEYS[presenceState]}`) : "";
  const typingIndicator = presenceState === "typing" || presenceState === "recording";
  // Pin to the newest message only when the newest message changes, so
  // loading older pages above does not jump the thread to the bottom.
  const newestMessageKey = messages.length ? messages[messages.length - 1].id : "";
  const keyboard = useKeyboardAwareConversation({
    activeKey: conversation?.id || "",
    itemCount: newestMessageKey,
    threadRef: messagesRef,
  });
  const olderAnchorRef = useRef(null);

  async function loadOlder() {
    const node = messagesRef.current;
    if (!node || !onLoadOlder || !hasOlderMessages || loadingOlderMessages) return;
    olderAnchorRef.current = { height: node.scrollHeight, top: node.scrollTop };
    await onLoadOlder();
  }

  function handleThreadScroll(event) {
    if (event.currentTarget.scrollTop < LOAD_OLDER_THRESHOLD_PX) loadOlder();
  }

  // Keep the reader's place after older messages are added above.
  useLayoutEffect(() => {
    const anchor = olderAnchorRef.current;
    const node = messagesRef.current;
    if (!anchor || !node) return;
    olderAnchorRef.current = null;
    node.scrollTop = node.scrollHeight - anchor.height + anchor.top;
  }, [messages.length]);

  function openPeerProfile() {
    if (!onViewProfile) return;
    if (peerIsSpace) {
      onViewProfile({
        ...user,
        identityType: "space",
        identityId: user.spaceId,
        actorType: "space",
        actorId: user.spaceId,
        spaceId: user.spaceId,
        userId: user.ownerUserId || "",
        ownerUserId: user.ownerUserId || "",
        accountType: "space",
      });
      return;
    }
    onViewProfile({
      userId: user.userId || "",
      displayName: user.displayName || "Profile",
      username: user.username || "",
      avatarUrl: user.avatarUrl || "",
      accountType: user.accountType || "personal",
    });
  }

  return (
    <section className="kt-conversation-screen flex min-w-0 flex-col bg-white" data-back-swipe-scope>
      <div className="flex min-w-0 items-center gap-3 border-b border-slate-200 px-4 py-3">
        <AppBackTab onBack={onBack} label={i18nText("ui.literals.k0050d622ebf2")} historyKey="explore-conversation" />
        <button
          type="button"
          onClick={openPeerProfile}
          className="kt-pressable relative flex-none rounded-full"
          aria-label={i18nText("ui.literals.ka7236c84a99b", { value0: user.displayName || i18nText("ui.literals.ka0fbee4e8361") })}
        >
          <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
          {presenceLabel ? (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          ) : null}
        </button>
        <button type="button" onClick={openPeerProfile} className="kt-pressable min-w-0 rounded-lg text-left">
          <p className="flex max-w-full items-center gap-1.5 truncate text-left text-sm font-black text-slate-950">
            <span className="truncate">{user.displayName || i18nText("ui.literals.kff4fc0276e96")}</span>
            {peerIsSpace ? (
              <span className="flex-none rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-sky-700">{translateUi("Space")}</span>
            ) : null}
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
              @{user.username || i18nText("ui.literals.k12dea96fec20")}
            </p>
          )}
        </button>
      </div>

      <MessagePrivacyNotice compact variant="explore" />
      {conversation?.spaceInbox && replyingAs ? (
        <p className="border-b border-sky-100 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-800">
          {translateUi("Replying as {value0}. Your Space team shares this conversation.", { value0: replyingAs })}
        </p>
      ) : null}

      <div ref={messagesRef} onScroll={handleThreadScroll} className="kt-message-thread space-y-3 bg-slate-50 px-4 py-4 kuntai-scrollbar-none">
        {hasOlderMessages ? (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingOlderMessages}
            className="mx-auto block rounded-full bg-white px-4 py-1.5 text-xs font-black text-slate-600 shadow-sm disabled:opacity-60"
          >
            {loadingOlderMessages ? i18nText("exploreMessagesFix.loadingOlder") : i18nText("exploreMessagesFix.loadOlder")}
          </button>
        ) : null}
        {loading && !messages.length ? <ConversationMessagesSkeleton /> : null}
        {!loading && !messages.length ? (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="text-sm font-black text-slate-950">{t("messages.startConversation")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("messages.startConversationMsg")}</p>
          </div>
        ) : null}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={translateUi(message)}
            mine={isMine(message)}
            seen={message.id === lastSeenOwnMessageId}
            senderLabel={teammateLabel(message)}
            canBlock={!peerIsSpace}
            canDelete={message.senderId === currentUserId}
            otherUserName={user.displayName || user.username || "This user"}
            onApproveLocationRequest={() => onAction?.("approveLocationRequest", { message, userId: user.userId })}
            onBlockUser={() => onAction?.("blockUser", { message, userId: user.userId })}
            onDeleteMessage={() => onAction?.("deleteMessage", { message, userId: user.userId })}
            onOpenSharedLocation={() => onAction?.("openSharedLocation", { message, userId: user.userId })}
          />
        ))}
      </div>

      <MessageComposer
        focused={keyboard.focused}
        onAction={onAction}
        onActivity={onActivity}
        onInputBlur={keyboard.handleInputBlur}
        onInputFocus={keyboard.handleInputFocus}
        onInputPointerDown={keyboard.handleInputPointerDown}
        onSend={onSend}
      />
    </section>
  );
}

function ConversationMessagesSkeleton() {
  useUiLocale();
  return (
    <div className="space-y-3" aria-label={i18nText("ui.literals.k22707c5d4fdd")} aria-busy="true">
      {["w-3/4", "ml-auto w-2/3", "w-4/5", "ml-auto w-1/2"].map((width, index) => (
        <div key={`${width}-${index}`} className={`${width} rounded-[20px] border border-slate-200 bg-white p-3`}>
          <div className="kt-startup-shimmer h-3 w-4/5 rounded-full" />
          <div className="kt-startup-shimmer mt-2 h-3 w-3/5 rounded-full" />
          <div className="kt-startup-shimmer mt-3 h-2 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
