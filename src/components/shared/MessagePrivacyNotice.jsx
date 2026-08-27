import { LockKeyhole, ShieldCheck } from "lucide-react";

const COPY = {
  explore: {
    eyebrow: "Private Explore messaging",
    title: "Restricted to conversation participants",
    body: "Messages are protected in transit and are not available in the KunThai admin workspace. Only the people in this conversation can open them.",
  },
  urmall: {
    eyebrow: "Supervised commerce messaging",
    title: "Built for safer buying and selling",
    body: "Authorized KunThai reviewers may inspect UrMall conversations when needed for safety, fraud prevention, support, or dispute resolution. Every staff access is recorded.",
  },
};

export default function MessagePrivacyNotice({ compact = false, variant = "explore" }) {
  const copy = COPY[variant] || COPY.explore;
  const Icon = variant === "urmall" ? ShieldCheck : LockKeyhole;
  const tone = variant === "urmall"
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : "border-sky-200 bg-sky-50 text-sky-950";

  if (compact) {
    return (
      <div className={`flex items-start gap-2 border-b px-4 py-2.5 text-xs font-semibold leading-5 ${tone}`}>
        <Icon className="mt-0.5 shrink-0" size={15} />
        <p><span className="font-black">{copy.eyebrow}.</span> {copy.body}</p>
      </div>
    );
  }

  return (
    <aside className={`rounded-2xl border p-4 ${tone}`} aria-label={copy.eyebrow}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/80 shadow-sm"><Icon size={19} /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">{copy.eyebrow}</p>
          <h3 className="mt-1 text-sm font-black">{copy.title}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 opacity-75">{copy.body}</p>
        </div>
      </div>
    </aside>
  );
}
