import BusinessLogo from "./BusinessLogo";
import VerificationBadge from "./VerificationBadge";

export default function BusinessProfileCard({ business }) {
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

          <p className="mt-1 text-sm font-medium text-gray-500">
            {business.category} · {business.location}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-gray-900">
              {business.rating.toFixed(1)}
            </span>
            <span className="text-yellow-500">star</span>
            <span className="text-gray-500">
              {business.reviewCount} reviews
            </span>
          </div>
        </div>

        <button
          type="button"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          onClick={() => console.log("Edit business clicked")}
        >
          Edit Profile
        </button>
      </div>
    </section>
  );
}
