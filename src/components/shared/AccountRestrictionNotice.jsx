import { ArrowRight, Clock3, LogOut, ShieldOff } from "lucide-react";

export default function AccountRestrictionNotice({ control, availablePage, onOpenAvailablePage, onSignOut }) {
  const banned = control.status === "banned";
  const suspended = control.status === "suspended";
  const title = banned ? "Account access ended" : suspended ? "Account temporarily suspended" : "This sector is restricted";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-5">
      <section className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-lg bg-red-50 text-red-700"><ShieldOff size={24} /></span>
        <h1 className="mt-5 text-2xl font-black text-zinc-950">{title}</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-zinc-600">{control.reason || "KunThai placed an administrative restriction on this account."}</p>
        {control.expires_at ? <p className="mt-4 flex items-center gap-2 text-sm font-bold text-zinc-700"><Clock3 size={17} className="text-zinc-400" /> Review date: {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(control.expires_at))}</p> : null}
        <div className="mt-7 grid gap-2 sm:grid-cols-2">
          {availablePage ? <button type="button" onClick={onOpenAvailablePage} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800">Open {availablePage === "marketplace" ? "UrMall" : availablePage} <ArrowRight size={17} /></button> : null}
          <button type="button" onClick={onSignOut} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-700 hover:bg-zinc-50"><LogOut size={17} /> Sign out</button>
        </div>
        <p className="mt-6 text-xs font-semibold leading-5 text-zinc-500">Contact KunThai Support to request a review or appeal this decision.</p>
      </section>
    </main>
  );
}

