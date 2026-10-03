import { createContext, useContext } from "react";

// Lets any admin screen (e.g. the header's "Lock now" button) lock the console.
export const ConsoleLockContext = createContext({ lockNow: () => {}, enabled: false });

export function useConsoleLock() {
  return useContext(ConsoleLockContext);
}
