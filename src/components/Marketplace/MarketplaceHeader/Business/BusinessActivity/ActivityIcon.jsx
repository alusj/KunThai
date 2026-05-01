import {
  BadgeCheck,
  CreditCard,
  Megaphone,
  MessageSquare,
  PackageCheck,
  PackageSearch,
  Star,
  Wallet,
} from "lucide-react";

const ICONS = {
  message: MessageSquare,
  order: PackageCheck,
  payment: CreditCard,
  payout: Wallet,
  product: BadgeCheck,
  promotion: Megaphone,
  review: Star,
  stock: PackageSearch,
};

const TONES = {
  active: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  "needs-reply": "bg-red-50 text-red-700",
  new: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
};

export default function ActivityIcon({ type, status }) {
  const Icon = ICONS[type] || PackageSearch;

  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONES[status]}`}>
      <Icon size={19} strokeWidth={2.3} />
    </span>
  );
}
