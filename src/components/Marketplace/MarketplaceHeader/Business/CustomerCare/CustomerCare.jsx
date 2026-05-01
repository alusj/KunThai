import { useSellerCustomerCare } from "../../../../../Backend/hooks/useSellerCustomerCare";
import CareMetricsGrid from "./CareMetricsGrid";
import RecentConversations from "./RecentConversations";
import SupportThreads from "./SupportThreads";

export default function CustomerCare() {
  const { metrics, conversations, supportThreads, loading } = useSellerCustomerCare();

  if (loading || !metrics) {
    return <div className="h-80 rounded-xl bg-white shadow-sm" />;
  }

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-black uppercase text-blue-700">Customer Care</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">
          Messages & buyer support
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          Keep replies fast, negotiations clear, and disputes under control.
        </p>
      </div>

      <CareMetricsGrid metrics={metrics} />
      <RecentConversations conversations={conversations} />
      <SupportThreads threads={supportThreads} />
    </section>
  );
}
