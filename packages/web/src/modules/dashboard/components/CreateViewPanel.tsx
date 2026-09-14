import { IconPlus } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import { useDashboardViews } from '../hooks/useDashboardViews';
import { visibleWidgetsFor } from '../widgets/registry';
import type { WidgetId } from '../widgets/types';

export const CreateViewPanel = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { createView } = useDashboardViews();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<readonly WidgetId[]>([]);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent): void => {
      if (anchorRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const availableWidgets = visibleWidgetsFor(user);

  const toggleWidget = (id: WidgetId, enabled: boolean): void => {
    setSelectedIds((current) =>
      enabled ? [...current, id] : current.filter((existingId) => existingId !== id),
    );
  };

  const reset = (): void => {
    setName('');
    setSelectedIds([]);
  };

  const onSubmit = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createView(trimmed, selectedIds);
    reset();
    setIsOpen(false);
  };

  return (
    <div className="dropdown-anchor" ref={anchorRef}>
      <button
        aria-label="Create view"
        className="icon-button dashboard-view-add"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <IconPlus size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
      </button>
      {isOpen ? (
        <div className="dropdown-panel dropdown-panel-create-view" role="menu">
          <div className="field">
            <label htmlFor="new-view-name">View name</label>
            <input
              autoFocus
              id="new-view-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ops"
              type="text"
              value={name}
            />
          </div>
          <div className="account-dropdown-label">Widgets</div>
          {availableWidgets.map((widget) => (
            <label className="checkbox-field" key={widget.id}>
              <input
                checked={selectedIds.includes(widget.id)}
                onChange={(event) => toggleWidget(widget.id, event.target.checked)}
                type="checkbox"
              />
              {widget.title}
            </label>
          ))}
          <button
            className="button button-primary button-full"
            disabled={!name.trim()}
            onClick={onSubmit}
            type="button"
          >
            Create view
          </button>
        </div>
      ) : null}
    </div>
  );
};
