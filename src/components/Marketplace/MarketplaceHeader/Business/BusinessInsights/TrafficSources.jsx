import TrafficSourceItem from "./TrafficSourceItem";

export default function TrafficSources({ sources }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-gray-950">Top traffic source</h3>
      <p className="mt-1 text-sm font-medium text-gray-500">
        Where buyers are finding your store.
      </p>

      <div className="mt-4 space-y-4">
        {sources.map((source) => (
          <TrafficSourceItem key={source.source} source={source} />
        ))}
      </div>
    </section>
  );
}
