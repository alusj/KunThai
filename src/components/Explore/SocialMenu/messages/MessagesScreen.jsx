import { useEffect, useState } from "react";

import { useExploreMessages } from "../../../../Backend/hooks/useExploreMessages";
import { useI18n } from "../../../../i18n";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import ConversationRow from "./ConversationRow";
import ConversationScreen from "./ConversationScreen";
import MessageTabs from "./MessageTabs";

export default function MessagesScreen({ currentProfile, hideHeader = false, initialRecipient, onConversationActiveChange, onViewProfile }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("inbox");
  const messages = useExploreMessages(currentProfile, initialRecipient);
  const currentUserId = currentProfile?.userId || "";
  const activeItems = tab === "requests" ? messages.requests : messages.inbox;

  useEffect(() => {
    onConversationActiveChange?.(Boolean(messages.activeConversation));
    return () => onConversationActiveChange?.(false);
  }, [messages.activeConversation, onConversationActiveChange]);

  useEffect(() => {
    if (tab === "inbox" && !messages.inbox.length && messages.requests.length) {
      setTab("requests");
    }
  }, [messages.inbox.length, messages.requests.length, tab]);

  if (messages.activeConversation) {
    return (
      <ConversationScreen
        conversation={messages.activeConversation}
        currentUserId={currentUserId}
        messages={messages.messages}
        onBack={messages.closeConversation}
        onAction={messages.handleConversationAction}
        onSend={messages.sendMessage}
        onActivity={messages.setActivity}
        onViewProfile={onViewProfile}
      />
    );
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title={t("messages.headerTitle")} subtitle={t("messages.headerSubtitle")} /> : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        <MessageTabs
          active={tab}
          requestCount={messages.requests.length}
          onChange={setTab}
        />

        {messages.error ? <ErrorState message={messages.error} onRetry={messages.reload} /> : null}

        {messages.loading ? (
          <MessagesSkeleton />
        ) : !activeItems.length ? (
          <EmptyState
            title={tab === "requests" ? t("messages.noRequests") : t("messages.noConversations")}
            message={tab === "requests" ? t("messages.noRequestsMsg") : t("messages.noConversationsMsg")}
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
                request={tab === "requests"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessagesSkeleton() {
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
