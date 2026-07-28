import { useI18n, t } from "../../../../../i18n";

const TYPE_STYLES = {
  message: "bg-gray-100 text-gray-600",
  negotiation: "bg-amber-50 text-amber-700",
  question: "bg-blue-50 text-blue-700",
};

const TYPE_KEYS = { message: "typeMessage", negotiation: "typeNegotiation", question: "typeQuestion" };

export default function ConversationTypeBadge({ type }) {
  useI18n();
  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-black capitalize ${TYPE_STYLES[type]}`}>
      {TYPE_KEYS[type] ? t(`urmall.biz.care.${TYPE_KEYS[type]}`) : type}
    </span>
  );
}
