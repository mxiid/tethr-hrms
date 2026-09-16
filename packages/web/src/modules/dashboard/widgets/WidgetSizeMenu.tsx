import { IconLayoutGrid } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { handleMenuArrowKeys } from '../../../components/menu/menuKeyboard';
import { useTheme } from '../../../providers/theme/useTheme';

import { WIDGET_SIZE_LABELS, type WidgetSize } from './widgetSizes';

type WidgetSizeMenuProps = {
  readonly title: string;
  readonly size: WidgetSize;
  readonly options: readonly WidgetSize[];
  readonly onChange: (size: WidgetSize) => void;
};

/**
 * The tile's size picker: only the sizes its content is authored to fit are
 * offered, so choosing one can never produce overflow or a scrollbar.
 */
export const WidgetSizeMenu = ({ title, size, options, onChange }: WidgetSizeMenuProps) => {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('[role="menuitemradio"], [role="menuitem"]')
        ?.focus();
    });
    const onClickOutside = (event: MouseEvent): void => {
      if (anchorRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="dropdown-anchor" ref={anchorRef}>
      <button
        aria-expanded={isOpen}
        aria-label={`Size of ${title} widget`}
        className="icon-button"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <IconLayoutGrid aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
      </button>
      {isOpen ? (
        <div
          aria-label={`Size of ${title} widget`}
          className="dropdown-panel dropdown-panel-widget-size"
          onKeyDown={(event) => void handleMenuArrowKeys(event)}
          ref={panelRef}
          role="menu"
        >
          <div className="account-dropdown-label">Size</div>
          {options.map((option) => (
            <button
              aria-checked={option === size}
              className={`dropdown-nav-item${option === size ? ' is-active' : ''}`}
              key={option}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              role="menuitemradio"
              type="button"
            >
              <span aria-hidden="true" className={`widget-size-glyph widget-size-glyph-${option}`} />
              <span>{WIDGET_SIZE_LABELS[option]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
