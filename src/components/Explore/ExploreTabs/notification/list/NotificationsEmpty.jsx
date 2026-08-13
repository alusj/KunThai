
import { t as i18nText } from "../../../../../i18n/index";// src/explore/notifications/list/NotificationsEmpty.jsx

/*
  NotificationsEmpty.jsx
  ----------------------
  Shown when user has no notifications
*/

export default function NotificationsEmpty() {
  return (
    <div style={{ padding: "40px", textAlign: "center", color: "#777" }}>
      <p>{i18nText("ui.literals.kd2609b6af124")}</p>
      <small>{i18nText("ui.literals.k78f4848ecac6")}</small>
    </div>
  );
}
