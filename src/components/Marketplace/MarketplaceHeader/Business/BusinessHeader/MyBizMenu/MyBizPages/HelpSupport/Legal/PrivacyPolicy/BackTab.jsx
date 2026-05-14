import AppBackTab from "../../../../../../../../../shared/AppBackTab.jsx";

export default function BackTab({ onBack }) {
  return (
    <AppBackTab
      onBack={onBack}
      label="Back"
      historyKey="marketplace-menu-back"
      className="mt-0.5 flex-none"
      useHistoryLayer={false}
    />
  );
}
