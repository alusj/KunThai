// MenuDrawer.jsx
// Buyer-focused marketplace utility drawer

import { createElement, useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  Heart,
  HelpCircle,
  History,
  LifeBuoy,
  MapPin,
  Navigation,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import AppPortal from "../../../shared/AppPortal";
import AppBackTab from "../../../shared/AppBackTab";
import { SlidePanel, useSlidePanel } from "../../../shared/SlideTransition";
import useBodyScrollLock from "../../../shared/useBodyScrollLock";
import SavedAddressBook from "../../../shared/savedAddresses/SavedAddressBook";
import { showToast } from "../../../../Backend/services/toastService";
import { useI18n, t } from "../../../../i18n";
import { resizedImageUrl } from "../../../../Backend/lib/imageProxy";
import { formatCurrency } from "../../../../Backend/utils/formatCurrency";
import { getOnboardingProfile } from "../../../../Backend/services/onboardingService";
import {
  deleteBuyerDeliveryAddress,
  fetchBuyerDeliveryAddresses,
  fetchSavedBuyerProducts,
  saveBuyerDeliveryAddress,
} from "../../../../Backend/services/marketplace/buyerMarketplaceService";
import Orders from "../../Orders";
import AdminRolesPanel from "../../shared/AdminRolesPanel";
import UrMallCautionCard from "../../shared/UrMallCautionCard";
import {
  clearBuyerAddressDeleted,
  findPreferredBuyerAddress,
  getBuyerAddressKey,
  markBuyerAddressDeleted,
  mergeRemoteBuyerAddresses,
  readBuyerAddressList,
  readBuyerAddressPreference,
  restoreBuyerAddress,
  writeBuyerAddressList,
  writeBuyerAddressPreference,
} from "../../shared/buyerAddressPreferences";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";
import { inlineErrorMessage } from "../../../../Backend/services/friendlyErrorService";

const BUYER_PAYMENT_KEY = "marketplace-buyer-payment";
const RECENT_PRODUCTS_KEY = "marketplace-recent-products";
const addressTypes = ["Resident", "Office", "Market", "School", "Other"];

const menuItems = [
  { id: "caution", labelKey: "urmall.menu.itemCaution", icon: ShoppingBag },
  { id: "orders", labelKey: "urmall.menu.itemOrders", icon: PackageCheck },
  { id: "saved", labelKey: "urmall.menu.itemSaved", icon: Heart },
  { id: "recent", labelKey: "urmall.menu.itemRecent", icon: History },
  { id: "address", labelKey: "urmall.menu.itemAddress", icon: MapPin },
  { id: "payments", labelKey: "urmall.menu.itemPayments", icon: CreditCard },
  { id: "returns", labelKey: "urmall.menu.itemReturns", icon: RotateCcw },
  { id: "adminRoles", labelKey: "urmall.menu.itemAdminRoles", icon: ShieldCheck },
  { id: "support", labelKey: "urmall.menu.itemSupport", icon: LifeBuoy },
  { id: "settings", labelKey: "urmall.menu.itemSettings", icon: Settings },
];

function readLocalValue(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function readBuyerAddresses() {
  return readBuyerAddressList();
}

function readSelectedAddressKey() {
  const preference = readBuyerAddressPreference();
  return preference ? getBuyerAddressKey(preference) : "";
}

function createEmptyAddress(profile = {}) {
  return {
    id: "",
    category: "Resident",
    customCategory: "",
    fullName: String(profile.displayName || profile.fullName || profile.full_name || "").trim(),
    phone: String(profile.phone || profile.phoneNumber || profile.phone_number || "").trim(),
    street: "",
    note: "",
    frontPictureUrl: "",
    detectedAddress: "",
    coordinates: null,
  };
}

function readRecentProducts() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_PRODUCTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusTone(status) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  if (status === "shipped") return "bg-blue-50 text-blue-700";
  return "bg-amber-50 text-amber-700";
}

function ProductMiniList({ products, emptyText, onProductSelect }) {
  useUiLocale();
  if (!products.length) {
    return <p className="rounded-lg bg-gray-50 p-4 text-center text-sm font-bold text-gray-500">{translateUi(emptyText)}</p>;
  }

  return (
    <div className="space-y-2">
      {products.slice(0, 8).map((product) => {
        const price = product.discountPrice && product.discountPrice < product.price ? product.discountPrice : product.price;

        return (
          <button
            key={product.id}
            type="button"
            onClick={() => onProductSelect?.(product)}
            className="kt-touchable flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
          >
            {product.imageUrl ? (
              <img src={resizedImageUrl(product.imageUrl, { width: 96, quality: 70 })} alt="" className="h-12 w-12 rounded-lg bg-gray-100 object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-400">
                {t("urmall.cart.imgPlaceholder")}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-gray-950">{product.name}</p>
              <p className="text-xs font-bold text-gray-500">{formatCurrency(price || 0)}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function OrderedItemsList({ orders, loading }) {
  useUiLocale();
  if (loading) {
    return <p className="rounded-lg bg-gray-50 p-4 text-center text-sm font-bold text-gray-500">{t("urmall.menu.loadingOrdered")}</p>;
  }

  if (!orders.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
        <ReceiptText className="mx-auto text-gray-400" size={34} />
        <p className="mt-3 font-black text-gray-950">{t("urmall.menu.noOrdered")}</p>
        <p className="mt-1 text-sm font-medium text-gray-500">{t("urmall.orders.noOrdersHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.slice(0, 10).map((order) => (
        <article key={order.id} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-gray-950">{order.preview || t("urmall.orders.orderTitle")}</p>
              <p className="mt-1 text-xs font-bold text-gray-500">{order.sellerName}</p>
            </div>
            <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-black capitalize ${statusTone(order.status)}`}>
              {translateUi(order.status)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-gray-500">
              {t(order.itemCount === 1 ? "urmall.orders.itemsDateOne" : "urmall.orders.itemsDateOther", { count: order.itemCount, date: formatDate(order.createdAt) })}
            </p>
            <p className="text-base font-black text-gray-950">{formatCurrency(order.totalAmount)}</p>
          </div>
          {order.deliveryLocation ? <p className="mt-2 text-xs font-bold text-gray-500">{order.deliveryLocation}</p> : null}
        </article>
      ))}
    </div>
  );
}

function BuyerArticlePanel({ icon, tone = "emerald", title, summary, sections }) {
  useUiLocale();
  const toneClass = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>
          {createElement(icon, { size: 24 })}
        </span>
        <h4 className="mt-4 text-xl font-black text-gray-950">{translateUi(title)}</h4>
        <p className="mt-2 text-sm font-semibold leading-7 text-gray-600">{translateUi(summary)}</p>
      </section>

      {sections.map((section) => (
        <article key={section.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h5 className="text-base font-black text-gray-950">{translateUi(section.title)}</h5>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-3 text-sm font-semibold leading-7 text-gray-600">
              {paragraph}
            </p>
          ))}
        </article>
      ))}
    </div>
  );
}

export default function MenuDrawer({ open, onClose, onRequestedScreenHandled, requestedScreen = "" }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const { visibleKey: visibleActive, action: activeAction } = useSlidePanel(active);
  const [savedProducts, setSavedProducts] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [savedAddresses, setSavedAddresses] = useState(readBuyerAddresses);
  const [selectedAddressKey, setSelectedAddressKey] = useState(readSelectedAddressKey);
  const [payment, setPayment] = useState(() => readLocalValue(BUYER_PAYMENT_KEY));
  const [message, setMessage] = useState("");
  const [accountContact, setAccountContact] = useState({});
  const deliveryPickerLabels = useMemo(
    () => ({
      historyKey: "urmall-delivery-address-picker",
      backLabel: t("urmall.menu.pickerBack"),
      eyebrow: t("urmall.detail.pickerEyebrow"),
      cardEyebrow: t("urmall.detail.deliveryAddress"),
      headerCurrentTitle: t("urmall.detail.pickerConfirmTitle"),
      headerDropTitle: t("urmall.detail.pickerDropTitle"),
      currentHeading: t("urmall.detail.pickerCurrentHeading"),
      dropHeading: t("urmall.detail.pickerDropHeading"),
      dropInstruction: t("urmall.detail.pickerDropInstruction"),
      currentStatus: t("urmall.detail.pickerCurrentStatus"),
      dropStatus: t("urmall.detail.pickerDropStatus"),
      currentName: t("urmall.detail.pickerCurrentName"),
      droppedName: t("urmall.detail.pickerDroppedName"),
    }),
    // locale drives re-translation of these labels on language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );

  useEffect(() => {
    if (!open) return;

    setRecentProducts(readRecentProducts());
    getOnboardingProfile()
      .then((profile) => {
        if (profile) setAccountContact(profile);
      })
      .catch(() => null);
    fetchBuyerDeliveryAddresses()
      .then((addresses) => {
        const mergedAddresses = mergeRemoteBuyerAddresses(addresses);
        const activeAddress = findPreferredBuyerAddress(mergedAddresses);
        setSavedAddresses(mergedAddresses);
        setSelectedAddressKey(activeAddress ? getBuyerAddressKey(activeAddress) : "");
        writeBuyerAddressPreference(activeAddress, { notify: false });
        writeBuyerAddressList(mergedAddresses);
      })
      .catch(() => null);
    fetchSavedBuyerProducts()
      .then(setSavedProducts)
      .catch((err) => setMessage(inlineErrorMessage(err, t("urmall.menu.savedLoadFailed"))));
  }, [open]);

  useEffect(() => {
    if (!open || !requestedScreen) return;
    if (menuItems.some((item) => item.id === requestedScreen)) {
      setMessage("");
      setActive(requestedScreen);
    }
    onRequestedScreenHandled?.();
  }, [onRequestedScreenHandled, open, requestedScreen]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (active) {
          setActive(null);
          return;
        }
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, onClose, open]);

  const activeTitle = useMemo(() => {
    const item = menuItems.find((entry) => entry.id === visibleActive);
    return item ? t(item.labelKey) : t("urmall.menu.buyerMenu");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleActive, locale]);

  // Saved on this device first, so an offline or signed-out buyer keeps it,
  // then to their account. The list is updated by the address book once its
  // "saved" animation has played (see SavedAddressBook's onSave contract).
  async function saveAddress(draft) {
    const localId = draft.id || `local-address-${Date.now()}`;
    const localAddress = { ...draft, id: localId };
    restoreBuyerAddress(localAddress);
    const localList = [localAddress, ...savedAddresses.filter((item) => item.id !== localId)];
    writeBuyerAddressList(localList);
    writeBuyerAddressPreference(localAddress, { notify: false });

    let savedAddress = localAddress;
    let synced = false;
    try {
      savedAddress = { ...localAddress, ...(await saveBuyerDeliveryAddress(draft)) };
      restoreBuyerAddress(savedAddress);
      synced = true;
    } catch {
      // Kept on this device; it reaches the account on a later save.
    }

    const nextAddresses = [savedAddress, ...localList.filter((item) => item.id !== localId && item.id !== savedAddress.id)];
    writeBuyerAddressList(nextAddresses);
    writeBuyerAddressPreference(savedAddress);
    return {
      address: savedAddress,
      synced,
      apply() {
        setSavedAddresses(nextAddresses);
        setSelectedAddressKey(getBuyerAddressKey(savedAddress));
      },
    };
  }

  function selectAddress(nextAddress) {
    const selectedKey = getBuyerAddressKey(nextAddress);
    const orderedAddresses = [
      nextAddress,
      ...savedAddresses.filter((item) => getBuyerAddressKey(item) !== selectedKey),
    ];
    setSavedAddresses(orderedAddresses);
    setSelectedAddressKey(selectedKey);
    writeBuyerAddressPreference(nextAddress);
    writeBuyerAddressList(orderedAddresses);
    showToast(t("addressBook.toastNextOrder"), "success");
  }

  async function removeAddress(nextAddress) {
    const addressKey = getBuyerAddressKey(nextAddress);
    markBuyerAddressDeleted(nextAddress);
    const nextAddresses = savedAddresses.filter((item) => getBuyerAddressKey(item) !== addressKey);
    setSavedAddresses(nextAddresses);
    writeBuyerAddressList(nextAddresses);
    if (selectedAddressKey === addressKey) {
      const replacement = nextAddresses[0] || null;
      writeBuyerAddressPreference(replacement);
      setSelectedAddressKey(replacement ? getBuyerAddressKey(replacement) : "");
    }

    try {
      await deleteBuyerDeliveryAddress(nextAddress.id);
      clearBuyerAddressDeleted(nextAddress);
      return { synced: true };
    } catch {
      return { synced: false };
    }
  }

  function savePayment() {
    localStorage.setItem(BUYER_PAYMENT_KEY, payment);
    setMessage(t("urmall.menu.paymentSaved"));
  }

  function openProduct(product) {
    onClose?.();
    window.dispatchEvent(new CustomEvent("marketplace-open-product", { detail: { product } }));
  }

  function renderActiveContent(screenKey = visibleActive) {
    return (
      <>
        {message && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{translateUi(message)}</p>}

        {screenKey === "caution" && <UrMallCautionCard showMenuNote={false} />}

        {screenKey === "orders" && <Orders compact onProductOpen={openProduct} />}

        {screenKey === "saved" && (
          <ProductMiniList
            products={savedProducts}
            emptyText={t("urmall.menu.savedEmpty")}
            onProductSelect={openProduct}
          />
        )}

        {screenKey === "recent" && (
          <ProductMiniList
            products={recentProducts}
            emptyText={t("urmall.menu.recentEmpty")}
            onProductSelect={openProduct}
          />
        )}

        {screenKey === "address" && (
          <SavedAddressBook
            addresses={savedAddresses}
            categories={addressTypes}
            createEmptyAddress={() => createEmptyAddress(accountContact)}
            getKey={getBuyerAddressKey}
            selectedKey={selectedAddressKey}
            menuActions={[
              { id: "use", icon: Navigation, label: t("urmall.menu.useForNextOrder"), onSelect: selectAddress },
            ]}
            onSave={saveAddress}
            onRemove={removeAddress}
            pickerLabels={deliveryPickerLabels}
            pickerBackLabel={t("urmall.menu.pickerBack")}
          />
        )}

        {screenKey === "payments" && (
          <div className="space-y-4">
            <BuyerArticlePanel
              icon={CreditCard}
              tone="amber"
              title={t("urmall.menu.paymentsTitle")}
              summary={t("urmall.menu.paymentsSummary")}
              sections={[
                {
                  title: t("urmall.menu.paymentsS1Title"),
                  paragraphs: [t("urmall.menu.paymentsS1P1"), t("urmall.menu.paymentsS1P2")],
                },
                {
                  title: t("urmall.menu.paymentsS2Title"),
                  paragraphs: [t("urmall.menu.paymentsS2P1"), t("urmall.menu.paymentsS2P2")],
                },
              ]}
            />
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <label className="block text-sm font-black text-gray-950">{t("urmall.menu.tempPaymentNote")}</label>
              <textarea
                value={payment}
                onChange={(event) => setPayment(event.target.value)}
                placeholder={t("urmall.menu.paymentPlaceholder")}
                className="min-h-32 w-full rounded-xl border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
              />
              <button type="button" onClick={savePayment} className="kt-touchable rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">
                {t("urmall.menu.savePaymentPref")}
              </button>
            </div>
          </div>
        )}

        {screenKey === "adminRoles" && <AdminRolesPanel />}

        {screenKey === "returns" && (
          <BuyerArticlePanel
            icon={ShieldAlert}
            tone="amber"
            title={t("urmall.menu.itemReturns")}
            summary={t("urmall.menu.returnsSummary")}
            sections={[
              {
                title: t("urmall.menu.returnsS1Title"),
                paragraphs: [t("urmall.menu.returnsS1P1"), t("urmall.menu.returnsS1P2")],
              },
              {
                title: t("urmall.menu.returnsS2Title"),
                paragraphs: [t("urmall.menu.returnsS2P1"), t("urmall.menu.returnsS2P2")],
              },
            ]}
          />
        )}

        {screenKey === "support" && (
          <BuyerArticlePanel
            icon={HelpCircle}
            title={t("urmall.menu.itemSupport")}
            summary={t("urmall.menu.supportSummary")}
            sections={[
              {
                title: t("urmall.menu.supportS1Title"),
                paragraphs: [t("urmall.menu.supportS1P1"), t("urmall.menu.supportS1P2")],
              },
              {
                title: t("urmall.menu.supportS2Title"),
                paragraphs: [t("urmall.menu.supportS2P1"), t("urmall.menu.supportS2P2")],
              },
            ]}
          />
        )}

        {screenKey === "settings" && (
          <BuyerArticlePanel
            icon={Settings}
            tone="blue"
            title={t("urmall.menu.itemSettings")}
            summary={t("urmall.menu.settingsSummary")}
            sections={[
              {
                title: t("urmall.menu.settingsS1Title"),
                paragraphs: [t("urmall.menu.settingsS1P1"), t("urmall.menu.settingsS1P2")],
              },
              {
                title: t("urmall.menu.settingsS2Title"),
                paragraphs: [t("urmall.menu.settingsS2P1"), t("urmall.menu.settingsS2P2")],
              },
            ]}
          />
        )}
      </>
    );
  }

  return (
    <AppPortal>
      <div
        aria-hidden={!open}
        inert={open ? undefined : "true"}
        className={`kt-urmall-screen-panel fixed inset-0 z-[1200] flex w-screen transform flex-col overflow-hidden bg-white shadow-2xl ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div
          aria-hidden={Boolean(visibleActive)}
          inert={visibleActive ? "true" : undefined}
          className="flex min-h-0 flex-1 flex-col"
        >
            <div className="kt-header-glass flex h-16 items-center gap-3 px-3 sm:px-4">
              <AppBackTab onBack={onClose} label={t("urmall.shell.backToUrMall")} historyKey="urmall-buyer-menu" useHistoryLayer={false} />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">UrMall</p>
                <h3 className="truncate text-lg font-black text-gray-950">{t("urmall.menu.buyerMenu")}</h3>
              </div>
            </div>

            <nav className="kt-safe-scroll-bottom min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 pt-4 sm:px-6 lg:px-8">
              <div className="grid gap-3 lg:grid-cols-2">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActive(item.id);
                        setMessage("");
                      }}
                      className="kt-touchable flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40 hover:shadow-md hover:shadow-emerald-950/5"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
                        <Icon size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-gray-950">{t(item.labelKey)}</span>
                        <span className="mt-1 block line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
                          {t("urmall.menu.manageYour", { label: t(item.labelKey) })}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>
        </div>

        {visibleActive ? (
          <SlidePanel action={activeAction} className="kt-safe-screen bg-gray-50">
            <div className="kt-header-glass flex h-16 items-center gap-3 px-3 sm:px-4">
              <AppBackTab onBack={() => setActive(null)} label={t("urmall.menu.backToBuyerMenu")} historyKey="urmall-buyer-menu-item" useHistoryLayer={false} />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{t("urmall.menu.buyerMenu")}</p>
                <h3 className="truncate text-lg font-black text-gray-950">{activeTitle}</h3>
              </div>
            </div>
            <section className="kt-safe-scroll-bottom min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 pt-4 sm:px-6 lg:px-8">
              {renderActiveContent(visibleActive)}
            </section>
          </SlidePanel>
        ) : null}
        </div>
    </AppPortal>
  );
}
