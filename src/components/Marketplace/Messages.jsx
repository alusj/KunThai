import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, MessageCircle, Send, X } from "lucide-react";
import {
  fetchBuyerMessages,
  markBuyerMarketplaceConversationRead,
  sendBuyerMarketplaceMessage,
  subscribeBuyerMarketplaceMessages,
} from "../../Backend/services/marketplace/buyerMarketplaceService";
import { formatMessageTime } from "../../Backend/utils/formatMessageTime";
import MessageImage from "../shared/MessageImage";
import { optimizeImageFile } from "../../Backend/services/marketplace/imageOptimization";
import { friendlyErrorMessage } from "../../Backend/services/friendlyErrorService";
import { useI18n, t } from "../../i18n";
import AppBackTab from "../shared/AppBackTab";
import MessagePrivacyNotice from "../shared/MessagePrivacyNotice";
import { useKeyboardAwareConversation } from "../../Backend/hooks/useKeyboardAwareConversation";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(t("urmall.messages.fileReadFailed")));
    reader.readAsDataURL(file);
  });
}

export default function Messages({ onBack, onProductOpen }) {
  useI18n();
  const [messages, setMessages] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [closingMessage, setClosingMessage] = useState(null);
  const [screenAction, setScreenAction] = useState("idle");
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  // Optimistic copies of just-sent messages so they render before the reload.
  const [echoes, setEchoes] = useState([]);
  const transitionTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const threadScrollRef = useRef(null);
  const threadEndRef = useRef(null);

  const activeMessage = useMemo(
    () => (activeId ? messages.find((message) => message.id === activeId) || null : null),
    [activeId, messages],
  );
  const visibleMessage = activeMessage || closingMessage;
  const unreadCount = messages.filter((message) => message.unread).length;

  const threadMessages = useMemo(() => {
    if (!visibleMessage) return [];
    const serverMessages = visibleMessage.messages || [];
    const serverIds = new Set(serverMessages.map((item) => item.id));
    const pending = echoes
      .filter((echo) => echo.conversationId === visibleMessage.id && !serverIds.has(echo.message.id))
      .map((echo) => echo.message);
    return [...serverMessages, ...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [echoes, visibleMessage]);
  const keyboard = useKeyboardAwareConversation({
    activeKey: visibleMessage?.id || "",
    itemCount: threadMessages.length,
    threadRef: threadScrollRef,
  });

  async function loadMessages({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError("");

    try {
      const rows = await fetchBuyerMessages();
      setMessages(rows);
      setActiveId((current) => (rows.some((row) => row.id === current) ? current : current ? "" : current));
    } catch (err) {
      if (!silent) setError(err.message || t("urmall.messages.loadFailed"));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
  }, []);

  useEffect(() => {
    let unsubscribe = null;
    let active = true;

    subscribeBuyerMarketplaceMessages(() => loadMessages({ silent: true }))
      .then((cleanup) => {
        if (active) {
          unsubscribe = cleanup;
        } else {
          cleanup?.();
        }
      })
      .catch(() => {
        // Realtime is an enhancement; the screen still loads on demand.
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  function clearTransitionTimer() {
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }

  async function openConversation(messageId) {
    clearTransitionTimer();
    setClosingMessage(null);
    setSendError("");
    setScreenAction("push");
    setActiveId(messageId);
    const conversation = messages.find((message) => message.id === messageId);
    if (conversation?.unread) {
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, unread: false } : message));
      markBuyerMarketplaceConversationRead(conversation).catch(() => loadMessages({ silent: true }));
    }
    transitionTimerRef.current = window.setTimeout(() => {
      setScreenAction("idle");
      transitionTimerRef.current = null;
    }, 360);
  }

  function closeConversation() {
    if (!activeMessage) return;

    clearTransitionTimer();
    setClosingMessage(activeMessage);
    setScreenAction("pop");
    setActiveId("");
    transitionTimerRef.current = window.setTimeout(() => {
      setClosingMessage(null);
      setScreenAction("idle");
      transitionTimerRef.current = null;
    }, 360);
  }

  async function handleImageSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      setSendError(t("urmall.messages.selectImageFile"));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(await optimizeImageFile(file));
      setAttachment({ dataUrl, name: file.name || "Selected photo" });
      setSendError("");
    } catch (err) {
      setSendError(friendlyErrorMessage(err, t("urmall.messages.imagePrepFailed")));
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    const text = draft.trim();
    const conversation = activeMessage;
    if ((!text && !attachment) || !conversation || sending) return;

    const pendingAttachment = attachment;
    const tempId = `pending-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      from: "buyer",
      text,
      mediaUrl: pendingAttachment?.dataUrl || "",
      mediaType: pendingAttachment ? "image" : "text",
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setEchoes((current) => [...current, { conversationId: conversation.id, message: optimisticMessage }]);
    setDraft("");
    setAttachment(null);
    setSendError("");
    setSending(true);

    try {
      const savedMessage = await sendBuyerMarketplaceMessage({
        seller: { id: conversation.businessId },
        product: conversation.productId
          ? { id: conversation.productId, name: conversation.productName, businessId: conversation.businessId }
          : null,
        topic: conversation.topic,
        message: text,
        messageType: conversation.type,
        mediaUrl: pendingAttachment?.dataUrl || "",
      });
      setEchoes((current) =>
        current.map((echo) => (echo.message.id === tempId ? { ...echo, message: savedMessage } : echo)),
      );
      loadMessages({ silent: true });
    } catch (err) {
      setEchoes((current) => current.filter((echo) => echo.message.id !== tempId));
      setDraft(text);
      setAttachment(pendingAttachment);
      setSendError(err.message || t("urmall.messages.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  function renderProductLink(message) {
    if (!message.productName || message.productName === message.topic) return null;

    return (
      <>
        {" - "}
        <button
          type="button"
          onClick={() =>
            onProductOpen?.({
              id: message.productId,
              businessId: message.businessId,
              name: message.productName,
            })
          }
          className="font-black text-emerald-700 hover:text-emerald-800 hover:underline"
        >
          {message.productName}
        </button>
      </>
    );
  }

  function renderListScreen() {
    return (
      <section
        aria-hidden={Boolean(visibleMessage)}
        inert={visibleMessage ? "true" : undefined}
        className="absolute inset-0 flex flex-col bg-gray-50"
        data-back-swipe-scope
      >
        <header className="kt-header-glass flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
          <AppBackTab onBack={onBack} label={t("urmall.shell.backToUrMall")} historyKey="urmall-messages" useHistoryLayer={false} />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-emerald-700">UrMall</p>
            <h1 className="truncate text-lg font-black text-gray-950">{t("urmall.shell.messagesTitle")}</h1>
            <p className="truncate text-xs font-bold text-gray-500">{t("urmall.shell.messagesSubtitle")}</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="w-full">
            <div className="mb-4"><MessagePrivacyNotice variant="urmall" /></div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-gray-950">{t("urmall.messages.conversations")}</h2>
              {unreadCount ? <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-black text-white">{unreadCount}</span> : null}
            </div>

            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

            {!loading && !error && !messages.length ? (
              <div className="mt-8 rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
                <MessageCircle className="mx-auto text-gray-400" size={36} />
                <p className="mt-3 font-black text-gray-950">{t("urmall.messages.noMessages")}</p>
                <p className="mt-1 text-sm font-medium text-gray-500">{t("urmall.messages.noMessagesHint")}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              {messages.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => openConversation(message.id)}
                  className={`kt-touchable w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                    message.unread
                      ? "border-emerald-200 bg-emerald-50/90 hover:bg-emerald-100/80"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-base font-black text-gray-950">
                      {message.sellerName}
                    </p>
                    <span className="shrink-0 text-xs font-bold text-gray-400">{formatMessageTime(message.createdAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-bold text-gray-500">{message.topic}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-gray-500">{message.preview}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderConversationScreen(message) {
    if (!message) return null;

    const panelClass = screenAction === "push"
      ? "kt-explore-stack-enter"
      : screenAction === "pop"
        ? "kt-explore-stack-leave-right"
        : "translate-x-0";
    const canSend = Boolean(draft.trim() || attachment) && !sending;

    return (
      <section className={`kt-conversation-screen absolute inset-0 z-10 flex flex-col bg-gray-50 ${panelClass}`} data-back-swipe-scope>
        <header className="kt-header-glass flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
          <AppBackTab
            onBack={closeConversation}
            label={t("urmall.messages.backToMessages")}
            historyKey="urmall-message-conversation"
            useHistoryLayer={false}
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-black uppercase text-emerald-700">{t("urmall.shell.messagesTitle")}</p>
            <h2 className="truncate text-lg font-black text-gray-950">{message.sellerName}</h2>
            <p className="truncate text-xs font-bold text-gray-500">
              {message.topic}
              {renderProductLink(message)}
            </p>
          </div>
        </header>

        <MessagePrivacyNotice compact variant="urmall" />

        <div ref={threadScrollRef} className="kt-message-thread px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-h-full w-full flex-col gap-3">
            {threadMessages.map((item) => {
              const fromBuyer = item.from === "buyer";

              return (
                <div
                  key={item.id}
                  className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm font-medium shadow-sm ${
                    fromBuyer
                      ? "ml-auto bg-emerald-600 text-white"
                      : "border border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  {item.mediaType === "image" && item.mediaUrl ? (
                    <MessageImage mediaUrl={item.mediaUrl} alt={t("urmall.messages.attachmentAlt")} pending={item.pending} className="mb-2" />
                  ) : null}
                  {item.text ? <p>{item.text}</p> : null}
                  <span className={`mt-1 block text-[10px] font-bold ${fromBuyer ? "text-white/70" : "text-gray-400"}`}>
                    {item.pending ? t("urmall.detail.sending") : formatMessageTime(item.createdAt)}
                  </span>
                </div>
              );
            })}
            <div ref={threadEndRef} />
          </div>
        </div>

        {sendError ? <p className="mx-4 shrink-0 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700 sm:mx-6 lg:mx-8">{sendError}</p> : null}

        <form
          onSubmit={sendReply}
          className="kt-message-composer border-t border-gray-200 bg-white px-3 pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.05)]"
          data-focused={keyboard.focused ? "true" : "false"}
        >
          {attachment ? (
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
              <img src={attachment.dataUrl} alt={t("urmall.messages.selectedAttachmentAlt")} className="h-12 w-12 rounded-lg object-cover" />
              <p className="min-w-0 flex-1 truncate text-sm font-black text-gray-950">{t("urmall.messages.photoReady")}</p>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-gray-500"
                aria-label={t("urmall.messages.removeAttachment")}
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          <div className="kt-message-composer-row flex w-full gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200"
              aria-label={t("urmall.messages.attachImage")}
            >
              <ImagePlus size={18} />
            </button>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPointerDown={keyboard.handleInputPointerDown}
              onFocus={keyboard.handleInputFocus}
              onBlur={keyboard.handleInputBlur}
              placeholder={t("urmall.messages.typeMessage")}
              enterKeyHint="send"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={16} />
              {t("urmall.messages.send")}
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <main className="relative h-full min-h-0 overflow-hidden bg-gray-50">
      {renderListScreen()}
      {renderConversationScreen(visibleMessage)}
    </main>
  );
}
