// src/components/Marketplace/MessageBubble.jsx

export default function MessageBubble({ msg }) {
  const isBuyer = msg.from === "buyer";

  return (
    <div
      className={`max-w-[70%] px-3 py-2 rounded-lg text-sm
        ${isBuyer
          ? "bg-slate-200 text-gray-800 self-start"
          : "bg-emerald-600 text-white self-end ml-auto"
        }`}
    >
      {msg.text}
    </div>
  );
}
