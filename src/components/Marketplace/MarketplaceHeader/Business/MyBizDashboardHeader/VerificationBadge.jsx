import { BadgeCheck } from "lucide-react";

export default function VerificationBadge({ verified, label }) {
  if (!verified) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
        Verification pending
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
      <BadgeCheck size={14} strokeWidth={2.4} />
      {label}
    </span>
  );
}
