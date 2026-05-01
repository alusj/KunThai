import {
  AlertTriangle,
  BadgeCheck,
  Clock,
  CreditCard,
  Megaphone,
  MessageSquare,
  PackageX,
  Store,
  Truck,
} from "lucide-react";

const ICONS = {
  approval: BadgeCheck,
  dispute: Truck,
  inventory: PackageX,
  messages: MessageSquare,
  orders: Clock,
  payout: CreditCard,
  profile: Store,
  promotion: Megaphone,
};

const TONES = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

export default function AttentionIcon({ type, priority }) {
  const Icon = ICONS[type] || AlertTriangle;

  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONES[priority]}`}>
      <Icon size={20} strokeWidth={2.3} />
    </span>
  );
}
