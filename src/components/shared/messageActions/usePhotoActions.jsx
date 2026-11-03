import { useCallback, useState } from "react";

import MessageActionMenu from "./MessageActionMenu";
import { ReportSheet } from "./MessageActionParts";
import { runImageAction, submitReport } from "./messageActionDom.js";
import { useMessageLongPress } from "./useMessageLongPress";
import { haptics } from "../../../Backend/services/feedbackService";

const PUBLIC_STORAGE = "/storage/v1/object/public/";

// Long-press on a photo shown full screen: Save image, Copy image and (for a
// public photo) Report, in the same card as chat messages, opening where the
// finger is, or from a "⋯" button (openFromButton). Returns { handlers,
// openFromButton, layer }: spread or combine the handlers on the photo, put
// openFromButton on the button, and render the layer once.
// photo: { url, reportedUserId, context }.
export function usePhotoActions({ url, reportedUserId = null, context = "photo" } = {}) {
  const [menu, setMenu] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const reportable = /^https:\/\//i.test(String(url || "")) && String(url).includes(PUBLIC_STORAGE);
  const closeMenu = useCallback(() => setMenu(null), []);

  const keys = ["saveImage", "copyImage", ...(reportable ? ["report"] : [])];

  // The card drops down under the button that was tapped.
  function openFromButton(event) {
    event?.stopPropagation?.();
    if (!url) return;
    haptics.light("messages");
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    setMenu({
      anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      bounds: { top: 0, bottom: viewportHeight, left: 0, right: window.innerWidth },
      align: "end",
      keys,
    });
  }

  const press = useMessageLongPress((element, point) => {
    const x = point?.x ?? window.innerWidth / 2;
    const y = point?.y ?? window.innerHeight / 2;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    setMenu({
      anchor: { top: y, bottom: y, left: x, right: x },
      bounds: { top: 0, bottom: viewportHeight, left: 0, right: window.innerWidth },
      align: x > window.innerWidth / 2 ? "end" : "start",
      keys,
    });
  }, { disabled: !url });

  function select(key) {
    if (key === "report") setReportOpen(true);
    else runImageAction(key, url);
  }

  const layer = (
    <>
      <MessageActionMenu state={menu} onClose={closeMenu} onSelect={select} />
      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmit={async (answer) => {
          const target = { targetType: "image", targetId: String(url).split(/[?#]/)[0], reportedUserId, context };
          if (await submitReport(target, answer)) setReportOpen(false);
        }}
      />
    </>
  );
  return { handlers: press.handlers, openFromButton, layer };
}
