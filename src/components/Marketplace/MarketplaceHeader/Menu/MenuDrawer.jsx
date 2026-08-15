// MenuDrawer.jsx
// Buyer-focused marketplace utility drawer

import { createElement, useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  CreditCard,
  Heart,
  HelpCircle,
  History,
  LifeBuoy,
  LocateFixed,
  MapPin,
  MoreHorizontal,
  Navigation,
  PackageCheck,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import AppPortal from "../../../shared/AppPortal";
import AppBackTab from "../../../shared/AppBackTab";
import { SlidePanel, useSlidePanel } from "../../../shared/SlideTransition";
import useBodyScrollLock from "../../../shared/useBodyScrollLock";
import {
  AddressAreaResolutionCard,
  AddressAreaStatusIcon,
  normalizeAreaLocation,
  useAddressAreaValidation,
} from "../../../shared/AddressAreaValidation";
import NearbyAreaScreen from "../../../transport/NearbyAreaScreen";
import { useI18n, t } from "../../../../i18n";
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

function readBuyerAddress() {
  const saved = readBuyerAddressPreference();
  if (saved) {
    return {
      id: saved.id || "",
      category: saved.category || saved.type || "Resident",
      customCategory: saved.customCategory || "",
      fullName: saved.fullName || saved.name || "",
      phone: saved.phone || "",
      street: saved.street || saved.address || "",
      note: saved.note || "",
      frontPictureUrl: saved.frontPictureUrl || "",
      detectedAddress: saved.detectedAddress || "",
      coordinates: saved.coordinates || null,
    };
  }

  return {
    id: "",
    category: "Resident",
    customCategory: "",
    fullName: "",
    phone: "",
    street: "",
    note: "",
    frontPictureUrl: "",
    detectedAddress: "",
    coordinates: null,
  };
}

function readBuyerAddresses() {
  return readBuyerAddressList();
}

function getAddressLabel(address) {
  return address.category === "Other" ? address.customCategory || "Other" : address.category || "Resident";
}

function getAddressActionKey(address = {}) {
  return getBuyerAddressKey(address);
}

function getAddressShareText(address) {
  const label = getAddressLabel(address);
  const street = address.street || address.detectedAddress || t("urmall.menu.addressPending");
  const phone = address.phone ? `\n${t("urmall.orders.phoneLabel", { phone: address.phone })}` : "";
  const note = address.note ? `\n${t("urmall.orders.noteLabel", { note: address.note })}` : "";
  return `${t("urmall.menu.deliveryAddressHeading", { label })}\n${street}${phone}${note}`;
}

function writeBuyerAddress(address) {
  writeBuyerAddressPreference(address);
}

function writeBuyerAddresses(addresses) {
  writeBuyerAddressList(addresses);
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
  if (!products.length) {
    return <p className="rounded-lg bg-gray-50 p-4 text-center text-sm font-bold text-gray-500">{emptyText}</p>;
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
              <img src={product.imageUrl} alt="" className="h-12 w-12 rounded-lg bg-gray-100 object-cover" />
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
              {order.status}
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
  const toneClass = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>
          {createElement(icon, { size: 24 })}
        </span>
        <h4 className="mt-4 text-xl font-black text-gray-950">{title}</h4>
        <p className="mt-2 text-sm font-semibold leading-7 text-gray-600">{summary}</p>
      </section>

      {sections.map((section) => (
        <article key={section.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h5 className="text-base font-black text-gray-950">{section.title}</h5>
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

function SavedAddressMenuAction({ danger = false, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kt-touchable flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black ${
        danger ? "text-rose-600 hover:bg-rose-50" : "text-gray-700 hover:bg-gray-50 hover:text-gray-950"
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-rose-50" : "bg-slate-50"}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

export default function MenuDrawer({ open, onClose }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const { visibleKey: visibleActive, action: activeAction } = useSlidePanel(active);
  const [savedProducts, setSavedProducts] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [address, setAddress] = useState(readBuyerAddress);
  const [savedAddresses, setSavedAddresses] = useState(readBuyerAddresses);
  const [locationCandidate, setLocationCandidate] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [areaPicker, setAreaPicker] = useState(null);
  const [payment, setPayment] = useState(() => readLocalValue(BUYER_PAYMENT_KEY));
  const [message, setMessage] = useState("");
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [addressActionMenuId, setAddressActionMenuId] = useState("");
  const [accountContact, setAccountContact] = useState({});
  const addressPoint = address.coordinates
    ? {
        lat: address.coordinates.latitude ?? address.coordinates.lat,
        lng: address.coordinates.longitude ?? address.coordinates.lng,
        address: address.detectedAddress || address.street,
      }
    : null;
  const addressValidation = useAddressAreaValidation(address.street, { selectedPoint: addressPoint });
  const activeActionAddress = useMemo(
    () => savedAddresses.find((item) => getAddressActionKey(item) === addressActionMenuId) || null,
    [addressActionMenuId, savedAddresses],
  );
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
        if (!profile) return;
        setAccountContact(profile);
        setAddress((current) => ({
          ...current,
          fullName: current.fullName || String(profile.displayName || profile.fullName || profile.full_name || "").trim(),
          phone: current.phone || String(profile.phone || profile.phoneNumber || profile.phone_number || "").trim(),
        }));
      })
      .catch(() => null);
    fetchBuyerDeliveryAddresses()
      .then((addresses) => {
        const mergedAddresses = mergeRemoteBuyerAddresses(addresses);
        const activeAddress = findPreferredBuyerAddress(mergedAddresses);
        setSavedAddresses(mergedAddresses);
        setAddress(activeAddress ? { ...createEmptyAddress(), ...activeAddress } : createEmptyAddress());
        writeBuyerAddressPreference(activeAddress, { notify: false });
        writeBuyerAddressList(mergedAddresses);
      })
      .catch(() => null);
    fetchSavedBuyerProducts()
      .then(setSavedProducts)
      .catch((err) => setMessage(err.message || t("urmall.menu.savedLoadFailed")));
  }, [open]);

  useEffect(() => {
    if (!open) setAreaPicker(null);
  }, [open]);

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

  async function saveAddress() {
    const localId = address.id || `local-address-${Date.now()}`;
    const localAddress = { ...address, id: localId };
    restoreBuyerAddress(localAddress);
    const nextAddresses = [localAddress, ...savedAddresses.filter((item) => item.id !== localId)];
    setSavedAddresses(nextAddresses);
    writeBuyerAddress(localAddress);
    writeBuyerAddresses(nextAddresses);
    try {
      const savedAddress = await saveBuyerDeliveryAddress(address);
      restoreBuyerAddress(savedAddress);
      const syncedAddresses = [savedAddress, ...nextAddresses.filter((item) => item.id !== localId && item.id !== savedAddress.id)];
      setSavedAddresses(syncedAddresses);
      writeBuyerAddress(savedAddress);
      writeBuyerAddresses(syncedAddresses);
      setMessage(t("urmall.menu.addressSaved"));
    } catch {
      setMessage(t("urmall.menu.addressSavedLocal"));
    }
    setAddress(createEmptyAddress(accountContact));
    setLocationCandidate(null);
    setLocationStatus("");
    setAddressFormOpen(false);
  }

  function updateAddress(patch) {
    setAddress((current) => ({ ...current, ...patch }));
  }

  function openAddAddress() {
    setAddress(createEmptyAddress(accountContact));
    setLocationCandidate(null);
    setLocationStatus("");
    setMessage("");
    setAddressFormOpen(true);
  }

  function editAddress(nextAddress) {
    setAddressActionMenuId("");
    setAddress({ ...createEmptyAddress(), ...nextAddress });
    setLocationCandidate(null);
    setLocationStatus("");
    setMessage("");
    setAddressFormOpen(true);
  }

  function closeAddressForm() {
    setAddress(createEmptyAddress(accountContact));
    setLocationCandidate(null);
    setLocationStatus("");
    setAreaPicker(null);
    setAddressFormOpen(false);
  }

  function selectAddress(nextAddress) {
    setAddressActionMenuId("");
    setAddress({ ...createEmptyAddress(), ...nextAddress });
    const selectedKey = getAddressActionKey(nextAddress);
    const orderedAddresses = [
      nextAddress,
      ...savedAddresses.filter((item) => getAddressActionKey(item) !== selectedKey),
    ];
    setSavedAddresses(orderedAddresses);
    writeBuyerAddress(nextAddress);
    writeBuyerAddresses(orderedAddresses);
    setMessage(t("urmall.menu.addressSelected", { label: getAddressLabel(nextAddress) }));
  }

  async function shareAddress(nextAddress) {
    setAddressActionMenuId("");
    const text = getAddressShareText(nextAddress);

    try {
      if (navigator.share) {
        await navigator.share({
          title: t("urmall.menu.deliveryAddressHeading", { label: getAddressLabel(nextAddress) }),
          text,
        });
        setMessage(t("urmall.menu.addressReadyShare"));
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setMessage(t("urmall.menu.addressCopied"));
        return;
      }

      setMessage(text);
    } catch {
      setMessage(t("urmall.menu.addressShareFailed"));
    }
  }

  async function removeAddress(addressKey, nextAddress) {
    setAddressActionMenuId("");
    const deletingActiveAddress = getAddressActionKey(readBuyerAddressPreference() || {}) === addressKey;
    markBuyerAddressDeleted(nextAddress);
    const nextAddresses = savedAddresses.filter((item) => getAddressActionKey(item) !== addressKey);
    setSavedAddresses(nextAddresses);
    writeBuyerAddresses(nextAddresses);

    if (deletingActiveAddress) {
      const replacement = nextAddresses[0] || null;
      writeBuyerAddress(replacement);
      setAddress(replacement ? { ...createEmptyAddress(), ...replacement } : createEmptyAddress());
    }

    if (addressFormOpen && getAddressActionKey(address) === addressKey) {
      closeAddressForm();
    }

    try {
      await deleteBuyerDeliveryAddress(nextAddress.id);
      clearBuyerAddressDeleted(nextAddress);
      setMessage(t("urmall.menu.addressRemoved"));
    } catch {
      setMessage(t("urmall.menu.addressRemovedLocal"));
    }
  }

  function openAddressAreaPicker(start = "current") {
    setLocationStatus("");
    setLocationCandidate(null);
    setMessage("");
    setAreaPicker({ start });
  }

  function locateMe() {
    openAddressAreaPicker("current");
  }

  function dropAddressPin() {
    openAddressAreaPicker("dropPin");
  }

  function acceptAreaLocation(location) {
    const nextLocation = normalizeAreaLocation(location, address.street);
    if (!nextLocation) return;

    updateAddress({
      detectedAddress: nextLocation.address,
      street: nextLocation.address || address.street,
      coordinates: nextLocation.coordinates,
    });
    setLocationStatus(t("urmall.menu.locationAdded", { address: nextLocation.address }));
    setAreaPicker(null);
  }

  function confirmDetectedLocation() {
    if (!locationCandidate) return;

    updateAddress({
      detectedAddress: locationCandidate.address,
      street: address.street || locationCandidate.address,
      coordinates: {
        latitude: locationCandidate.latitude,
        longitude: locationCandidate.longitude,
      },
    });
    setLocationStatus(t("urmall.menu.locationAddedEdit"));
    setLocationCandidate(null);
  }

  function rejectDetectedLocation() {
    setLocationCandidate(null);
    setLocationStatus(t("urmall.menu.enterManually"));
  }

  function handleFrontPictureChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => updateAddress({ frontPictureUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
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
        {message && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p>}

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
          <div className="space-y-4">
            {savedAddresses.length ? (
              <div className="space-y-2">
                <p className="text-sm font-black text-gray-950">{t("urmall.detail.savedAddresses")}</p>
                {savedAddresses.map((item) => {
                  const actionKey = getAddressActionKey(item);
                  const selected = actionKey === getAddressActionKey(address);

                  return (
                    <article
                      key={actionKey}
                      className="kt-touchable relative rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => editAddress(item)} className="kt-touchable min-w-0 flex-1 text-left">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-gray-950">{t("urmall.detail.addressLabel", { label: getAddressLabel(item) })}</span>
                            {selected ? (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                {t("urmall.menu.selected")}
                              </span>
                            ) : null}
                          </span>
                          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
                            {item.street || item.detectedAddress}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setAddressActionMenuId((current) => (current === actionKey ? "" : actionKey));
                          }}
                          className="kt-touchable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-950"
                          aria-label={t("urmall.menu.addressActionsAria", { label: getAddressLabel(item) })}
                          aria-expanded={addressActionMenuId === actionKey}
                          aria-haspopup="menu"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}

            {activeActionAddress ? (
              <div
                className="fixed inset-0 z-[1300] flex items-end justify-center bg-slate-950/20 px-3 py-4 backdrop-blur-[1px] sm:items-center sm:p-6"
                role="presentation"
                onClick={() => setAddressActionMenuId("")}
              >
                <section
                  className="kt-modal-enter w-full max-w-sm overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white p-2 shadow-2xl shadow-slate-950/20 sm:max-w-xs"
                  role="menu"
                  aria-label={t("urmall.menu.addressActionsMenuAria", { label: getAddressLabel(activeActionAddress) })}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="border-b border-gray-100 px-3 py-3">
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                      {t("urmall.detail.addressLabel", { label: getAddressLabel(activeActionAddress) })}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
                      {activeActionAddress.street || activeActionAddress.detectedAddress || t("urmall.menu.deliveryLocationFallback")}
                    </p>
                  </div>
                  <div className="grid gap-1 p-1">
                    <SavedAddressMenuAction icon={Navigation} label={t("urmall.menu.useForNextOrder")} onClick={() => selectAddress(activeActionAddress)} />
                    <SavedAddressMenuAction icon={Pencil} label={t("urmall.menu.editAddress")} onClick={() => editAddress(activeActionAddress)} />
                    <SavedAddressMenuAction icon={Share2} label={t("urmall.menu.shareDetails")} onClick={() => shareAddress(activeActionAddress)} />
                    <SavedAddressMenuAction
                      danger
                      icon={Trash2}
                      label={t("urmall.menu.deleteAddress")}
                      onClick={() => removeAddress(addressActionMenuId, activeActionAddress)}
                    />
                  </div>
                </section>
              </div>
            ) : null}

            {!addressFormOpen ? (
              <button
                type="button"
                onClick={openAddAddress}
                className="kt-touchable inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
              >
                <Plus size={17} />
                {savedAddresses.length ? t("urmall.menu.addAnother") : t("urmall.menu.addAddress")}
              </button>
            ) : null}

            {addressFormOpen ? (
              <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-gray-950">
                      {address.id ? t("urmall.menu.editDeliveryAddress") : t("urmall.menu.addDeliveryAddress")}
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
                      {t("urmall.menu.formHint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeAddressForm}
                    className="kt-touchable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
                    aria-label={t("urmall.menu.closeForm")}
                  >
                    <X size={16} />
                  </button>
                </div>

              <label className="space-y-1">
                <span className="text-xs font-black uppercase text-gray-500">{t("urmall.menu.locationCategory")}</span>
                <select
                  value={address.category}
                  onChange={(event) => updateAddress({ category: event.target.value })}
                  className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                >
                  {addressTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>

              {address.category === "Other" ? (
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">{t("urmall.menu.customCategory")}</span>
                  <input
                    value={address.customCategory}
                    onChange={(event) => updateAddress({ customCategory: event.target.value })}
                    placeholder={t("urmall.menu.customCategoryPlaceholder")}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">{t("urmall.detail.fullName")}</span>
                  <input
                    value={address.fullName}
                    onChange={(event) => updateAddress({ fullName: event.target.value })}
                    placeholder={t("urmall.menu.receiverName")}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">{t("urmall.detail.phoneNumber")}</span>
                  <input
                    value={address.phone}
                    onChange={(event) => updateAddress({ phone: event.target.value })}
                    placeholder={t("urmall.detail.phoneNumber")}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              <label className="space-y-1">
                <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500">
                  {t("urmall.menu.street")}
                  <AddressAreaStatusIcon status={addressValidation.status} />
                </span>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    value={address.street}
                    onChange={(event) => updateAddress({ street: event.target.value })}
                    placeholder={t("urmall.menu.streetPlaceholder")}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={locateMe}
                    className="kt-touchable inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-black text-white transition hover:bg-gray-800"
                  >
                    <LocateFixed size={16} />
                    {t("urmall.detail.locateMe")}
                  </button>
                  <button
                    type="button"
                    onClick={dropAddressPin}
                    className="kt-touchable inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:bg-gray-50"
                  >
                    <MapPin size={16} />
                    {t("urmall.detail.dropPin")}
                  </button>
                </div>
              </label>

              <AddressAreaResolutionCard
                validation={addressValidation}
                onLocateMe={locateMe}
                onDropPin={dropAddressPin}
              />

              {locationCandidate ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-black text-emerald-950">
                    {t("urmall.menu.currentLocationIs", { address: locationCandidate.address })}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={confirmDetectedLocation}
                      className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 size={15} />
                      {t("urmall.menu.correctAddLocation")}
                    </button>
                    <button
                      type="button"
                      onClick={rejectDetectedLocation}
                      className="kt-touchable h-10 rounded-lg border border-gray-200 bg-white px-3 text-xs font-black text-gray-700 hover:bg-gray-50"
                    >
                      {t("urmall.menu.wrongEnterManually")}
                    </button>
                  </div>
                </div>
              ) : null}

              <label className="space-y-1">
                <span className="text-xs font-black uppercase text-gray-500">{t("urmall.menu.noteLabel")}</span>
                <textarea
                  value={address.note}
                  onChange={(event) => updateAddress({ note: event.target.value })}
                  placeholder={t("urmall.menu.notePlaceholder")}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-black uppercase text-gray-500">{t("urmall.menu.frontPicture")}</span>
                <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
                    {address.frontPictureUrl ? (
                      <img src={address.frontPictureUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="text-gray-400" size={30} />
                    )}
                  </div>
                  <div className="flex flex-col justify-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFrontPictureChange}
                      className="text-sm font-semibold text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-950 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
                    />
                    <p className="mt-2 text-xs font-semibold leading-5 text-gray-500">
                      {t("urmall.menu.frontPictureHint")}
                    </p>
                  </div>
                </div>
              </label>

              {address.detectedAddress ? (
                <p className="rounded-xl bg-gray-50 p-3 text-xs font-bold leading-5 text-gray-600">
                  {t("urmall.menu.detectedLocation", { address: address.detectedAddress })}
                </p>
              ) : null}
              {locationStatus ? <p className="text-sm font-bold text-gray-600">{locationStatus}</p> : null}
              </div>
            ) : null}

            {addressFormOpen ? (
              <button
                type="button"
                onClick={saveAddress}
                className="kt-touchable h-12 w-full rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
              >
                {address.id ? t("urmall.menu.updateAddress") : t("urmall.menu.saveAddress")}
              </button>
            ) : null}
          </div>
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
      {areaPicker ? (
        <div className="fixed inset-0 z-[1300] bg-slate-950">
          <NearbyAreaScreen
            mode="businessLocationPicker"
            pickerStart={areaPicker.start}
            pickerLabels={deliveryPickerLabels}
            backLabel={t("urmall.menu.pickerBack")}
            onBack={() => setAreaPicker(null)}
            onLocationPicked={acceptAreaLocation}
          />
        </div>
      ) : null}
    </AppPortal>
  );
}
