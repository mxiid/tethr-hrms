import { useState } from 'react';

import { roundToNiceStep } from './chartPalette';
import { ChartTooltip } from './ChartTooltip';

type TrendPoint = {
  readonly label: string;
  readonly value: number;
};

type BarTrendChartProps = {
  readonly points: readonly TrendPoint[];
  readonly formatValue?: (value: number) => string;
};

const defaultFormat = (value: number): string => new Intl.NumberFormat('en').format(value);

// Trend over time, one series — sequential job, one hue, no legend needed
// (the chart's own title already names what's plotted). Bars cap at 24px and
// never fill their slot; only the last bar carries a direct label, the rest
// live in the hover/focus tooltip.
export const BarTrendChart = ({ points, formatValue = defaultFormat }: BarTrendChartProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = roundToNiceStep(Math.max(...points.map((point) => point.value), 1));

  if (points.length === 0 || max === 0) {
    return (
      <div className="dashboard-chart dashboard-bar-trend">
        <div className="dashboard-bar-trend-plot dashboard-bar-trend-plot-empty" />
        <p className="dashboard-chart-empty-label">No finalized runs yet</p>
      </div>
    );
  }

  return (
    <div className="dashboard-chart dashboard-bar-trend">
      <div className="dashboard-bar-trend-plot">
        <div className="dashboard-bar-trend-gridlines">
          {[max, max / 2, 0].map((tick) => (
            <div className="dashboard-bar-trend-gridline" key={tick}>
              <span className="dashboard-bar-trend-tick">{formatValue(Math.round(tick))}</span>
            </div>
          ))}
        </div>
        <div className="dashboard-bar-trend-columns">
          {points.map((point, index) => {
            const isLast = index === points.length - 1;
            const isHovered = hoveredIndex === index;
            return (
              <button
                aria-label={`${point.label}: ${formatValue(point.value)}`}
                className="dashboard-bar-trend-column"
                key={point.label}
                onBlur={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(index)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                type="button"
              >
                {isHovered ? <ChartTooltip label={point.label} value={formatValue(point.value)} /> : null}
                <div
                  className={`dashboard-bar-trend-bar${isHovered ? ' is-hovered' : ''}`}
                  style={{ height: max > 0 ? `${(point.value / max) * 100}%` : '0%' }}
                >
                  {isLast ? (
                    <span className="dashboard-bar-trend-value">{formatValue(point.value)}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="dashboard-bar-trend-axis">
        {points.map((point) => (
          <span className="dashboard-bar-trend-axis-label" key={point.label}>
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
};
