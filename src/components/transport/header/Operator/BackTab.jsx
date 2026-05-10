import AppBackTab from "../../../shared/AppBackTab";

export default function BackTab({ onBack }) {
  return (
    <AppBackTab
      onBack={onBack}
      label="Back"
      historyKey="transport-operator-header"
      className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
    />
  );
}
