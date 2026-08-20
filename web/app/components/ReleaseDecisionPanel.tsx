import { useState } from "react";

import { THEME_BY_ID } from "../game/content.ts";
import { getGenericCard } from "../game/generic-card-catalog.ts";
import type {
  GameState,
  PowerAdjustment,
  ReleaseOption,
  ReleaseSelection,
  SupportDirection,
} from "../game/types.ts";

const POWER_ADJUSTMENTS = [-3, -2, -1, 0, 1, 2, 3] as const satisfies
  readonly PowerAdjustment[];

const SUPPORT_DIRECTION_LABEL: Record<SupportDirection, string> = {
  consistency: "안정성",
  counterplay: "대응력",
  finisher: "결과물",
  recovery: "회수",
};

function optionName(option: ReleaseOption): string {
  if (option.kind === "generic") {
    return getGenericCard(option.genericCardId)?.name ?? "범용 카드";
  }
  if (option.kind === "reprint") return `재판 · ${option.cardId}`;
  const theme = THEME_BY_ID[option.themeId];
  if (option.kind === "new-theme") return theme?.name ?? "신테마";
  return `${theme?.shortName ?? "테마"} · ${SUPPORT_DIRECTION_LABEL[option.direction]} 지원`;
}

function optionRole(option: ReleaseOption): string {
  if (option.kind === "new-theme") return "신테마";
  if (option.kind === "support") return "지원";
  if (option.kind === "generic") return "범용";
  return "예약 재판";
}

function getDirectSelectionCount(options: readonly ReleaseOption[]): number {
  const hasGenericRules = options.some((option) => option.kind === "generic");
  if (!hasGenericRules) return 3;
  return options.some((option) => option.kind === "reprint" && option.locked)
    ? 3
    : 4;
}

function isCompleteSelection(
  options: readonly ReleaseOption[],
  selectedOptionIds: readonly string[],
): boolean {
  const selected = options.filter((option) =>
    selectedOptionIds.includes(option.id),
  );
  const expectedCount = getDirectSelectionCount(options);
  if (selected.length !== expectedCount) return false;
  if (selected.filter((option) => option.kind === "new-theme").length < 1) {
    return false;
  }
  if (!options.some((option) => option.kind === "generic")) {
    return selected.every((option) =>
      option.kind === "new-theme" || option.kind === "support"
    );
  }
  return (
    selected.some((option) => option.kind === "support") &&
    selected.some((option) => option.kind === "generic")
  );
}

export function ReleaseDecisionPanel({
  disabled = false,
  fixedSelections,
  game,
  guidedTarget = false,
  onChange,
  onSubmit,
  selectedOptionIds,
}: {
  disabled?: boolean;
  fixedSelections?: readonly ReleaseSelection[];
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
  const effectiveSelectedOptionIds = fixedSelections
    ? fixedSelections.map((selection) => selection.optionId)
    : selectedOptionIds;
  const fixedPowerAdjustments = fixedSelections
    ? new Map(
        fixedSelections.map((selection) => [
          selection.optionId,
          selection.powerAdjustment,
        ]),
      )
    : null;
  const lockedReprint = options.find(
    (option) => option.kind === "reprint" && option.locked,
  );
  const expectedCount = getDirectSelectionCount(options);
  const hasGenericRules = directOptions.some(
    (option) => option.kind === "generic",
  );
  const complete = isCompleteSelection(options, effectiveSelectedOptionIds);
  const selectedCount = directOptions.filter((option) =>
    effectiveSelectedOptionIds.includes(option.id),
  ).length;
  const selectedDirectOptions = directOptions.filter((option) =>
    effectiveSelectedOptionIds.includes(option.id),
  );

  const toggleOption = (option: ReleaseOption) => {
    if (disabled || fixedSelections || option.kind === "reprint") return;
    const selected = effectiveSelectedOptionIds.includes(option.id);
    if (selected) {
      onChange(effectiveSelectedOptionIds.filter((id) => id !== option.id));
      return;
    }

    const next = [...effectiveSelectedOptionIds];
    if (next.length >= expectedCount) return;
    onChange([...next, option.id]);
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
            {fixedSelections
              ? `이번 발매 시안 ${expectedCount}종은 이미 결정되었습니다. 구성과 파워를 확인하세요.`
              : hasGenericRules
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
                  const selected = effectiveSelectedOptionIds.includes(option.id);
                  const atCapacity = !selected && selectedCount >= expectedCount;
                  return (
                    <button
                      aria-pressed={selected}
                      className={selected ? "is-selected" : undefined}
                      data-tutorial-control={`release-core-${group.kind}`}
                      disabled={disabled || Boolean(fixedSelections) || atCapacity}
                      key={option.id}
                      onClick={() => toggleOption(option)}
                      type="button"
                    >
                      <span>{optionRole(option)}</span>
                      <strong>{optionName(option)}</strong>
                    </button>
                  );
                })}
            </div>
          </fieldset>
        ))}
      </div>

      {selectedDirectOptions.length > 0 ? (
        <section
          aria-label="선택한 발매 카드 파워 조정"
          className="release-power-adjustments"
        >
          <header>
            <strong>{fixedSelections ? "결정된 파워" : "파워 조정"}</strong>
            <span>
              {fixedSelections
                ? "첫 인수인계에 적용될 값을 확인합니다."
                : "-3은 약하게 · 0은 기본 · +3은 강하게"}
            </span>
          </header>
          <div>
            {selectedDirectOptions.map((option) => {
              const currentAdjustment =
                fixedPowerAdjustments?.get(option.id) ??
                powerAdjustments[option.id] ??
                0;
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
                        disabled={disabled || Boolean(fixedSelections)}
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
            })}
          </div>
        </section>
      ) : null}

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
            ? fixedSelections
              ? "이번 발매 시안이 준비됐습니다. 발매 확정을 눌러 기록에 반영하세요."
              : "필수 구성이 완성됐습니다. 제출하면 DAY 30 발매 기록에 즉시 반영됩니다."
            : hasGenericRules
              ? "신테마·지원·범용을 각각 1종 이상 선택해주세요."
              : "신테마가 1종 이상 필요합니다."}
        </p>
        <button
          className="primary-action"
          data-sound="release"
          data-tutorial-control="release-submit"
          disabled={disabled || !complete}
          onClick={() => {
            const selected = directOptions
              .filter((option) => effectiveSelectedOptionIds.includes(option.id))
              .map((option) => ({
                optionId: option.id,
                powerAdjustment:
                  fixedPowerAdjustments?.get(option.id) ??
                  powerAdjustments[option.id] ??
                  0,
              }));
            onSubmit(selected);
          }}
          type="button"
        >
          발매 확정
        </button>
      </footer>
    </section>
  );
}
