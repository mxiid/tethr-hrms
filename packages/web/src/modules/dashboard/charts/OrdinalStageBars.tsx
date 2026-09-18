import { ordinalAccentVarAt } from './chartPalette';

type OrdinalStage = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
};

type OrdinalStageBarsProps = {
  readonly stages: readonly OrdinalStage[];
  /** Density cap from the tile size; undefined renders every stage. */
  readonly maxStages?: number;
};

// Ordered stages (a funnel) — order carries meaning, so this is one hue
// (the app's indigo accent) stepping light-to-dark by stage, not a
// categorical palette. The value always sits outside the bar so it's never
// clipped, which also means it needs no hover/tooltip to be readable.
export const OrdinalStageBars = ({ stages, maxStages }: OrdinalStageBarsProps) => {
  const shownStages = stages.slice(0, maxStages);
  const max = Math.max(...shownStages.map((stage) => stage.value), 1);

  return (
    <div className="dashboard-chart dashboard-ordinal-bars">
      {shownStages.map((stage, index) => (
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
