import { useState } from 'react';

import { categoricalColorVarAt } from './chartPalette';

type ShareSegment = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
};

type StackedShareBarProps = {
  readonly segments: readonly ShareSegment[];
};

// Part-to-whole, as a single horizontal bar split into segments — not a
// donut/pie (the dataviz method has no pie form for part-to-whole; a bar
// reads faster and scales better at a glance). The legend below is always
// present for >=2 series and doubles as this chart's table-view twin, so a
// segment's exact count never lives only behind a hover.
export const StackedShareBar = ({ segments }: StackedShareBarProps) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const nonZero = segments.filter((segment) => segment.value > 0);
  const total = nonZero.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return (
      <div className="dashboard-chart dashboard-share-bar">
        <div className="dashboard-share-bar-track dashboard-share-bar-track-empty" />
        <p className="dashboard-chart-empty-label">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="dashboard-chart dashboard-share-bar">
      <div className="dashboard-share-bar-track">
        {nonZero.map((segment) => {
          const colorIndex = segments.findIndex((entry) => entry.id === segment.id);
          return (
            <div
              className={`dashboard-share-bar-segment${hoveredId === segment.id ? ' is-hovered' : ''}`}
              key={segment.id}
              onBlur={() => setHoveredId(null)}
              onFocus={() => setHoveredId(segment.id)}
              onMouseEnter={() => setHoveredId(segment.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ flexGrow: segment.value, background: categoricalColorVarAt(colorIndex) }}
              tabIndex={0}
            />
          );
        })}
      </div>
      <div className="dashboard-chart-legend">
        {segments.map((segment) => {
          const colorIndex = segments.findIndex((entry) => entry.id === segment.id);
          return (
            <div
              className={`dashboard-chart-legend-item${hoveredId === segment.id ? ' is-hovered' : ''}`}
              key={segment.id}
            >
              <span
                aria-hidden="true"
                className="dashboard-chart-legend-swatch"
                style={{ background: categoricalColorVarAt(colorIndex) }}
              />
              <span className="dashboard-chart-legend-label">{segment.label}</span>
              <span className="dashboard-chart-legend-count">{segment.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
