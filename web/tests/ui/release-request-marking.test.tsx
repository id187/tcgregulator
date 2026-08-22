import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ReleaseDecisionPanel } from "../../app/components/ReleaseDecisionPanel.tsx";
import { BUSINESS_EVENT_BY_TYPE } from "../../app/game/business-events.ts";
import { THEME_BY_ID } from "../../app/game/content.ts";
import { createInitialGame, reduceGame } from "../../app/game/engine.ts";
import type { GameState } from "../../app/game/types.ts";

function reachFirstRelease(kind: "indirect-support" | "environment-target") {
  let game = createInitialGame(98_101);
  const themeId = game.activeThemeIds[0];
  game = reduceGame(game, {
    type: "SET_RELEASE_REQUEST",
    request: { kind, themeId },
  });

  for (let guard = 0; guard < 20; guard += 1) {
    if (game.day === 10 && game.phase === "release-edit") {
      return { game, themeId };
    }
    const pending = game.operations.pendingEvent;
    if (pending) {
      const choice = BUSINESS_EVENT_BY_TYPE[pending.type].choices.find(
        (candidate) => candidate.cost <= game.finance.cash + 1e-9,
      );
      if (!choice) throw new Error("Expected an affordable event choice.");
      game = reduceGame(game, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: pending.id,
        choice: choice.id,
      });
      continue;
    }
    game = reduceGame(game, { type: "ADVANCE_DAYS", days: 1 });
  }
  throw new Error("First release review did not open.");
}

function renderReview(game: GameState) {
  render(
    <ReleaseDecisionPanel
      game={game}
      onChange={vi.fn()}
      onSubmit={vi.fn()}
      selectedOptionIds={[]}
    />,
  );
}

it.each([
  ["indirect-support", "요청 · 간접 지원", "위한 간접 지원 요청", "지원"],
  ["environment-target", "요청 · 환경 저격", "겨냥한 환경 저격 요청", "저격"],
] as const)(
  "marks a %s generic with its request purpose and target",
  (kind, overline, purpose, footer) => {
    const { game, themeId } = reachFirstRelease(kind);
    const target = THEME_BY_ID[themeId].shortName;
    renderReview(game);

    expect(screen.getByText(overline)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${target}.*${purpose}`))).toBeTruthy();
    expect(screen.getByText(new RegExp(`${target} ${footer}`))).toBeTruthy();
  },
);
