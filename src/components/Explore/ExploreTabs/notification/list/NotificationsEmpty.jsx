// src/explore/notifications/list/NotificationsEmpty.jsx

/*
  NotificationsEmpty.jsx
  ----------------------
  Shown when user has no notifications
*/

export default function NotificationsEmpty() {
  return (
    <div style={{ padding: "40px", textAlign: "center", color: "#777" }}>
      <p>No notifications yet</p>
      <small>You’ll see likes, follows, and updates here.</small>
    </div>
  );
}
