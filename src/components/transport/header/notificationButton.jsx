// NotificationButton.jsx
// Displays operator or passenger notifications

import { FiBell } from "react-icons/fi";

export default function NotificationButton() {
  const handleClick = () => {
    console.log("Open Notifications");
  };

  return (
    <button
      onClick={handleClick}
      className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
    >
      <FiBell size={20} />

      {/* Notification Indicator */}
      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
    </button>
  );
}