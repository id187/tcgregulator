import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
  THEMES,
  THEME_BY_ID,
} from "../app/game/content.ts";
import {
  getCommunityHeat,
  getDailyCommunityPosts,
  getReleaseReactionProfile,
} from "../app/game/daily-community.ts";
import {
  createInitialGame,
  formatCommunityEvent,
  reduceGame,
} from "../app/game/engine.ts";
import type {
  CommunityEvent,
  GameState,
  PowerAdjustment,
  ThemeContent,
} from "../app/game/types.ts";

function makeRuntime(theme: ThemeContent, share: number): GameState["themes"][string] {
  const launchParts = theme.parts.slice(0, INITIAL_THEME_PART_COUNT);
  return {
    share,
    previousWeekShare: share,
    winRate: 0.5,
    power: theme.basePower,
    unpleasantness: theme.baseUnpleasantness,
    fatigue: 10,
    legalLimits: Object.fromEntries(launchParts.map((part) => [part.id, 3])),
    partStats: Object.fromEntries(
      launchParts.map((part) => [
        part.id,
        {
          usageRate: part.inclusion,
          averageCopies: part.averageCopies,
        },
      ]),
    ),
    lastSupportDay: null,
    freshness: 50,
    topStreakDays: 0,
    counterProgress: 0,
    counterThreshold: 100,
    counterAdoption: 0,
    counterDiscoveredDay: null,
    counterBuild: 0,
    supportPower: 0,
    supportUnpleasantness: 0,
    supportCount: 0,
    releasedPartIds: launchParts.map((part) => part.id),
    lastSupportAdjustment: null,
    supportReplacementPressure: 0,
  };
}

function makeState(seed = 7301): GameState {
  const active = THEMES.slice(0, 5);
  const shares = [0.32, 0.25, 0.2, 0.13, 0.1];
  const themes = Object.fromEntries(
    active.map((theme, index) => [
      theme.id,
      makeRuntime(theme, shares[index]),
    ]),
  );

  return {
    schemaVersion: 3,
    seed,
    day: 60,
    phase: "running",
    activeThemeIds: active.map((theme) => theme.id),
    themes,
    users: { tier: 35_000, casual: 45_000, collector: 20_000 },
    finance: { today: 0.7, rolling30: 18, cumulative: 35 },
    community: [],
    supportRequests: [],
    releaseSlate: null,
    releaseHistory: [],
    history: [
      {
        day: 15,
        totalUsers: 100_000,
        revenue: 0.5,
        topThemeId: active[0].id,
        shares: {
          [active[0].id]: 0.6,
          [active[1].id]: 0.4,
        },
      },
    ],
    recentRevenue: [],
    lastSupportProposalDay: null,
    nextSupportRequestId: 1,
    nextReleaseOptionId: 1,
    nextCommunityId: 1,
    currentTopThemeId: active[0].id,
    purchaseTrust: 80,
    handoverComplete: true,
  };
}

function releaseWithMixedReactions(seed = 9191): GameState {
  let state = createInitialGame(seed);
  const restriction = state.community.find(
    (event) =>
      event.day === 45 &&
      (event.type === "restriction-applied" || event.type === "cosmetic-restriction"),
  );
  assert.ok(restriction);
  const restrictedThemeId = restriction.themeId;
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: restrictedThemeId,
    direction: "consistency",
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 14 });
  assert.equal(state.day, 60);
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  const requested = state.releaseSlate.options.find((option) => option.requested);
  assert.ok(requested);
  const selected = [
    requested,
    ...state.releaseSlate.options.filter((option) => option.id !== requested.id),
  ].slice(0, 3);
  return reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: selected.map((option, index) => ({
      optionId: option.id,
      powerAdjustment: ([0, 3, -3] as const)[index],
    })),
  });
}

