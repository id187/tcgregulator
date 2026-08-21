import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { BrandMark } from "./BrandMark";

export type TitleScreenMotionPreference = "system" | "reduced";

export type TitleScreenSettings = {
  bgmVolume: number;
  soundEnabled: boolean;
  impactEffectsEnabled: boolean;
  motionPreference: TitleScreenMotionPreference;
};

export type TitleScreenSettingsUpdate = <
  Key extends keyof TitleScreenSettings,
>(
  key: Key,
  value: TitleScreenSettings[Key],
) => void;

export type TitleScreenSavedGame = {
  available: boolean;
  summary: string;
};

export type TitleScreenProps = {
  busy: boolean;
  savedGame: TitleScreenSavedGame;
  message?: string | null;
  settings: TitleScreenSettings;
  onContinue: () => void;
  onNewGame: () => void;
  onSettingsChange: TitleScreenSettingsUpdate;
  onSettingsOpen?: () => void;
  onSettingsClose?: () => void;
  onSoundTest?: () => void;
  onTutorialReset: () => void;
  children?: ReactNode;
};

type TitleScreenMode = "main" | "settings";

export function TitleScreen({
  busy,
  children,
  message,
  onContinue,
  onNewGame,
  onSettingsChange,
  onSettingsClose,
  onSettingsOpen,
  onSoundTest,
  onTutorialReset,
  savedGame,
  settings,
}: TitleScreenProps) {
  const [mode, setMode] = useState<TitleScreenMode>("main");
  const [tutorialResetConfirmed, setTutorialResetConfirmed] = useState(false);
  const titleId = useId();
  const savedGameSummaryId = useId();
  const mainHeadingRef = useRef<HTMLHeadingElement>(null);
  const settingsHeadingRef = useRef<HTMLHeadingElement>(null);
  const hasNavigatedRef = useRef(false);
  const savedGameDayLabel = savedGame.available
    ? savedGame.summary.match(/^DAY\s+\d+/)?.[0] ?? null
    : null;

  useEffect(() => {
    if (!hasNavigatedRef.current) return;

    const heading = mode === "settings"
      ? settingsHeadingRef.current
      : mainHeadingRef.current;
    heading?.focus();
  }, [mode]);

  const openSettings = () => {
    hasNavigatedRef.current = true;
    setMode("settings");
    onSettingsOpen?.();
  };

  const closeSettings = () => {
    hasNavigatedRef.current = true;
    setMode("main");
    onSettingsClose?.();
  };

  return (
    <main
      aria-busy={busy}
      className={`title-screen title-screen--${mode}${
        settings.motionPreference === "reduced"
          ? " title-screen--reduced-motion"
          : ""
      }`}
    >
      {mode === "main" ? (
        <section
          aria-labelledby={titleId}
          className="title-screen__main-screen"
        >
          <header className="title-screen__brand">
            <BrandMark className="title-screen__brand-mark" />
            <h1
              className="title-screen__title"
              id={titleId}
              ref={mainHeadingRef}
              tabIndex={-1}
            >
              TCG REGULATOR
            </h1>
          </header>

          <nav aria-label="타이틀 메뉴" className="title-screen__actions">
            <button
              className="title-screen__action title-screen__action--new-game"
              disabled={busy}
              onClick={onNewGame}
              type="button"
            >
              처음부터
            </button>
            <button
              aria-describedby={savedGameSummaryId}
              className="title-screen__action title-screen__action--continue"
              disabled={busy || !savedGame.available}
              onClick={onContinue}
              type="button"
            >
              이어하기{savedGameDayLabel ? ` · ${savedGameDayLabel}` : ""}
            </button>
            <button
              className="title-screen__action title-screen__action--settings"
              onClick={openSettings}
              type="button"
            >
              SETTINGS
            </button>
          </nav>

          <p
            aria-live="polite"
            className="title-screen__saved-game-summary sr-only"
            id={savedGameSummaryId}
          >
            {savedGame.summary}
          </p>
        </section>
      ) : (
        <section
          aria-labelledby={titleId}
          className="settings-screen title-screen__settings-screen"
        >
          <header className="settings-screen__header">
            <button
              aria-label="메인 화면으로 돌아가기"
              className="settings-screen__back-button"
              onClick={closeSettings}
              type="button"
            >
              메인 화면으로
            </button>
            <h1
              className="settings-screen__title"
              id={titleId}
              ref={settingsHeadingRef}
              tabIndex={-1}
            >
              SETTINGS
            </h1>
          </header>

          <div
            aria-label="인터페이스 설정"
            className="settings-screen__options"
            role="group"
          >
            <button
              aria-pressed={settings.soundEnabled}
              className="settings-screen__option settings-screen__option--sound"
              data-sound="none"
              onClick={() =>
                onSettingsChange("soundEnabled", !settings.soundEnabled)
              }
              type="button"
            >
              <span className="settings-screen__option-label">효과음</span>
              <strong className="settings-screen__option-value">
                {settings.soundEnabled ? "ON" : "OFF"}
              </strong>
            </button>
            <button
              aria-pressed={settings.impactEffectsEnabled}
              className="settings-screen__option settings-screen__option--impact"
              onClick={() =>
                onSettingsChange(
                  "impactEffectsEnabled",
                  !settings.impactEffectsEnabled,
                )
              }
              type="button"
            >
              <span className="settings-screen__option-label">
                파급 화면 효과
              </span>
              <strong className="settings-screen__option-value">
                {settings.impactEffectsEnabled ? "ON" : "OFF"}
              </strong>
            </button>
            <button
              aria-pressed={settings.motionPreference === "reduced"}
              className="settings-screen__option settings-screen__option--motion"
              onClick={() =>
                onSettingsChange(
                  "motionPreference",
                  settings.motionPreference === "reduced" ? "system" : "reduced",
                )
              }
              type="button"
            >
              <span className="settings-screen__option-label">모션 감소</span>
              <strong className="settings-screen__option-value">
                {settings.motionPreference === "reduced"
                  ? "강제 감소"
                  : "시스템 설정"}
              </strong>
            </button>
            <button
              className="settings-screen__option settings-screen__option--tutorial"
              onClick={() => {
                onTutorialReset();
                setTutorialResetConfirmed(true);
              }}
              title="안내 기록을 초기화합니다. 전체 인수인계 안내는 새 임기를 시작하면 DAY 0부터 다시 표시됩니다."
              type="button"
            >
              <span className="settings-screen__option-label">
                안내 처음부터 다시 보기
              </span>
              <strong
                aria-live="polite"
                className="settings-screen__option-value"
              >
                {tutorialResetConfirmed ? "초기화됨" : "RESET"}
              </strong>
            </button>
            {onSoundTest ? (
              <button
                className="settings-screen__option settings-screen__option--sound-test"
                data-sound="impact"
                disabled={!settings.soundEnabled}
                onClick={onSoundTest}
                type="button"
              >
                <span className="settings-screen__option-label">
                  효과음 테스트
                </span>
                <strong className="settings-screen__option-value">
                  {settings.soundEnabled ? "재생" : "OFF"}
                </strong>
              </button>
            ) : null}
          </div>
        </section>
      )}

      {message ? (
        <p
          aria-live="polite"
          className="title-screen__message"
          role="status"
        >
          {message}
        </p>
      ) : null}
      {children}
    </main>
  );
}
