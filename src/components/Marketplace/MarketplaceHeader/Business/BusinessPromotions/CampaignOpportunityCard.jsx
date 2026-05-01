export default function CampaignOpportunityCard({ opportunity }) {
  return (
    <article className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-black text-blue-950">{opportunity.title}</h4>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-blue-700">
          {opportunity.dateLabel}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium leading-5 text-blue-800">
        {opportunity.description}
      </p>
    </article>
  );
}
