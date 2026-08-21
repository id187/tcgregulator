import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXTUAL_TUTORIALS,
  CONTEXTUAL_TUTORIAL_TOPIC_IDS,
  TAB_TUTORIALS,
  TAB_TUTORIAL_TAB_IDS,
  createContextualTutorialVisitState,
  createTabTutorialVisitState,
  getContextualTutorialPages,
  getFirstVisitTabTutorial,
  getPendingTutorialPopups,
  getTabTutorial,
  getTabTutorialPages,
  isTabTutorialSeriesComplete,
  isContextualTutorialTriggered,
  isTabTutorialGuidanceActive,
  markContextualTutorialVisited,
  markTabTutorialVisited,
  shouldOpenContextualTutorial,
  shouldOpenTabTutorial,
  type TabTutorialTabId,
} from "../app/game/tab-tutorial.ts";

function tutorialText(tab: TabTutorialTabId): string {
  return getTabTutorialPages(tab)
    .flatMap((page) => [
      page.title,
      page.body,
      ...(page.terms ?? []).flatMap((term) => [term.label, term.description]),
    ])
    .join("\n");
}

test("tab tutorials cover every primary game tab in navigation order", () => {
  assert.deepEqual(TAB_TUTORIAL_TAB_IDS, [
    "distribution",
    "cards",
    "releases",
    "operations",
    "community",
    "news",
    "finance",
  ]);
  assert.deepEqual(Object.keys(TAB_TUTORIALS), TAB_TUTORIAL_TAB_IDS);

  for (const tab of TAB_TUTORIAL_TAB_IDS) {
    const tutorial = getTabTutorial(tab);
    assert.equal(tutorial.tab, tab);
    assert.ok(tutorial.label.length > 0);
    assert.ok(tutorial.pages.length >= 2);
    assert.equal(getTabTutorialPages(tab), tutorial.pages);
  }
});

test("every tutorial page has stable, unique, readable content", () => {
  const pageIds = new Set<string>();

  for (const tab of TAB_TUTORIAL_TAB_IDS) {
    for (const page of getTabTutorialPages(tab)) {
      assert.match(page.id, new RegExp(`^${tab}-`));
      assert.equal(pageIds.has(page.id), false, `duplicate page id: ${page.id}`);
      pageIds.add(page.id);
      assert.ok(page.title.trim().length > 0, `${page.id} needs a title`);
      assert.ok(page.body.trim().length > 0, `${page.id} needs body copy`);

      const termLabels = new Set<string>();
      for (const term of page.terms ?? []) {
        assert.ok(term.label.trim().length > 0, `${page.id} has an empty term`);
        assert.ok(
          term.description.trim().length > 0,
          `${page.id}/${term.label} needs a description`,
        );
        assert.equal(
          termLabels.has(term.label),
          false,
          `${page.id} repeats ${term.label}`,
        );
        termLabels.add(term.label);
      }
    }
  }
});

test("the first distribution tutorial explains the shared shell and distribution screen", () => {
  const pages = getTabTutorialPages("distribution");
  const text = tutorialText("distribution");

  assert.deepEqual(
    pages.map((page) => page.sectionLabel),
    ["인수인계", "인수인계", "인수인계", "인수인계", "분포", "분포"],
  );

  for (const phrase of [
    "이 회사의 TCG 운영 책임자",
    "최고의 TCG",
    "금제 리스트",
    "키워드 도감",
    "DAY",
    "활성 유저",
    "보유자금",
    "다음 발매",
    "금제위원회",
    "PLAY 화면",
    "+1일",
    "다음 일정까지",
    "입상 점유율",
    "유저 비율",
    "오늘의 입상표",
    "생태계 건강",
    "상위 3개 집중",
    "구매 신뢰",
    "커뮤니티 여론",
    "최근 30일 매출",
  ]) {
    assert.match(text, new RegExp(phrase.replace(/[+]/g, "\\+")), phrase);
  }

  for (const segment of ["메타층", "캐주얼층", "콜렉터층", "리셀층"]) {
    assert.match(text, new RegExp(segment));
  }
});

