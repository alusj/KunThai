// src/explore/notifications/Notifications.jsx
import { useEffect, useState } from "react";
import NotificationsList from "./list/NotificationsList";
import NotificationsEmpty from "./list/NotificationsEmpty";
import NotificationsSkeleton from "./skeletons/NotificationsSkeleton";

/*
  Notifications.jsx
  ------------------
  Main notification screen
  - Handles loading
  - Handles empty state
  - Handles list rendering
*/

export default function Notifications() {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Simulate API fetch
    setTimeout(() => {
      setNotifications([
        {
          id: 1,
          type: "follow",
          user: "John Doe",
          time: "2 mins ago",
          read: false,
        },
        {
          id: 2,
          type: "like",
          user: "Mary Johnson",
          time: "1 hour ago",
          read: true,
        },
        {
          id: 3,
          type: "system",
          user: "UrSalone Team",
          time: "Yesterday",
          read: false,
        },
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) return <NotificationsSkeleton />;

  if (!notifications.length) return <NotificationsEmpty />;

  return <NotificationsList data={notifications} />;
}
