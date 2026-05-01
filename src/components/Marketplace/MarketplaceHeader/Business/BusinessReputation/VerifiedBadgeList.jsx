import { BadgeCheck, Lock } from "lucide-react";

export default function VerifiedBadgeList({ badges }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="font-black text-gray-950">Verified badges</h4>
      <div className="mt-3 flex flex-wrap gap-2">
        {badges.map((badge) => {
          const active = badge.status === "active";
          const Icon = active ? BadgeCheck : Lock;

          return (
            <span
              key={badge.id}
              className={[
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black",
                active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500",
              ].join(" ")}
            >
              <Icon size={14} strokeWidth={2.3} />
              {badge.label}
            </span>
          );
        })}
      </div>
    </section>
  );
}
