// src/explore/notifications/skeletons/NotificationsSkeleton.jsx

/*
  NotificationsSkeleton.jsx
  -------------------------
  Loading state
*/

export default function NotificationsSkeleton() {
  return (
    <div style={{ padding: "12px" }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: "60px",
            background: "#e5e7eb",
            borderRadius: "10px",
            marginBottom: "10px",
          }}
        />
      ))}
    </div>
  );
}
