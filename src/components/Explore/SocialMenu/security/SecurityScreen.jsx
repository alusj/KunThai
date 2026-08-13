import { useEffect, useState } from "react";
import {
  HiOutlineBellAlert,
  HiOutlineDevicePhoneMobile,
  HiOutlineExclamationTriangle,
  HiOutlineFingerPrint,
  HiOutlineKey,
  HiOutlineLockClosed,
  HiOutlineShieldCheck,
} from "react-icons/hi2";

import {
  disableBiometricUnlock,
  enableBiometricUnlock,
  getBiometricAvailability,
  readBiometricPreference,
  verifyBiometricUnlock,
} from "../../../../Backend/services/biometricService";
import { showToast } from "../../../../Backend/services/toastService";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import { t as i18nText, uiText } from "../../../../i18n/index";

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

export default function SecurityScreen({ currentProfile, hideHeader = false, onOpenHelp, onSwitchAccount }) {
  const currentUserId = currentProfile?.userId || "";
  const [biometricAvailability, setBiometricAvailability] = useState({ available: false, checking: true, reason: "" });
  const [biometricPreference, setBiometricPreference] = useState(() => readBiometricPreference(currentUserId));
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setBiometricPreference(readBiometricPreference(currentUserId));
    getBiometricAvailability().then((result) => {
      if (active) setBiometricAvailability({ ...result, checking: false });
    });
    return () => {
      active = false;
    };
  }, [currentUserId]);

  function runAction(action) {
    if (action === "help") onOpenHelp?.();
    if (action === "switch") onSwitchAccount?.();
  }

  async function enableBiometrics() {
    if (biometricBusy) return;
    setBiometricBusy(true);
    try {
      const next = await enableBiometricUnlock({
        displayName: currentProfile?.displayName || currentProfile?.name || "KunThai user",
        userId: currentUserId,
      });
      setBiometricPreference(next);
      showToast(i18nText("ui.literals.k8812a7a93a8a"), "success");
    } catch (error) {
      showToast(error.message || i18nText("ui.literals.ke58e7c9e74e0"), "danger");
    } finally {
      setBiometricBusy(false);
    }
  }

  function disableBiometrics() {
    setBiometricPreference(disableBiometricUnlock(currentUserId));
    showToast(i18nText("ui.literals.k89e7589c9e0b"), "info");
  }

  async function testBiometrics() {
    if (biometricBusy) return;
    setBiometricBusy(true);
    try {
      const next = await verifyBiometricUnlock(currentUserId);
      setBiometricPreference(next);
      showToast(i18nText("ui.literals.kd3b572e43456"), "success");
    } catch (error) {
      showToast(error.message || i18nText("ui.literals.k2ccdd51c06a7"), "danger");
    } finally {
      setBiometricBusy(false);
    }
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title={i18nText("ui.literals.kf25ce1b8a399")} subtitle={i18nText("ui.literals.kc7d688be197f")} /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-sm lg:p-6">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-700 text-white">
            <HiOutlineShieldCheck className="text-3xl" />
          </span>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-sky-700">{i18nText("ui.literals.k26fd45b16ad4")}</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">{i18nText("ui.literals.keebf29260b31")}</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
            {i18nText("ui.literals.kd1f038c3f110")}
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
                    <h4 className="text-base font-black text-slate-950">{uiText(item.title)}</h4>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{uiText(item.description)}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{uiText(item.status)}</span>
                  {item.action ? (
                    <button type="button" onClick={() => runAction(item.action)} className="text-sm font-black text-sky-700">
                      {uiText(item.actionLabel)}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-[24px] border border-sky-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700">
              <HiOutlineFingerPrint className="text-2xl" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-950">{i18nText("ui.literals.k1197e4d65347")}</h3>
                  <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                    {i18nText("ui.literals.kfb7f4c6126ca")}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-black ${
                  biometricPreference.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}>
                  {biometricPreference.enabled ? i18nText("ui.literals.kdf174a3f2faa") : biometricAvailability.checking ? i18nText("ui.literals.kb97354edfd00") : i18nText("ui.literals.k0c6c4102d4df")}
                </span>
              </div>

              {!biometricAvailability.checking && !biometricAvailability.available ? (
                <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                  {biometricAvailability.reason}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {biometricPreference.enabled ? (
                  <>
                    <button type="button" onClick={testBiometrics} disabled={biometricBusy} className="rounded-2xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
                      {biometricBusy ? i18nText("ui.literals.ka4f306ad0906") : i18nText("ui.literals.k302c330ec0e3")}
                    </button>
                    <button type="button" onClick={disableBiometrics} disabled={biometricBusy} className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-60">
                      {i18nText("ui.literals.k8807c2b3fd0f")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={enableBiometrics}
                    disabled={biometricBusy || biometricAvailability.checking || !biometricAvailability.available || !currentUserId}
                    className="rounded-2xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {biometricBusy ? i18nText("ui.literals.kf440b52bcf7a") : i18nText("ui.literals.k910832ea40a1")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-amber-100 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <HiOutlineExclamationTriangle className="mt-0.5 flex-none text-2xl text-amber-700" />
            <div>
              <h3 className="text-base font-black text-amber-950">{i18nText("ui.literals.k0d19f84e1496")}</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">{i18nText("ui.literals.kfd1d805a2645")}</p>
              <button type="button" onClick={onOpenHelp} className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-black text-amber-800 shadow-sm">
                {i18nText("ui.literals.k2d1b393e14f0")}
              </button>
            </div>
          </div>
        </section>

        {/* Future backend: register biometric public keys server-side before using them as a sign-in factor or payment authorization. */}
        {/* Future backend: list authenticated sessions, trusted devices, login alerts, and session revocation controls here. */}
      </div>
    </div>
  );
}
