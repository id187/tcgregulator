import { useState } from "react";

import { THEME_BY_ID } from "../game/content.ts";
import { getProspectiveSupportKeyword } from "../game/engine.ts";
import { getGenericCard } from "../game/generic-card-catalog.ts";
import { getPlayKeyword } from "../game/play-keywords.ts";
import {
  canToggleReleaseOption,
  getDirectReleaseSelectionCount,
  isCompleteReleaseSelection,
} from "../game/release-selection.ts";
import type {
  GameState,
  PowerAdjustment,
  ReleaseOption,
  ReleaseSelection,
} from "../game/types.ts";
import { RegulatorCardFace } from "./RegulatorCardFace.tsx";

const POWER_ADJUSTMENTS = [-3, -2, -1, 0, 1, 2, 3] as const satisfies
  readonly PowerAdjustment[];

function optionName(option: ReleaseOption): string {
  if (option.kind === "generic") {
    return getGenericCard(option.genericCardId)?.name ?? "범용 카드";
  }
  if (option.kind === "reprint") {
    const themePart = THEME_BY_ID[option.themeId]?.parts.find(
      (part) => part.id === option.cardId,
    );
    return `재판 · ${
      themePart?.name ?? getGenericCard(option.cardId)?.name ?? "출시 카드"
    }`;
  }
  const theme = THEME_BY_ID[option.themeId];
  if (option.kind === "new-theme") return theme?.name ?? "신테마";
  return theme?.shortName ?? "테마";
}

function optionNameLines(option: ReleaseOption): readonly string[] {
  return [optionName(option)];
}

function optionKeywordLabels(
  game: GameState,
  option: ReleaseOption,
): readonly string[] {
  if (option.kind === "new-theme") {
    return THEME_BY_ID[option.themeId].playKeywords.map(
      (keyword) => getPlayKeyword(keyword).label,
    );
  }
  if (option.kind === "support") {
    const keyword = getProspectiveSupportKeyword(
      game,
      option.themeId,
      option.direction,
    );
    return keyword ? [`+ ${getPlayKeyword(keyword).label}`] : [];
  }
  if (option.kind === "generic") {
    const card = getGenericCard(option.genericCardId);
    return card ? [getPlayKeyword(card.keyword).label] : [];
  }
  return [];
}

function optionRole(option: ReleaseOption): string {
  if (option.kind === "new-theme") return "신테마";
  if (option.kind === "support") return "지원";
  if (option.kind === "generic") return "범용";
  return "예약 재판";
}

function optionEffect(game: GameState, option: ReleaseOption): string {
  if (option.kind === "generic") {
    return (
      getGenericCard(option.genericCardId)?.description ??
      "여러 테마가 공유할 수 있는 범용 선택지를 추가합니다."
    );
  }
  if (option.kind === "reprint") {
    return "절판된 핵심 카드의 접근성을 회복하고 보유가치의 방향을 바꿉니다.";
  }
  const theme = THEME_BY_ID[option.themeId];
  if (option.kind === "new-theme") {
    return theme?.playstyle ?? "새로운 덱과 플레이 흐름을 환경에 추가합니다.";
  }
  const keyword = getProspectiveSupportKeyword(
    game,
    option.themeId,
    option.direction,
  );
  return keyword
    ? `${getPlayKeyword(keyword).label} 성향을 강화하는 ${theme?.shortName ?? "테마"} 전용 지원입니다.`
    : `${theme?.shortName ?? "테마"}의 기존 플랜을 강화하는 전용 지원입니다.`;
}

