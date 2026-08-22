import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type ReferenceTool = "banlist" | "keywords" | "shareholder";

export function HeaderReferenceTools({
  banList,
  guidedToolTarget = null,
  keywordGlossary,
  onGuidedToolOpen,
  shareholderRequest = null,
  shareholderRequestLabel = "대주주 요청",
}: {
  banList: ReactNode;
  guidedToolTarget?: ReferenceTool | null;
  keywordGlossary: ReactNode;
  onGuidedToolOpen?: (tool: ReferenceTool) => void;
  shareholderRequest?: ReactNode;
  shareholderRequestLabel?: string;
}) {
  const [activeTool, setActiveTool] = useState<ReferenceTool | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<ReferenceTool, HTMLButtonElement | null>>({
    banlist: null,
    keywords: null,
    shareholder: null,
  });
  const baseId = useId();

  useEffect(() => {
    if (!activeTool) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActiveTool(null);
      triggerRefs.current[activeTool]?.focus({ preventScroll: true });
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setActiveTool(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [activeTool]);

  const tools: Array<{
    id: ReferenceTool;
    label: string;
    content: ReactNode;
  }> = [
    { id: "banlist", label: "금제 리스트", content: banList },
    { id: "keywords", label: "키워드 도감", content: keywordGlossary },
    ...(shareholderRequest
      ? [{
          id: "shareholder" as const,
          label: shareholderRequestLabel,
          content: shareholderRequest,
        }]
      : []),
  ];

  return (
    <div className="header-reference-tools" ref={rootRef}>
      <div aria-label="게임 참고 자료" className="header-reference-buttons">
        {tools.map((tool) => {
          const panelId = `${baseId}-${tool.id}`;
          return (
            <button
              aria-controls={panelId}
              aria-expanded={activeTool === tool.id}
              className={`${activeTool === tool.id ? "is-active " : ""}${
                tool.id === "shareholder" ? "is-shareholder" : ""
              }`.trim() || undefined}
              data-tutorial-control={`header-${tool.id}`}
              data-tutorial-target={
                guidedToolTarget === tool.id ? "active" : undefined
              }
              key={tool.id}
              onClick={() => {
                const opening = activeTool !== tool.id;
                setActiveTool(opening ? tool.id : null);
                if (opening && guidedToolTarget === tool.id) {
                  onGuidedToolOpen?.(tool.id);
                }
              }}
              ref={(node) => {
                triggerRefs.current[tool.id] = node;
              }}
              type="button"
            >
              <span>{tool.label}</span>
              <span aria-hidden="true" className="header-reference-info-mark">
                ⓘ
              </span>
            </button>
          );
        })}
      </div>
      {activeTool ? (
        <section
          aria-label={tools.find((tool) => tool.id === activeTool)?.label}
          className="header-reference-panel"
          id={`${baseId}-${activeTool}`}
        >
          {tools.find((tool) => tool.id === activeTool)?.content}
        </section>
      ) : null}
    </div>
  );
}
