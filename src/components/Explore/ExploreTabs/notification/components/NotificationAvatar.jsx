// src/explore/notifications/components/NotificationAvatar.jsx

/*
  NotificationAvatar.jsx
  ----------------------
  Handles avatar icon based on notification type
*/

export default function NotificationAvatar({ type }) {
  const icon =
    type === "system" ? "🚀" : "👤";

  return (
    <div
      style={{
        width: "42px",
        height: "42px",
        borderRadius: "50%",
        background: "#e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "20px",
      }}
    >
      {icon}
    </div>
  );
}
