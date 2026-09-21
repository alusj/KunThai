// src/explore/urfeed/connections/Connections.jsx

/*
  Connections.jsx
  ----------------
  Shows friends inside UrFeed
*/

import { t } from "../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../i18n/index.js";

export default function Connections() {
  useUiLocale();
  return <div>{t("explore.yourConnectionsHere")}</div>;
}