function supportReactionState(
  themeStrength: "strong" | "weak",
  adjustment: PowerAdjustment,
  replacement: boolean,
  seed = 44001,
): GameState {
  const state = makeState(seed);
  const targetId = state.activeThemeIds[0];
  const target = THEME_BY_ID[targetId];
  const targetShare = themeStrength === "strong" ? 0.34 : 0.04;
  const otherShare = (1 - targetShare) / (state.activeThemeIds.length - 1);
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [
      themeId,
      themeId === targetId ? targetShare : otherShare,
    ]),
  );
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].share = shares[themeId];
    state.themes[themeId].previousWeekShare = shares[themeId];
  }

  const runtime = state.themes[targetId];
  const launchParts = target.parts.slice(0, INITIAL_THEME_PART_COUNT);
  const newParts = target.parts.slice(
    INITIAL_THEME_PART_COUNT,
    INITIAL_THEME_PART_COUNT + SUPPORT_PARTS_PER_RELEASE,
  );
  runtime.supportCount = 1;
  runtime.releasedPartIds = [...launchParts, ...newParts].map((part) => part.id);
  runtime.lastSupportDay = 60;
  runtime.lastSupportAdjustment = adjustment;
  runtime.supportReplacementPressure = replacement ? 0.62 : 0.08;
  runtime.legalLimits = Object.fromEntries(
    [...launchParts, ...newParts].map((part) => [part.id, 3]),
  );
  runtime.partStats = Object.fromEntries(
    [
      ...launchParts.map((part) => [
        part.id,
        {
          usageRate: part.inclusion * (replacement ? 0.42 : 0.96),
          averageCopies: part.averageCopies,
        },
      ] as const),
      ...newParts.map((part, index) => [
        part.id,
        {
          usageRate: replacement ? 0.96 - index * 0.04 : adjustment >= 2 ? 0.7 : 0.28,
          averageCopies: part.averageCopies,
        },
      ] as const),
    ],
  );

  state.day = 64;
  state.currentTopThemeId = themeStrength === "strong" ? targetId : state.activeThemeIds[1];
  state.community = [];
  state.releaseHistory = [
    {
      day: 60,
      products: [
        {
          optionId: `support-cross-${themeStrength}-${adjustment}`,
          kind: "support",
          themeId: targetId,
          direction: "consistency",
          expectedTier: adjustment >= 2 ? "Tier 1" : "Tier 3",
          powerAdjustment: adjustment,
        },
      ],
    },
  ];
  const makeHistory = (day: number) => ({
    day,
    totalUsers: 100_000,
    revenue: 0.5,
    topThemeId: state.currentTopThemeId,
    shares: { ...shares },
  });
  state.history = [makeHistory(20), makeHistory(60)];
  return state;
}

type UnbanFixtureTone =
  | "overdue"
  | "dangerous"
  | "surge"
  | "no-impact"
  | "measured";

function unbanReactionState(
  tone: UnbanFixtureTone,
  seed = 62001,
): GameState {
  const state = makeState(seed);
  const targetId = state.activeThemeIds[0];
  const content = THEME_BY_ID[targetId];
  const part = content.parts[0];
  const pathByTone: Record<UnbanFixtureTone, readonly [number, number, number, number]> = {
    overdue: [0.04, 0.045, 0.048, 0.051],
    dangerous: [0.28, 0.281, 0.283, 0.285],
    surge: [0.09, 0.102, 0.108, 0.115],
    "no-impact": [0.06, 0.061, 0.062, 0.063],
    measured: [0.13, 0.135, 0.139, 0.144],
  };
  const sharesFor = (targetShare: number) => {
    const otherShare = (1 - targetShare) / (state.activeThemeIds.length - 1);
    return Object.fromEntries(
      state.activeThemeIds.map((themeId) => [
        themeId,
        themeId === targetId ? targetShare : otherShare,
      ]),
    );
  };
  state.day = 138;
  state.phase = "running";
  state.community = [
    {
      id: "old-restriction-start",
      day: 45,
      category: "restriction",
      type: "restriction-applied",
      themeId: targetId,
      partId: part.id,
      value: 1,
      previousValue: 3,
      body: `[운영 공지] ${part.name} 1장 적용`,
    },
    {
      id: "long-restriction-unban",
      day: 135,
      category: "restriction",
      type: "restriction-applied",
      themeId: targetId,
      partId: part.id,
      value: 3,
      previousValue: 1,
      body: `[운영 공지] ${part.name} 3장 적용`,
    },
  ];
  const shares = pathByTone[tone];
  state.history = shares.map((targetShare, index) => {
    const day = 135 + index;
    const dayShares = sharesFor(targetShare);
    const topThemeId = [...state.activeThemeIds].sort(
      (left, right) => dayShares[right] - dayShares[left],
    )[0];
    return {
      day,
      totalUsers: 10_000,
      revenue: 0.5,
      topThemeId,
      shares: dayShares,
    };
  });
  const currentShares = state.history.at(-1)!.shares;
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].share = currentShares[themeId];
    state.themes[themeId].previousWeekShare = currentShares[themeId];
  }
  state.themes[targetId].legalLimits[part.id] = 3;
  state.currentTopThemeId = state.history.at(-1)!.topThemeId;
  return state;
}

function staleRestrictionState(
  withNoChange: boolean,
  seed = 63001,
): GameState {
  const state = makeState(seed);
  const targetId = state.activeThemeIds[0];
  const part = THEME_BY_ID[targetId].parts[0];
  const targetShare = 0.04;
  const otherShare = (1 - targetShare) / (state.activeThemeIds.length - 1);
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [
      themeId,
      themeId === targetId ? targetShare : otherShare,
    ]),
  );
  state.day = 170;
  state.phase = "running";
  state.community = [
    {
      id: "stale-restriction-start",
      day: 45,
      category: "restriction",
      type: "restriction-applied",
      themeId: targetId,
      partId: part.id,
      value: 1,
      previousValue: 3,
      body: `[운영 공지] ${part.name} 1장 적용`,
    },
  ];
  if (withNoChange) {
    const topId = state.activeThemeIds[1];
    const topPart = THEME_BY_ID[topId].parts[0];
    state.community.push({
      id: "stale-no-change",
      day: 135,
      category: "restriction",
      type: "restriction-no-change",
      themeId: topId,
      partId: topPart.id,
      value: 3,
      previousValue: 3,
      body: "[운영 공지] 금제 변경 없음",
    });
  }
  state.history = [135, 136, 137, 138, 170].map((day) => ({
    day,
    totalUsers: 10_000,
    revenue: 0.5,
    topThemeId: state.activeThemeIds[1],
    shares: { ...shares },
  }));
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].share = shares[themeId];
    state.themes[themeId].previousWeekShare = shares[themeId];
  }
  state.themes[targetId].legalLimits[part.id] = 1;
  state.currentTopThemeId = state.activeThemeIds[1];
  return state;
}

