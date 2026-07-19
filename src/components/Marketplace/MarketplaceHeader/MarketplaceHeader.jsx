import { MessageCircle, Plus, Search, ShoppingBag, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { useSellerBusinessStatus } from "../../../Backend/hooks/useSellerBusinessStatus";
import {
  markNotificationScopeVisited,
  markNotificationsSeen,
  subscribeNotificationSeen,
} from "../../../Backend/services/notificationSeenStore";
import { guardGuestAction } from "../../../Backend/services/guestModeService";
import { fetchBuyerMessages, fetchBuyerOrders } from "../../../Backend/services/marketplace/buyerMarketplaceService";
import PremiumHeader, { PremiumHeaderButton } from "../../shared/PremiumHeader";
import Cart from "./Cart/Cart";
import Menu from "./Menu/Menu";

const BUYER_MESSAGE_SCOPE = "urmall:buyer:messages";

function mapHeaderItem(prefix, item) {
  const baseId = item.id || item.conversationKey || item.businessId || item.createdAt;
  const changeKey = [item.status, item.createdAt].filter(Boolean).join(":");

  return {
    id: `${prefix}:${baseId}${changeKey ? `:${changeKey}` : ""}`,
    unread: item.unread !== false,
    created_at: item.updated_at || item.updatedAt || item.created_at || item.createdAt || null,
  };
}

export default function MarketplaceHeader({
  onMyBizClick,
  onMessagesClick,
  onSearchClick,
  searchOpen = false,
  activeUtility,
  onActivityChange,
  onNotificationCountChange,
  onNotificationStateChange,
  sellerNotificationCount = 0,
}) {
  const { loading, hasBusiness } = useSellerBusinessStatus();
  const [orderItems, setOrderItems] = useState([]);
  const [messageItems, setMessageItems] = useState([]);
  const [, setSeenVersion] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const businessLabel = loading || hasBusiness ? "Open your business workspace" : "Register your business";
  // Pending orders are actionable. Merely viewing them must not clear the
  // badge; it disappears only after the order status changes.
  const orderCount = orderItems.length;
  // The message badge tracks live unread seller messages: it only clears when
  // the buyer actually opens the conversation (which marks it read), not when
  // the header is merely glanced at.
  const messageCount = messageItems.length;
  const activeHint = messageCount ? "messages" : "";
  const unreadCount = orderCount + messageCount;

  useEffect(() => {
    onNotificationCountChange?.(unreadCount);
    onNotificationStateChange?.({
      orderCount,
      messageCount,
      totalCount: unreadCount,
    });
  }, [messageCount, onNotificationCountChange, onNotificationStateChange, orderCount, unreadCount]);

  useEffect(() => {
    onActivityChange?.(cartOpen || menuOpen);
    return () => onActivityChange?.(false);
  }, [cartOpen, menuOpen, onActivityChange]);

  useEffect(() => {
    let alive = true;

    async function loadOrderCount() {
      try {
        const orders = await fetchBuyerOrders();
        if (alive) {
          setOrderItems(
            orders
              .filter((order) => String(order.status || "").toLowerCase() === "pending")
              .map((order) => mapHeaderItem("buyer-order", order)),
          );
        }
      } catch {
        if (alive) setOrderItems([]);
      }
    }

    loadOrderCount();
    const interval = window.setInterval(loadOrderCount, 20000);
    window.addEventListener("marketplace-orders-updated", loadOrderCount);
    return () => {
      alive = false;
      window.clearInterval(interval);
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
    const interval = window.setInterval(loadMessageCount, 20000);
    window.addEventListener("marketplace-message-sent", loadMessageCount);
    window.addEventListener("marketplace-seller-messages-updated", loadMessageCount);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("marketplace-message-sent", loadMessageCount);
      window.removeEventListener("marketplace-seller-messages-updated", loadMessageCount);
    };
  }, []);

  useEffect(() => {
    return subscribeNotificationSeen(() => setSeenVersion((version) => version + 1));
  }, []);

  useEffect(() => {
    if (activeUtility === "messages" && messageItems.length) markNotificationsSeen(BUYER_MESSAGE_SCOPE, messageItems);
  }, [activeUtility, messageItems]);

  function openMessages() {
    markNotificationsSeen(BUYER_MESSAGE_SCOPE, messageItems);
    markNotificationScopeVisited(BUYER_MESSAGE_SCOPE);
    setSeenVersion((version) => version + 1);
    onMessagesClick?.();
  }

  return (
    <PremiumHeader
      accent="emerald"
      centerIcon={ShoppingBag}
      title="UrMall"
      className="z-20"
      left={(
        <PremiumHeaderButton
          active={!loading && !hasBusiness}
          accent="emerald"
          badge={sellerNotificationCount}
          icon={loading || hasBusiness ? Store : Plus}
          label={businessLabel}
          onClick={() => {
            if (guardGuestAction("open", "seller workspace")) return;
            onMyBizClick?.();
          }}
        />
      )}
      right={(
        <>
          <PremiumHeaderButton
            active={searchOpen}
            accent="emerald"
            icon={Search}
            label={searchOpen ? "Close search" : "Search UrMall products"}
            onClick={() => onSearchClick?.()}
          />
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
          <Menu badge={orderCount} onOpenChange={setMenuOpen} />
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
