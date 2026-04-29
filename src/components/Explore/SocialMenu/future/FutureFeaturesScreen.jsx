import { futureFeatures } from "./futureFeatures";

export default function FutureFeaturesScreen() {
  return (
    <main className="px-4 py-4 sm:px-5">
      <section className="kuntai-card overflow-hidden">
        <div className="border-b border-slate-200 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-700">Roadmap</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Advanced future features</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            These ideas are reserved for later so Explore can stay focused, stable, and professional now.
          </p>
        </div>

        <div className="grid gap-3 p-3 sm:grid-cols-2">
          {futureFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white text-xl text-sky-700 shadow-sm">
                    <Icon />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-slate-950">{feature.title}</h4>
                    <p className="kuntai-break mt-1 text-sm leading-6 text-slate-600">{feature.description}</p>
                    <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">
                      Coming later
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
