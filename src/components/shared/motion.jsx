import { createElement } from "react";

export const motionTimings = {
  press: 140,
  small: 190,
  page: 260,
  sheet: 300,
};

export const fadeSlideClass = "kt-page-fade-slide";
export const bottomSheetClass = "kt-bottom-sheet-transition";

export function PageTransition({ active = true, children, className = "" }) {
  return (
    <div className={`${active ? fadeSlideClass : ""} ${className}`}>
      {children}
    </div>
  );
}

export function StepSlideTransition({ children, className = "", direction = "forward", stepKey }) {
  const slideClass = direction === "backward" ? "kt-form-step-slide-backward" : "kt-form-step-slide-forward";

  return (
    <div key={stepKey} className={`${slideClass} ${className}`}>
      {children}
    </div>
  );
}

export function PressableButton({
  as = "button",
  children,
  className = "",
  disabled = false,
  type = "button",
  ...props
}) {
  const elementProps = {
    ...props,
    className: `kt-pressable ${className}`,
    disabled,
  };

  if (as === "button") {
    elementProps.type = type;
  }

  return createElement(as, elementProps, children);
}

export function MotionCard({ as = "div", children, className = "", ...props }) {
  return createElement(as, {
    ...props,
    className: `kt-motion-card ${className}`,
  }, children);
}
