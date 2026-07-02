import { Hotel, House, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";

const BUSINESS_GUIDES = [
  { icon: Store, title: "Shop", purpose: "Sell physical products through a catalog.", registration: "Choose Shop, select the shop categories, add contact and location details, then upload identity and business documents.", operation: "Publish products with honest prices and stock. Shops may offer pickup, delivery, or both." },
  { icon: UtensilsCrossed, title: "Restaurant", purpose: "Publish meals that are available on a selected day.", registration: "Choose Restaurant, add the restaurant identity and operating details, then submit the required verification documents.", operation: "Create each meal with a cover image, five gallery images, and a short video. Restaurants may offer pickup and delivery." },
  { icon: Hotel, title: "Hotel", purpose: "Present a hotel, its gallery, short video, and available room information.", registration: "Choose Hotel and register the hotel identity, physical location, contact details, and verification documents.", operation: "Use Add Hotel to publish one cover image, five extra images, and one video. Hotel workspaces do not use shop categories or order tools." },
  { icon: House, title: "Property Agent", purpose: "Advertise authorised property for rent or sale.", registration: "Choose Property Agent and submit the agent or company identity, location, contact details, and operating documents.", operation: "Every property needs accurate location and price information, one cover image, five extra images, and one short video. Listings are reviewed before public publication." },
];

export default function UrMallCautionCard({ showMenuNote = true }) {
  return (
    <section className="mt-5 rounded-[28px] border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm sm:p-5">
      {showMenuNote ? <div className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">You can find this Caution Card at any time in the UrMall buyer menu.</div> : null}
      <div className="mt-4 flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-700"><ShoppingBag size={22} /></span><div><h2 className="text-xl font-black text-slate-950">How UrMall businesses work</h2><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Choose the business type that matches the real service. Verification checks identity and documents, but buyers and sellers must still confirm the item, price, location, fulfillment method, and payment instructions.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{BUSINESS_GUIDES.map(({ icon: Icon, operation, purpose, registration, title }) => <article key={title} className="rounded-2xl border border-blue-100 bg-white p-4"><div className="flex items-center gap-2"><Icon size={18} className="text-blue-700" /><h3 className="font-black text-slate-950">{title}</h3></div><p className="mt-2 text-sm font-bold text-slate-700">Purpose: {purpose}</p><p className="mt-2 text-xs font-semibold leading-5 text-slate-600"><strong>Registration:</strong> {registration}</p><p className="mt-2 text-xs font-semibold leading-5 text-slate-600"><strong>How it works:</strong> {operation}</p></article>)}</div>
      <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">Never send passwords, one-time codes, payment PINs, or identity documents to a buyer or seller. Keep important conversations connected to UrMall and report suspicious requests.</p>
    </section>
  );
}
