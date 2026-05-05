import {
  FiClock,
  FiCreditCard,
  FiHelpCircle,
  FiMapPin,
  FiSettings,
  FiShield,
  FiUser,
  FiX,
} from "react-icons/fi";

const walletActions = [
  { icon: FiCreditCard, label: "Top up wallet", detail: "Add money for rides and delivery" },
  { icon: FiClock, label: "My trips", detail: "Active tickets, rides, and receipts" },
  { icon: FiShield, label: "Payment safety", detail: "PIN, disputes, and verified payments" },
];

const menuActions = [
  { icon: FiMapPin, label: "Saved places", detail: "Home, work, pickup points" },
  { icon: FiHelpCircle, label: "Support", detail: "Ride issues and operator reports" },
  { icon: FiSettings, label: "Transport settings", detail: "Language, alerts, preferences" },
];

export default function TransportMenuDrawer({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close transport menu overlay"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/30"
      />

      <aside className="relative h-full w-full max-w-sm bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-600 text-white flex items-center justify-center">
              <FiUser size={19} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Transport Menu</h2>
              <p className="text-xs text-gray-500">Passenger tools and wallet</p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close transport menu"
            onClick={onClose}
            className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-gray-100 transition"
          >
            <FiX size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <section className="rounded-2xl border border-green-100 bg-green-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-green-800">Wallet Balance</p>
                <p className="mt-1 text-2xl font-bold text-gray-950">SLE 0.00</p>
                <p className="mt-1 text-xs text-green-700">
                  Pay verified operators, deliveries, and trip tickets.
                </p>
              </div>
              <div className="h-11 w-11 rounded-full bg-white text-green-700 flex items-center justify-center shadow-sm">
                <FiCreditCard size={21} />
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Wallet
            </h3>
            {walletActions.map((item) => (
              <button
                key={item.label}
                type="button"
                className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left hover:border-green-200 hover:bg-green-50 transition"
              >
                <span className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">
                    <item.icon size={18} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                    <span className="block text-xs text-gray-500">{item.detail}</span>
                  </span>
                </span>
              </button>
            ))}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Passenger
            </h3>
            {menuActions.map((item) => (
              <button
                key={item.label}
                type="button"
                className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left hover:border-gray-200 hover:bg-gray-50 transition"
              >
                <span className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">
                    <item.icon size={18} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                    <span className="block text-xs text-gray-500">{item.detail}</span>
                  </span>
                </span>
              </button>
            ))}
          </section>
        </div>
      </aside>
    </div>
  );
}
