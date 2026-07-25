import { useEffect, useRef } from "react";

import type { RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

interface UseDialogFocusOptions {
  isOpen: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose?: () => void;
}

const getFocusableElements = (container: HTMLElement | null) => {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true"
  );
};

export const useDialogFocus = ({
  isOpen,
  containerRef,
  initialFocusRef,
  onClose,
}: UseDialogFocusOptions) => {
  // Five of the six call sites pass an inline `onClose` arrow, so keeping it
  // in the effect's dependency list meant the trap tore down and re-armed on
  // every parent render — and the re-arm runs `focusInitialTarget()`. A
  // keyboard user toggling a control inside LayersPanel had focus yanked back
  // to the panel's Close button, making the toggle list impossible to walk.
  // The ref keeps the latest handler without tying it to focus lifecycle.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    const container = containerRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusInitialTarget = () => {
      const firstFocusable =
        initialFocusRef?.current ?? getFocusableElements(container)[0];

      if (firstFocusable) {
        firstFocusable.focus();
        return;
      }

      container?.focus();
    };

    const focusFrame = window.requestAnimationFrame(focusInitialTarget);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!container) {
        return;
      }

      if (event.key === "Escape") {
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [containerRef, initialFocusRef, isOpen]);
};
