import assert from "node:assert/strict";
import test from "node:test";

import { getNextCampaignMilestone } from "../app/game/campaign-milestone.ts";

test("the guided handover advances one briefing day at a time", () => {
  assert.deepEqual(
    getNextCampaignMilestone({
      day: 2,
      handoverComplete: false,
      nextBanDay: 40,
      nextReleaseDay: 10,
      phase: "running",
    }),
    { days: 1, label: "다음 인수인계" },
  );
});

test("a replay with completed guidance skips handover stops", () => {
  assert.deepEqual(
    getNextCampaignMilestone({
      day: 1,
      handoverComplete: true,
      nextBanDay: 40,
      nextReleaseDay: 10,
      phase: "running",
    }),
    { days: 9, label: "정기 발매" },
  );
});

test("the nearest release is selected after the guided handover", () => {
  assert.deepEqual(
    getNextCampaignMilestone({ day: 31, nextBanDay: 75, nextReleaseDay: 60, phase: "running" }),
    { days: 29, label: "정기 발매" },
  );
});

test("a restriction review wins when it is the nearest event", () => {
  assert.deepEqual(
    getNextCampaignMilestone({ day: 60, nextBanDay: 75, nextReleaseDay: 90, phase: "running" }),
    { days: 15, label: "금제위원회" },
  );
});

test("the settlement and ending remain available after decisions close", () => {
  assert.deepEqual(
    getNextCampaignMilestone({ day: 450, nextBanDay: 495, nextReleaseDay: 480, phase: "running" }),
    { days: 1, label: "결산 관찰" },
  );
  assert.deepEqual(
    getNextCampaignMilestone({ day: 451, nextBanDay: 495, nextReleaseDay: 480, phase: "running" }),
    { days: 49, label: "임기 종료" },
  );
});

test("there is no next milestone after the campaign ends", () => {
  assert.equal(
    getNextCampaignMilestone({ day: 500, nextBanDay: 555, nextReleaseDay: 510, phase: "ended" }),
    null,
  );
});