function makeNoChangeRestrictionState(seed = 2208): GameState {
  const state = structuredClone(
    reduceGame(createInitialGame(seed), { type: "ADVANCE_DAYS", days: 2 }),
  );
  state.community = state.community.filter(
    (event) =>
      !(
        (event.day === 45 &&
          (event.type === "restriction-applied" ||
            event.type === "cosmetic-restriction")) ||
        (event.day === 46 &&
          event.type === "restriction-demand" &&
          event.partId === "cycle-gate")
      ),
  );
  state.community.push({
    id: "no-change-announcement",
    day: 45,
    category: "restriction",
    type: "restriction-no-change",
    themeId: "cycle",
    partId: "cycle-gate",
    value: 2,
    previousValue: 2,
    body: "[운영 공지] 금제 변경 없음 — 윤회 현행 유지",
  });
  return state;
}

function setNoChangeMetaHealth(state: GameState, unhealthy: boolean): void {
  const targetShare = unhealthy ? 0.4 : 0.18;
  const otherShare = (1 - targetShare) / (state.activeThemeIds.length - 1);
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    runtime.share = themeId === "cycle" ? targetShare : otherShare;
    runtime.previousWeekShare = runtime.share;
    if (themeId === "cycle") {
      runtime.unpleasantness = unhealthy ? 92 : 32;
      runtime.fatigue = unhealthy ? 84 : 12;
      runtime.topStreakDays = unhealthy ? 90 : 4;
    }
  }
  const decisionHistory = state.history.find((entry) => entry.day === 45);
  assert.ok(decisionHistory);
  decisionHistory.shares = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [themeId, state.themes[themeId].share]),
  );
  decisionHistory.topThemeId = "cycle";
}

test("returns twenty stable posts for every valid campaign day without mutation", () => {
  const state = makeState(20260816);
  const before = JSON.stringify(state);

  for (let day = 1; day <= state.day; day += 1) {
    const first = getDailyCommunityPosts(state, day);
    const second = getDailyCommunityPosts(state, day);
    assert.equal(first.length, 20, `DAY ${day}`);
    assert.equal(new Set(first.map((post) => post.id)).size, 20);
    assert.deepEqual(first, second);
  }

  assert.equal(JSON.stringify(state), before);
  assert.throws(() => getDailyCommunityPosts(state, 0), RangeError);
  assert.throws(() => getDailyCommunityPosts(state, state.day + 1), RangeError);
});

test("cycles through all 64 copy templates across thirty days", () => {
  const state = makeState(90125);
  const templateKeys = new Set<string>();

  for (let day = 1; day <= 30; day += 1) {
    for (const post of getDailyCommunityPosts(state, day)) {
      const match = post.id.match(
        /-(meta|deck|counter|ban|fan|newbie|tourney|price)-(\d{2})$/,
      );
      assert.ok(match, post.id);
      templateKeys.add(`${match[1]}-${match[2]}`);
    }
  }

  assert.equal(templateKeys.size, 64);
});

test("generated part names avoid stacked possessive particles", () => {
  const repeatedPossessives = THEMES.flatMap((theme) =>
    theme.parts.filter(
      (part) => (part.name.match(/의 /g) ?? []).length > 1,
    ),
  );
  assert.deepEqual(repeatedPossessives, []);
});

test("uses only historically active themes and valid card references", () => {
  const state = makeState(4404);
  const historicalIds = new Set([
    state.activeThemeIds[0],
    state.activeThemeIds[1],
  ]);

  for (const post of getDailyCommunityPosts(state, 15)) {
    assert.ok(historicalIds.has(post.themeId));
    const theme = THEME_BY_ID[post.themeId];
    assert.ok(theme);
    assert.ok(post.partId);
    assert.ok(theme.parts.some((part) => part.id === post.partId));
    if (post.relatedThemeId) assert.ok(THEME_BY_ID[post.relatedThemeId]);
    assert.ok(post.body.length > 10);
    assert.doesNotMatch(post.body, /\{(?:theme|other|part|share|copies|day)\}/);
  }

  const currentIds = new Set(state.activeThemeIds);
  assert.ok(
    getDailyCommunityPosts(state, 14).every((post) =>
      currentIds.has(post.themeId),
    ),
  );
});

