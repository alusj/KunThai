// src/explore/notifications/list/NotificationsList.jsx
import NotificationItem from "../components/NotificationItem";

/*
  NotificationsList.jsx
  ---------------------
  Renders list of notifications
*/

export default function NotificationsList({ data }) {
  return (
    <div style={{ padding: "12px" }}>
      {data.map((item) => (
        <NotificationItem key={item.id} item={item} />
      ))}
    </div>
  );
}
