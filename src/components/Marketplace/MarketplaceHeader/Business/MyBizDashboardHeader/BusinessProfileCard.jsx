import { Bike, Clock, MapPin, Store, Tags } from "lucide-react";

import BusinessLogo from "./BusinessLogo";
import VerificationBadge from "./VerificationBadge";

function StatusPill({ icon: Icon, label, active }) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black",
        active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500",
      ].join(" ")}
    >
      <Icon size={14} strokeWidth={2.3} />
      {label}
    </span>
  );
}

export default function BusinessProfileCard({ business, status, onEditProfile }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <BusinessLogo initials={business.logoInitials} logoUrl={business.logoUrl} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-gray-950">{business.name}</h2>
            <VerificationBadge
              verified={business.verified}
              label={business.verificationLabel}
            />
          </div>

          <div className="mt-2 space-y-1 text-sm font-semibold text-gray-500">
            <p className="flex items-center gap-2">
              <Tags size={15} strokeWidth={2.3} />
              <span className="min-w-0 truncate">
                {business.category || "No category yet"}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <MapPin size={15} strokeWidth={2.3} />
              <span className="min-w-0 truncate">
                {business.location || "No address yet"}
              </span>
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-gray-900">
              {business.rating.toFixed(1)}
            </span>
            <span className="text-yellow-500">star</span>
            <span className="text-gray-500">
              {business.reviewCount} reviews
            </span>
          </div>

          {status ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <StatusPill
                icon={Clock}
                label={status.open ? "Open now" : "Closed"}
                active={status.open}
              />
              <StatusPill
                icon={Bike}
                label="Delivery"
                active={status.deliveryEnabled}
              />
              <StatusPill
                icon={Store}
                label="Pickup"
                active={status.pickupEnabled}
              />
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          onClick={onEditProfile}
        >
          Edit Profile
        </button>
      </div>
    </section>
  );
}
