import { MessageCircle, PackageCheck, ShoppingBag, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { useSellerBusinessStatus } from "../../../Backend/hooks/useSellerBusinessStatus";
import {
  getUnseenNotificationCount,
  markNotificationsSeen,
  subscribeNotificationSeen,
} from "../../../Backend/services/notificationSeenStore";
import { fetchBuyerMessages, fetchBuyerOrders } from "../../../Backend/services/marketplace/buyerMarketplaceService";
import PremiumHeader, { PremiumHeaderButton } from "../../shared/PremiumHeader";
import Cart from "./Cart/Cart";
import Menu from "./Menu/Menu";

const BUYER_ORDER_SCOPE = "urmall:buyer:orders";
const BUYER_MESSAGE_SCOPE = "urmall:buyer:messages";

function mapHeaderItem(prefix, item) {
  const baseId = item.id || item.conversationKey || item.businessId || item.createdAt;
  const changeKey = [item.status, item.createdAt].filter(Boolean).join(":");

  return {
    id: `${prefix}:${baseId}${changeKey ? `:${changeKey}` : ""}`,
    unread: item.unread !== false,
  };
}

export default function MarketplaceHeader({
  onMyBizClick,
  onOrdersClick,
  onMessagesClick,
  activeUtility,
  onActivityChange,
}) {
  const { loading, hasBusiness } = useSellerBusinessStatus();
  const [orderItems, setOrderItems] = useState([]);
  const [messageItems, setMessageItems] = useState([]);
  const [, setSeenVersion] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const businessLabel = hasBusiness ? "MyBiz" : "REGISTER";
  const orderCount = getUnseenNotificationCount(BUYER_ORDER_SCOPE, orderItems);
  const messageCount = getUnseenNotificationCount(BUYER_MESSAGE_SCOPE, messageItems, { unreadOnly: true });
  const activeHint = orderCount ? "orders" : messageCount ? "messages" : "";

  useEffect(() => {
    onActivityChange?.(cartOpen || menuOpen);
    return () => onActivityChange?.(false);
  }, [cartOpen, menuOpen, onActivityChange]);

  useEffect(() => {
    let alive = true;

    async function loadOrderCount() {
      try {
        const orders = await fetchBuyerOrders();
        if (alive) setOrderItems(orders.map((order) => mapHeaderItem("buyer-order", order)));
      } catch {
        if (alive) setOrderItems([]);
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
        if (alive) {
          setMessageItems(messages.filter((message) => message.unread).map((message) => mapHeaderItem("buyer-message", message)));
        }
      } catch {
        if (alive) setMessageItems([]);
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

  useEffect(() => {
    return subscribeNotificationSeen(() => setSeenVersion((version) => version + 1));
  }, []);

  function openOrders() {
    markNotificationsSeen(BUYER_ORDER_SCOPE, orderItems);
    setSeenVersion((version) => version + 1);
    onOrdersClick?.();
  }

  function openMessages() {
    markNotificationsSeen(BUYER_MESSAGE_SCOPE, messageItems);
    setSeenVersion((version) => version + 1);
    onMessagesClick?.();
  }

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
          <HeaderButtonWithHint
            hint="New order update"
            visible={activeHint === "orders"}
            onClick={openOrders}
          >
            <PremiumHeaderButton
              active={activeUtility === "orders"}
              accent="emerald"
              badge={orderCount}
              icon={PackageCheck}
              label="Open orders"
              onClick={openOrders}
            />
          </HeaderButtonWithHint>
          <HeaderButtonWithHint
            hint="New seller message"
            visible={activeHint === "messages"}
            onClick={openMessages}
          >
            <PremiumHeaderButton
              active={activeUtility === "messages"}
              accent="emerald"
              badge={messageCount}
              icon={MessageCircle}
              label="Open messages"
              onClick={openMessages}
            />
          </HeaderButtonWithHint>
          <Cart onOpenChange={setCartOpen} />
          <Menu onOpenChange={setMenuOpen} />
        </>
      )}
    />
  );
}

function HeaderButtonWithHint({ children, hint, onClick, visible }) {
  return (
    <div className="relative">
      {children}
      {visible ? (
        <button
          type="button"
          onClick={onClick}
          className="absolute right-0 top-[calc(100%+0.55rem)] z-50 w-36 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-left text-xs font-black text-slate-700 shadow-xl shadow-slate-900/10"
        >
          {hint}
          <span className="absolute -top-1 right-5 h-3 w-3 rotate-45 border-l border-t border-emerald-100 bg-white" />
        </button>
      ) : null}
    </div>
  );
}
