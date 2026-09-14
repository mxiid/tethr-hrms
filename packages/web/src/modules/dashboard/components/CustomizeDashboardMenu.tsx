import { IconAdjustments, IconChevronDown } from '@tabler/icons-react';
import { useAtom } from 'jotai';
import { useEffect, useRef, useState } from 'react';

import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';
import { activeViewWidgetsAtom } from '../states/dashboardViewsState';
import { defaultLayoutFor, visibleWidgetsFor } from '../widgets/registry';
import type { WidgetId } from '../widgets/types';

export const CustomizeDashboardMenu = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [layout, setLayout] = useAtom(activeViewWidgetsAtom);
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

  const availableWidgets = visibleWidgetsFor(user);

  const toggleWidget = (id: WidgetId, enabled: boolean): void => {
    setLayout((current) =>
      enabled ? [...current, defaultLayoutFor(id)] : current.filter((widget) => widget.id !== id),
    );
  };

  return (
    <div className="dropdown-anchor" ref={anchorRef}>
      <button
        className={`button button-secondary${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <IconAdjustments size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
        Customize
        <IconChevronDown size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
      </button>
      {isOpen ? (
        <div className="dropdown-panel dropdown-panel-customize" role="menu">
          <div className="account-dropdown-label">Widgets</div>
          {availableWidgets.map((widget) => (
            <label className="checkbox-field" key={widget.id}>
              <input
                checked={layout.some((entry) => entry.id === widget.id)}
                onChange={(event) => toggleWidget(widget.id, event.target.checked)}
                type="checkbox"
              />
              {widget.title}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
};
