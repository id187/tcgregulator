import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LotusSymbol } from "./LotusSymbol";

export type GuidedTutorialBrief = {
  kicker: string;
  title: string;
  message: string;
  controlIds?: readonly string[];
  inspection?: boolean;
  hoverInspection?: boolean;
  informational?: boolean;
  freeInteraction?: boolean;
};

type GuidedTutorialTerm = {
  id: string;
  label: string;
  match: string;
};

export type GuidedTutorialPage = {
  message: string;
  termId?: string;
  termLabel?: string;
  terms: GuidedTutorialTerm[];
};

const TUTORIAL_TERM_DEFINITIONS: ReadonlyArray<{
  id: string;
  label: string;
  matches: readonly string[];
}> = [
  { id: "active-users", label: "활성 유저", matches: ["활성 유저"] },
  { id: "user-share", label: "유저 비율", matches: ["유저 비율"] },
  { id: "meta-segment", label: "메타층", matches: ["메타층"] },
  { id: "casual-segment", label: "캐주얼층", matches: ["캐주얼층"] },
  { id: "collector-segment", label: "콜렉터층", matches: ["콜렉터층"] },
  { id: "reseller-segment", label: "리셀층", matches: ["리셀층"] },
  { id: "placement", label: "입상", matches: ["입상"] },
  {
    id: "top-cut-share",
    label: "탑컷 비율",
    matches: ["탑컷 점유율", "탑컷 비율"],
  },
  { id: "adoption-rate", label: "채용률", matches: ["채용률"] },
  { id: "win-rate", label: "승률", matches: ["승률"] },
  { id: "card-market-price", label: "시세", matches: ["카드 시세", "시세"] },
  {
    id: "environment-health",
    label: "환경 건강도",
    matches: ["환경 건강도", "환경 건강", "생태계 건강"],
  },
  { id: "purchase-trust", label: "구매 신뢰", matches: ["구매 신뢰"] },
  { id: "forbidden", label: "금지", matches: ["금지"] },
  { id: "limited", label: "제한", matches: ["제한"] },
  { id: "semi-limited", label: "준제한", matches: ["준제한"] },
  { id: "unlimited", label: "무제한", matches: ["무제한"] },
  { id: "restriction-reset", label: "초기화", matches: ["초기화"] },
  { id: "restriction-submit", label: "제출", matches: ["제출"] },
  { id: "sound-control", label: "SFX", matches: ["SFX"] },
  { id: "settings-control", label: "설정", matches: ["설정"] },
  {
    id: "tutorial-page-navigation",
    label: "이전·다음",
    matches: ["이전과 다음"],
  },
  { id: "tutorial-skip", label: "건너뛰기", matches: ["건너뛰기"] },
  {
    id: "tutorial-home",
    label: "메인 화면으로",
    matches: ["메인 화면으로"],
  },
];

function buildTutorialPage(message: string): GuidedTutorialPage {
  const terms = TUTORIAL_TERM_DEFINITIONS.flatMap((definition) => {
    const match = definition.matches.find((candidate) =>
      message.includes(candidate),
    );
    return match ? [{ id: definition.id, label: definition.label, match }] : [];
  }).sort((left, right) => right.match.length - left.match.length);
  return {
    message,
    termId: terms[0]?.id,
    termLabel: terms[0]?.label,
    terms,
  };
}

