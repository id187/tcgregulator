import { useEffect, type CSSProperties } from "react";

import { THEME_BY_ID } from "../game/content.ts";
import { getGenericCard } from "../game/generic-card-catalog.ts";
import type { ReleaseBatch, SupportDirection } from "../game/types.ts";
import { RegulatorCardFace } from "./RegulatorCardFace.tsx";
import { ReleasePackCard } from "./ReleasePackCard.tsx";

const SUPPORT_COPY: Record<
  SupportDirection,
  { label: string; effect: string }
> = {
  consistency: {
    label: "안정성 지원",
    effect: "초동과 전개 성공률을 보강해 테마의 기본 동선을 단단하게 만든다.",
  },
  counterplay: {
    label: "대응력 지원",
    effect: "불리 상성과 후공 상황에 개입할 새로운 대응 수단을 제공한다.",
  },
  finisher: {
    label: "결과물 지원",
    effect: "최종 필드와 승리 수단을 강화해 한 번의 전개가 더 큰 위협이 된다.",
  },
  recovery: {
    label: "회수 지원",
    effect: "소모한 자원을 되돌려 장기전과 재전개 능력을 높인다.",
  },
};

function powerCopy(adjustment: number): string {
  if (adjustment === 0) return "기준 파워";
  return `파워 ${adjustment > 0 ? "+" : ""}${adjustment}`;
}

function getProductFace(product: ReleaseBatch["products"][number]) {
  if (product.kind === "generic") {
    const card = getGenericCard(product.genericCardId);
    return {
      accent: "#53799a",
      effect: card?.description ?? "여러 테마가 채용할 수 있는 범용 효과를 제공한다.",
      footer: `범용 · ${powerCopy(product.powerAdjustment)}`,
      overline: "GENERIC CARD",
      title: card?.name ?? "범용 카드",
    };
  }

  const theme = THEME_BY_ID[product.themeId];
  if (product.kind === "reprint") {
    const themePart = theme?.parts.find((part) => part.id === product.cardId);
    const generic = getGenericCard(product.cardId);
    return {
      accent: themePart ? theme?.color : "#53799a",
      effect:
        generic?.description ??
        `${theme?.playstyle ?? "기존 전략"}의 핵심 카드를 다시 공급해 접근성을 높인다.`,
      footer: `재판 · ${powerCopy(product.powerAdjustment)}`,
      overline: themePart ? `${theme?.name ?? "테마"} · REPRINT` : "GENERIC · REPRINT",
      themeId: themePart ? theme?.id : undefined,
      title: themePart?.name ?? generic?.name ?? "재판 카드",
    };
  }

  if (product.kind === "support") {
    const support = SUPPORT_COPY[product.direction ?? "consistency"];
    return {
      accent: theme?.color,
      effect: support.effect,
      footer: `${support.label} · ${powerCopy(product.powerAdjustment)}`,
      overline: `${theme?.name ?? "테마"} · SUPPORT`,
      themeId: theme?.id,
      title: `${theme?.shortName ?? "테마"} 지원 카드`,
    };
  }

  return {
    accent: theme?.color,
    effect: `${theme?.playstyle ?? "새로운 플레이 스타일"}. ${theme?.aesthetic ?? "독자적인 세계관"}.`,
    footer: `신규 테마 · ${powerCopy(product.powerAdjustment)}`,
    overline: `${theme?.name ?? "신규 테마"} · DEBUT`,
    themeId: theme?.id,
    title: `${theme?.shortName ?? "신규"} 창간 카드`,
  };
}

export function ReleasePublicationSequence({ batch }: { batch: ReleaseBatch }) {
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => {
        window.dispatchEvent(
          new CustomEvent("tcg-regulator-sound", { detail: "release" }),
        );
      },
      reducedMotion ? 120 : 2350,
    );
    return () => window.clearTimeout(timer);
  }, [batch.day]);

  return (
    <div className="release-publication-sequence">
      <div className="release-card-stream" aria-label="팩 수록 카드">
        {batch.products.map((product, index) => {
          const face = getProductFace(product);
          return (
            <span
              className="release-ingesting-card"
              key={product.optionId}
              style={{ "--release-card-index": index } as CSSProperties}
            >
              <RegulatorCardFace {...face} />
            </span>
          );
        })}
      </div>

      <div className="release-pack-reveal">
        <span className="release-pack-intake" aria-hidden="true" />
        <ReleasePackCard batch={batch} />
        <span className="release-publication-burst" aria-hidden="true">
          <i />
          <strong>ON SALE</strong>
        </span>
      </div>

      <div className="release-publication-caption">
        <span>PACK ASSEMBLY COMPLETE</span>
        <strong>{batch.products.length}종 수록 · 정식 출시</strong>
        <p>봉인된 생산안이 카드팩이 되어 시장에 도착했습니다.</p>
      </div>
    </div>
  );
}
