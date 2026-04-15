export interface RectSnapshot {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export interface ViewportFramingState {
  viewportWidth: number;
  viewportHeight: number;
  fitInsets: EdgeInsets;
  overlayInsets: EdgeInsets;
  usableRect: ViewportRect;
  overlayRect: ViewportRect;
  compositionOffsetXPx: number;
  compositionOffsetYPx: number;
  signature: string;
}

interface ResolveViewportFramingParams {
  viewportWidth: number;
  viewportHeight: number;
  isMobile: boolean;
  topBarRect?: RectSnapshot | null;
  timelineRect?: RectSnapshot | null;
  sidebarRect?: RectSnapshot | null;
  searchRailRect?: RectSnapshot | null;
  settingsRailRect?: RectSnapshot | null;
  activePanelRect?: RectSnapshot | null;
}

const MIN_RECT_SIDE_PX = 96;
const FIT_GAP_DESKTOP_PX = 16;
const FIT_GAP_MOBILE_PX = 12;
const OVERLAY_GAP_DESKTOP_PX = 18;
const OVERLAY_GAP_MOBILE_PX = 14;

const createRectFromInsets = (
  viewportWidth: number,
  viewportHeight: number,
  insets: EdgeInsets
): ViewportRect => {
  const maxLeft = Math.max(0, viewportWidth - MIN_RECT_SIDE_PX);
  const maxTop = Math.max(0, viewportHeight - MIN_RECT_SIDE_PX);
  const left = Math.min(Math.max(0, insets.left), maxLeft);
  const top = Math.min(Math.max(0, insets.top), maxTop);
  const rightInset = Math.min(Math.max(0, insets.right), maxLeft);
  const bottomInset = Math.min(Math.max(0, insets.bottom), maxTop);
  const right = Math.max(left + MIN_RECT_SIDE_PX, viewportWidth - rightInset);
  const bottom = Math.max(top + MIN_RECT_SIDE_PX, viewportHeight - bottomInset);
  const width = Math.max(MIN_RECT_SIDE_PX, right - left);
  const height = Math.max(MIN_RECT_SIDE_PX, bottom - top);

  return {
    left,
    top,
    width,
    height,
    right,
    bottom,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
};

const rectIntersectsViewport = (
  rect: RectSnapshot | null | undefined,
  viewportWidth: number,
  viewportHeight: number
) => {
  if (!rect) {
    return false;
  }

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewportWidth &&
    rect.top < viewportHeight
  );
};

const roundInset = (value: number) => Math.max(0, Math.round(value));
const roundSigned = (value: number) => Math.round(value);

const withBottomInset = (
  current: number,
  rect: RectSnapshot | null | undefined,
  viewportHeight: number,
  gapPx: number
) => (rect ? Math.max(current, viewportHeight - rect.top + gapPx) : current);

const withTopInset = (
  current: number,
  rect: RectSnapshot | null | undefined,
  gapPx: number
) => (rect ? Math.max(current, rect.bottom + gapPx) : current);

const withLeftInset = (
  current: number,
  rect: RectSnapshot | null | undefined,
  gapPx: number
) => (rect ? Math.max(current, rect.right + gapPx) : current);

const withRightInset = (
  current: number,
  rect: RectSnapshot | null | undefined,
  viewportWidth: number,
  gapPx: number
) => (rect ? Math.max(current, viewportWidth - rect.left + gapPx) : current);

const applyRailOverlayInset = (
  currentInsets: EdgeInsets,
  rect: RectSnapshot | null | undefined,
  viewportWidth: number,
  gapPx: number
) => {
  if (!rect) {
    return currentInsets;
  }

  const anchoredLeft = rect.left + rect.width / 2 < viewportWidth / 2;
  if (anchoredLeft) {
    return {
      ...currentInsets,
      left: Math.max(currentInsets.left, rect.right + gapPx),
    };
  }

  return {
    ...currentInsets,
    right: Math.max(currentInsets.right, viewportWidth - rect.left + gapPx),
  };
};

export const createDefaultViewportFramingState = (
  viewportWidth = 0,
  viewportHeight = 0
): ViewportFramingState => {
  const usableRect = createRectFromInsets(viewportWidth, viewportHeight, {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  return {
    viewportWidth,
    viewportHeight,
    fitInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    overlayInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    usableRect,
    overlayRect: usableRect,
    compositionOffsetXPx: 0,
    compositionOffsetYPx: 0,
    signature: "0:0:0:0:0:0:0:0:0:0",
  };
};

export const resolveViewportFraming = ({
  viewportWidth,
  viewportHeight,
  isMobile,
  topBarRect,
  timelineRect,
  sidebarRect,
  searchRailRect,
  settingsRailRect,
  activePanelRect,
}: ResolveViewportFramingParams): ViewportFramingState => {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return createDefaultViewportFramingState(viewportWidth, viewportHeight);
  }

  const fitGapPx = isMobile ? FIT_GAP_MOBILE_PX : FIT_GAP_DESKTOP_PX;
  const overlayGapPx = isMobile
    ? OVERLAY_GAP_MOBILE_PX
    : OVERLAY_GAP_DESKTOP_PX;

  const visibleTopBar = rectIntersectsViewport(
    topBarRect,
    viewportWidth,
    viewportHeight
  )
    ? topBarRect
    : null;
  const visibleTimeline = rectIntersectsViewport(
    timelineRect,
    viewportWidth,
    viewportHeight
  )
    ? timelineRect
    : null;
  const visibleSidebar = rectIntersectsViewport(
    sidebarRect,
    viewportWidth,
    viewportHeight
  )
    ? sidebarRect
    : null;
  const visibleSearchRail = rectIntersectsViewport(
    searchRailRect,
    viewportWidth,
    viewportHeight
  )
    ? searchRailRect
    : null;
  const visibleSettingsRail = rectIntersectsViewport(
    settingsRailRect,
    viewportWidth,
    viewportHeight
  )
    ? settingsRailRect
    : null;
  const visibleActivePanel = rectIntersectsViewport(
    activePanelRect,
    viewportWidth,
    viewportHeight
  )
    ? activePanelRect
    : null;

  let fitInsets: EdgeInsets = {
    top: fitGapPx,
    right: fitGapPx,
    bottom: fitGapPx,
    left: fitGapPx,
  };

  fitInsets.top = withTopInset(fitInsets.top, visibleTopBar, fitGapPx);
  fitInsets.bottom = withBottomInset(
    fitInsets.bottom,
    visibleTimeline,
    viewportHeight,
    fitGapPx
  );

  if (visibleSidebar) {
    if (isMobile) {
      fitInsets.bottom = withBottomInset(
        fitInsets.bottom,
        visibleSidebar,
        viewportHeight,
        fitGapPx
      );
    } else {
      fitInsets.left = withLeftInset(fitInsets.left, visibleSidebar, fitGapPx);
    }
  }

  if (visibleActivePanel && !isMobile) {
    fitInsets.right = withRightInset(
      fitInsets.right,
      visibleActivePanel,
      viewportWidth,
      fitGapPx
    );
  }

  fitInsets = {
    top: roundInset(fitInsets.top),
    right: roundInset(fitInsets.right),
    bottom: roundInset(fitInsets.bottom),
    left: roundInset(fitInsets.left),
  };

  let overlayInsets: EdgeInsets = {
    top: overlayGapPx,
    right: overlayGapPx,
    bottom: overlayGapPx,
    left: overlayGapPx,
  };

  overlayInsets.top = withTopInset(
    overlayInsets.top,
    visibleTopBar,
    overlayGapPx
  );
  overlayInsets.bottom = withBottomInset(
    overlayInsets.bottom,
    visibleTimeline,
    viewportHeight,
    overlayGapPx
  );

  if (visibleSidebar) {
    if (isMobile) {
      overlayInsets.bottom = withBottomInset(
        overlayInsets.bottom,
        visibleSidebar,
        viewportHeight,
        overlayGapPx
      );
    } else {
      overlayInsets.left = withLeftInset(
        overlayInsets.left,
        visibleSidebar,
        overlayGapPx
      );
    }
  }

  overlayInsets = applyRailOverlayInset(
    overlayInsets,
    visibleSearchRail,
    viewportWidth,
    overlayGapPx
  );
  overlayInsets = applyRailOverlayInset(
    overlayInsets,
    visibleSettingsRail,
    viewportWidth,
    overlayGapPx
  );

  if (visibleActivePanel) {
    overlayInsets = applyRailOverlayInset(
      overlayInsets,
      visibleActivePanel,
      viewportWidth,
      overlayGapPx
    );
    overlayInsets.top = withTopInset(
      overlayInsets.top,
      visibleActivePanel,
      overlayGapPx
    );
    overlayInsets.bottom = withBottomInset(
      overlayInsets.bottom,
      visibleActivePanel,
      viewportHeight,
      overlayGapPx
    );
  }

  overlayInsets = {
    top: roundInset(overlayInsets.top),
    right: roundInset(overlayInsets.right),
    bottom: roundInset(overlayInsets.bottom),
    left: roundInset(overlayInsets.left),
  };

  const usableRect = createRectFromInsets(
    viewportWidth,
    viewportHeight,
    fitInsets
  );
  const overlayRect = createRectFromInsets(
    viewportWidth,
    viewportHeight,
    overlayInsets
  );

  const compositionOffsetXPx = usableRect.centerX - viewportWidth / 2;
  const compositionOffsetYPx = usableRect.centerY - viewportHeight / 2;

  return {
    viewportWidth,
    viewportHeight,
    fitInsets,
    overlayInsets,
    usableRect,
    overlayRect,
    compositionOffsetXPx,
    compositionOffsetYPx,
    signature: [
      fitInsets.left,
      fitInsets.right,
      fitInsets.top,
      fitInsets.bottom,
      overlayInsets.left,
      overlayInsets.right,
      overlayInsets.top,
      overlayInsets.bottom,
      roundSigned(compositionOffsetXPx),
      roundSigned(compositionOffsetYPx),
    ].join(":"),
  };
};
