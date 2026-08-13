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
import { t as i18nText } from "../../../../i18n/index";

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
      {!hideHeader ? <SocialScreenHeader title={i18nText("ui.literals.kb6247600888a")} subtitle={i18nText("ui.literals.k75f210c87343")} /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-sky-100 bg-gradient-to-br from-sky-700 to-sky-800 p-5 text-white shadow-sm lg:p-6">
          <HiOutlineShieldCheck className="text-4xl" />
          <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-sky-100">{i18nText("ui.literals.k68be8f112993")}</p>
          <h3 className="mt-2 text-2xl font-black">{i18nText("ui.literals.k5572af8aa12f")}</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-sky-100">{i18nText("ui.literals.k3e2f3685b106")}</p>
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
          <button type="button" onClick={onOpenReport} className="rounded-[22px] bg-sky-700 p-5 text-left text-white"><HiOutlineFlag className="text-2xl" /><p className="mt-3 font-black">{i18nText("ui.literals.k24f3f52de52e")}</p><p className="mt-1 text-sm font-semibold text-sky-100">{i18nText("ui.literals.k7ba72ddc81ea")}</p></button>
          <button type="button" onClick={onOpenPrivacy} className="rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-sm"><HiOutlineShieldCheck className="text-2xl text-sky-700" /><p className="mt-3 font-black text-slate-950">{i18nText("ui.literals.k8a88f051eace")}</p><p className="mt-1 text-sm font-semibold text-slate-500">{i18nText("ui.literals.k3a753e98f83c")}</p></button>
          <button type="button" onClick={onOpenTerms} className="rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-sm"><HiOutlineExclamationTriangle className="text-2xl text-sky-700" /><p className="mt-3 font-black text-slate-950">{i18nText("ui.literals.kf2a82997453c")}</p><p className="mt-1 text-sm font-semibold text-slate-500">{i18nText("ui.literals.k670f037507cd")}</p></button>
        </section>

        <section className="rounded-[24px] border border-rose-100 bg-rose-50 p-5">
          <h3 className="text-base font-black text-rose-950">{i18nText("ui.literals.k4393aa0f57c0")}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-rose-800">{i18nText("ui.literals.k07c71eae506e")}</p>
        </section>

        {/* Future backend: add report status, appeal entry points, trusted transaction education, and region-aware emergency guidance. */}
      </div>
    </div>
  );
}
