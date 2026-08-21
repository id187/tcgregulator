import type { TabTutorialTabId } from "../game/tab-tutorial.ts";

const NAV_ITEMS: { id: TabTutorialTabId; label: string }[] = [
  { id: "distribution", label: "분포" },
  { id: "cards", label: "카드" },
  { id: "releases", label: "발매" },
  { id: "operations", label: "사업 운영" },
  { id: "community", label: "커뮤니티" },
  { id: "news", label: "소식" },
  { id: "finance", label: "재무" },
];

export function PrimaryNavigation({
  activeTab,
  disabled,
  hasBusinessEvent,
  phase,
  onActivate,
  onReturnToTitle,
}: {
  activeTab: TabTutorialTabId;
  disabled: boolean;
  hasBusinessEvent: boolean;
  phase: "running" | "ban-edit" | "release-edit" | "ended";
  onActivate: (tab: TabTutorialTabId) => void;
  onReturnToTitle: () => void;
}) {
  return (
    <nav className="primary-nav" aria-label="주요 메뉴">
      <div className="nav-scroll">
        {NAV_ITEMS.map((item) => {
          const alert =
            (item.id === "cards" && phase === "ban-edit") ||
            (item.id === "releases" && phase === "release-edit") ||
            (item.id === "operations" && hasBusinessEvent);

          return (
            <button
              className={activeTab === item.id ? "nav-item active" : "nav-item"}
              data-tutorial-control={`nav-${item.id}`}
              disabled={disabled}
              key={item.id}
              onClick={() => onActivate(item.id)}
              type="button"
            >
              <span className="nav-item-label">{item.label}</span>
              {item.id === "cards" ||
              item.id === "releases" ||
              item.id === "operations" ? (
                <span
                  aria-hidden={!alert}
                  className={`nav-count nav-alert${alert ? "" : " is-placeholder"}`}
                >
                  !
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
