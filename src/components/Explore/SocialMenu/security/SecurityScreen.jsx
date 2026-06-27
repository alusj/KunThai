import {
  HiOutlineBellAlert,
  HiOutlineDevicePhoneMobile,
  HiOutlineExclamationTriangle,
  HiOutlineKey,
  HiOutlineLockClosed,
  HiOutlineShieldCheck,
} from "react-icons/hi2";

import SocialScreenHeader from "../shared/SocialScreenHeader";

const securityItems = [
  {
    title: "Password and recovery",
    description: "Keep your sign-in details current and use the account recovery flow if access is lost.",
    status: "Available at sign-in",
    icon: HiOutlineKey,
    action: "help",
    actionLabel: "Get account help",
  },
  {
    title: "Accounts on this device",
    description: "Review or change the KunThai account currently active on this device.",
    status: "Current session",
    icon: HiOutlineDevicePhoneMobile,
    action: "switch",
    actionLabel: "Switch account",
  },
  {
    title: "Login alerts",
    description: "KunThai will surface important sign-in and account-change notices through trusted alert channels.",
    status: "Being prepared",
    icon: HiOutlineBellAlert,
  },
  {
    title: "Device protection",
    description: "A screen lock, updated browser, and private device access help protect your KunThai session.",
    status: "Managed by device",
    icon: HiOutlineLockClosed,
  },
];

export default function SecurityScreen({ hideHeader = false, onOpenHelp, onSwitchAccount }) {
  function runAction(action) {
    if (action === "help") onOpenHelp?.();
    if (action === "switch") onSwitchAccount?.();
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Security" subtitle="Review account protection, sessions, and sign-in readiness." /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-sm lg:p-6">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-700 text-white">
            <HiOutlineShieldCheck className="text-3xl" />
          </span>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-sky-700">Account protection</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">A simple security overview</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
            Security starts with protected sign-in details, a trusted device, and quick action when something looks unfamiliar.
          </p>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {securityItems.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700">
                    <Icon className="text-2xl" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-base font-black text-slate-950">{item.title}</h4>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{item.description}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{item.status}</span>
                  {item.action ? (
                    <button type="button" onClick={() => runAction(item.action)} className="text-sm font-black text-sky-700">
                      {item.actionLabel}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-[24px] border border-amber-100 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <HiOutlineExclamationTriangle className="mt-0.5 flex-none text-2xl text-amber-700" />
            <div>
              <h3 className="text-base font-black text-amber-950">Something looks unfamiliar?</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">Change your sign-in details through account recovery and send the details to Help Center.</p>
              <button type="button" onClick={onOpenHelp} className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-black text-amber-800 shadow-sm">
                Open Help Center
              </button>
            </div>
          </div>
        </section>

        {/* Future backend: list authenticated sessions, trusted devices, login alerts, and session revocation controls here. */}
      </div>
    </div>
  );
}
