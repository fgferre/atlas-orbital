import { useEffect } from "react";

import {
  createDefaultViewportFramingState,
  resolveViewportFraming,
} from "../../lib/camera";
import { useStore } from "../../store";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import type { RightControlPanelId } from "./controlPanelConfig";

interface ViewportFramingTrackerProps {
  activePanel: RightControlPanelId | null;
}

const MEASURE_DEBOUNCE_MS = 140;

const toRectSnapshot = (element: Element | null) => {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
};

const queryPanelElement = (activePanel: RightControlPanelId | null) => {
  const panelIds =
    activePanel && activePanel !== "search"
      ? [`atlas-${activePanel}-panel`]
      : activePanel === "search"
        ? ["atlas-search-panel"]
        : [
            "atlas-search-panel",
            "atlas-scene-panel",
            "atlas-overlay-panel",
            "atlas-project-panel",
          ];

  for (const panelId of panelIds) {
    const panel = document.getElementById(panelId);
    if (panel) {
      return panel;
    }
  }

  return null;
};

export const ViewportFramingTracker = ({
  activePanel,
}: ViewportFramingTrackerProps) => {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const selectedId = useStore((state) => state.selectedId);
  const setViewportFraming = useStore((state) => state.setViewportFraming);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") {
        return;
      }

      setViewportFraming(
        createDefaultViewportFramingState(window.innerWidth, window.innerHeight)
      );
    };
  }, [setViewportFraming]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let animationFrameId = 0;
    let debounceTimer: number | null = null;

    const measure = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      setViewportFraming(
        resolveViewportFraming({
          viewportWidth,
          viewportHeight,
          isMobile,
          topBarRect: toRectSnapshot(
            document.querySelector('[data-ui-framing="top-bar"]')
          ),
          timelineRect: toRectSnapshot(
            document.querySelector('[data-ui-framing="timeline"]')
          ),
          sidebarRect: toRectSnapshot(
            document.querySelector('[data-ui-framing="sidebar"]')
          ),
          searchRailRect: toRectSnapshot(
            document.querySelector('[data-ui-framing="search-rail"]')
          ),
          settingsRailRect: toRectSnapshot(
            document.querySelector('[data-ui-framing="settings-rail"]')
          ),
          activePanelRect: toRectSnapshot(queryPanelElement(activePanel)),
        })
      );
    };

    const scheduleMeasure = (immediate = false) => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }

      if (immediate) {
        animationFrameId = window.requestAnimationFrame(measure);
        return;
      }

      debounceTimer = window.setTimeout(() => {
        animationFrameId = window.requestAnimationFrame(measure);
      }, MEASURE_DEBOUNCE_MS);
    };

    const resizeObserver = new ResizeObserver(() => scheduleMeasure());
    const elementsToObserve = [
      document.documentElement,
      document.body,
      document.querySelector('[data-ui-framing="top-bar"]'),
      document.querySelector('[data-ui-framing="timeline"]'),
      document.querySelector('[data-ui-framing="sidebar"]'),
      document.querySelector('[data-ui-framing="search-rail"]'),
      document.querySelector('[data-ui-framing="settings-rail"]'),
      queryPanelElement(activePanel),
    ];

    elementsToObserve.forEach((element) => {
      if (element instanceof Element) {
        resizeObserver.observe(element);
      }
    });

    const handleWindowChange = () => scheduleMeasure();

    scheduleMeasure(true);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("orientationchange", handleWindowChange);

    return () => {
      resizeObserver.disconnect();
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("orientationchange", handleWindowChange);
    };
  }, [activePanel, isMobile, selectedId, setViewportFraming]);

  return null;
};
