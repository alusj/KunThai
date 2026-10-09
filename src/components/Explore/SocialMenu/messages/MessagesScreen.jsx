import { useEffect, useRef, useState } from "react";
import { HiOutlineBuildingOffice2 } from "react-icons/hi2";

import { useExploreMessages } from "../../../../Backend/hooks/useExploreMessages";
import { useHideAiAssistant } from "../../../../Backend/services/ai/aiScreenContext";
import { useI18n } from "../../../../i18n";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import ConversationRow from "./ConversationRow";
import ConversationScreen from "./ConversationScreen";
import MessageTabs from "./MessageTabs";
import MessagePrivacyNotice from "../../../shared/MessagePrivacyNotice";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";

const CONVERSATION_TRANSITION_MS = 280;

export default function MessagesScreen({ currentProfile, hideHeader = false, initialRecipient, onConversationActiveChange, onViewProfile }) {
  // KAI is not offered in Explore messages.
  useHideAiAssistant();
  const { t } = useI18n();
  const [tab, setTab] = useState("inbox");
  const messages = useExploreMessages(currentProfile, initialRecipient);
  const currentUserId = currentProfile?.userId || "";
  const spaceName = messages.spaceInbox ? currentProfile?.displayName || currentProfile?.name || translateUi("Space") : "";
  const activeItems = messages.spaceInbox || tab !== "requests" ? messages.inbox : messages.requests;

  // Slide the conversation in/out over the list (same feel as other back-nav)
  // instead of an instant swap. The outgoing conversation and its last messages
  // are kept for the exit animation, then dropped.
  const [screenAction, setScreenAction] = useState("idle");
  const [closingConversation, setClosingConversation] = useState(null);
  const [closingMessages, setClosingMessages] = useState([]);
  const previousConversationRef = useRef(null);
  const lastMessagesRef = useRef([]);
  const visibleConversation = messages.activeConversation || closingConversation;

  useEffect(() => {
    onConversationActiveChange?.(Boolean(messages.activeConversation));
    return () => onConversationActiveChange?.(false);
  }, [messages.activeConversation, onConversationActiveChange]);

  // Keep the latest messages of the open conversation so the exit animation can
  // still show them (closeConversation clears messages synchronously).
  useEffect(() => {
    if (messages.activeConversation) lastMessagesRef.current = messages.messages;
  }, [messages.activeConversation, messages.messages]);

  useEffect(() => {
    const current = messages.activeConversation;
    const previous = previousConversationRef.current;
    previousConversationRef.current = current;

    if (current) {
      setScreenAction("push");
      setClosingConversation(null);
      return undefined;
    }

    if (previous) {
      setClosingConversation(previous);
      setClosingMessages(lastMessagesRef.current);
      setScreenAction("pop");
      const timer = window.setTimeout(() => {
        setClosingConversation(null);
        setClosingMessages([]);
        setScreenAction("idle");
      }, CONVERSATION_TRANSITION_MS);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [messages.activeConversation]);

  // Open on Requests only once, when the first load finds nothing but
  // requests. After that the person's own tab choice is kept, so Inbox can
  // always be opened (even while it is empty).
  const autoTabDecidedRef = useRef(false);
  useEffect(() => {
    if (autoTabDecidedRef.current || messages.loading) return;
    autoTabDecidedRef.current = true;
    if (!messages.inbox.length && messages.requests.length) setTab("requests");
  }, [messages.inbox.length, messages.loading, messages.requests.length]);

  const panelClass = screenAction === "push"
    ? "kt-explore-stack-enter"
    : screenAction === "pop"
      ? "kt-explore-stack-leave-right"
      : "";
  const conversationMessages = messages.activeConversation ? messages.messages : closingMessages;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        aria-hidden={visibleConversation ? true : undefined}
        inert={visibleConversation ? "true" : undefined}
      >
        {!hideHeader ? <div className="shrink-0"><SocialScreenHeader title={t("messages.headerTitle")} subtitle={t("messages.headerSubtitle")} /></div> : null}

        <div className="min-h-0 w-full flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <MessagePrivacyNotice variant="explore" />
          {messages.spaceInbox ? (
            <section className="flex items-center gap-3 rounded-[24px] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-sky-600 text-white">
                <HiOutlineBuildingOffice2 size={21} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-slate-950">{translateUi("{value0} inbox", { value0: spaceName })}</span>
                <span className="block text-xs font-semibold leading-5 text-slate-500">
                  {translateUi("Messages people send to this Space. Everyone on your team who can reply sees them here.")}
                </span>
              </span>
            </section>
          ) : (
            <MessageTabs
              active={tab}
              inboxUnreadCount={messages.inboxUnreadCount}
              requestCount={messages.requests.length}
              onChange={setTab}
            />
          )}

          {messages.error ? <ErrorState message={translateUi(messages.error)} onRetry={messages.reload} /> : null}

          {messages.loading ? (
            <MessagesSkeleton />
          ) : !activeItems.length ? (
            <EmptyState
              title={messages.spaceInbox ? translateUi("No messages yet") : tab === "requests" ? t("messages.noRequests") : t("messages.noConversations")}
              message={messages.spaceInbox
                ? translateUi("When someone messages {value0}, the conversation appears here for your team.", { value0: spaceName })
                : tab === "requests" ? t("messages.noRequestsMsg") : t("messages.noConversationsMsg")}
            />
          ) : (
            <div className="space-y-3">
              {activeItems.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  currentUserId={currentUserId}
                  onOpen={messages.openConversation}
                  onRespond={messages.respondToRequest}
                  request={!messages.spaceInbox && tab === "requests"}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {visibleConversation ? (
        <div className={`absolute inset-0 z-10 ${panelClass}`}>
          <ConversationScreen
            key={visibleConversation.id}
            conversation={visibleConversation}
            currentUserId={currentUserId}
            loading={messages.conversationLoading}
            messages={conversationMessages}
            onBack={messages.closeConversation}
            onAction={messages.handleConversationAction}
            onSend={messages.sendMessage}
            hasOlderMessages={messages.hasOlderMessages}
            loadingOlderMessages={messages.loadingOlderMessages}
            onLoadOlder={messages.loadOlderMessages}
            onActivity={messages.setActivity}
            onViewProfile={onViewProfile}
            replyingAs={spaceName}
          />
        </div>
      ) : null}
    </div>
  );
}

function MessagesSkeleton() {
  useUiLocale();
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200" />
              <div className="h-3 w-56 max-w-full animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
