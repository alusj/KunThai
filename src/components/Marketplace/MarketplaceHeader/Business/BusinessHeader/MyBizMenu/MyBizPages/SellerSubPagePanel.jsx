import { SlidePanel, useSlidePanel } from "../../../../../../shared/SlideTransition";

// A sub-screen covers its seller menu page. The panel is anchored to the
// menu's fixed screen area (MyBizMenu), not to the page, and scrolls on its
// own: the panel clips, so a page taller than the phone was cut off and its
// lower fields and Save buttons could not be reached.
export default function SellerSubPagePanel({ children, currentView, className = "" }) {
  const activeView = currentView === "menu" ? null : currentView;
  const { visibleKey, action } = useSlidePanel(activeView);

  if (!visibleKey) return null;

  return (
    <SlidePanel action={action} className={className}>
      <div className="kt-safe-scroll-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain" data-back-swipe-scope>
        {children(visibleKey)}
      </div>
    </SlidePanel>
  );
}
