import { ordinalAccentVarAt } from './chartPalette';

type OrdinalStage = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
};

type OrdinalStageBarsProps = {
  readonly stages: readonly OrdinalStage[];
};

// Ordered stages (a funnel) — order carries meaning, so this is one hue
// (the app's indigo accent) stepping light-to-dark by stage, not a
// categorical palette. The value always sits outside the bar so it's never
// clipped, which also means it needs no hover/tooltip to be readable.
export const OrdinalStageBars = ({ stages }: OrdinalStageBarsProps) => {
  const max = Math.max(...stages.map((stage) => stage.value), 1);

  return (
    <div className="dashboard-chart dashboard-ordinal-bars">
      {stages.map((stage, index) => (
        <div className="dashboard-ordinal-row" key={stage.id}>
          <span className="dashboard-ordinal-label">{stage.label}</span>
          <span className="dashboard-ordinal-track">
            <span
              className="dashboard-ordinal-bar"
              style={{
                width: `${(stage.value / max) * 100}%`,
                background: ordinalAccentVarAt(index),
              }}
            />
          </span>
          <span className="dashboard-ordinal-value">{stage.value}</span>
        </div>
      ))}
    </div>
  );
};
