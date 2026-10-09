import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineBellAlert,
  HiOutlineCamera,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineMapPin,
  HiOutlineMicrophone,
  HiOutlineShieldCheck,
  HiOutlineUserGroup,
} from "react-icons/hi2";

import SocialScreenHeader from "../shared/SocialScreenHeader";
import { isNativePlatform } from "../../../../Backend/services/nativeOAuthService";
import { readPermissionStatus, requestPermission } from "../../../../Backend/services/permissionStatusService";
import { t as i18nText, uiText } from "../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../i18n/index.js";

// Copy: `title`/`summary`/`detail` are English source run through uiText();
// `*Key` fields are exploreSettingsFix translation keys.
const permissions = [
  {
    id: "camera",
    title: "Camera and photos",
    icon: HiOutlineCamera,
    summary: "Used only when you choose to capture or attach media.",
    detail: "KunThai does not switch on your camera in the background. Your browser or device controls final access.",
  },
  {
    id: "microphone",
    title: "Microphone",
    icon: HiOutlineMicrophone,
    summary: "Used for voice notes or media you deliberately record.",
    detail: "Recording starts only from a visible recording action. You can deny access through your device settings.",
  },
  {
    id: "location",
    title: "Location",
    icon: HiOutlineMapPin,
    summaryKey: "exploreSettingsFix.permLocationSummary",
    detailKey: "exploreSettingsFix.permLocationDetail",
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: HiOutlineBellAlert,
    summaryKey: "exploreSettingsFix.permNotificationsSummary",
    detail: "Notification categories are managed in Settings. Browser or operating-system permission remains under your control.",
  },
  {
    id: "contacts",
    title: "Contacts",
    icon: HiOutlineUserGroup,
    static: true,
    summaryKey: "exploreSettingsFix.permContactsSummary",
    detailKey: "exploreSettingsFix.permContactsDetail",
  },
];

const STATUS_KEYS = {
  granted: "exploreSettingsFix.permGranted",
  denied: "exploreSettingsFix.permDenied",
  prompt: "exploreSettingsFix.permPrompt",
  unknown: "exploreSettingsFix.permUnknown",
  unsupported: "exploreSettingsFix.permUnsupported",
  native: "exploreSettingsFix.notAvailableYet",
  picker: "exploreSettingsFix.permPicker",
};

const STATUS_TONE = {
  granted: "bg-emerald-50 text-emerald-700",
  denied: "bg-rose-50 text-rose-700",
};

export default function PermissionsScreen({ hideHeader = false, onOpenPrivacy }) {
  useUiLocale();
  const native = isNativePlatform();
  const [expandedId, setExpandedId] = useState("");
  const [statuses, setStatuses] = useState({});
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      permissions.filter((item) => !item.static).map(async (item) => [item.id, await readPermissionStatus(item.id, { native })]),
    );
    setStatuses(Object.fromEntries(entries));
  }, [native]);

  useEffect(() => {
    refresh();
    // Coming back from the device's Settings app changes the answers.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  async function ask(id) {
    if (busyId) return;
    setBusyId(id);
    try {
      const next = await requestPermission(id, { native });
      setStatuses((current) => ({ ...current, [id]: next }));
    } finally {
      setBusyId("");
    }
  }

  function statusFor(permission) {
    if (permission.static) return "picker";
    if (permission.id === "notifications" && native) return "native";
    return statuses[permission.id] || "unknown";
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title={i18nText("ui.literals.kd06d55570938")} subtitle={i18nText("ui.literals.k572df0b39dde")} /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineShieldCheck className="text-3xl" /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{i18nText("ui.literals.k37f3358a4d73")}</p>
              <h3 className="mt-1 text-2xl font-black text-slate-950">{i18nText("ui.literals.kabb378810799")}</h3>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{i18nText("ui.literals.k86e0f21654a4")}</p>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-500">
                {native ? i18nText("exploreSettingsFix.permOpenSettingsApp") : i18nText("exploreSettingsFix.permOpenSettingsWeb")}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {permissions.map((permission) => {
            const Icon = permission.icon;
            const expanded = expandedId === permission.id;
            const status = statusFor(permission);
            const canAsk = ["prompt", "unknown"].includes(status);
            return (
              <article key={permission.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><Icon className="text-xl" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-base font-black text-slate-950">{uiText(permission.title)}</h4>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${STATUS_TONE[status] || "bg-slate-100 text-slate-600"}`}>{i18nText(STATUS_KEYS[status])}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                      {permission.summaryKey ? i18nText(permission.summaryKey) : uiText(permission.summary)}
                    </p>
                  </div>
                </div>
                {status === "denied" ? (
                  <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold leading-5 text-rose-800">
                    {native ? i18nText("exploreSettingsFix.permDeniedHintApp") : i18nText("exploreSettingsFix.permDeniedHintWeb")}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {canAsk ? (
                    <button type="button" onClick={() => ask(permission.id)} disabled={Boolean(busyId)} className="rounded-2xl bg-sky-700 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
                      {busyId === permission.id ? i18nText("exploreSettingsFix.checking") : i18nText("exploreSettingsFix.permAllow")}
                    </button>
                  ) : null}
                  {status === "denied" ? (
                    <button type="button" onClick={refresh} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
                      {i18nText("exploreSettingsFix.permRecheck")}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setExpandedId(expanded ? "" : permission.id)} className="inline-flex items-center gap-1 text-sm font-black text-sky-700">
                    {expanded ? i18nText("ui.literals.k4c852b26d1b7") : i18nText("ui.literals.kc3fffbba8c1b")}
                    {expanded ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                  </button>
                </div>
                {expanded ? (
                  <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">
                    {permission.detailKey ? i18nText(permission.detailKey) : uiText(permission.detail)}
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>

        <button type="button" onClick={onOpenPrivacy} className="w-full rounded-[24px] border border-sky-100 bg-sky-50 p-5 text-left">
          <p className="text-base font-black text-sky-950">{i18nText("ui.literals.k1e4f0bb54872")}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-sky-800">{i18nText("ui.literals.ke4d67b85d470")}</p>
        </button>
      </div>
    </div>
  );
}
