import { FiBatteryCharging, FiPower, FiRadio, FiWifi } from "react-icons/fi";
import { forwardRef, useImperativeHandle, useState } from "react";

import { useI18n, t } from "../../i18n";
import CenteredModal from "../shared/CenteredModal";

// Shown once going online has saved: what being online means for the
// operator. "Don't show this again" is remembered on this device only.
// Like OnlineElsewhereCard it owns its open state (opened through the ref)
// so showing or closing it never re-renders the whole dashboard.
const HIDE_KEY = "kt.operator.goingOnlineNotice.hidden";

function noticeHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

const GoingOnlineNoticeCard = forwardRef(function GoingOnlineNoticeCard(_props, ref) {
  useI18n();
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  useImperativeHandle(ref, () => ({
    open: () => {
      if (noticeHidden()) return;
      setDontShow(false);
      setOpen(true);
    },
  }), []);

  function close() {
    if (dontShow) {
      try {
        localStorage.setItem(HIDE_KEY, "1");
      } catch {
        // Private mode or blocked storage: it simply shows again next time.
      }
    }
    setOpen(false);
  }

  const points = [
    { icon: FiWifi, text: t("urrideLiveDiscovery.onlineNoticeInternet") },
    { icon: FiPower, text: t("urrideLiveDiscovery.onlineNoticeOffline") },
    { icon: FiBatteryCharging, text: t("urrideLiveDiscovery.onlineNoticeBattery") },
  ];

  return (
    <CenteredModal open={open} onClose={close} maxWidth="max-w-sm" labelledBy="going-online-notice-title" dismissOnBackdrop={false} quick>
      <div data-direction="going-online-notice">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <FiRadio size={22} />
        </span>
        <h2 id="going-online-notice-title" className="mt-4 text-lg font-black text-slate-950">
          {t("urrideLiveDiscovery.onlineNoticeTitle")}
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t("urrideLiveDiscovery.onlineNoticeBody")}</p>
        <ul className="mt-4 grid gap-2">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
              <Icon size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span className="text-[13px] font-semibold leading-5 text-slate-700">{text}</span>
            </li>
          ))}
        </ul>
        <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-700">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(event) => setDontShow(event.target.checked)}
            className="h-5 w-5 rounded border-slate-300 accent-slate-950"
          />
          {t("urrideLiveDiscovery.onlineNoticeDontShow")}
        </label>
        <button
          type="button"
          onClick={close}
          className="kt-touchable mt-5 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
        >
          {t("urrideLiveDiscovery.onlineNoticeAcknowledge")}
        </button>
      </div>
    </CenteredModal>
  );
});

export default GoingOnlineNoticeCard;