test("each tab tutorial names the information and controls visible in that tab", () => {
  const expectedPhrases: Readonly<
    Record<Exclude<TabTutorialTabId, "distribution">, readonly string[]>
  > = {
    cards: [
      "테마 리스트",
      "범용 리스트",
      "유저 비율",
      "입상 점유율",
      "승률",
      "지원",
      "간접",
      "저격",
      "재판",
      "채용률",
      "시세",
      "금제 일정",
    ],
    releases: [
      "발매 기록",
      "카드팩",
      "대표 신테마",
      "수록 구성",
      "파워",
    ],
    operations: [
      "보유 운영자금",
      "순운영 현금",
      "구매 신뢰",
      "환경 건강",
      "집행 주기",
      "일반 · 상태 기반 확률",
      "위험 · 결정일 챌린지",
      "위험 · 적발 확률",
      "집행 버튼",
      "진행 중",
      "최근 기록",
    ],
    community: [
      "게시글",
      "좋아요 / 인기",
      "열기",
      "← 이전 날 / 다음 날 →",
      "오늘",
      "반응 띠",
    ],
    news: [
      "좋은 소식 / 나쁜 소식",
      "소식 항목",
      "← 이전 날 / 다음 날 →",
      "오늘",
      "화면 옆 연속 소식",
      "× 버튼",
    ],
    finance: [
      "전일 대비",
      "최대 90일",
      "매출 / 보유자금",
      "건강 / 신뢰 / 여론",
      "R / B",
      "마우스",
      "매출·환경 역행",
      "그래프 범례",
    ],
  };

  for (const [tab, phrases] of Object.entries(expectedPhrases) as Array<
    [Exclude<TabTutorialTabId, "distribution">, readonly string[]]
  >) {
    const text = tutorialText(tab);
    for (const phrase of phrases) {
      assert.ok(text.includes(phrase), `${tab} tutorial must explain ${phrase}`);
    }
  }
});

test("first-visit state is immutable and tracked independently for each tab", () => {
  const initial = createTabTutorialVisitState();
  assert.deepEqual(initial, {
    distribution: false,
    cards: false,
    releases: false,
    operations: false,
    community: false,
    news: false,
    finance: false,
  });

  const context = { guidanceEnabled: true } as const;
  assert.equal(shouldOpenTabTutorial("distribution", initial, context), true);
  assert.equal(
    getFirstVisitTabTutorial("distribution", initial, context),
    TAB_TUTORIALS.distribution,
  );

  const afterDistribution = markTabTutorialVisited(initial, "distribution");
  assert.notEqual(afterDistribution, initial);
  assert.equal(initial.distribution, false);
  assert.equal(afterDistribution.distribution, true);
  assert.equal(
    shouldOpenTabTutorial("distribution", afterDistribution, context),
    false,
  );
  assert.equal(
    getFirstVisitTabTutorial("distribution", afterDistribution, context),
    null,
  );
  assert.equal(shouldOpenTabTutorial("cards", afterDistribution, context), true);
  assert.equal(
    markTabTutorialVisited(afterDistribution, "distribution"),
    afterDistribution,
    "marking an already-read tab should preserve the state reference",
  );

  const restored = createTabTutorialVisitState(["distribution", "cards"]);
  assert.equal(restored.distribution, true);
  assert.equal(restored.cards, true);
  assert.equal(restored.finance, false);
});

test("the help series completes only after seven tabs and both first decisions", () => {
  const allTabs = createTabTutorialVisitState(TAB_TUTORIAL_TAB_IDS);
  const bothDecisions = createContextualTutorialVisitState([
    "first-restriction",
    "first-release",
  ]);

  assert.equal(
    TAB_TUTORIAL_TAB_IDS.length + CONTEXTUAL_TUTORIAL_TOPIC_IDS.length,
    9,
  );

  for (const missingTab of TAB_TUTORIAL_TAB_IDS) {
    const tabsExceptOne = createTabTutorialVisitState(
      TAB_TUTORIAL_TAB_IDS.filter((tab) => tab !== missingTab),
    );
    assert.equal(
      isTabTutorialSeriesComplete(tabsExceptOne, bothDecisions),
      false,
      `series must remain incomplete without ${missingTab}`,
    );
  }

  for (const missingTopic of CONTEXTUAL_TUTORIAL_TOPIC_IDS) {
    const decisionsExceptOne = createContextualTutorialVisitState(
      CONTEXTUAL_TUTORIAL_TOPIC_IDS.filter(
        (topic) => topic !== missingTopic,
      ),
    );
    assert.equal(
      isTabTutorialSeriesComplete(allTabs, decisionsExceptOne),
      false,
      `series must remain incomplete without ${missingTopic}`,
    );
  }

  assert.equal(isTabTutorialSeriesComplete(allTabs, bothDecisions), true);
});

