import { useI18n, t } from "../../../../../i18n";
import ConversationItem from "./ConversationItem";

export default function RecentConversations({ conversations, onOpen, activeId }) {
  useI18n();
  return (
    <section className="space-y-3">
      <h3 className="text-base font-black text-gray-950">{t("urmall.biz.dash.messages")}</h3>

      <div className="space-y-3">
        {conversations.length ? (
          conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              onOpen={onOpen}
              active={activeId === conversation.id}
            />
          ))
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
            <p className="font-black text-gray-950">{t("urmall.biz.care.noMessages")}</p>
            <p className="mt-1 text-sm font-medium text-gray-500">{t("urmall.biz.care.noMessagesDesc")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
