import { IconSettings } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { useTheme } from '../../../providers/theme/useTheme';

import type { WidgetFieldDefinition } from './types';

type WidgetFieldPickerProps = {
  readonly title: string;
  readonly fields: readonly WidgetFieldDefinition[];
  readonly selectedFieldIds: readonly string[];
  readonly onToggleField: (fieldId: string, enabled: boolean) => void;
};

export const WidgetFieldPicker = ({
  title,
  fields,
  selectedFieldIds,
  onToggleField,
}: WidgetFieldPickerProps) => {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent): void => {
      if (anchorRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="dropdown-anchor" ref={anchorRef}>
      <button
        aria-label={`Choose fields for ${title}`}
        className="icon-button"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <IconSettings size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
      </button>
      {isOpen ? (
        <div className="dropdown-panel dropdown-panel-widget-fields" role="menu">
          <div className="account-dropdown-label">Fields</div>
          {fields.map((field) => (
            <label className="checkbox-field" key={field.id}>
              <input
                checked={selectedFieldIds.includes(field.id)}
                onChange={(event) => onToggleField(field.id, event.target.checked)}
                type="checkbox"
              />
              {field.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
};
