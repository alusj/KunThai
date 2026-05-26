import { MessageCircle, PackageCheck, ShoppingBag, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { useSellerBusinessStatus } from "../../../Backend/hooks/useSellerBusinessStatus";
import { fetchBuyerMessages, fetchBuyerOrders } from "../../../Backend/services/marketplace/buyerMarketplaceService";
import PremiumHeader, { PremiumHeaderButton } from "../../shared/PremiumHeader";
import Cart from "./Cart/Cart";
import Menu from "./Menu/Menu";

export default function MarketplaceHeader({
  onMyBizClick,
  onOrdersClick,
  onMessagesClick,
  activeUtility,
  onActivityChange,
}) {
  const { loading, hasBusiness } = useSellerBusinessStatus();
  const [orderCount, setOrderCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const businessLabel = hasBusiness ? "MyBiz" : "REGISTER";

  useEffect(() => {
    onActivityChange?.(cartOpen || menuOpen);
    return () => onActivityChange?.(false);
  }, [cartOpen, menuOpen, onActivityChange]);

  useEffect(() => {
    let alive = true;

    async function loadOrderCount() {
      try {
        const orders = await fetchBuyerOrders();
        if (alive) setOrderCount(orders.length);
      } catch {
        if (alive) setOrderCount(0);
      }
    }

    loadOrderCount();
    window.addEventListener("marketplace-orders-updated", loadOrderCount);
    return () => {
      alive = false;
      window.removeEventListener("marketplace-orders-updated", loadOrderCount);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadMessageCount() {
      try {
        const messages = await fetchBuyerMessages();
        if (alive) setMessageCount(messages.filter((message) => message.unread).length);
      } catch {
        if (alive) setMessageCount(0);
      }
    }

    loadMessageCount();
    window.addEventListener("marketplace-message-sent", loadMessageCount);
    window.addEventListener("marketplace-seller-messages-updated", loadMessageCount);
    return () => {
      alive = false;
      window.removeEventListener("marketplace-message-sent", loadMessageCount);
      window.removeEventListener("marketplace-seller-messages-updated", loadMessageCount);
    };
  }, []);

  if (loading) {
    return (
      <PremiumHeader
        accent="emerald"
        centerIcon={ShoppingBag}
        title="UrMall"
        className="z-20"
        left={<div className="h-11 w-28 animate-pulse rounded-2xl bg-slate-100" />}
        right={(
          <>
            {[PackageCheck, MessageCircle, ShoppingBag, Store].map((Icon, index) => (
              <span key={index} className="grid h-11 w-11 animate-pulse place-items-center rounded-2xl bg-slate-100 text-slate-300">
                <Icon size={18} />
              </span>
            ))}
          </>
        )}
      />
    );
  }

  return (
    <PremiumHeader
      accent="emerald"
      centerIcon={ShoppingBag}
      title="UrMall"
      className="z-20"
      left={(
        <PremiumHeaderButton
          active={!hasBusiness}
          accent="emerald"
          icon={Store}
          label={businessLabel}
          onClick={onMyBizClick}
          wide
        >
          {businessLabel}
        </PremiumHeaderButton>
      )}
      right={(
        <>
          <PremiumHeaderButton
            active={activeUtility === "orders"}
            accent="emerald"
            badge={orderCount}
            icon={PackageCheck}
            label="Open orders"
            onClick={onOrdersClick}
          />
          <PremiumHeaderButton
            active={activeUtility === "messages"}
            accent="emerald"
            badge={messageCount}
            icon={MessageCircle}
            label="Open messages"
            onClick={onMessagesClick}
          />
          <Cart onOpenChange={setCartOpen} />
          <Menu onOpenChange={setMenuOpen} />
        </>
      )}
    />
  );
}
