import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { AI_CHAT_OPEN_EVENT, AI_CLOSE_EVENT, AI_OPEN_EVENT, getAiSurface } from "../../Backend/services/ai/aiSurfaceService";
import { useAiAvailability } from "../../Backend/hooks/useAiTask";

// KAI — the single mounted host.
//
// Mounted once in App.jsx. It renders nothing until some screen calls
// `openAiAssistant(...)`, and the sheet itself is lazy so no AI code is
// downloaded by someone who never opens it.

const AiAssistantSheet = lazy(() => import("./AiAssistantSheet.jsx"));
const AiChatPanel = lazy(() => import("./chat/AiChatPanel.jsx"));

export default function AiAssistantHost() {
  const [request, setRequest] = useState(null);
  const [open, setOpen] = useState(false);
  const [chatRequest, setChatRequest] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const closeTimerRef = useRef(null);
  const { available, checked } = useAiAvailability();

  // Closing hides the sheet first and drops the request afterwards, so the
  // exit animation has something to animate rather than vanishing.
  const close = useCallback(() => {
    setOpen(false);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setRequest(null), 260);
  }, []);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  const closeChat = useCallback(() => setChatOpen(false), []);

  // The conversation lives in its own store, so the chat request can stay
  // mounted after closing; reopening shows the same conversation.
  useEffect(() => {
    function onOpenChat(event) {
      const detail = event.detail || {};
      const current = getAiSurface();
      setOpen(false);
      setChatRequest({
        key: `${Date.now()}`,
        surface: detail.surface || current.surface,
        // A screen that opens the chat for another section does not inherit
        // this section's role.
        role: detail.role || (!detail.surface || detail.surface === current.surface ? current.role : ""),
        screen: detail.screen || current.screen,
        title: detail.title || "",
        message: detail.message || "",
        autoSend: Boolean(detail.autoSend),
        selection: Array.isArray(detail.selection) ? detail.selection : [],
        facts: detail.facts || null,
        onInsert: typeof detail.onInsert === "function" ? detail.onInsert : null,
        insertLabel: detail.insertLabel || "",
      });
      setChatOpen(true);
    }
    window.addEventListener(AI_CHAT_OPEN_EVENT, onOpenChat);
    return () => window.removeEventListener(AI_CHAT_OPEN_EVENT, onOpenChat);
  }, []);

  useEffect(() => {
    function onOpen(event) {
      const detail = event.detail || {};
      const current = getAiSurface();
      window.clearTimeout(closeTimerRef.current);
      setOpen(true);
      setRequest({
        surface: detail.surface || current.surface,
        screen: detail.screen || current.screen,
        title: detail.title || "",
        task: detail.task || "",
        input: detail.input || null,
        text: detail.text || "",
        actions: detail.actions || null,
        onInsert: typeof detail.onInsert === "function" ? detail.onInsert : null,
        insertLabel: detail.insertLabel || "",
        buildInput: typeof detail.buildInput === "function" ? detail.buildInput : null,
        sourceLabel: detail.sourceLabel || "",
        hideAsk: Boolean(detail.hideAsk),
        hidePrompts: Boolean(detail.hidePrompts),
        askTask: detail.askTask || "",
        buildAskInput: typeof detail.buildAskInput === "function" ? detail.buildAskInput : null,
        askPlaceholder: detail.askPlaceholder || "",
        prompts: Array.isArray(detail.prompts) ? detail.prompts.filter(Boolean).slice(0, 4) : null,
        extraActions: Array.isArray(detail.extraActions)
          ? detail.extraActions.filter((action) => action?.label && typeof action.run === "function")
          : [],
      });
    }

    window.addEventListener(AI_OPEN_EVENT, onOpen);
    window.addEventListener(AI_CLOSE_EVENT, close);
    return () => {
      window.removeEventListener(AI_OPEN_EVENT, onOpen);
      window.removeEventListener(AI_CLOSE_EVENT, close);
    };
  }, [close]);

  // A deployment without a Gemini key simply never opens anything.
  if (checked && !available) return null;
  if (!request && !chatRequest) return null;

  return (
    <Suspense fallback={null}>
      {request ? <AiAssistantSheet open={open} request={request} onClose={close} /> : null}
      {chatRequest ? <AiChatPanel open={chatOpen} request={chatRequest} onClose={closeChat} /> : null}
    </Suspense>
  );
}