test("places stored special events first and returns defensive copies", () => {
  const state = makeState(88);
  const theme = THEMES[0];
  const specialEvents: CommunityEvent[] = [
    {
      id: "community-special-a",
      day: 20,
      category: "counter",
      type: "counter-found",
      themeId: theme.id,
      partId: theme.parts[0].id,
      body: "실전에서 새 카운터가 발견됐다",
    },
    {
      id: "community-special-b",
      day: 20,
      category: "restriction",
      type: "restriction-demand",
      themeId: theme.id,
      partId: theme.parts[1].id,
      body: "금제 토론이 빠르게 올라오는 중",
    },
  ];
  state.community.push(...specialEvents);

  const posts = getDailyCommunityPosts(state, 20);
  assert.equal(posts.length, 20);
  assert.deepEqual(
    posts.slice(0, 2).map((post) => post.id),
    specialEvents.map((event) => event.id),
  );
  assert.notStrictEqual(posts[0], state.community[0]);

  posts[0].body = "returned copy changed";
  assert.equal(state.community[0].body, "실전에서 새 카운터가 발견됐다");
});

test("bursts for four release days with strong, weak, art, and ban-support reactions", () => {
  let state = releaseWithMixedReactions();
  const expectedContextCounts = [16, 12, 8, 5];

  assert.equal(getReleaseReactionProfile(state, 60).surge, false);
  assert.equal(
    getDailyCommunityPosts(state, 60).some((post) =>
      post.id.startsWith("daily-release-"),
    ),
    false,
  );
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 4 });
  const before = JSON.stringify(state);
  for (let lifecycleIndex = 0; lifecycleIndex < 4; lifecycleIndex += 1) {
    const age = lifecycleIndex + 1;
    const day = 60 + age;
    const profile = getReleaseReactionProfile(state, day);
    const posts = getDailyCommunityPosts(state, day);
    const storedReleaseCount = posts.filter(
      (post) =>
        post.id.startsWith("community-") &&
        (post.type === "release-reaction" || post.type === "support-released"),
    ).length;
    const generatedReleaseCount = posts.filter((post) =>
      post.id.startsWith("daily-release-"),
    ).length;

    assert.equal(posts.length, 20);
    assert.equal(profile.surge, true);
    assert.equal(profile.age, age);
    assert.equal(profile.flags.greed, true);
    assert.equal(profile.flags.weak, true);
    assert.equal(profile.flags.backlash, true);
    assert.equal(
      storedReleaseCount + generatedReleaseCount,
      expectedContextCounts[lifecycleIndex],
      `DAY +${age}`,
    );
    assert.ok(
      posts.every((post) => !post.body.includes("발매 다음 날인데")),
    );
    assert.ok(getCommunityHeat(state, day) >= profile.heat);
  }

  const launchPosts = getDailyCommunityPosts(state, 61);
  assert.ok(
    launchPosts.some((post) => post.body.includes("이럴 거면 금제 왜 함")),
  );
  assert.ok(
    launchPosts.some((post) =>
      /돈에 미쳤네|파워 인플레|체급을 이렇게|매출 그래프|밸런스를 상품/.test(
        post.body,
      ),
    ),
  );
  assert.ok(
    launchPosts.some((post) =>
      /누가 사냐|돈 주고 맞추라고|너무 약함|약하게|반쪽 설계|매물 글|최소한 굴러가게/.test(
        post.body,
      ),
    ),
  );
  assert.ok(
    launchPosts.filter((post) =>
      /일러|색감|팬아트|비주얼|풀아트|카드명/.test(post.body),
    ).length >= 4,
  );
  assert.equal(JSON.stringify(state), before);
});

test("keeps only deterministic high-appeal fandom signals after launch", () => {
  const state = makeState(7712);
  const theme = THEMES[0];
  assert.ok(theme.appeal >= 70);
  state.releaseHistory.push({
    day: 50,
    products: [
      {
        optionId: "loyalty-product",
        kind: "support",
        themeId: theme.id,
        direction: "recovery",
        expectedTier: "Tier 1",
        powerAdjustment: 0,
      },
    ],
  });

  const first = getDailyCommunityPosts(state, 60);
  const second = getDailyCommunityPosts(state, 60);
  const loyalty = first.filter((post) => post.id.startsWith("daily-loyalty-"));
  assert.equal(loyalty.length, 1);
  assert.match(
    loyalty[0].body,
    /계속 굴린다|돌아오게|분위기|후회 안 함|팬들 대단|고정 유저/,
  );
  assert.deepEqual(first, second);
  assert.equal(getReleaseReactionProfile(state, 60).surge, false);
});

test("adds current-day fatigue chatter below release priority", () => {
  const state = makeState(1188);
  const targetId = state.activeThemeIds[0];
  state.themes[targetId].fatigue = 90;
  state.themes[targetId].topStreakDays = 90;

  const posts = getDailyCommunityPosts(state, state.day);
  const fatigue = posts.find((post) => post.id.startsWith("daily-fatigue-"));
  assert.ok(fatigue);
  assert.equal(fatigue.themeId, targetId);
  assert.match(fatigue.body, /게임 끈다|운영 의도|피곤한 단계|잡아먹은|금제할 때/);
  assert.ok(getCommunityHeat(state, state.day) >= 52);
  assert.equal(
    getDailyCommunityPosts(state, state.day - 1).some((post) =>
      post.id.startsWith("daily-fatigue-"),
    ),
    false,
  );
});

