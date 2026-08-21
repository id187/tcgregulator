import { Fragment, type ReactNode } from "react";

export type SignalFlowNode = {
  icon?: ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "caution";
};

export function SignalFlow({
  className = "",
  compact = false,
  nodes,
}: {
  className?: string;
  compact?: boolean;
  nodes: readonly SignalFlowNode[];
}) {
  const description = nodes
    .map((node) => `${node.label}: ${node.value}`)
    .join(". ");

  return (
    <div
      aria-label={description}
      className={`signal-flow ${compact ? "compact" : ""} ${className}`.trim()}
      role="img"
    >
      {nodes.map((node, index) => (
        <Fragment key={`${node.label}-${index}`}>
          <div className={`signal-node ${node.tone ?? "neutral"}`}>
            {node.icon ? (
              <span aria-hidden="true" className="signal-node-glyph">
                {node.icon}
              </span>
            ) : (
              <svg
                aria-hidden="true"
                className="signal-node-index"
                viewBox="0 0 32 32"
              >
                <circle cx="16" cy="16" r="13" />
                <text dominantBaseline="central" textAnchor="middle" x="16" y="16">
                  {index + 1}
                </text>
              </svg>
            )}
            <div>
              <span>{node.label}</span>
              <strong>{node.value}</strong>
            </div>
          </div>
          {index < nodes.length - 1 ? (
            <svg
              aria-hidden="true"
              className="signal-connector"
              viewBox="0 0 28 16"
            >
              <path d="M2 8h21m-6-5 6 5-6 5" />
            </svg>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
