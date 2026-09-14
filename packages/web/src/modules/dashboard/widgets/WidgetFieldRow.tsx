import type { WidgetFieldDefinition, WidgetFieldValues } from './types';

type WidgetFieldRowProps = {
  readonly fields: readonly WidgetFieldDefinition[];
  readonly selectedFieldIds: readonly string[];
  readonly values: WidgetFieldValues;
  readonly loading: boolean;
  readonly error: boolean;
};

export const WidgetFieldRow = ({
  fields,
  selectedFieldIds,
  values,
  loading,
  error,
}: WidgetFieldRowProps) => {
  if (error) {
    return <p className="auth-error">Could not load this widget.</p>;
  }

  const selectedFields = selectedFieldIds
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is WidgetFieldDefinition => field !== undefined);

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