test("restriction reactions start next day and dominate the board 16/14/12", () => {
  let state = createInitialGame(1000);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 2 });
  const announcement = state.community.find(
    (event) =>
      event.day === 45 &&
      event.type === "restriction-applied",
  );
  assert.ok(announcement);

  const decisionPosts = getDailyCommunityPosts(state, 45);
  assert.equal(
    decisionPosts.some((post) => post.id === announcement.id),
    false,
  );
  assert.equal(
    decisionPosts.some((post) => post.id.startsWith("daily-restriction-45-")),
    false,
  );

  const storedNextDayIds = new Set(
    state.community
      .filter(
        (event) =>
          event.day === 46 &&
          event.type === "restriction-demand" &&
          event.partId === announcement.partId,
      )
      .map((event) => event.id),
  );
  const before = JSON.stringify(state);
  for (const [day, expected] of [
    [46, 16],
    [47, 14],
    [48, 12],
  ] as const) {
    const first = getDailyCommunityPosts(state, day);
    const second = getDailyCommunityPosts(state, day);
    const contextual = first.filter(
      (post) =>
        post.id.startsWith("daily-restriction-45-") ||
        storedNextDayIds.has(post.id),
    );
    assert.equal(first.length, 20);
    assert.equal(contextual.length, expected);
    assert.equal(new Set(contextual.map((post) => post.body)).size, expected);
    assert.deepEqual(first, second);
    assert.ok(getCommunityHeat(state, day) >= ([96, 84, 70] as const)[day - 46]);
    for (const post of contextual) {
      const theme = THEME_BY_ID[post.themeId];
      assert.ok(theme);
      assert.ok(theme.parts.some((part) => part.id === post.partId));
      assert.equal(post.value, announcement.value);
      assert.equal(post.previousValue, announcement.previousValue);
      assert.equal(post.relatedThemeId, undefined);
      assert.equal(post.body.includes("금제표 나온 지 하루 만에"), false);
    }
  }
  assert.equal(JSON.stringify(state), before);
});

test("a no-change restriction announcement also creates a delayed debate", () => {
  const state = makeNoChangeRestrictionState();

  assert.equal(
    getDailyCommunityPosts(state, 45).some(
      (post) => post.id === "no-change-announcement",
    ),
    false,
  );
  const posts = getDailyCommunityPosts(state, 46);
  const contextual = posts.filter((post) =>
    post.id.startsWith("daily-restriction-45-"),
  );
  assert.equal(posts.length, 20);
  assert.equal(contextual.length, 16);
  assert.ok(
    contextual.some((post) =>
      /변경 없음|현행 유지|아무것도 안 자른/.test(post.body),
    ),
  );
  assert.ok(contextual.every((post) => post.previousValue === post.value));
  for (const day of [46, 47, 48]) {
    const delayed = getDailyCommunityPosts(state, day).filter((post) =>
      post.id.startsWith("daily-restriction-45-"),
    );
    assert.ok(
      delayed.every(
        (post) =>
          !/가격 반토막|덱 해체|카드가 빠지면|우회 전개|금제 후 랭크|점유율만 빠지고|같이 맞았네|[0-3]→[0-3]/.test(
            post.body,
          ),
      ),
    );
  }
});

test("no-change debate condemns a stuck meta but defends a healthy one", () => {
  const healthy = makeNoChangeRestrictionState(3309);
  const unhealthy = structuredClone(healthy);
  setNoChangeMetaHealth(healthy, false);
  setNoChangeMetaHealth(unhealthy, true);
  const criticalPattern =
    /아무것도 안 자르냐|손을 아예 놨네|다음 금제로 미룬|경고등|책임을 유저|숨 쉴 틈|환경이 괜찮다는|쌓인 피로|검토 결과|고착에도|환경 개선보다|솜방망이 금제보다|신중함이 아니라 방치|상위권 집중|별개 문제|기준으로만/;
  const context = (state: GameState) =>
    getDailyCommunityPosts(state, 46).filter((post) =>
      post.id.startsWith("daily-restriction-45-"),
    );
  const healthyPosts = context(healthy);
  const unhealthyPosts = context(unhealthy);

  assert.equal(healthyPosts.length, 16);
  assert.equal(unhealthyPosts.length, 16);
  assert.equal(
    healthyPosts.filter((post) => criticalPattern.test(post.body)).length,
    0,
  );
  assert.ok(
    unhealthyPosts.filter((post) => criticalPattern.test(post.body)).length >=
      10,
  );
  assert.ok(
    healthyPosts.filter((post) =>
      /현행 유지|한 사이클 더|과잉 대응|지켜보자|관찰|금제보다 연구|변경 없음도 선택|유지는 납득|건드리지 않은|건드릴 이유/.test(
        post.body,
      ),
    ).length >= 8,
  );
});

