import MessageImage from "../shared/MessageImage";
import VoiceNotePlayer from "../shared/voice/VoiceNotePlayer";
import MessageActionMenu from "../shared/messageActions/MessageActionMenu";
import { DeleteMessageDialog, DeletedMessageBody, MessageReplyQuote, ReportSheet } from "../shared/messageActions/MessageActionParts";
import { revealMessage } from "../shared/messageActions/messageActionDom.js";
import { useMessageLongPress } from "../shared/messageActions/useMessageLongPress";
import { formatMessageTime } from "../../Backend/utils/formatMessageTime";
import { t as i18nText } from "../../i18n/index";
import { useI18n as useUiLocale } from "../../i18n/index.js";

// The bubbles of an UrMall chat (buyer Messages and seller Customer Care), with
// the long-press action menu. chat comes from useMarketplaceMessageActions.
export default function MarketplaceChatMessages({ messages, myRole, chat, threadRef, attachmentAlt, sendingLabel }) {
  useUiLocale();
  return (
    <>
      {messages.map((message) => (
        <MarketplaceChatBubble
          key={message.id}
          message={message}
          mine={message.from === myRole}
          selected={chat.menu?.message?.id === message.id}
          quoteAuthor={message.replySnapshot ? chat.authorOf(message.replySnapshot.from) : ""}
          onLongPress={chat.openMenu}
          onOpenQuote={(replyToId) => revealMessage(threadRef?.current, replyToId)}
          attachmentAlt={attachmentAlt}
          sendingLabel={sendingLabel}
        />
      ))}
      <MessageActionMenu state={chat.menu} onClose={chat.closeMenu} onSelect={chat.runMenuAction} />
      <DeleteMessageDialog open={Boolean(chat.deleteTarget)} onClose={chat.closeDelete} onChoose={chat.chooseDelete} />
      <ReportSheet open={Boolean(chat.reportTarget)} onClose={chat.closeReport} onSubmit={chat.sendReport} />
    </>
  );
}

function MarketplaceChatBubble({ message, mine, selected, quoteAuthor, onLongPress, onOpenQuote, attachmentAlt, sendingLabel }) {
  useUiLocale();
  const press = useMessageLongPress((element) => onLongPress?.(message, element), { disabled: message.pending });
  const time = message.pending ? sendingLabel : formatMessageTime(message.createdAt);
  const edited = message.editedAt && !message.deletedAt ? ` · ${i18nText("messageActions.edited")}` : "";

  return (
    <div
      {...press.handlers}
      data-message-id={message.id}
      data-pressing={press.pressing ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      className={`kt-message-pressable max-w-[86%] rounded-2xl px-4 py-3 text-sm font-medium shadow-sm ${
        mine ? "ml-auto bg-emerald-600 text-white" : "border border-gray-200 bg-white text-gray-700"
      }`}
    >
      {message.deletedAt ? (
        <DeletedMessageBody tone={mine ? "emerald" : "light"} />
      ) : (
        <>
          {message.replySnapshot ? (
            <MessageReplyQuote
              snapshot={message.replySnapshot}
              author={quoteAuthor}
              tone={mine ? "emerald" : "light"}
              onOpen={() => onOpenQuote?.(message.replyToId)}
            />
          ) : null}
          {message.mediaType === "image" && message.mediaUrl ? (
            <MessageImage mediaUrl={message.mediaUrl} alt={attachmentAlt} pending={message.pending} className="mb-2" />
          ) : null}
          {message.mediaType === "audio" && message.mediaUrl ? (
            <VoiceNotePlayer
              src={message.mediaUrl}
              seed={message.id}
              loading={message.pending}
              tone={mine ? "emerald" : "light"}
              className={message.text ? "mb-2" : ""}
            />
          ) : null}
          {message.text ? <p>{message.text}</p> : null}
        </>
      )}
      <span className={`mt-1 block text-[10px] font-bold ${mine ? "text-white/70" : "text-gray-400"}`}>
        {time}{edited}
      </span>
    </div>
  );
}
