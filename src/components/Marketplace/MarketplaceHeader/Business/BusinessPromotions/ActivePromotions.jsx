import ActivePromotionCard from "./ActivePromotionCard";

export default function ActivePromotions({ onCreate, promotions }) {
  const canCreate = typeof onCreate === "function";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-gray-950">Active promotions</h3>
        <button
          type="button"
          className="text-sm font-black text-blue-700 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400"
          disabled={!canCreate}
          onClick={onCreate}
        >
          Create promo
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {promotions.map((promotion) => (
          <ActivePromotionCard key={promotion.id} promotion={promotion} />
        ))}
      </div>
    </section>
  );
}