test("restriction recency copy uses the latest support product, not theme debut", () => {
  let state = createInitialGame(1000);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 2 });
  const announcement = state.community.find(
    (event) => event.day === 45 && event.type === "restriction-applied",
  );
  assert.ok(announcement);
  state.releaseHistory.push({
    day: 40,
    products: [
      {
        optionId: "recent-restricted-support",
        kind: "support",
        themeId: announcement.themeId,
        direction: "recovery",
        expectedTier: "Tier 1",
        powerAdjustment: 0,
      },
    ],
  });
  const recencyPosts = [47, 48].flatMap((day) =>
    getDailyCommunityPosts(state, day)
      .filter((post) => post.id.startsWith("daily-restriction-45-"))
      .filter((post) => /발매 \d+일/.test(post.body)),
  );
  assert.ok(recencyPosts.length > 0);
  assert.ok(recencyPosts.every((post) => post.body.includes("발매 5일")));
  assert.ok(recencyPosts.every((post) => !post.body.includes("발매 44일")));
});

test("crosses prior theme strength with support strength in dense release chatter", () => {
  const cases = [
    {
      state: supportReactionState("strong", 3, false, 55101),
      expected:
        /상위권|1티어|강한 테마|밀어주|연임|메타 1위|왕관|환경 전체|다른 테마/,
    },
    {
      state: supportReactionState("strong", -3, false, 55102),
      expected: /애초에 왜 줌|그나마 다행|지원 자리|자원 낭비|왜 냈|실질 강화|다른 테마나/,
    },
    {
      state: supportReactionState("weak", 2, false, 55103),
      expected: /제대로 된 지원|메타 순환|구제 지원|비주류|실전덱|팬덱|새 얼굴|이 정도는 줘야/,
    },
    {
      state: supportReactionState("weak", -3, false, 55104),
      expected: /지원 자리.*아깝|지원 횟수|슬롯|날리|약한 .*약한|구제|팬들이 기다린/,
    },
  ];

  for (const { state, expected } of cases) {
    for (const [age, expectedQuota, expectedPlay] of [
      [1, 16, 10],
      [2, 12, 8],
      [3, 8, 5],
      [4, 5, 3],
    ] as const) {
      const day = 60 + age;
      const first = getDailyCommunityPosts(state, day);
      const second = getDailyCommunityPosts(state, day);
      const contextual = first.filter((post) => post.id.startsWith("daily-release-"));
      const productVoices = contextual.filter((post) => post.id.endsWith("-play"));
      assert.equal(contextual.length, expectedQuota, `DAY +${age}`);
      assert.equal(productVoices.length, expectedPlay, `DAY +${age}`);
      if (age === 1) {
        assert.ok(productVoices.some((post) => expected.test(post.body)), `DAY +${age}`);
      }
      assert.equal(
        new Set(contextual.map((post) => post.body)).size,
        contextual.length,
        `duplicate contextual copy on DAY +${age}`,
      );
      assert.ok(
        contextual.every((post) => !/^\[(?:티어|캐주얼|콜렉터|관전자|겜안분)/.test(post.body)),
      );
      assert.deepEqual(first, second);
    }
  }
});

test("calls out a Theseus rebuild when new cards displace an old weak-theme core", () => {
  const state = supportReactionState("weak", 3, true, 77703);
  const target = THEME_BY_ID[state.activeThemeIds[0]];
  const launchParts = target.parts.slice(0, INITIAL_THEME_PART_COUNT);
  const supportParts = target.parts.slice(
    INITIAL_THEME_PART_COUNT,
    INITIAL_THEME_PART_COUNT + SUPPORT_PARTS_PER_RELEASE,
  );
  const posts = getDailyCommunityPosts(state, 61)
    .filter((post) => post.id.startsWith("daily-release-"))
    .filter((post) => post.id.endsWith("-play"));

  assert.equal(posts.length, 10);
  assert.ok(posts.some((post) => post.body.includes("테세우스")));
  assert.ok(
    posts.some((post) => launchParts.some((part) => post.body.includes(part.name))),
  );
  assert.ok(
    posts.some((post) => supportParts.some((part) => post.body.includes(part.name))),
  );
  assert.ok(posts.every((post) => supportParts.some((part) => part.id === post.partId)));
  assert.ok(
    posts.filter((post) =>
      /기존|옛날|예전|구축|리메이크|정체성|테세우스|상위 호환|해고/.test(post.body),
    ).length >= 6,
  );
});

test("never names prepared-but-unreleased cards in historical community snapshots", () => {
  const state = supportReactionState("strong", 3, false, 88331);
  const targetId = state.activeThemeIds[0];
  const target = THEME_BY_ID[targetId];

  for (const day of [20, 60, 61, 64]) {
    const posts = getDailyCommunityPosts(state, day);
    for (const post of posts) {
      const content = THEME_BY_ID[post.themeId];
      const supportCount = state.releaseHistory.reduce(
        (count, batch) =>
          batch.day < day
            ? count +
              batch.products.filter(
                (product) =>
                  product.kind === "support" && product.themeId === post.themeId,
              ).length
            : count,
        0,
      );
      const releasedCount =
        INITIAL_THEME_PART_COUNT + supportCount * SUPPORT_PARTS_PER_RELEASE;
      const released = content.parts.slice(0, releasedCount);
      const unreleased = content.parts.slice(releasedCount);
      assert.ok(released.some((part) => part.id === post.partId), `${day}: ${post.id}`);
      assert.ok(
        unreleased.every((part) => !post.body.includes(part.name)),
        `${day}: ${post.body}`,
      );
    }
  }

  const beforeSupport = getDailyCommunityPosts(state, 60).filter(
    (post) => post.themeId === targetId,
  );
  assert.ok(
    beforeSupport.every((post) =>
      target.parts
        .slice(0, INITIAL_THEME_PART_COUNT)
        .some((part) => part.id === post.partId),
    ),
  );
});

test("keeps a first support wave's D+1 board identical after a later wave", () => {
  let state = createInitialGame(99551);
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: "white-night",
    direction: "consistency",
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 14 });
  assert.equal(state.day, 60);
  assert.ok(state.releaseSlate);
  const firstRequested = state.releaseSlate.options.find((option) => option.requested);
  assert.ok(firstRequested);
  const firstSelections = [
    firstRequested,
    ...state.releaseSlate.options.filter((option) => option.id !== firstRequested.id),
  ].slice(0, 3);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: firstSelections.map((option, index) => ({
      optionId: option.id,
      powerAdjustment: index === 0 ? 3 : 0,
    })),
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  const firstView = getDailyCommunityPosts(state, 61);
  assert.ok(firstView.some((post) => post.type === "support-released"));

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 15 });
  assert.equal(state.day, 76);
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: "white-night",
    direction: "recovery",
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 14 });
  assert.equal(state.day, 90);
  assert.ok(state.releaseSlate);
  const secondRequested = state.releaseSlate.options.find((option) => option.requested);
  assert.ok(secondRequested);
  const secondSelections = [
    secondRequested,
    ...state.releaseSlate.options.filter((option) => option.id !== secondRequested.id),
  ].slice(0, 3);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: secondSelections.map((option, index) => ({
      optionId: option.id,
      powerAdjustment: index === 0 ? -3 : 0,
    })),
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(state.themes["white-night"].supportCount, 2);
  assert.equal(state.themes["white-night"].lastSupportAdjustment, -3);

  const beforeHistoricalRead = JSON.stringify(state);
  assert.deepEqual(getDailyCommunityPosts(state, 61), firstView);
  assert.equal(JSON.stringify(state), beforeHistoricalRead);
});

