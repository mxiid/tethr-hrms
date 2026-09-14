type ChartTooltipProps = {
  readonly value: string;
  readonly label: string;
};

// Meant to be the child of a `position: relative` mark wrapper — it positions
// itself via CSS (`.dashboard-chart-tooltip`), so callers never compute
// coordinates. Values lead (bold, primary ink), the label follows (secondary).
export const ChartTooltip = ({ value, label }: ChartTooltipProps) => (
  <div className="dashboard-chart-tooltip" role="tooltip">
    <div className="dashboard-chart-tooltip-value">{value}</div>
    <div className="dashboard-chart-tooltip-label">{label}</div>
  </div>
);