test("tab help is date-independent and follows only guidance and completion", () => {
  const visits = createTabTutorialVisitState();
  assert.equal(isTabTutorialGuidanceActive({ guidanceEnabled: true }), true);
  assert.equal(
    isTabTutorialGuidanceActive({ guidanceEnabled: false }),
    false,
  );
  assert.equal(
    shouldOpenTabTutorial("finance", visits, { guidanceEnabled: true }),
    true,
  );
  assert.equal(
    shouldOpenTabTutorial("finance", visits, { guidanceEnabled: false }),
    false,
  );

  const completed = markTabTutorialVisited(visits, "finance");
  assert.equal(
    shouldOpenTabTutorial("finance", completed, { guidanceEnabled: true }),
    false,
    "turning guidance back on must not reopen a completed tab",
  );
  assert.equal(
    shouldOpenTabTutorial(
      "finance",
      createTabTutorialVisitState(),
      { guidanceEnabled: true },
    ),
    true,
    "a new campaign resets first-visit completion",
  );
});

test("restriction and release help are separate contextual topics", () => {
  assert.deepEqual(CONTEXTUAL_TUTORIAL_TOPIC_IDS, [
    "first-restriction",
    "first-release",
  ]);
  assert.deepEqual(Object.keys(CONTEXTUAL_TUTORIALS), [
    "first-restriction",
    "first-release",
  ]);

  const contextualPageIds = new Set<string>();
  for (const topic of CONTEXTUAL_TUTORIAL_TOPIC_IDS) {
    const tutorial = CONTEXTUAL_TUTORIALS[topic];
    assert.equal(tutorial.topic, topic);
    assert.equal(
      tutorial.tab,
      topic === "first-restriction" ? "cards" : "releases",
    );
    assert.ok(tutorial.pages.length >= 2);
    for (const page of tutorial.pages) {
      assert.match(page.id, new RegExp(`^${topic}-`));
      assert.equal(contextualPageIds.has(page.id), false);
      contextualPageIds.add(page.id);
    }
  }

  const restrictionText = getContextualTutorialPages("first-restriction")
    .flatMap((page) => [
      page.title,
      page.body,
      ...(page.terms ?? []).flatMap((term) => [term.label, term.description]),
    ])
    .join("\n");
  for (const phrase of [
    "입상표",
    "시세",
    "구매 신뢰",
    "0 · 금지",
    "1 · 제한",
    "2 · 준제한",
    "3 · 무제한",
    "절반",
    "초기화",
    "금제안 제출",
    "변경 없음",
  ]) {
    assert.ok(restrictionText.includes(phrase), phrase);
  }

  const releaseText = getContextualTutorialPages("first-release")
    .flatMap((page) => [
      page.title,
      page.body,
      ...(page.terms ?? []).flatMap((term) => [term.label, term.description]),
    ])
    .join("\n");
  for (const phrase of [
    "강한 카드",
    "약한 카드",
    "이미 결정",
    "신테마",
    "지원",
    "범용",
    "4종",
    "예약 재판",
    "-3",
    "0",
    "+3",
    "발매 확정",
    "DAY 30",
  ]) {
    assert.ok(releaseText.includes(phrase), phrase);
  }

  assert.equal(tutorialText("cards").includes("0 · 금지"), false);
  assert.equal(tutorialText("cards").includes("금제안 제출"), false);
  assert.equal(tutorialText("releases").includes("발매 확정"), false);
  assert.equal(tutorialText("releases").includes("-3"), false);
});

