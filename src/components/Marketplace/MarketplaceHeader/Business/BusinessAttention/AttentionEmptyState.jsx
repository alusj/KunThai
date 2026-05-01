import { CheckCircle2 } from "lucide-react";

export default function AttentionEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
      <CheckCircle2 className="mx-auto text-emerald-600" size={30} strokeWidth={2.4} />
      <h4 className="mt-3 font-black text-gray-950">Everything is clear</h4>
      <p className="mt-1 text-sm font-medium text-gray-500">
        No urgent seller tasks need attention right now.
      </p>
    </div>
  );
}
