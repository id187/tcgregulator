import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { TabTutorialPopup } from "../../app/components/TabTutorialPopup.tsx";
import { getContextualTutorialPages } from "../../app/game/tab-tutorial.ts";

function TutorialHarness({
  sectionLabel,
  topic,
  onComplete,
}: {
  sectionLabel: string;
  topic: "first-business-event" | "release-planning-tools";
  onComplete: () => void;
}) {
  const [index, setIndex] = useState(0);
  const pages = getContextualTutorialPages(topic);
  return (
    <TabTutorialPopup
      currentIndex={index}
      onComplete={onComplete}
      onNext={() => setIndex((current) => current + 1)}
      onPrevious={() => setIndex((current) => current - 1)}
      pages={pages}
      sectionLabel={sectionLabel}
    />
  );
}

it("shows the DAY 20 surprise-event introduction before its choice sheet", async () => {
  const user = userEvent.setup();
  const onComplete = vi.fn();
  render(
    <TutorialHarness
      onComplete={onComplete}
      sectionLabel="첫 기습 이벤트"
      topic="first-business-event"
    />,
  );

  expect(screen.getByRole("dialog", { name: /첫 기습 이벤트 안내.*돌발 경영 제안/ })).toBeTruthy();
  expect(screen.getByText("돌발 제안 확인")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("성공과 역풍을 함께 읽고 결정하십시오")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "확인" }));
  expect(onComplete).toHaveBeenCalledOnce();
});

it("explains the shared release-request slot and softer indirect tradeoff", async () => {
  const user = userEvent.setup();
  render(
    <TutorialHarness
      onComplete={vi.fn()}
      sectionLabel="발매 요청"
      topic="release-planning-tools"
    />,
  );

  expect(screen.getByText(/한 발매주기에 합쳐서 한 건만 유지/)).toBeTruthy();
  expect(screen.getByText(/전용 카드 3장.*반발도 커질 수/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText(/효과가 약하거나 예상과 다르게 퍼질 수도/)).toBeTruthy();
  expect(screen.getByText(/대체로 구매 신뢰와 커뮤니티 반발이 적/)).toBeTruthy();
});
