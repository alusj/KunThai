import { useCallback, useEffect, useState } from "react";

import {
  currentMarketplaceUserId,
  deleteMarketplaceMessageForEveryone,
  editMarketplaceMessage,
  hideMarketplaceMessage,
  messageActionFields,
} from "../services/marketplace/marketplaceMessageActionsService";
import { showToast } from "../services/toastService";
import { t as i18nText } from "../../i18n/index";
import { readMenuAnchor, copyMessageText, prepareImageForActions, runImageAction, submitReport } from "../../components/shared/messageActions/messageActionDom.js";
import { canStillEdit, messageActionKeys } from "../../components/shared/messageActions/messageActionModel.js";

function snapshotOf(message) {
  return { from: message.from, body: message.text, type: message.mediaType || "text" };
}

// The long-press menu, reply/edit and deletes for one UrMall chat screen.
// myRole: "buyer" or "seller" (the side this screen speaks for).
// threadKey: the open conversation; changing it clears the menu and reply.
// onChanged: reload the thread after a change is saved.
export function useMarketplaceMessageActions({ myRole, otherName, threadKey, onChanged }) {
  const [menu, setMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [context, setContext] = useState(null);
  // Changes shown before the reload brings them back from the server.
  const [patches, setPatches] = useState({});
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [userId, setUserId] = useState("");

  useEffect(() => {
    currentMarketplaceUserId().then(setUserId).catch(() => {});
  }, []);

  useEffect(() => {
    setMenu(null);
    setDeleteTarget(null);
    setContext(null);
  }, [threadKey]);

  const closeMenu = useCallback(() => setMenu(null), []);

  // A message this account sent: on the seller side, a teammate's reply is
  // on "our" side but only its sender may edit or delete it for everyone.
  // Older rows have no sender; the database decides for those.
  function sentByMe(message) {
    if (message.from !== myRole) return false;
    return !message.sentBy || !userId || message.sentBy === userId;
  }

  function authorOf(from) {
    return from === myRole ? i18nText("messageActions.you") : otherName;
  }

  function visible(messages = []) {
    return messages
      .filter((message) => !hiddenIds.has(message.id))
      .map((message) => (patches[message.id] ? { ...message, ...patches[message.id] } : message));
  }

  function openMenu(message, element) {
    const keys = messageActionKeys(
      { id: message.id, text: message.text, type: message.mediaUrl ? message.mediaType || "image" : "text", createdAt: message.createdAt, deletedAt: message.deletedAt, pending: message.pending },
      {
        mine: sentByMe(message),
        // A teammate's reply on the seller side is "ours": not reported.
        canReport: message.from !== myRole,
        hasImage: message.mediaType === "image" && Boolean(message.mediaUrl),
      },
    );
    const placement = readMenuAnchor(element);
    if (!keys.length || !placement) return;
    const photo = message.mediaType === "image" && Boolean(message.mediaUrl);
    const preview = {
      author: authorOf(message.from),
      text: message.text || (photo ? i18nText("messageActions.photo") : ""),
      imageUrl: photo ? element.querySelector("img")?.currentSrc || "" : "",
      photo,
    };
    if (keys.includes("saveImage")) prepareImageForActions(message.mediaUrl);
    setMenu({ ...placement, element, keys, align: message.from === myRole ? "end" : "start", message, preview });
  }

  function patch(messageId, fields) {
    setPatches((current) => ({ ...current, [messageId]: { ...(current[messageId] || {}), ...fields } }));
  }

  function unpatch(messageId) {
    setPatches((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  async function hide(message) {
    setHiddenIds((current) => new Set(current).add(message.id));
    try {
      await hideMarketplaceMessage(message.id);
      showToast(i18nText("messageActions.hiddenToast"), "info");
      onChanged?.();
    } catch {
      setHiddenIds((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
      showToast(i18nText("messageActions.deleteFailed"), "danger");
    }
  }

  async function deleteForEveryone(message) {
    patch(message.id, { text: "", mediaUrl: "", mediaType: "text", deletedAt: new Date().toISOString() });
    try {
      const saved = await deleteMarketplaceMessageForEveryone(message.id);
      patch(message.id, { ...messageActionFields(saved || {}), text: "", mediaUrl: "" });
      showToast(i18nText("messageActions.deletedToast"), "info");
      onChanged?.();
    } catch (error) {
      unpatch(message.id);
      const expired = /24 hours/i.test(String(error?.message || ""));
      showToast(expired ? i18nText("messageActions.deleteExpired") : i18nText("messageActions.deleteFailed"), "danger");
    }
  }

  async function runMenuAction(key) {
    const message = menu?.message;
    if (!message) return;
    if (key === "reply") setContext({ mode: "reply", message, author: authorOf(message.from), snapshot: snapshotOf(message) });
    else if (key === "copy") {
      if (await copyMessageText(message.text)) showToast(i18nText("messageActions.copied"), "success");
    } else if (key === "edit") setContext({ mode: "edit", message, snapshot: snapshotOf(message) });
    else if (key === "delete") setDeleteTarget(message);
    else if (key === "deleteForMe") hide(message);
    else if (key === "saveImage" || key === "copyImage") runImageAction(key, message.mediaUrl);
    else if (key === "report") setReportTarget({ targetType: "marketplace_message", targetId: message.id });
  }

  function chooseDelete(choice) {
    const message = deleteTarget;
    setDeleteTarget(null);
    if (!message) return;
    if (choice === "everyone") deleteForEveryone(message);
    else hide(message);
  }

  // Saves the edit in the composer. Returns { ok }.
  async function submitEdit(text) {
    const message = context?.message;
    const body = String(text || "").trim();
    if (!message || !body) return { ok: false };
    if (!canStillEdit(message)) {
      setContext(null);
      showToast(i18nText("messageActions.editExpired"), "danger");
      return { ok: false };
    }
    setContext(null);
    if (body === message.text) return { ok: true };
    patch(message.id, { text: body, editedAt: new Date().toISOString() });
    try {
      const saved = await editMarketplaceMessage(message.id, body);
      patch(message.id, { text: saved?.preview ?? body, editedAt: saved?.edited_at || new Date().toISOString() });
      onChanged?.();
      return { ok: true };
    } catch (error) {
      unpatch(message.id);
      const expired = /15 minutes/i.test(String(error?.message || ""));
      showToast(expired ? i18nText("messageActions.editExpired") : i18nText("messageActions.editFailed"), "danger");
      return { ok: false };
    }
  }

  // Fields a reply adds to the message being sent, and to its optimistic copy.
  function replyFields() {
    if (context?.mode !== "reply") return {};
    return { replyToId: context.message.id, replySnapshot: context.snapshot };
  }

  return {
    authorOf,
    cancelContext: () => setContext(null),
    chooseDelete,
    closeDelete: () => setDeleteTarget(null),
    reportTarget,
    closeReport: () => setReportTarget(null),
    sendReport: async (answer) => {
      if (await submitReport(reportTarget, answer)) setReportTarget(null);
    },
    closeMenu,
    context,
    deleteTarget,
    editing: context?.mode === "edit",
    menu,
    openMenu,
    replyFields,
    runMenuAction,
    setContext,
    submitEdit,
    visible,
  };
}