test("routes unban debate through overdue, dangerous, surge, no-impact, and measured outcomes", () => {
  const cases: Array<{
    tone: UnbanFixtureTone;
    seed: number;
    primary: RegExp;
  }> = [
    {
      tone: "overdue",
      seed: 71001,
      primary: /왜 이제|그동안 왜|늦|오래|방치|걸렸|정상화|묶|떠난|금제는 빨랐/,
    },
    {
      tone: "dangerous",
      seed: 71002,
      primary: /왜 풀|상위권|불쾌|독주|봉인|위험|미러전|강했|환경 피로|금제한 문제/,
    },
    {
      tone: "surge",
      seed: 71003,
      primary: /봐라|복귀|급등|반등|수직|상위 재진입|다시 안 뜬다|복구|메타 시계|추세/,
    },
    {
      tone: "no-impact",
      seed: 71004,
      primary: /거의 그대로|괜히 겁|아무 일|달라진 게|영향 없음|미동|과잉 대응|아무 변화|진작|조용/,
    },
    {
      tone: "measured",
      seed: 71005,
      primary: /적당|환영|선택지|메타 순환|숨통|복귀 폭|돌려주는|경쟁권|균형|성공적인/,
    },
  ];
  const caution =
    /표본|지켜봐|최소 한 주|데이터|신중|달라질 수|가능성|방심|확인하자|대응하면|며칠|성급|매치업 분포|관찰/;

  for (const { tone, seed, primary } of cases) {
    const state = unbanReactionState(tone, seed);
    const before = JSON.stringify(state);
    for (const [age, quota, cautionCount] of [
      [1, 16, 3],
      [2, 14, 3],
      [3, 12, 2],
    ] as const) {
      const posts = getDailyCommunityPosts(state, 135 + age).filter((post) =>
        post.id.startsWith("daily-restriction-135-"),
      );
      assert.equal(posts.length, quota, `${tone} D+${age}`);
      assert.equal(new Set(posts.map((post) => post.body)).size, quota);
      assert.ok(
        posts.filter((post) => primary.test(post.body)).length >=
          Math.floor(quota * 0.35),
        `${tone} primary D+${age}`,
      );
      const cautionNumbers = age === 1 ? [5, 10, 15] : age === 2 ? [4, 9, 13] : [5, 10];
      const routedCaution = posts.filter((post) => {
        const match = post.id.match(/-(\d+)-(\d{2})$/);
        return match ? cautionNumbers.includes(Number(match[2])) : false;
      });
      assert.equal(routedCaution.length, cautionCount, `${tone} caution D+${age}`);
      assert.ok(routedCaution.every((post) => caution.test(post.body)));
      assert.ok(posts.every((post) => post.value === 3 && post.previousValue === 1));
      assert.ok(posts.every((post) => !/^\[(?:티어|캐주얼|콜렉터|관전자)/.test(post.body)));
    }
    assert.equal(JSON.stringify(state), before);
  }
});

test("historical unban reactions ignore later runtime and restriction changes", () => {
  const state = unbanReactionState("surge", 72001);
  const historical = getDailyCommunityPosts(state, 136);
  const later = structuredClone(state);
  later.day = 230;
  later.themes.cycle.share = 0.5;
  later.themes.cycle.unpleasantness = 99;
  later.themes.cycle.fatigue = 99;
  later.themes.cycle.legalLimits["cycle-gate"] = 0;
  later.community.push({
    id: "future-cycle-restriction",
    day: 225,
    category: "restriction",
    type: "restriction-applied",
    themeId: "cycle",
    partId: "cycle-gate",
    value: 0,
    previousValue: 3,
    body: "미래 금제",
  });
  later.history.push({
    day: 230,
    totalUsers: 9_000,
    revenue: 0.4,
    topThemeId: "cycle",
    shares: Object.fromEntries(
      later.activeThemeIds.map((themeId) => [
        themeId,
        themeId === "cycle" ? 0.5 : 0.5 / (later.activeThemeIds.length - 1),
      ]),
    ),
  });

  assert.deepEqual(getDailyCommunityPosts(later, 136), historical);
});

test("periodically asks to free long-restricted off-meta cards without flooding", () => {
  const state = staleRestrictionState(false, 73001);
  const activeDays: number[] = [];
  let captured: CommunityEvent[] | null = null;
  for (let day = 139; day <= 169; day += 1) {
    const board = getDailyCommunityPosts(state, day);
    const stale = board.filter((post) =>
      post.id.startsWith("daily-stale-restriction-"),
    );
    assert.equal(board.length, 20);
    assert.ok(stale.length <= 2);
    if (stale.length > 0) {
      activeDays.push(day);
      captured ??= board;
      assert.ok(
        stale.every((post) =>
          /아직 제한|왜 계속|화석|유지할 이유|묶|복역|겁|방치|장기 제한|티어표|입상|공동묘지|시대가 바뀐|해제 검토/.test(
            post.body,
          ),
        ),
      );
    }
  }
  assert.ok(activeDays.length >= 3);
  for (let index = 1; index < activeDays.length; index += 1) {
    const gap = activeDays[index] - activeDays[index - 1];
    assert.ok(gap >= 5 && gap <= 9, `ambient gap ${gap}`);
  }
  assert.ok(captured);

  const historicalDay = activeDays[0];
  const historical = getDailyCommunityPosts(state, historicalDay);
  const later = structuredClone(state);
  later.day = 230;
  later.themes.cycle.share = 0.4;
  later.themes.cycle.legalLimits["cycle-gate"] = 3;
  later.history.push({
    day: 230,
    totalUsers: 8_000,
    revenue: 0.3,
    topThemeId: "cycle",
    shares: Object.fromEntries(
      later.activeThemeIds.map((themeId) => [
        themeId,
        themeId === "cycle" ? 0.4 : 0.6 / (later.activeThemeIds.length - 1),
      ]),
    ),
  });
  later.community.push({
    id: "future-unban",
    day: 225,
    category: "restriction",
    type: "restriction-applied",
    themeId: "cycle",
    partId: "cycle-gate",
    value: 3,
    previousValue: 1,
    body: "미래 해제",
  });
  assert.deepEqual(getDailyCommunityPosts(later, historicalDay), historical);
});

test("prioritizes an overdue unban request after a no-change restriction review", () => {
  const state = staleRestrictionState(true, 74001);
  const posts = getDailyCommunityPosts(state, 136);
  const contextual = posts.filter((post) =>
    post.id.startsWith("daily-restriction-135-"),
  );
  const stale = contextual.filter((post) => post.id.includes("-stale-"));
  assert.equal(posts.length, 20);
  assert.equal(contextual.length, 16);
  assert.equal(stale.length, 1);
  assert.ok(posts.slice(0, 2).some((post) => post.id === stale[0].id));
  assert.match(stale[0].body, /왜|화석|묶|제한|금제표|복역|사라진/);
  assert.equal(stale[0].value, stale[0].previousValue);
});

test("formats full and partial restriction relief explicitly", () => {
  const state = makeState(75001);
  const base: CommunityEvent = {
    id: "format-unban",
    day: 135,
    category: "restriction",
    type: "restriction-applied",
    themeId: "cycle",
    partId: "cycle-gate",
    value: 3,
    previousValue: 1,
    body: "",
  };
  assert.match(formatCommunityEvent(base, state), /제한 해제 1→3장/);
  assert.match(
    formatCommunityEvent(
      { ...base, id: "format-relief", value: 2 },
      state,
    ),
    /제한 완화 1→2장/,
  );
});