function addDescriptionToken(element: HTMLElement, token: string) {
  const tokens = new Set((element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
  tokens.add(token);
  element.setAttribute("aria-describedby", [...tokens].join(" "));
}

function removeDescriptionToken(element: HTMLElement, token: string) {
  const tokens = (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((value) => value && value !== token);
  if (tokens.length > 0) element.setAttribute("aria-describedby", tokens.join(" "));
  else element.removeAttribute("aria-describedby");
}

function renderTutorialMessage(page: GuidedTutorialPage): ReactNode[] {
  const result: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  while (cursor < page.message.length) {
    let selected: GuidedTutorialTerm | null = null;
    let selectedIndex = Number.POSITIVE_INFINITY;
    for (const term of page.terms) {
      const index = page.message.indexOf(term.match, cursor);
      if (index < 0) continue;
      if (
        index < selectedIndex ||
        (index === selectedIndex && term.match.length > (selected?.match.length ?? 0))
      ) {
        selected = term;
        selectedIndex = index;
      }
    }
    if (!selected || !Number.isFinite(selectedIndex)) {
      result.push(page.message.slice(cursor));
      break;
    }
    if (selectedIndex > cursor) {
      result.push(page.message.slice(cursor, selectedIndex));
    }
    result.push(
      <mark className="guided-term-mark" data-term-id={selected.id} key={`${selected.id}-${key}`}>
        {selected.match}
      </mark>,
    );
    cursor = selectedIndex + selected.match.length;
    key += 1;
  }
  return result;
}

function getStepExplainers(step: string): string[] {
  switch (step) {
    case "day1-controls":
      return [
        "SFX는 효과음을 켜고 끄는 버튼입니다. 튜토리얼에서는 설정을 바꾸지 않고 위치와 기능만 기억합니다.",
        "설정은 효과음·파급 효과·테스트 화면·모션 감소를 조정합니다. 메인 화면의 SETTINGS와 같은 인터페이스 설정입니다.",
        "이전과 다음은 설명 페이지만 이동합니다. 건너뛰기는 DAY 45로 이동하고, 메인 화면으로는 현재 진행을 저장한 뒤 타이틀로 돌아갑니다.",
      ];
    case "day1-banlist":
      return [
        "금제 리스트는 현재 허용 매수가 3장보다 적은 카드만 보여줍니다. 정책을 바꾸는 화면이 아니라 빠르게 확인하는 참고 창입니다.",
        "같은 버튼을 다시 누르거나 바깥을 누르면 닫힙니다. 다른 참고 버튼을 누르면 열린 창이 교체됩니다.",
      ];
    case "day1-keywords":
      return [
        "키워드는 카드가 덱에서 맡는 기능을 짧게 묶은 말입니다. 초동·대응·회수 같은 용어를 모르면 이 도감에서 뜻을 확인하세요.",
        "도감도 같은 버튼을 다시 누르거나 바깥을 누르면 닫힙니다. 금제 리스트와 동시에 두 창이 열리지는 않습니다.",
      ];
    case "day1-distribution-mode":
      return [
        "탑컷 비율은 최근 대회 상위 자리의 테마 구성이고, 유저 비율은 플레이어 계층의 구성입니다.",
        "두 기준은 분모가 다릅니다. 강한 대회 성과와 많은 플레이어 수를 같은 수치로 해석하지 마세요.",
      ];
    case "day1-community":
      return [
        "활성 유저는 오늘 게임에 남아 있는 전체 인원입니다. 유저 비율은 이 인원이 어떤 방식으로 TCG를 즐기는지 나눈 구성비입니다.",
        "메타층은 대회 성과를 좇고, 캐주얼층은 가볍게 플레이합니다. 두 계층의 변화는 경쟁 환경과 접근성을 보여줍니다.",
        "콜렉터층은 수집을, 리셀층은 재판매를 중시합니다. 네 계층을 합치면 전체 활성 유저가 됩니다.",
      ];
    case "day1-community-read":
    case "day31-community-read":
    case "day46-community-read":
      return [
        "커뮤니티 글은 체감과 감정을 보여주는 신호입니다. 글의 양이나 어조가 강해도 전체 유저의 행동을 그대로 대표하지는 않습니다.",
        "같은 불만이 반복되면 원인을 메타 분포·활성 유저·구매 신뢰와 대조하세요. 말과 실제 이탈이 함께 움직일 때 운영 위험이 커집니다.",
      ];
    case "day22-advance":
      return [
        "+1일은 결정 직후 반응을 세밀하게 볼 때, +7일은 추세가 이어지는지 확인할 때 사용합니다. 하루의 급등락만으로 장기 방향을 단정하지 마세요.",
        "시간이 흐르면 연구·피로·사업 효과가 함께 반영됩니다. 진행 전 현재 수치를 기억하고, 진행 뒤 무엇이 얼마나 달라졌는지 비교하세요.",
      ];
    case "day8-placement-read":
      return [
        "입상은 대회에서 상위권에 들어 기록된 결과입니다. 입상표는 오늘 어떤 테마가 상위 자리를 몇 석 차지했는지 보여줍니다.",
        "탑컷은 예선을 통과해 본선 상위권에 든 덱들의 묶음입니다. 탑컷 비율은 그 자리 전체에서 각 테마가 차지한 몫입니다.",
        "입상 수가 많으면 그 테마가 오늘 대회에서 자주 성과를 냈다는 뜻입니다. 하루 결과와 장기 추세는 구분해서 보세요.",
        "오늘 입상 결과는 다음 날 채용률과 카드 시세에 반영됩니다. 채용률은 덱에서 실제로 선택된 비율, 시세는 현재 거래 가격입니다.",
      ];
    case "day8-distribution-links":
      return [
        "도넛 조각에 마우스를 올리거나 키보드로 초점을 옮기면 중앙 수치가 그 항목으로 바뀝니다.",
        "테마 조각이나 오른쪽 테마 행을 누르면 카드 탭의 해당 테마 상세로 이동합니다. 기타와 유저 계층은 합산 정보라 상세 이동이 없습니다.",
      ];
    case "day15-card-catalog-generic":
      return [
        "테마 리스트는 한 테마에 속한 카드 묶음을, 범용 리스트는 여러 테마가 함께 채용하는 카드를 보여줍니다.",
        "두 목록 모두 현재 시세와 7일 등락, 현행 허용 매수를 같은 열에서 비교합니다.",
      ];
    case "day1-card-overview":
      return [
        "유저 비율은 전체 활성 유저 중 그 테마를 쓰는 사람의 비중입니다. 탑컷 비율은 최근 대회 상위 자리에서 그 테마가 차지한 비중입니다.",
        "승률은 그 테마가 환경 전체를 상대로 거둔 평균 성과입니다. 사용자가 많다는 사실과 대회에서 강하다는 사실은 구분해서 보세요.",
      ];
    case "day15-part":
      return [
        "파츠 채용률은 그 테마 덱 중 이 카드를 쓰는 비율입니다. 평균 매수는 채용한 덱이 보통 몇 장을 넣는지 보여줍니다.",
        "시세는 카드의 현재 거래 가격입니다. 7일 등락은 일주일 전보다 가격이 얼마나 오르거나 내렸는지 보여줍니다.",
        "입상이 늘고 이 카드를 찾는 사람이 많아지면 시세도 오를 수 있습니다.",
        "현행 제한은 한 덱에 넣을 수 있는 현재 매수입니다. 채용률·평균 매수·핵심 역할이 모두 높을수록 제한의 파급도 커집니다.",
      ];
    case "day15-request-support":
      return [
        "지원 요청은 기존 테마의 안정성·대응력·결과물·회수 중 다음 보강 방향을 선택합니다.",
        "요청은 다음 발매 후보를 바꾸는 기능입니다. 튜토리얼이 끝난 뒤 환경에 실제로 필요한 경우에만 사용하세요.",
      ];
    case "day15-request-indirect":
      return [
        "간접 지원은 테마 전용 카드가 아니라 같은 키워드를 공유하는 범용 카드를 요청합니다.",
        "여러 덱이 함께 쓸 수 있으므로 선택한 테마 밖의 환경에도 영향을 줄 수 있습니다.",
      ];
    case "day15-request-target":
      return [
        "환경 저격은 선택한 테마를 상대하기 좋은 범용 카드를 요청합니다.",
        "상위 테마를 누를 수 있지만 다른 덱도 같은 카드를 채용할 수 있으므로 새 중심 카드가 될 가능성까지 살펴야 합니다.",
      ];
    case "day15-request-reprint":
      return [
        "재판은 이미 출시된 카드의 공급을 늘려 접근성을 높입니다.",
        "가격 부담은 낮출 수 있지만 기존 보유가치와 구매 신뢰에 충격을 줄 수 있습니다. 튜토리얼 중에는 어떤 요청도 저장되지 않습니다.",
      ];
    case "day15-finance-read":
      return [
        "매출은 오늘 발생한 판매 규모이고, 보유자금은 비용 정산 뒤 실제로 쓸 수 있는 돈입니다. 매출 상승과 현금 여유는 같은 뜻이 아닙니다.",
        "환경 건강도는 경기 품질·탑컷 다양성·상위권 순환·세대 공존을 모은 점수입니다. 높을수록 여러 덱이 건강하게 경쟁한다는 뜻입니다.",
        "구매 신뢰와 활성 유저가 매출과 함께 오르면 지속 가능한 성장에 가깝습니다. 매출만 오르고 신뢰·건강·여론이 하락하면 후폭풍 신호로 보세요.",
      ];
    case "day15-operations":
      return [
        "사업 운영에서는 자금을 써서 유입·판매·신뢰에 영향을 주는 액션을 집행합니다.",
      ];
    case "day15-operations-overview":
      return [
        "일반 액션은 현재 환경 건강·구매 신뢰·최근 발매 품질을 반영해 성공 확률이 정해지고, 결과는 다음 날 확정됩니다. 비용·기간·쿨다운을 함께 확인하세요.",
        "광고·유통·행사 액션은 성공하면 유입과 판매를 늘리지만 실패하면 반대 효과가 생깁니다. 현재 상태가 좋아도 성공 확률은 100%가 되지 않습니다.",
        "챔피언십과 대형 프로젝트는 발매·금제 결정을 마친 날에만 시작할 수 있는 상태 유지형 챌린지입니다. 봉입률 조정은 별도의 적발 확률을 사용합니다.",
        "유입이 늘어도 환경 건강과 구매 신뢰가 받쳐주지 않으면 새 유저가 오래 남지 않습니다. 효과 종료 뒤에도 수치가 유지되는지 판단해야 합니다.",
      ];
    case "day15-tv-cm":
      return [
        "TV CM은 일반 확률형 액션입니다. 화면에 표시된 성공 확률은 지금의 환경과 구매 신뢰를 기준으로 고정되며 결과는 다음 날 한 번만 결정됩니다.",
      ];
    case "day1-distribution-return":
      return [
        "카드 화면에서는 수치만 읽었고 어떤 운영 액션도 집행하지 않았습니다. 자연 연구와 피로만으로 1위가 바뀔 수 있습니다.",
        "입상표는 그날 대회의 자리 수이고, 탑컷 비율은 최근 14일 누적 자리의 비중입니다. 둘의 변화 속도는 서로 다릅니다.",
      ];
    case "day29-advance":
      return [
        "발매 파워는 새 상품이 환경에 들어올 때의 체급을 조절합니다. 높은 값은 초기 관심과 매출을 키우지만 기존 카드의 가치와 메타 다양성을 압박할 수 있습니다.",
        "신테마는 새 선택지를, 지원은 기존 테마의 수명을, 범용은 여러 테마의 공통 도구를 늘립니다. 당장의 판매량과 장기 생태계 효과를 함께 비교하세요.",
      ];
    case "day30-release-principles":
      return [
        "강한 후보는 출시 직후 관심과 매출을 크게 만들기 쉽습니다. 대신 한 테마로 환경이 몰리고, 반복 노출 피로와 환경 건강 하락이 이어질 수 있습니다.",
        "약한 후보는 첫 판매와 화제성이 작을 수 있습니다. 대신 기존 덱과 카드의 가치를 지키고 여러 선택지가 공존할 여유를 남깁니다.",
        "신테마는 새 덱을 추가하고, 지원은 기존 덱을 보강하며, 범용은 여러 덱이 함께 쓰는 도구를 공급합니다.",
        "신테마·지원·범용을 각각 1종 이상 선택합니다.",
        "파워 조정은 -3부터 +3까지이며 강하게 만들수록 초기 매출과 환경 부담이 함께 커집니다.",
      ];
    case "day30-release-select":
      return [
        "이번 인수인계 발매 시안은 이미 결정되어 있으며 신테마 2종·지원 1종·범용 1종으로 구성됩니다.",
        "표시된 파워 값도 이번 시안에 포함되어 있습니다. 후보와 조정 버튼은 확인만 하고 바꾸지 않습니다.",
        "구성과 파워를 확인한 뒤 실제 ‘발매 확정’ 버튼을 누르세요. 자유 운영부터는 후보와 파워를 직접 결정합니다.",
      ];
    case "day30-advance":
      return [
        "발매 당일 수치는 기대와 구매가 먼저 반영된 값입니다. 실제 채용·승률·반감은 다음 날부터 관측되므로 하루를 진행해 결과를 확인하세요.",
        "초기 반응이 크더라도 며칠 뒤 유지되는지가 중요합니다. 매출, 활성 유저, 커뮤니티 어조가 같은 방향인지 비교하세요.",
      ];
    case "day30-releases-nav":
    case "day30-releases-read":
      return [
        "발매 기록은 출시일과 카드팩 그림, 새 테마 상징을 중심으로 정리됩니다.",
        "신테마는 새 덱을, 지원은 기존 덱의 보강을, 범용은 여러 덱이 공유하는 도구를 뜻합니다.",
      ];
    case "day31-community-controls":
      return [
        "이전 날과 다음 날은 글 목록의 날짜만 옮깁니다. 하단 +1일·+7일과 달리 게임 날짜나 수치는 바뀌지 않습니다.",
        "오늘은 과거 글을 보다가 현재 날짜의 글로 즉시 돌아오는 버튼입니다.",
      ];
    case "day31-community-open":
      return [
        "각 글은 관련 테마나 카드를 가리킵니다. 글을 누르면 카드 탭의 해당 위치로 이동해 실제 수치와 비교할 수 있습니다.",
        "좋아요가 높은 글은 인기 글로 강조됩니다. 인기는 여론의 크기이지 메타 성과의 확정 판정은 아닙니다.",
      ];
    case "day31-news-controls":
      return [
        "소식은 큰 변화만 짧은 제목과 숫자로 정리합니다. 푸른 항목은 좋은 변화, 붉은 항목은 나쁜 변화입니다.",
        "소식 날짜 버튼도 목록만 바꾸며 게임 시간은 진행하지 않습니다. 지나간 선택의 후폭풍을 날짜별로 되짚을 때 사용하세요.",
      ];
    case "day45-restriction":
      return [
        "금지·제한·준제한은 허용 매수를 0·1·2장으로 낮춥니다. 카드 한 장의 수치보다 그 카드가 초동·중간다리·결과물 중 어떤 역할인지 먼저 보세요.",
        "위협을 방치하면 환경 불만이 남고, 과도한 제재는 보유가치와 구매 신뢰를 훼손합니다. 정답 대신 감수할 후폭풍을 선택하는 단계입니다.",
      ];
    case "day45-restriction-controls":
      return [
        "현재 카드풀의 절반까지만 금제할 수 있습니다.",
        "금지는 0장, 제한은 1장, 준제한은 2장, 무제한은 3장까지 허용합니다. 숫자 버튼은 카드의 최종 허용 매수를 뜻합니다.",
        "초기화는 이번 편집을 되돌리고, 제출은 현재 안을 확정합니다. 제출한 첫 금제는 즉시 자유 운영으로 이어집니다.",
      ];
    case "day45-advance":
    case "day46-community":
      return [
        "금제 공표와 실제 반응은 같은 날 완성되지 않습니다. 다음 날부터 덱 변경·이탈·복귀가 수치와 글에 드러납니다.",
        "좋은 반응과 나쁜 반응이 동시에 생길 수 있습니다. 환경 건강의 회복이 구매 신뢰 하락보다 큰지 여러 지표를 함께 보세요.",
      ];
    case "day46-distribution-read":
      return [
        "탑컷 점유율은 최근 14일 본선 자리의 비중이고, 본선 진출률은 그 테마 참가자 가운데 본선에 오른 비율입니다. 분모가 서로 다릅니다.",
        "채용률이 내려가도 본선 진출률이 높다면 숙련자 중심으로 남았을 수 있습니다. 커뮤니티 반응과 실제 대회 결과가 일치하는지 마지막으로 대조하세요.",
      ];
    case "day46-start":
      return [
        "이제부터 +1일과 +7일을 직접 선택해 관측합니다. 결정 직후에는 +1일, 안정된 구간의 추세 확인에는 +7일이 읽기 쉽습니다.",
        "발매·금제·사업 선택 뒤에는 매출, 활성 유저, 환경 건강, 구매 신뢰, 커뮤니티가 연쇄적으로 움직입니다. 한 수치가 아니라 변화의 연결을 판단하세요.",
      ];
    default:
      return [];
  }
}

export function buildGuidedTutorialPages(
  step: string,
  brief: GuidedTutorialBrief,
): GuidedTutorialPage[] {
  const splitMessage = (message: string) => {
    if (message.length <= 76) return [message];
    const sentences = (message.match(/[^.!?]+[.!?]?/g) ?? [message])
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((sentence) => {
        if (sentence.length <= 76) return [sentence];
        const parts: string[] = [];
        let line = "";
        for (const word of sentence.split(/\s+/)) {
          const combined = line ? `${line} ${word}` : word;
          if (line && combined.length > 76) {
            parts.push(line);
            line = word;
          } else {
            line = combined;
          }
        }
        if (line) parts.push(line);
        return parts;
      });
    const chunks: string[] = [];
    let current = "";
    for (const sentence of sentences) {
      const combined = current ? `${current} ${sentence}` : sentence;
      if (current && combined.length > 76) {
        chunks.push(current);
        current = sentence;
      } else {
        current = combined;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  };
  const explainers = getStepExplainers(step).flatMap(splitMessage);
  const briefMessages = splitMessage(brief.message);
  const messages = brief.informational
    ? [...briefMessages, ...explainers]
    : [...explainers, ...briefMessages];
  return messages.map(buildTutorialPage);
}

export function GuidedTutorialBar({
  allowSkip,
  brief,
  busy,
  day,
  onConfirm,
  onInformationalNext,
  onMain,
  onSkip,
  step,
  targetKey,
}: {
  allowSkip: boolean;
  brief: GuidedTutorialBrief;
  busy: boolean;
  day: number;
  onConfirm: () => void;
  onInformationalNext: () => void;
  onMain: () => void;
  onSkip: () => void;
  step: string;
  targetKey: string;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const skipCancelRef = useRef<HTMLButtonElement>(null);
  const onConfirmRef = useRef(onConfirm);
  const pages = useMemo(
    () => buildGuidedTutorialPages(step, brief),
    [brief, step],
  );
  const safePageIndex = Math.min(
    Math.max(0, pageIndex),
    Math.max(0, pages.length - 1),
  );
  const currentPage = pages[safePageIndex] ?? pages[0];
  const lastPage = safePageIndex >= pages.length - 1;
  const displayedTitle = !lastPage && !brief.informational
    ? currentPage?.termLabel
      ? `${currentPage.termLabel}의 뜻을 설명합니다`
      : "기능과 판단 기준을 먼저 설명합니다"
    : brief.title;
  const controlKey = brief.controlIds?.join("|") ?? "";

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  useEffect(() => {
    if (!skipConfirmOpen) return;
    const previouslyFocused = document.activeElement;
    const frame = window.requestAnimationFrame(() => {
      skipCancelRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [skipConfirmOpen]);

  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    let targets: HTMLElement[] = [];
    const observer = new ResizeObserver(() => measure());
    const measure = () => {
      if (!lastPage || targets.length === 0) {
        setRect(null);
        return;
      }
      const bounds = targets.map((target) => target.getBoundingClientRect());
      const padding = 7;
      const left = Math.max(0, Math.min(...bounds.map((item) => item.left)) - padding);
      const top = Math.max(0, Math.min(...bounds.map((item) => item.top)) - padding);
      const right = Math.min(
        window.innerWidth,
        Math.max(...bounds.map((item) => item.right)) + padding,
      );
      const bottom = Math.min(
        window.innerHeight,
        Math.max(...bounds.map((item) => item.bottom)) + padding,
      );
      setRect({
        top,
        left,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      });
    };
    const connect = () => {
      if (brief.freeInteraction || brief.informational) {
        setRect(null);
        return;
      }
      const selectors = [
        '[data-tutorial-target="active"]',
        ...(brief.controlIds ?? []).map(
          (controlId) => `[data-tutorial-control~="${controlId}"]`,
        ),
      ];
      targets = Array.from(
        document.querySelectorAll<HTMLElement>(selectors.join(",")),
      ).filter((target) => target.getClientRects().length > 0);
      if (targets.length === 0) {
        attempts += 1;
        if (attempts < 12) frame = window.requestAnimationFrame(connect);
        return;
      }
      if (!lastPage) {
        setRect(null);
        return;
      }
      targets[0].scrollIntoView({ block: "nearest", inline: "nearest" });
      targets.forEach((target) => {
        addDescriptionToken(target, "guided-tutorial-message");
        observer.observe(target);
      });
      measure();
    };
    const handleViewportChange = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const trapFocus = (event: KeyboardEvent) => {
      const skipDialog = document.querySelector<HTMLElement>(
        ".guided-skip-dialog",
      );
      if (skipDialog && event.key === "Escape") {
        event.preventDefault();
        setSkipConfirmOpen(false);
        return;
      }
      if (brief.freeInteraction && !skipDialog) return;
      if (
        brief.inspection &&
        lastPage &&
        (event.key === "Enter" || event.key === " ") &&
        targets.includes(document.activeElement as HTMLElement)
      ) {
        event.preventDefault();
        onConfirmRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusableSelector =
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
      const focusables = skipDialog
        ? Array.from(
            skipDialog.querySelectorAll<HTMLElement>("button:not(:disabled)"),
          )
        : Array.from(
            new Set<HTMLElement>([
              ...document.querySelectorAll<HTMLElement>(
                ".guided-tutorial-bar button:not(:disabled)",
              ),
              ...(lastPage
                ? targets.flatMap((target) => [
                    ...(target.matches(focusableSelector) ? [target] : []),
                    ...target.querySelectorAll<HTMLElement>(focusableSelector),
                  ])
                : []),
            ]),
          );
      if (focusables.length === 0) return;
      const currentIndex = focusables.indexOf(
        document.activeElement as HTMLElement,
      );
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + focusables.length) % focusables.length;
      event.preventDefault();
      focusables[nextIndex].focus({ preventScroll: true });
    };
    const guardPointerInput = (event: Event) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) return;
      const skipDialog = document.querySelector<HTMLElement>(
        ".guided-skip-dialog",
      );
      const isTutorialTarget = targets.some((target) =>
        target.contains(eventTarget),
      );
      if (skipDialog) {
        if (skipDialog.contains(eventTarget)) return;
      } else if (
        brief.freeInteraction ||
        (lastPage && isTutorialTarget) ||
        eventTarget.closest(".guided-tutorial-bar")
      ) {
        if (
          event.type === "click" &&
          brief.inspection &&
          isTutorialTarget
        ) {
          onConfirmRef.current();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const inspectOnHoverOrFocus = (event: Event) => {
      if (!brief.hoverInspection || !lastPage) return;
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) return;
      if (targets.some((target) => target.contains(eventTarget))) {
        onConfirmRef.current();
      }
    };

    frame = window.requestAnimationFrame(connect);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("keydown", trapFocus);
    document.addEventListener("pointerdown", guardPointerInput, true);
    document.addEventListener("click", guardPointerInput, true);
    document.addEventListener("pointerover", inspectOnHoverOrFocus, true);
    document.addEventListener("focusin", inspectOnHoverOrFocus, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("keydown", trapFocus);
      document.removeEventListener("pointerdown", guardPointerInput, true);
      document.removeEventListener("click", guardPointerInput, true);
      document.removeEventListener("pointerover", inspectOnHoverOrFocus, true);
      document.removeEventListener("focusin", inspectOnHoverOrFocus, true);
      observer.disconnect();
      targets.forEach((target) =>
        removeDescriptionToken(target, "guided-tutorial-message"),
      );
    };
  }, [
    brief.controlIds,
    brief.freeInteraction,
    brief.hoverInspection,
    brief.informational,
    brief.inspection,
    controlKey,
    lastPage,
    targetKey,
  ]);

  const handleNext = () => {
    if (!lastPage) {
      setPageIndex(Math.min(pages.length - 1, safePageIndex + 1));
      return;
    }
    if (brief.informational) onInformationalNext();
  };

  return (
    <div
      className={`guided-tour-layer${brief.freeInteraction ? " is-free-interaction" : ""}${
        skipConfirmOpen ? " is-skip-confirming" : ""
      }`}
    >
      {!brief.freeInteraction && !brief.informational && lastPage && rect ? (
          <>
            <div
              aria-hidden="true"
              className="guided-spotlight-cutout"
              style={rect}
            />
            <div
              aria-hidden="true"
              className="guided-target-outline"
              style={rect}
            />
          </>
      ) : null}

      <aside
        aria-live="polite"
        className="guided-tutorial-bar"
        id="guided-tutorial-message"
      >
        <LotusSymbol tone="info" />
        <div className="guided-tutorial-copy">
          <strong>{displayedTitle}</strong>
          <p>{currentPage ? renderTutorialMessage(currentPage) : null}</p>
        </div>
        <div className="guided-tutorial-progress" aria-label={`설명 ${safePageIndex + 1}/${pages.length}`}>
          <span>DAY {day} · {safePageIndex + 1}/{pages.length}</span>
          <i aria-hidden="true">
            <b style={{ width: `${((safePageIndex + 1) / pages.length) * 100}%` }} />
          </i>
        </div>
        <div className="guided-tutorial-actions">
          <button
            data-tutorial-term="tutorial-page-navigation"
            disabled={busy || safePageIndex === 0}
            onClick={() => setPageIndex(Math.max(0, safePageIndex - 1))}
            type="button"
          >
            이전
          </button>
          <button
            className="is-next"
            data-tutorial-term="tutorial-page-navigation"
            disabled={busy || (lastPage && !brief.informational)}
            onClick={handleNext}
            type="button"
          >
            다음
          </button>
          <button
            data-tutorial-term="tutorial-skip"
            disabled={busy || !allowSkip}
            onClick={() => setSkipConfirmOpen(true)}
            title={allowSkip ? undefined : "첫 금제 단계부터는 건너뛸 수 없습니다."}
            type="button"
          >
            건너뛰기
          </button>
          <button
            data-tutorial-term="tutorial-home"
            disabled={busy}
            onClick={onMain}
            type="button"
          >
            메인 화면으로
          </button>
        </div>
      </aside>

      {skipConfirmOpen ? (
        <>
          <div aria-hidden="true" className="guided-skip-dialog-backdrop" />
          <section
            aria-describedby="guided-skip-description"
            aria-labelledby="guided-skip-title"
            aria-modal="true"
            className="guided-skip-dialog"
            role="alertdialog"
          >
            <LotusSymbol tone="caution" />
            <div className="guided-skip-dialog-copy">
              <span>LOTUS · HANDOVER OVERRIDE</span>
              <strong id="guided-skip-title">프롤로그를 건너뛸까요?</strong>
              <p id="guided-skip-description">
                고정된 학습 구간만 생략하고 DAY 45 첫 금제위원회에서 직접
                결정을 시작합니다.
              </p>
            </div>
            <div className="guided-skip-dialog-note">
              첫 금제안은 자동 적용되지 않습니다. 제출 뒤 새 임기 시드가
              배정됩니다.
            </div>
            <div className="guided-skip-dialog-actions">
              <button
                className="guided-skip-dialog-cancel"
                disabled={busy}
                onClick={() => setSkipConfirmOpen(false)}
                ref={skipCancelRef}
                type="button"
              >
                계속 안내받기
              </button>
              <button
                className="guided-skip-dialog-confirm"
                disabled={busy}
                onClick={() => {
                  setSkipConfirmOpen(false);
                  onSkip();
                }}
                type="button"
              >
                {busy ? "DAY 45 준비 중" : "첫 금제부터 시작"}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
