import type { TabTutorialTabId } from "../game/tab-tutorial.ts";
import type {
  HandoverTabAvailability,
  HandoverTabAvailabilityMap,
} from "../game/handover.ts";

const NAV_ITEMS: { id: TabTutorialTabId; label: string }[] = [
  { id: "distribution", label: "분포" },
  { id: "cards", label: "카드" },
  { id: "releases", label: "발매" },
  { id: "operations", label: "사업 운영" },
  { id: "community", label: "커뮤니티" },
  { id: "news", label: "소식" },
  { id: "finance", label: "재무" },
];

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <rect height="10" rx="2" width="16" x="4" y="11" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function PrimaryNavigation({
  activeTab,
  disabled,
  hasBusinessEvent,
  phase,
  onActivate,
  onLockedActivate,
  onReturnToTitle,
  tabAvailability,
}: {
  activeTab: TabTutorialTabId;
  disabled: boolean;
  hasBusinessEvent: boolean;
  phase: "running" | "ban-edit" | "release-edit" | "ended";
  onActivate: (tab: TabTutorialTabId) => void;
  onLockedActivate?: (
    tab: TabTutorialTabId,
    availability: HandoverTabAvailability,
  ) => void;
  onReturnToTitle: () => void;
  tabAvailability?: Partial<HandoverTabAvailabilityMap>;
}) {
  return (
    <nav className="primary-nav" aria-label="주요 메뉴">
      <div className="nav-scroll">
        {NAV_ITEMS.map((item) => {
          const availability = tabAvailability?.[item.id];
          const locked = availability?.unlocked === false;
          const lockDescriptionId = locked
            ? `primary-nav-${item.id}-lock`
            : undefined;
          const alert =
            (item.id === "cards" && phase === "ban-edit") ||
            (item.id === "releases" && phase === "release-edit") ||
            (item.id === "operations" && hasBusinessEvent);
          const className = [
            "nav-item",
            activeTab === item.id ? "active" : "",
            locked ? "is-locked" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              aria-current={activeTab === item.id ? "page" : undefined}
              aria-describedby={lockDescriptionId}
              aria-disabled={locked || undefined}
              className={className}
              data-tutorial-control={`nav-${item.id}`}
              disabled={disabled}
              key={item.id}
              onClick={() => {
                if (locked && availability) {
                  onLockedActivate?.(item.id, availability);
                  return;
                }
                onActivate(item.id);
              }}
              title={locked ? availability?.reason ?? undefined : undefined}
              type="button"
            >
              <span className="nav-item-label">{item.label}</span>
              {locked && availability ? (
                <span aria-hidden="true" className="nav-lock-indicator">
                  <LockIcon />
                </span>
              ) : item.id === "cards" ||
                item.id === "releases" ||
                item.id === "operations" ? (
                <span
                  aria-hidden={!alert}
                  className={`nav-count nav-alert${alert ? "" : " is-placeholder"}`}
                >
                  !
                </span>
              ) : null}
              {locked && availability?.reason ? (
                <span className="sr-only" id={lockDescriptionId}>
                  {availability.reason}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        className="reset-button"
        data-tutorial-control="home"
        onClick={onReturnToTitle}
        type="button"
      >
        <span aria-hidden="true">←</span>
        PLAY 화면
      </button>
    </nav>
  );
}
