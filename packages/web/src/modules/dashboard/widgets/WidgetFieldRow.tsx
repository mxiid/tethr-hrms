import type { WidgetFieldDefinition, WidgetFieldValues } from './types';

type WidgetFieldRowProps = {
  readonly fields: readonly WidgetFieldDefinition[];
  readonly selectedFieldIds: readonly string[];
  readonly values: WidgetFieldValues;
  readonly loading: boolean;
  readonly error: boolean;
  /** Density cap from the tile size; undefined renders every selected field. */
  readonly limit?: number;
};

export const WidgetFieldRow = ({
  fields,
  selectedFieldIds,
  values,
  loading,
  error,
  limit,
}: WidgetFieldRowProps) => {
  if (error) {
    return (
      <p className="auth-error" role="alert">
        Could not load this widget.
      </p>
    );
  }

  const selectedFields = selectedFieldIds
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is WidgetFieldDefinition => field !== undefined)
    .slice(0, limit);

  return (
    <div className="widget-stat-row">
      {selectedFields.map((field) => (
        <div className="widget-stat" key={field.id}>
          <div className="metric-label">{field.label}</div>
          <div className="metric-value">{loading ? '…' : (values[field.id] ?? '—')}</div>
        </div>
      ))}
    </div>
  );
};
