// src/explore/notifications/components/NotificationAction.jsx

/*
  NotificationAction.jsx
  ----------------------
  Optional action buttons per notification
*/

export default function NotificationAction({ type }) {
  if (type === "follow") {
    return (
      <button style={btnStyle}>
        Follow back
      </button>
    );
  }

  return null;
}

const btnStyle = {
  border: "none",
  padding: "6px 12px",
  borderRadius: "20px",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
};
