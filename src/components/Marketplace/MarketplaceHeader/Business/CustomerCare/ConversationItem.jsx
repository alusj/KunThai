import { formatMessageTime } from "../../../../../Backend/utils/formatMessageTime";
import { useI18n, t } from "../../../../../i18n";

function conversationTitle(conversation) {
  if (conversation.productName) {
    return t("urmall.biz.care.msgAbout", { buyer: conversation.buyerName, product: conversation.productName });
  }

  return t("urmall.biz.care.msgGeneral", { buyer: conversation.buyerName });
}

export default function ConversationItem({ conversation, onOpen, active }) {
  useI18n();
  return (
    <button
      type="button"
      onClick={() => onOpen?.(conversation)}
      className={`w-full rounded-lg border p-4 text-left transition ${
        conversation.unread
          ? "border-emerald-200 bg-emerald-50/90 hover:bg-emerald-100/80"
          : active
            ? "border-gray-300 bg-gray-50"
            : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="line-clamp-2 font-black text-gray-950">{conversationTitle(conversation)}</p>
          </div>
          <p className="mt-1 text-xs font-bold uppercase text-gray-400">{conversation.productName ? t("urmall.biz.care.productMessage") : t("urmall.biz.care.urmallMessage")}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-gray-400">{formatMessageTime(conversation.time)}</span>
      </div>

      <p className="mt-3 text-sm font-medium leading-5 text-gray-600">
        {conversation.preview}
      </p>

      <p className="mt-3 text-xs font-black text-emerald-700">{t("urmall.biz.care.openConversation")}</p>
    </button>
  );
}
