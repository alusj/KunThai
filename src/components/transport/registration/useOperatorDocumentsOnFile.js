import { useEffect, useState } from "react";

import { NO_DOCUMENTS_ON_FILE } from "../../services/operatorDocumentsOnFile";
import { getOperatorDocumentsOnFile } from "../../services/transportOperatorAccountService";

// The documents KunThai already holds for the signed-in operator, so a
// registration or edit screen shows them as received instead of asking again.
export default function useOperatorDocumentsOnFile() {
  const [onFile, setOnFile] = useState(NO_DOCUMENTS_ON_FILE);
  useEffect(() => {
    let alive = true;
    getOperatorDocumentsOnFile().then((result) => {
      if (alive) setOnFile(result);
    });
    return () => {
      alive = false;
    };
  }, []);
  return onFile;
}
