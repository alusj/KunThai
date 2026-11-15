import { useEffect, useState } from "react";

import { NO_DOCUMENTS_ON_FILE } from "../../services/operatorDocumentsOnFile";
import { getOperatorDocumentsOnFile } from "../../services/transportOperatorAccountService";

// The last answer, so a screen opened again shows it at once instead of
// flashing "documents missing" while it asks again.
let lastOnFile = null;

// The documents KunThai already holds for the signed-in operator, so a
// registration or edit screen shows them as received instead of asking again,
// and the dashboard knows when every document is in. A new `refreshKey` (the
// account's last save) asks again.
export default function useOperatorDocumentsOnFile(refreshKey = "") {
  const [onFile, setOnFile] = useState(() => lastOnFile || NO_DOCUMENTS_ON_FILE);
  const [loaded, setLoaded] = useState(() => Boolean(lastOnFile));
  useEffect(() => {
    let alive = true;
    getOperatorDocumentsOnFile().then((result) => {
      if (!alive) return;
      lastOnFile = result;
      setOnFile(result);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return loaded ? onFile : { ...onFile, loading: true };
}
