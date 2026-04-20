import type { RightControlPanelId } from "./controlPanelConfig";

const RAIL_TAB_ICON_CLASS = "h-[1.2rem] w-[1.2rem] shrink-0";

export const RailTabContent = ({
  panelId,
  label,
}: {
  panelId: RightControlPanelId;
  label: string;
}) => (
  <span className="pointer-events-none flex flex-col items-center justify-start gap-[0.5rem] leading-none">
    <RailTabIcon panelId={panelId} />
    <span className="drawer-tab-label text-[7.5px] leading-none tracking-[0.2em] text-white">
      {label}
    </span>
  </span>
);

const RailTabIcon = ({ panelId }: { panelId: RightControlPanelId }) => {
  if (panelId === "search") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className={RAIL_TAB_ICON_CLASS}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m19 19-3.97-3.97m0 0A6 6 0 1 0 6.57 6.57a6 6 0 0 0 8.485 8.485Z"
        />
      </svg>
    );
  }

  if (panelId === "view") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className={RAIL_TAB_ICON_CLASS}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 12s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 14.25A2.25 2.25 0 1 0 12 9.75a2.25 2.25 0 0 0 0 4.5Z"
        />
      </svg>
    );
  }

  if (panelId === "display") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className={RAIL_TAB_ICON_CLASS}
        aria-hidden="true"
      >
        <rect x="4.5" y="5" width="15" height="11" rx="1.5" />
        <path d="M9 19h6" strokeLinecap="round" />
        <path d="M12 16v3" strokeLinecap="round" />
      </svg>
    );
  }

  if (panelId === "a11y") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className={RAIL_TAB_ICON_CLASS}
        aria-hidden="true"
      >
        <circle cx="12" cy="5.25" r="1.9" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 9.25h14M9.15 9.5v3.65L8 18.45M14.85 9.5v3.65L16 18.45M9.9 13h4.2"
        />
      </svg>
    );
  }

  return null;
};
