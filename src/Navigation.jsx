import { useState } from "react";

const TABS = [
  { id: "nearby",  label: "Nearby",  emoji: "📍" },
  { id: "hotels",  label: "Hotels",  emoji: "🏨" },
  { id: "worship", label: "Worship", emoji: "🕌" },
  { id: "food",    label: "Food",    emoji: "🍽️" },
  { id: "health",  label: "Health",  emoji: "🏥" },
];

export default function Navigation() {
  const [tab, setTab] = useState("nearby");

  const Pill = ({ id, label, emoji }) => {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm
          ${active ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-700 hover:bg-slate-50 border-slate-300"}`}
      >
        <span className="text-base">{emoji}</span>
        <span className="font-medium">{label}</span>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="sticky top-[56px] z-10 bg-slate-100/80 backdrop-blur supports-[backdrop-filter]:bg-slate-100/60">
        <div className="px-4 py-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {TABS.map(t => <Pill key={t.id} {...t} />)}
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-28 space-y-4">
        {tab === "nearby"  && <Card title="Nearby"  subtitle="Map & list of places around you." />}
        {tab === "hotels"  && <Card title="Hotels"  subtitle="Call, directions, hours, booking links." />}
        {tab === "worship" && <Card title="Worship" subtitle="Mosques, churches, prayer times." />}
        {tab === "food"    && <Card title="Food"    subtitle="Restaurants, street food, delivery." />}
        {tab === "health"  && <Card title="Health"  subtitle="Hospitals, clinics, pharmacies." />}
      </div>
    </div>
  );
}

function Card({ title, subtitle }) {
  return (
    <div className="bg-white border rounded-lg p-4 hover:shadow-sm transition">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
    </div>
  );
}
