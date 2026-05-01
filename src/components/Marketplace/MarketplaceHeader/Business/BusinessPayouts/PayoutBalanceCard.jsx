import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";

export default function PayoutBalanceCard({ label, amount, tone = "gray" }) {
  const tones = {
    gray: "bg-white text-gray-950",
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
  };

  return (
    <div className={`rounded-lg border border-gray-200 p-4 ${tones[tone]}`}>
      <p className="text-sm font-bold opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-black">{formatCurrency(amount)}</p>
    </div>
  );
}
