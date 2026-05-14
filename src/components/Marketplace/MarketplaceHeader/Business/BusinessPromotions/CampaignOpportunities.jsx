import CampaignOpportunityCard from "./CampaignOpportunityCard";

export default function CampaignOpportunities({ opportunities }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-black text-gray-950">Upcoming campaign opportunities</h3>
      <p className="mt-1 text-sm font-medium text-gray-500">
        UrMall moments sellers can prepare for early.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {opportunities.map((opportunity) => (
          <CampaignOpportunityCard key={opportunity.id} opportunity={opportunity} />
        ))}
      </div>
    </section>
  );
}
