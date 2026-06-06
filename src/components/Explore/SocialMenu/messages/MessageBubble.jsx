export default function MessageBubble({ mine, message }) {
  const mediaUrl = message.mediaUrl || message.media_url || "";
  const mediaType = message.type || message.media_type || "text";

  return (
    <div className={`flex min-w-0 ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`kuntai-break max-w-[82%] rounded-[22px] px-4 py-3 text-sm font-semibold leading-6 sm:max-w-[78%] ${
          mine ? "rounded-br-md bg-slate-950 text-white" : "rounded-bl-md bg-slate-100 text-slate-800"
        }`}
      >
        {mediaType === "image" && mediaUrl ? (
          <img src={mediaUrl} alt="Message attachment" className="mb-2 max-h-72 w-full rounded-2xl object-cover" />
        ) : null}
        {mediaType === "audio" && mediaUrl ? (
          <div className={`mb-2 rounded-2xl p-2 ${mine ? "bg-white/10" : "bg-white"}`}>
            <audio controls src={mediaUrl} className="w-full" aria-label="Voice message" />
          </div>
        ) : null}
        {message.body ? <p>{message.body}</p> : mediaType === "audio" ? <p>Voice note</p> : mediaType === "image" ? <p>Photo</p> : null}
        <p className={`mt-1 text-[10px] font-bold ${mine ? "text-white/55" : "text-slate-400"}`}>
          {message.pending ? "Sending..." : new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
