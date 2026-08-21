import { getPlayKeyword, PLAY_KEYWORD_IDS } from "../game/play-keywords.ts";

export function PlayKeywordGlossary({ expanded = false }: { expanded?: boolean }) {
  return (
    <details className="play-keyword-glossary" open={expanded}>
      <summary>플레이 키워드 도감</summary>
      <p className="play-keyword-guide">
        테마는 기본 3종으로 시작하며 지원 발매마다 1종을 얻어 최대 6종으로
        확장됩니다. 유불리 수치는 공개되지 않으므로 설명·입상 변화·커뮤니티
        연구로 상성을 추론하십시오.
      </p>
      <div>
        {PLAY_KEYWORD_IDS.map((keyword) => {
          const entry = getPlayKeyword(keyword);
          return (
            <article key={keyword}>
              <strong>{entry.label}</strong>
              <p>{entry.description}</p>
            </article>
          );
        })}
      </div>
    </details>
  );
}
