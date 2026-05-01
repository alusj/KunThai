import SupportThreadItem from "./SupportThreadItem";

export default function SupportThreads({ threads }) {
  if (threads.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h3 className="text-base font-black text-gray-950">Support & disputes</h3>
      <div className="space-y-3">
        {threads.map((thread) => (
          <SupportThreadItem key={thread.id} thread={thread} />
        ))}
      </div>
    </section>
  );
}
