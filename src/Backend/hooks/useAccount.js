// backend/hooks/useAccount.js
// Fetches main + sub accounts

import { useEffect, useState } from "react";
import { getMainAccount, getSubAccounts } from "../services/accountService";
import { useAuth } from "./useAuth";

export const useAccount = () => {
  const { user } = useAuth();
  const [mainAccount, setMainAccount] = useState(null);
  const [subAccounts, setSubAccounts] = useState([]);

  useEffect(() => {
    if (!user) return;

    const fetchAccounts = async () => {
      const main = await getMainAccount(user.id);
      const subs = await getSubAccounts(user.id);

      setMainAccount(main.data);
      setSubAccounts(subs.data || []);
    };

    fetchAccounts();
  }, [user]);

  return { mainAccount, subAccounts };
};