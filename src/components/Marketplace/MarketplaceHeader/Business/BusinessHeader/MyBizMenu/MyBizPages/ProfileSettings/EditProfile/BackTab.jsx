import AppBackButton from "../../../../../../../../shared/AppBackButton.jsx";

export default function BackTab({ onBack }) {
  return (
    <AppBackButton
      onBack={onBack}
      label="Back"
      historyKey="marketplace-menu-back"
      className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
    />
  );
}
