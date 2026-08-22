import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { HeaderReferenceTools } from "../../app/components/HeaderReferenceTools.tsx";
import { ShareholderRequestOverlay } from "../../app/components/ReportArrivalOverlay.tsx";
import { ShareholderRequestStatus } from "../../app/components/ShareholderRequestStatus.tsx";
import { createInitialGame } from "../../app/game/engine.ts";
import type { ShareholderRequest } from "../../app/game/types.ts";

const REQUEST: ShareholderRequest = {
  id: "shareholder-request-1",
  kind: "suppress-tier2",
  themeId: "cycle",
  offeredDay: 25,
  deadlineDay: 55,
  rewardCash: 15,
  status: "pending",
  responseDay: null,
  resolvedDay: null,
};

it("offers the forced shareholder request with both accept and refusal", async () => {
  const user = userEvent.setup();
  const onRespond = vi.fn();
  render(<ShareholderRequestOverlay onRespond={onRespond} request={REQUEST} />);

  expect(screen.getByRole("dialog", { name: "대주주 특별 요청" })).toBeTruthy();
  expect(screen.getByText(/Tier 2 이하/)).toBeTruthy();
  expect(screen.getByText("₩15.00억")).toBeTruthy();
  expect(screen.getByText("최대 −₩5.00억")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "요청 거부" }));
  expect(onRespond).toHaveBeenLastCalledWith(false);
  await user.click(screen.getByRole("button", { name: "요청 수락" }));
  expect(onRespond).toHaveBeenLastCalledWith(true);
});

it("keeps an accepted request visible beside the reference tools", async () => {
  const user = userEvent.setup();
  const game = createInitialGame(92_000);
  game.day = 25;
  game.shareholder.request = {
    ...REQUEST,
    status: "accepted",
    responseDay: 25,
  };
  const request = game.shareholder.request;
  expect(request?.status).toBe("accepted");

  render(
    <HeaderReferenceTools
      banList={<div>금제 내용</div>}
      keywordGlossary={<div>키워드 내용</div>}
      shareholderRequest={
        <ShareholderRequestStatus game={game} request={request!} />
      }
      shareholderRequestLabel="대주주 요청 · D-30"
    />,
  );

  await user.click(screen.getByRole("button", { name: /대주주 요청 · D-30/ }));
  expect(screen.getByText(/Tier 2 이하로 낮추십시오/)).toBeTruthy();
  expect(screen.getByText("+₩15.00억")).toBeTruthy();
  expect(screen.getByText("최대 −₩5.00억")).toBeTruthy();
});
