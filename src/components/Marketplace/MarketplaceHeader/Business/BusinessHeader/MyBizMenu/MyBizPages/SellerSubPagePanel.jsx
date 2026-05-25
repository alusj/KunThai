import { SlidePanel, useSlidePanel } from "../../../../../../shared/SlideTransition";

export default function SellerSubPagePanel({ children, currentView, className = "" }) {
  const activeView = currentView === "menu" ? null : currentView;
  const { visibleKey, action } = useSlidePanel(activeView);

  if (!visibleKey) return null;

  return (
    <SlidePanel action={action} className={className}>
      {children(visibleKey)}
    </SlidePanel>
  );
}
