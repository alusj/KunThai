import { BadgeCheck, Clock, FileText, Hotel, House, Landmark, ShieldAlert, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";

const BUSINESS_GUIDES = [
  { icon: Store, title: "Shop", purpose: "Sell physical products through a catalog.", registration: "Choose Shop, select the shop categories, add contact and location details, then upload identity or business documents when they are ready.", operation: "Publish products with honest prices and stock. Shops may offer pickup, delivery, or both." },
  { icon: UtensilsCrossed, title: "Restaurant", purpose: "Publish meals that are available on a selected day.", registration: "Choose Restaurant, add the restaurant identity and operating details, then attach documents that help KunThai verify the business.", operation: "Create each meal with a cover image, five gallery images, and a short video. Restaurants may offer pickup and delivery." },
  { icon: Hotel, title: "Hotel", purpose: "Present a hotel, its gallery, short video, and available room information.", registration: "Choose Hotel and register the hotel identity, physical location, contact details, and verification documents.", operation: "Use Add Hotel to publish one cover image, five extra images, and one video. Hotel workspaces do not use shop categories or order tools." },
  { icon: House, title: "Real Estate Agent", purpose: "Advertise property for rent or sale.", registration: "Choose Real Estate Agent and add agent, company, or authorization records when they are ready so KunThai can verify the seller profile.", operation: "Every property needs accurate location and price information, one cover image, five extra images, and one short video. Listings can be published by the seller; the seller verification badge remains a separate trust signal." },
];

const VERIFICATION_GUIDES = [
  {
    icon: Landmark,
    title: "Government-recognized documents",
    body: "Verification uses documents issued or recognized by a known government organization, such as an owner ID, business registration, tax record, permit, or license where applicable.",
  },
  {
    icon: Clock,
    title: "Register first, upload later",
    body: "You can create the UrMall business account even if the documents are not ready. Add them later from the seller dashboard when you have clear files available.",
  },
  {
    icon: BadgeCheck,
    title: "Not verified until reviewed",
    body: "A seller with missing documents, or documents still waiting for review, will show a Not verified or pending status until KunThai approves the verification.",
  },
];

export default function UrMallCautionCard({ showMenuNote = true }) {
  return (
    <section className="mt-5 rounded-[28px] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-4 shadow-sm sm:p-5">
      {showMenuNote ? (
        <div className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">
          You can find this Caution Card at any time in the UrMall buyer menu.
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-700">
          <ShoppingBag size={23} />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Seller verification guidance</p>
          <h2 className="mt-1 text-2xl font-black leading-tight text-slate-950">Create a serious UrMall business account</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            UrMall lets a seller register first, but verification is earned only after KunThai can review reliable identity and business documents. Buyers should still confirm the item, price, location, delivery or pickup method, and payment instructions before sending money.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {VERIFICATION_GUIDES.map(({ body, icon: Icon, title }) => (
          <article key={title} className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <Icon size={19} />
            </span>
            <h3 className="mt-3 font-black text-slate-950">{title}</h3>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{body}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
            <FileText size={19} />
          </span>
          <div>
            <h3 className="font-black text-slate-950">Business type matters</h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
              Choose the business type that matches the real service. The documents and review questions may differ by shop, restaurant, hotel, or property work.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BUSINESS_GUIDES.map(({ icon: Icon, operation, purpose, registration, title }) => (
            <article key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <Icon size={18} className="text-blue-700" />
                <h4 className="font-black text-slate-950">{title}</h4>
              </div>
              <p className="mt-2 text-sm font-bold text-slate-700">Purpose: {purpose}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-600"><strong>Registration:</strong> {registration}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-600"><strong>How it works:</strong> {operation}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
        <ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-700" />
        <p className="text-xs font-bold leading-5">
          Never send passwords, one-time codes, payment PINs, or private identity documents to a buyer or seller. Keep important conversations connected to UrMall and report suspicious requests.
        </p>
      </div>
    </section>
  );
}
