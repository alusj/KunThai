export default function NotificationAction({ followed, onFollowBack, type }) {
  if (type === "follow" || type === "connect") {
    return (
      <button
        type="button"
        onClick={onFollowBack}
        disabled={followed}
        className={`mt-3 inline-flex h-9 items-center rounded-full px-4 text-xs font-black transition ${
          followed ? "bg-slate-100 text-slate-400" : "bg-sky-600 text-white active:scale-95"
        }`}
      >
        {followed ? "Connected" : "Connect back"}
      </button>
    );
  }

  return null;
}
