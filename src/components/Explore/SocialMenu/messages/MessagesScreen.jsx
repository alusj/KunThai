import { useState } from "react";

import { useExploreMessages } from "../../../../Backend/hooks/useExploreMessages";
import EmptyState from "../../shared/EmptyState";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import ConversationRow from "./ConversationRow";
import ConversationScreen from "./ConversationScreen";
import MessageTabs from "./MessageTabs";

export default function MessagesScreen({ currentProfile, hideHeader = false, initialRecipient }) {
  const [tab, setTab] = useState("inbox");
  const messages = useExploreMessages(currentProfile, initialRecipient);
  const currentUserId = currentProfile?.userId || "";
  const activeItems = tab === "requests" ? messages.requests : messages.inbox;

  if (messages.activeConversation) {
    return (
      <ConversationScreen
        conversation={messages.activeConversation}
        currentUserId={currentUserId}
        messages={messages.messages}
        onBack={messages.closeConversation}
        onSend={messages.sendMessage}
        onActivity={messages.setActivity}
      />
    );
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Messages" subtitle="Private Explore conversations and message requests." /> : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Explore Messages</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Inbox</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">Start chats from profiles. Media messages and read receipts are staged for later.</p>
        </div>

        <MessageTabs
          active={tab}
          counts={{ inbox: messages.inbox.length, requests: messages.requests.length }}
          onChange={setTab}
        />

        {!activeItems.length ? (
          <EmptyState
            title={tab === "requests" ? "No message requests" : "No conversations yet"}
            message={tab === "requests" ? "New people outside your circle can appear here later." : "Open a profile and tap Message to start a chat."}
          />
        ) : (
          <div className="space-y-3">
            {activeItems.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                currentUserId={currentUserId}
                onOpen={messages.openConversation}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
