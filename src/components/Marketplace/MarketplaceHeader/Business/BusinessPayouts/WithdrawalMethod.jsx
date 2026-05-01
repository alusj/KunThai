import { Landmark } from "lucide-react";

export default function WithdrawalMethod({ method }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Landmark size={19} strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-500">{method.type}</p>
          <p className="truncate font-black text-gray-950">{method.label}</p>
          <p className="text-sm font-medium text-gray-500">{method.maskedAccount}</p>
        </div>
      </div>
    </article>
  );
}
