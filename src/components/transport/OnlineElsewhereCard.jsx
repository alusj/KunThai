import { FiBriefcase, FiTruck } from "react-icons/fi";
import { forwardRef, useImperativeHandle, useState } from "react";

import { useI18n, t } from "../../i18n";
import CenteredModal from "../shared/CenteredModal";

// Going online on one dashboard while online on another: only one is online
// at a time, so this asks first. It owns its open state (opened through the
// ref) so showing or closing it never re-renders the whole dashboard, and it
// opens from what the dashboard already knows, with no network wait.
//   open({ mode: "solo" | "company", companyName, hereMode: "solo" | "company" })
const OnlineElsewhereCard = forwardRef(function OnlineElsewhereCard({ onConfirm }, ref) {
  useI18n();
  const [prompt, setPrompt] = useState(null);
  useImperativeHandle(ref, () => ({ open: setPrompt }), []);

  const company = prompt?.companyName || t("operatorWorkMode.yourCompany");
  const otherIsSolo = prompt?.mode === "solo";
  const hereIsSolo = prompt?.hereMode === "solo";
  const title = otherIsSolo ? t("operatorDashboards.soloOnlineTitle") : t("operatorWorkMode.companyOnlineTitle", { company });
  const body = otherIsSolo
    ? t("operatorDashboards.soloOnlineBody")
    : hereIsSolo
      ? t("operatorWorkMode.companyOnlineBody", { company })
      : t("operatorDashboards.companyOnlineBody", { company });
  const confirmLabel = hereIsSolo ? t("operatorWorkMode.goOnlineSolo") : t("operatorDashboards.goOnlineHere");
  const stayLabel = otherIsSolo ? t("operatorDashboards.stayOnlineSolo") : t("operatorWorkMode.stayWithCompany", { company });

  return (
    <CenteredModal open={Boolean(prompt)} onClose={() => setPrompt(null)} maxWidth="max-w-sm" labelledBy="company-online-title" quick>
      <div data-direction="company-online-prompt">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          {otherIsSolo ? <FiTruck size={22} /> : <FiBriefcase size={22} />}
        </span>
        <h2 id="company-online-title" className="mt-4 text-lg font-black text-slate-950">{title}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={() => {
              setPrompt(null);
              onConfirm?.();
            }}
            className="kt-touchable h-12 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={() => setPrompt(null)}
            className="kt-touchable h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
          >
            {stayLabel}
          </button>
        </div>
      </div>
    </CenteredModal>
  );
});

export default OnlineElsewhereCard;
