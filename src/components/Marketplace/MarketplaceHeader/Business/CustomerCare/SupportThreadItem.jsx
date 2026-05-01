export default function SupportThreadItem({ thread }) {
  return (
    <article className="rounded-lg border border-red-100 bg-red-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-red-900">{thread.title}</p>
          <p className="mt-1 text-sm font-medium leading-5 text-red-700">
            {thread.description}
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-red-700">
          {thread.priority}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs font-black text-red-700">{thread.time}</span>
        <button
          type="button"
          className="rounded-lg bg-red-700 px-3 py-2 text-xs font-black text-white transition hover:bg-red-800"
          onClick={() => console.log("Open support thread", thread.id)}
        >
          Respond
        </button>
      </div>
    </article>
  );
}
