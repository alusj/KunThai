const TYPE_STYLES = {
  message: "bg-gray-100 text-gray-600",
  negotiation: "bg-amber-50 text-amber-700",
  question: "bg-blue-50 text-blue-700",
};

export default function ConversationTypeBadge({ type }) {
  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-black capitalize ${TYPE_STYLES[type]}`}>
      {type}
    </span>
  );
}