export function ReleaseDecisionPanel({
  disabled = false,
  game,
  guidedTarget = false,
  onChange,
  onSubmit,
  selectedOptionIds,
}: {
  disabled?: boolean;
  game: GameState;
  guidedTarget?: boolean;
  onChange: (optionIds: string[]) => void;
  onSubmit: (selections: ReleaseSelection[]) => void;
  selectedOptionIds: readonly string[];
}) {
  const options = game.releaseSlate?.options ?? [];
  const [powerAdjustments, setPowerAdjustments] = useState<
    Record<string, PowerAdjustment>
  >({});
  const directOptions = options.filter((option) => option.kind !== "reprint");
  const lockedReprint = options.find(
    (option) => option.kind === "reprint" && option.locked,
  );
  const expectedCount = getDirectReleaseSelectionCount(options);
  const hasGenericRules = directOptions.some(
    (option) => option.kind === "generic",
  );
  const complete = isCompleteReleaseSelection(
    options,
    selectedOptionIds,
  );
  const selectedCount = directOptions.filter((option) =>
    selectedOptionIds.includes(option.id),
  ).length;
  const selectedDirectOptions = directOptions.filter((option) =>
    selectedOptionIds.includes(option.id),
  );

  const toggleOption = (option: ReleaseOption) => {
    if (disabled || option.kind === "reprint") return;
    const selected = selectedOptionIds.includes(option.id);
    if (selected) {
      onChange(selectedOptionIds.filter((id) => id !== option.id));
      return;
    }

    if (
      !canToggleReleaseOption(
        options,
        selectedOptionIds,
        option.id,
      )
    ) return;
    onChange([...selectedOptionIds, option.id]);
  };

  const groups: Array<{
    kind: "new-theme" | "support" | "generic";
    label: string;
  }> = [
    { kind: "new-theme", label: "신테마" },
    { kind: "support", label: "지원" },
    ...(directOptions.some((option) => option.kind === "generic")
      ? [{ kind: "generic" as const, label: "범용" }]
      : []),
  ];

  return (
    <section
      aria-labelledby="release-decision-title"
      className="release-decision-panel"
      data-tutorial-control="release-review"
      data-tutorial-target={guidedTarget ? "active" : undefined}
    >
      <header>
        <div>
          <span>RELEASE REVIEW · DAY {game.day}</span>
          <h2 id="release-decision-title">이번 카드팩 구성</h2>
          <p>
            {hasGenericRules
              ? `신테마·지원·범용을 각각 1종 이상 포함해 ${expectedCount}종을 고르세요.`
              : `신테마를 1종 이상 포함해 ${expectedCount}종을 고르세요.`}
          </p>
        </div>
        <strong>{selectedCount} / {expectedCount}</strong>
      </header>

      <div className="release-option-groups">
        {groups.map((group) => (
          <fieldset className="release-option-group" key={group.kind}>
            <legend>{group.label}</legend>
            <div>
              {directOptions
                .filter((option) => option.kind === group.kind)
                .map((option) => {
                  const selected = selectedOptionIds.includes(option.id);
                  const nameLines = optionNameLines(option);
                  const keywordLabels = optionKeywordLabels(game, option);
                  const faceThemeId =
                    option.kind === "generic" ? undefined : option.themeId;
                  const faceAccent = faceThemeId
                    ? THEME_BY_ID[faceThemeId]?.color
                    : "#4b86a6";
                  const atCapacity = !selected && selectedCount >= expectedCount;
                  const preservesRequiredMix = canToggleReleaseOption(
                    options,
                    selectedOptionIds,
                    option.id,
                  );
                  const selectionBlocked = !selected && !preservesRequiredMix;
                  return (
                    <button
                      aria-pressed={selected}
                      className={selected ? "is-selected" : undefined}
                      data-tutorial-control={`release-core-${group.kind}`}
                      disabled={
                        disabled ||
                        selectionBlocked
                      }
                      key={option.id}
                      onClick={() => toggleOption(option)}
                      title={
                        selectionBlocked
                          ? atCapacity
                            ? "선택한 카드 하나를 먼저 해제하세요."
                            : "남은 칸은 아직 선택하지 않은 필수 종류를 위해 남겨두세요."
                          : undefined
                      }
                      type="button"
                    >
                      <RegulatorCardFace
                        accent={faceAccent}
                        effect={optionEffect(game, option)}
                        footer={keywordLabels.join(" · ")}
                        overline={optionRole(option)}
                        themeId={faceThemeId}
                        title={nameLines.join(" ")}
                      />
                    </button>
                  );
                })}
            </div>
          </fieldset>
        ))}
      </div>

      <section
        aria-label="선택한 발매 카드 파워 조정"
        className="release-power-adjustments"
      >
        <header>
          <strong>파워 조정</strong>
          <span>-3은 약하게 · 0은 기본 · +3은 강하게</span>
        </header>
        <div>
          {selectedDirectOptions.length === 0 ? (
            <p className="release-power-adjustments-empty" role="status">
              선택한 카드가 없습니다. 위 후보를 선택하면 이곳에서 파워를 조정할 수 있습니다.
            </p>
          ) : (
            selectedDirectOptions.map((option) => {
              const currentAdjustment =
                powerAdjustments[option.id] ?? 0;
              return (
                <div className="release-power-adjustment-row" key={option.id}>
                  <span>
                    <small>{optionRole(option)}</small>
                    <strong>{optionName(option)}</strong>
                  </span>
                  <div
                    aria-label={`${optionName(option)} 파워 조정`}
                    className="release-power-scale"
                    role="group"
                  >
                    {POWER_ADJUSTMENTS.map((adjustment) => (
                      <button
                        aria-pressed={currentAdjustment === adjustment}
                        disabled={disabled}
                        key={adjustment}
                        onClick={() =>
                          setPowerAdjustments((current) => ({
                            ...current,
                            [option.id]: adjustment,
                          }))
                        }
                        type="button"
                      >
                        {adjustment > 0 ? `+${adjustment}` : adjustment}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {lockedReprint ? (
        <div className="release-locked-reprint" role="status">
          <span>예약 재판</span>
          <strong>{optionName(lockedReprint)}</strong>
          <small>요청에 따라 카드팩에 자동 포함됩니다.</small>
        </div>
      ) : null}

      <footer>
        <p>
          {complete
            ? `필수 구성이 완성됐습니다. DAY ${game.day} 생산안으로 봉인하고 DAY ${game.day + 1}에 정식 출시합니다.`
            : hasGenericRules
              ? "신테마·지원·범용을 각각 1종 이상 선택해주세요."
              : "신테마가 1종 이상 필요합니다."}
        </p>
        <button
          className="primary-action"
          data-sound="click"
          data-tutorial-control="release-submit"
          disabled={disabled || !complete}
          onClick={() => {
            const selected = directOptions
              .filter((option) => selectedOptionIds.includes(option.id))
              .map((option) => ({
                optionId: option.id,
                powerAdjustment:
                  powerAdjustments[option.id] ?? 0,
              }));
            onSubmit(selected);
          }}
          type="button"
        >
          생산안 확정
        </button>
      </footer>
    </section>
  );
}
