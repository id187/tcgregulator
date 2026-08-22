import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { TitleScreen } from "../../app/components/TitleScreen.tsx";
import Home from "../../app/page.tsx";
import { createInitialGame } from "../../app/game/engine.ts";

const SETTINGS = {
  bgmVolume: 0.5,
  soundEnabled: true,
  impactEffectsEnabled: true,
  motionPreference: "system" as const,
};

it("shows only a new-game start when no autosave exists", async () => {
  const user = userEvent.setup();
  render(
    <TitleScreen
      busy={false}
      onContinue={() => undefined}
      onNewGame={() => undefined}
      onSettingsChange={() => undefined}
      onTutorialReset={() => undefined}
      savedGame={{ available: false, summary: "저장된 임기 없음" }}
      settings={SETTINGS}
    />,
  );

  expect(screen.getByRole("button", { name: "새 게임" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /이어하기/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "처음부터" })).toBeNull();

  await user.click(screen.getByRole("button", { name: "SETTINGS" }));
  expect(screen.queryByText("EXPORT")).toBeNull();
  expect(screen.queryByText("IMPORT")).toBeNull();
});

it("restarts an existing autosave after explicit confirmation", async () => {
  const user = userEvent.setup();
  const mediaPlay = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);
  const mediaPause = vi
    .spyOn(HTMLMediaElement.prototype, "pause")
    .mockImplementation(() => undefined);
  window.localStorage.clear();
  window.localStorage.setItem(
    "tcg-regulator-save-v2",
    JSON.stringify(createInitialGame(77)),
  );

  const { unmount } = render(<Home />);
  await screen.findByRole("button", { name: /이어하기/ });
  expect(screen.getByRole("button", { name: "처음부터" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "처음부터" }));
  await user.click(screen.getByRole("button", { name: "DAY 0 긴급 투입" }));

  await waitFor(() => {
    const saved = JSON.parse(
      window.localStorage.getItem("tcg-regulator-save-v2") ?? "null",
    ) as { day?: number; seed?: number } | null;
    expect(saved?.day).toBe(0);
    expect(saved?.seed).not.toBe(77);
  });

  unmount();
  mediaPause.mockRestore();
  mediaPlay.mockRestore();
  window.localStorage.clear();
});
