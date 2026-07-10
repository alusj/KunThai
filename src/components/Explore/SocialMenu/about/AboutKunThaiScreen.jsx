import {
  HiOutlineBanknotes,
  HiOutlineGlobeAlt,
  HiOutlineHeart,
  HiOutlineScale,
  HiOutlineShoppingBag,
  HiOutlineSparkles,
  HiOutlineTruck,
  HiOutlineUserGroup,
} from "react-icons/hi2";

import SocialScreenHeader from "../shared/SocialScreenHeader";

const services = [
  ["Explore", "Share, discover, message, and build trusted connections.", HiOutlineUserGroup],
  ["UrMall Marketplace", "Find products and support local commerce through clear seller and order records.", HiOutlineShoppingBag],
  ["UrRide", "Connect passengers, operators, fleets, bookings, and delivery activity.", HiOutlineTruck],
  ["Payments", "Support practical payment and account tools only where those services are enabled.", HiOutlineBanknotes],
];

export default function AboutKunThaiScreen({ hideHeader = false, onOpenTerms }) {
  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="About KunThai" subtitle="One connected home for everyday digital services." /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-slate-950 via-slate-900 to-sky-900 p-6 text-white shadow-sm lg:p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-white/10"><HiOutlineGlobeAlt className="text-4xl" /></div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-sky-200">Built as one KunThai</p>
          <h3 className="mt-2 max-w-3xl text-3xl font-black leading-tight">Social, commerce, movement, and trusted services designed to work together.</h3>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-200">KunThai is an original super-app experience focused on useful local services, clear controls, and dependable account identity.</p>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {services.map(([title, description, Icon]) => (
            <article key={title} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-50 text-sky-700"><Icon className="text-2xl" /></span>
              <h4 className="mt-3 text-lg font-black text-slate-950">{title}</h4>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-[22px] bg-sky-50 p-5"><HiOutlineHeart className="text-2xl text-sky-700" /><h4 className="mt-3 font-black text-sky-950">People first</h4><p className="mt-1 text-sm font-semibold leading-6 text-sky-800">Controls should be understandable and useful on mobile.</p></article>
          <article className="rounded-[22px] bg-slate-100 p-5"><HiOutlineScale className="text-2xl text-slate-700" /><h4 className="mt-3 font-black text-slate-950">Clear responsibility</h4><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Services work better when records, rules, and expectations are visible.</p></article>
          <article className="rounded-[22px] bg-emerald-50 p-5"><HiOutlineSparkles className="text-2xl text-emerald-700" /><h4 className="mt-3 font-black text-emerald-950">Steady improvement</h4><p className="mt-1 text-sm font-semibold leading-6 text-emerald-800">KunThai grows in practical stages without hiding first-version limits.</p></article>
        </section>

        <button type="button" onClick={onOpenTerms} className="w-full rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm">
          <p className="text-base font-black text-slate-950">Policy Center and open source information</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Review service policies, community expectations, and software license notices.</p>
        </button>

        {/* Future backend: provide release version, service availability by country, company details, and official contact channels. */}
      </div>
    </div>
  );
}
