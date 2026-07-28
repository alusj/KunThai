import { useI18n, t } from "../../../../../i18n";
import SupportThreadItem from "./SupportThreadItem";

export default function SupportThreads({ threads }) {
  useI18n();
  if (threads.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h3 className="text-base font-black text-gray-950">{t("urmall.biz.care.supportDisputes")}</h3>
      <div className="space-y-3">
        {threads.map((thread) => (
          <SupportThreadItem key={thread.id} thread={thread} />
        ))}
      </div>
    </section>
  );
}
