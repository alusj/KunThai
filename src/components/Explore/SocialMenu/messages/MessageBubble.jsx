export default function MessageBubble({ mine, message }) {
  return (
    <div className={`flex min-w-0 ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`kuntai-break max-w-[82%] rounded-[22px] px-4 py-3 text-sm font-semibold leading-6 sm:max-w-[78%] ${
          mine ? "rounded-br-md bg-slate-950 text-white" : "rounded-bl-md bg-slate-100 text-slate-800"
        }`}
      >
        {message.body}
        <p className={`mt-1 text-[10px] font-bold ${mine ? "text-white/55" : "text-slate-400"}`}>
          {message.pending ? "Sending..." : new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
