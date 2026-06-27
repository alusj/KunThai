import {
  HiOutlineBanknotes,
  HiOutlineChatBubbleLeftRight,
  HiOutlineExclamationTriangle,
  HiOutlineFlag,
  HiOutlineShieldCheck,
  HiOutlineShoppingBag,
  HiOutlineTruck,
  HiOutlineUserMinus,
} from "react-icons/hi2";

import SocialScreenHeader from "../shared/SocialScreenHeader";

const safetyGuides = [
  ["Content and conversations", "Use post, profile, comment, and message tools to report abuse, scams, threats, or impersonation.", HiOutlineChatBubbleLeftRight],
  ["Blocks and boundaries", "Blocking removes an account from your social surfaces. Privacy Center lets you review blocked accounts.", HiOutlineUserMinus],
  ["Marketplace care", "Check listing details, keep order records, and use supported payment and dispute paths.", HiOutlineShoppingBag],
  ["Transport awareness", "Confirm fleet details and booking information, then report unsafe conduct or false operator details.", HiOutlineTruck],
  ["Money protection", "Never share passwords or verification codes. Review payment details before confirming a transaction.", HiOutlineBanknotes],
];

export default function SafetyCenterScreen({ hideHeader = false, onOpenPrivacy, onOpenReport, onOpenTerms }) {
  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Safety Center" subtitle="Practical guidance for safer social, marketplace, transport, and money use." /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-sky-100 bg-gradient-to-br from-sky-700 to-sky-800 p-5 text-white shadow-sm lg:p-6">
          <HiOutlineShieldCheck className="text-4xl" />
          <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-sky-100">Safer choices across KunThai</p>
          <h3 className="mt-2 text-2xl font-black">Notice, pause, verify, report</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-sky-100">Use visible account details, official service records, and KunThai reporting tools when something does not feel right.</p>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {safetyGuides.map(([title, description, Icon]) => (
            <article key={title} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-50 text-sky-700"><Icon className="text-2xl" /></span>
              <h4 className="mt-3 text-base font-black text-slate-950">{title}</h4>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <button type="button" onClick={onOpenReport} className="rounded-[22px] bg-sky-700 p-5 text-left text-white"><HiOutlineFlag className="text-2xl" /><p className="mt-3 font-black">Report a problem</p><p className="mt-1 text-sm font-semibold text-sky-100">Send details to support.</p></button>
          <button type="button" onClick={onOpenPrivacy} className="rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-sm"><HiOutlineShieldCheck className="text-2xl text-sky-700" /><p className="mt-3 font-black text-slate-950">Privacy Center</p><p className="mt-1 text-sm font-semibold text-slate-500">Review controls and blocks.</p></button>
          <button type="button" onClick={onOpenTerms} className="rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-sm"><HiOutlineExclamationTriangle className="text-2xl text-sky-700" /><p className="mt-3 font-black text-slate-950">Safety policies</p><p className="mt-1 text-sm font-semibold text-slate-500">Read the rules for services.</p></button>
        </section>

        <section className="rounded-[24px] border border-rose-100 bg-rose-50 p-5">
          <h3 className="text-base font-black text-rose-950">Immediate danger</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-rose-800">KunThai support is not an emergency service. Contact the appropriate local emergency service when someone faces immediate harm.</p>
        </section>

        {/* Future backend: add report status, appeal entry points, trusted transaction education, and region-aware emergency guidance. */}
      </div>
    </div>
  );
}
