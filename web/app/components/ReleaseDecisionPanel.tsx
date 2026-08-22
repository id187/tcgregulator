import { useState } from "react";

import { THEME_BY_ID } from "../game/content.ts";
import { REPRINT_PACK_CANDIDATE_COUNT } from "../game/campaign.ts";
import { getProspectiveSupportKeyword } from "../game/engine.ts";
import {
  getCountForecastRange,
  getForecastRange,
} from "../game/forecast-display.ts";
import { getGenericCard } from "../game/generic-card-catalog.ts";
import { getPlayKeyword } from "../game/play-keywords.ts";
import { getReleaseSlateKind } from "../game/release-kind.ts";
import { getReprintImpactPreview } from "../game/release-requests.ts";
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

function formatSignedScore(value: number): string {
  if (value > 0) return `+${value.toFixed(1)}`;
  if (value < 0) return value.toFixed(1);
  return "0.0";
}

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
  return option.requested ? "요청 재판" : "재판 후보";
}

function optionEffect(game: GameState, option: ReleaseOption): string {
  if (option.kind === "generic") {
    return (
      getGenericCard(option.genericCardId)?.description ??
      "여러 테마가 공유할 수 있는 범용 선택지를 추가합니다."
    );
  }
  if (option.kind === "reprint") {
    const preview = getReprintImpactPreview(game, option.cardId);
    if (!preview) {
      return "절판된 핵심 카드의 접근성을 회복하고 보유가치의 방향을 바꿉니다.";
    }
    return `현재 시세 ${Math.round(preview.referencePrice).toLocaleString("ko-KR")}원 · 수요 ${Math.round(preview.playDemandScore)} · 출시 ${preview.ageDays}일 경과`;
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
  const releaseKind = game.releaseSlate?.releaseKind ?? "regular";
  const isReprintReview = game.releaseSlate
    ? getReleaseSlateKind(game.releaseSlate) === "reprint"
    : false;
  const [powerAdjustments, setPowerAdjustments] = useState<
    Record<string, PowerAdjustment>
  >({});
  const directOptions = isReprintReview
    ? options
    : options.filter((option) => option.kind !== "reprint");
  const expectedCount = getDirectReleaseSelectionCount(releaseKind);
  const hasGenericRules = directOptions.some(
    (option) => option.kind === "generic",
  );
  const complete = isCompleteReleaseSelection(
    releaseKind,
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
    if (disabled || (!isReprintReview && option.kind === "reprint")) return;
    const selected = selectedOptionIds.includes(option.id);
    if (selected) {
      onChange(selectedOptionIds.filter((id) => id !== option.id));
      return;
    }

    if (
      !canToggleReleaseOption(
        releaseKind,
        options,
        selectedOptionIds,
        option.id,
      )
    ) return;
    onChange([...selectedOptionIds, option.id]);
  };

  const groups: Array<{
    kind: "new-theme" | "support" | "generic" | "reprint";
    label: string;
  }> = isReprintReview
    ? [{ kind: "reprint", label: `재판 후보 ${REPRINT_PACK_CANDIDATE_COUNT}종` }]
    : [
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
          <span>{isReprintReview ? "REPRINT REVIEW" : "RELEASE REVIEW"} · DAY {game.day}</span>
          <h2 id="release-decision-title">
            {isReprintReview ? "이번 재판팩 구성" : "이번 카드팩 구성"}
          </h2>
          <p>
            {isReprintReview
              ? `시세와 수요를 비교해 후보 ${REPRINT_PACK_CANDIDATE_COUNT}종 중 ${expectedCount}종을 고르세요. 재판 카드는 파워를 조정하지 않습니다.`
              : hasGenericRules
              ? `신테마·지원·범용을 각각 1종 이상 포함해 ${expectedCount}종을 고르세요.`
              : `신테마를 1종 이상 포함해 ${expectedCount}종을 고르세요.`}
          </p>
        </div>
        <strong>{selectedCount} / {expectedCount}</strong>
      </header>

      <div className="release-option-groups">
        {groups.map((group) => (
          <fieldset
            className={
              isReprintReview
                ? "release-option-group release-option-group-reprint"
                : "release-option-group"
            }
            key={group.kind}
          >
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
                    releaseKind,
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

      {!isReprintReview ? <section
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
      </section> : (
        <section className="release-power-adjustments release-reprint-impact" aria-label="재판 영향 안내">
          <header>
            <strong>재판 영향</strong>
            <span>관측 자료로 계산한 예상 범위입니다 · 분석 신뢰도 중간</span>
          </header>
          <div>
            {selectedDirectOptions.map((option) => {
              if (option.kind !== "reprint") return null;
              const preview = getReprintImpactPreview(game, option.cardId);
              const accessForecast = preview
                ? getCountForecastRange(preview.accessibilityUserGain)
                : null;
              const trustForecast = preview
                ? getForecastRange(preview.trustDelta, {
                    relativeMargin: 0.25,
                    minimumMargin: 0.5,
                    step: 0.5,
                    maximum: 0,
                  })
                : null;
              return preview ? (
                <div className="release-power-adjustment-row" key={option.id}>
                  <span>
                    <small>{preview.collectorLabel ?? "일반 초판"}</small>
                    <strong>{preview.cardName}</strong>
                  </span>
                  <span>
                    접근 +{accessForecast!.lower.toLocaleString("ko-KR")}~{accessForecast!.upper.toLocaleString("ko-KR")}명 · 신뢰 {formatSignedScore(trustForecast!.lower)}~{formatSignedScore(trustForecast!.upper)} 전망
                  </span>
                </div>
              ) : null;
            })}
          </div>
        </section>
      )}

      <footer>
        <p>
          {complete
            ? isReprintReview
              ? `재판 3종이 확정됐습니다. DAY ${game.day + 1}부터 시세·접근성·콜렉터 반응을 관측합니다.`
              : `필수 구성이 완성됐습니다. DAY ${game.day} 생산안으로 봉인하고 DAY ${game.day + 1}에 정식 출시합니다.`
            : isReprintReview
              ? `후보 ${REPRINT_PACK_CANDIDATE_COUNT}종 중 재판할 카드 3종을 선택해주세요.`
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
                  option.kind === "reprint"
                    ? 0
                    : powerAdjustments[option.id] ?? 0,
              }));
            onSubmit(selected);
          }}
          type="button"
        >
          {isReprintReview ? "재판팩 확정" : "생산안 확정"}
        </button>
      </footer>
    </section>
  );
}
