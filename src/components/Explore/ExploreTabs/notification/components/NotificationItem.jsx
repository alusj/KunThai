// src/explore/notifications/components/NotificationItem.jsx
import NotificationAvatar from "./NotificationAvatar";
import NotificationAction from "./NotificationAction";

/*
  NotificationItem.jsx
  --------------------
  Single notification row
*/

export default function NotificationItem({ item }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        padding: "12px",
        borderRadius: "10px",
        marginBottom: "10px",
        background: item.read ? "#fff" : "#f1f6ff",
        cursor: "pointer",
      }}
    >
      <NotificationAvatar type={item.type} />

      <div style={{ flex: 1 }}>
        <p style={{ margin: 0 }}>
          <strong>{item.user}</strong> {getMessage(item.type)}
        </p>
        <small style={{ color: "#777" }}>{item.time}</small>
      </div>

      <NotificationAction type={item.type} />
    </div>
  );
}

function getMessage(type) {
  switch (type) {
    case "follow":
      return "started following you";
    case "like":
      return "liked your post";
    case "system":
      return "posted an update";
    default:
      return "";
  }
}