test("contextual topics trigger once at their decision states", () => {
  const initial = createContextualTutorialVisitState();
  assert.deepEqual(initial, {
    "first-restriction": false,
    "first-release": false,
  });

  const banContext = {
    guidanceEnabled: true,
    day: 15,
    phase: "ban-edit",
  } as const;
  const releaseContext = {
    guidanceEnabled: true,
    day: 30,
    phase: "release-edit",
  } as const;

  assert.equal(
    isContextualTutorialTriggered("first-restriction", banContext),
    true,
  );
  assert.equal(
    shouldOpenContextualTutorial("first-restriction", initial, banContext),
    true,
  );
  assert.equal(
    isContextualTutorialTriggered("first-release", releaseContext),
    true,
  );
  assert.equal(
    shouldOpenContextualTutorial("first-release", initial, releaseContext),
    true,
  );

  assert.equal(
    isContextualTutorialTriggered("first-restriction", {
      ...banContext,
      phase: "running",
    }),
    false,
  );
  assert.equal(
    isContextualTutorialTriggered("first-release", {
      ...releaseContext,
      guidanceEnabled: false,
    }),
    false,
  );

  const afterRestriction = markContextualTutorialVisited(
    initial,
    "first-restriction",
  );
  assert.equal(initial["first-restriction"], false);
  assert.equal(afterRestriction["first-restriction"], true);
  assert.equal(
    shouldOpenContextualTutorial(
      "first-restriction",
      afterRestriction,
      banContext,
    ),
    false,
  );
  assert.equal(
    markContextualTutorialVisited(afterRestriction, "first-restriction"),
    afterRestriction,
    "confirming the same contextual topic twice must be idempotent",
  );
});

test("a tab overview is queued before a pending contextual topic", () => {
  const freshTabs = createTabTutorialVisitState();
  const freshContexts = createContextualTutorialVisitState();
  const banContext = {
    guidanceEnabled: true,
    day: 15,
    phase: "ban-edit",
  } as const;

  assert.deepEqual(
    getPendingTutorialPopups("cards", freshTabs, freshContexts, banContext).map(
      (popup) => [popup.kind, popup.id],
    ),
    [
      ["tab", "cards"],
      ["contextual", "first-restriction"],
    ],
  );

  const cardsRead = markTabTutorialVisited(freshTabs, "cards");
  assert.deepEqual(
    getPendingTutorialPopups("cards", cardsRead, freshContexts, banContext).map(
      (popup) => [popup.kind, popup.id],
    ),
    [["contextual", "first-restriction"]],
    "the decision topic must still open after the tab overview was completed",
  );

  const restrictionRead = markContextualTutorialVisited(
    freshContexts,
    "first-restriction",
  );
  assert.deepEqual(
    getPendingTutorialPopups(
      "cards",
      cardsRead,
      restrictionRead,
      banContext,
    ),
    [],
  );
  const duplicateRestrictionRead = markContextualTutorialVisited(
    restrictionRead,
    "first-restriction",
  );
  assert.equal(duplicateRestrictionRead, restrictionRead);
  assert.deepEqual(
    getPendingTutorialPopups(
      "cards",
      cardsRead,
      duplicateRestrictionRead,
      banContext,
    ),
    [],
    "a duplicate confirmation must not enqueue the contextual popup again",
  );

  const releaseContext = {
    guidanceEnabled: true,
    day: 30,
    phase: "release-edit",
  } as const;
  assert.deepEqual(
    getPendingTutorialPopups(
      "releases",
      freshTabs,
      freshContexts,
      releaseContext,
    ).map((popup) => [popup.kind, popup.id]),
    [
      ["tab", "releases"],
      ["contextual", "first-release"],
    ],
  );

  assert.deepEqual(
    getPendingTutorialPopups(
      "releases",
      freshTabs,
      freshContexts,
      banContext,
    ).map((popup) => [popup.kind, popup.id]),
    [["tab", "releases"]],
    "a contextual topic must only queue on its own tab",
  );
  assert.deepEqual(
    getPendingTutorialPopups(
      "cards",
      freshTabs,
      freshContexts,
      { ...banContext, guidanceEnabled: false },
    ),
    [],
    "disabled guidance must suppress both tab and contextual popups",
  );
});
