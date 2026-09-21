import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { t as i18nText } from "../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";

export default function RentalActions({ title, actions }) {
  useUiLocale();
  const [open, setOpen] = useState(false);
  return <div className={`pointer-events-auto absolute right-3 top-3 ${open ? "z-20" : "z-10"}`} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" aria-label={i18nText("ui.literals.k85a9ad950324", { value0: title })} aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-full bg-slate-950/90 p-2 text-white shadow-lg"><MoreHorizontal size={22} /></button>
    {open && <><button type="button" aria-label={i18nText("ui.literals.kf677eef374b5")} className="fixed inset-0 cursor-default" onClick={() => setOpen(false)} /><div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">{actions.map(([label, action]) => <button key={label} type="button" onClick={() => { setOpen(false); action(); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100 focus:bg-slate-100">{translateUi(label)}</button>)}</div></>}
  </div>;
}
