import { FiMapPin } from "react-icons/fi";
import { t, useI18n } from "../../i18n/index.js";

// Before accepting a transport company's invitation, the operator is told
// plainly that the company's admins will see where they are while they work
// for it (Transport's invite card and the company access dialog).
export default function InviteLocationNotice({ companyName, className = "mt-3" }) {
  useI18n();
  return (
    <div role="note" className={`${className} flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-left text-amber-950 shadow-sm`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-amber-950" aria-hidden="true">
        <FiMapPin size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-black leading-5">{t("urrideInviteLocation.title")}</p>
        <p className="mt-1 text-sm font-bold leading-6">
          {t("urrideInviteLocation.body", { company: companyName || t("urride.transport.inviteCard.companyFallback") })}
        </p>
      </div>
    </div>
  );
}
