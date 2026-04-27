import { Compass, ShoppingBag, CarFront, ShieldCheck } from "lucide-react";

const defaultPanels = [
  {
    icon: Compass,
    title: "Social discovery",
    body: "Move from nearby discoveries into posts, people, and local conversations without changing apps.",
  },
  {
    icon: ShoppingBag,
    title: "Marketplace ready",
    body: "Browse, buy, and grow a business profile with a cleaner identity layer from day one.",
  },
  {
    icon: CarFront,
    title: "Transport built in",
    body: "Ride and delivery entry points feel like part of the same account, not a separate product.",
  },
];

export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  panels = defaultPanels,
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06101c] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(249,115,22,0.16),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_28%),linear-gradient(145deg,#07111a_0%,#0a1a2c_40%,#04101a_100%)]" />
        <div className="absolute left-[-10%] top-[-10%] h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute bottom-[-12%] right-[-6%] h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden rounded-[32px] border border-white/10 bg-white/[0.05] p-8 shadow-[0_28px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:block">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.34em] text-sky-100">
            <ShieldCheck size={14} />
            Cross-platform onboarding
          </p>
          <h2 className="mt-6 max-w-xl text-5xl font-semibold leading-[1.02] tracking-[-0.05em] text-white">
            One account for Explore, Marketplace, and Transport.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            KunThai should feel like one connected platform from the first minute. This onboarding prepares profile,
            preferences, and default entry points so the app feels intentional across every surface.
          </p>

          <div className="mt-10 grid gap-4">
            {panels.map((panel) => {
              const Icon = panel.icon;
              return (
                <div
                  key={panel.title}
                  className="flex gap-4 rounded-[24px] border border-white/10 bg-slate-950/25 p-4"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] text-sky-100">
                    <Icon size={20} />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">{panel.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{panel.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="w-full">
          <div className="mx-auto w-full max-w-xl rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,17,30,0.94),rgba(4,11,21,0.98))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-8">
            {eyebrow && (
              <p className="mb-4 inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.34em] text-sky-100">
                {eyebrow}
              </p>
            )}

            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[2.25rem]">{title}</h1>
            {subtitle && <p className="mt-3 text-sm leading-6 text-slate-300">{subtitle}</p>}

            <div className="mt-6">{children}</div>
          </div>

          {footer && <div className="mx-auto mt-5 max-w-xl text-center text-sm text-slate-100">{footer}</div>}
        </section>
      </div>
    </div>
  );
}
