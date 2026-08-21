import { GavelIcon, ReleaseIcon } from "./MetricGlyphs.tsx";

type DecisionMetric = {
  label: string;
  value: string;
};

export function DecisionEventHero({
  currentStep,
  day,
  description,
  kind,
  metrics,
  steps,
  title,
}: {
  currentStep: number;
  day: number;
  description: string;
  kind: "release" | "restriction";
  metrics: readonly DecisionMetric[];
  steps: readonly string[];
  title: string;
}) {
  const Icon = kind === "release" ? ReleaseIcon : GavelIcon;

  return (
    <section className={`decision-event-hero is-${kind}`}>
      <div className="decision-event-sigil" aria-hidden="true">
        <Icon size={32} />
      </div>
      <div className="decision-event-heading">
        <span>
          {kind === "release" ? "RELEASE COUNCIL" : "RESTRICTION COUNCIL"}
          <b>DAY {day}</b>
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="decision-event-metrics" aria-label="결정 현황">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <ol className="decision-event-steps" aria-label="결정 단계">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const state =
            stepNumber < currentStep
              ? "complete"
              : stepNumber === currentStep
                ? "current"
                : "upcoming";
          return (
            <li className={state} key={step}>
              <span>{stepNumber}</span>
              <strong>{step}</strong>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
