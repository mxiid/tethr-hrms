import { IconChevronDown, type TablerIcon } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { useTheme } from '../../providers/theme/useTheme';

import { handleMenuArrowKeys } from './menuKeyboard';

type ActionMenuItem = {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: TablerIcon;
  readonly onSelect: () => void;
};

type ActionMenuSection = {
  readonly key: string;
  /** Optional small caps heading above the group, e.g. "Frequently used". */
  readonly label?: string;
  readonly items: readonly ActionMenuItem[];
};

type ActionMenuProps = {
  readonly label: string;
  readonly icon?: TablerIcon;
  readonly sections: readonly ActionMenuSection[];
};

/**
 * A primary button that opens a grouped menu of related actions instead of
 * committing to one — the "Add people ⌄" pattern. The whole button toggles the
 * menu; there is no separate default action, so nothing fires by accident.
 */
export const ActionMenu = ({ label, icon: Icon, sections }: ActionMenuProps) => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    // Move focus into the menu so arrow keys work without a Tab first.
    const frame = window.requestAnimationFrame(() => {
      containerRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="action-menu" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="button button-primary action-menu-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {Icon ? <Icon size={theme.icon.size.md} stroke={theme.icon.stroke.md} /> : null}
        {label}
        <IconChevronDown aria-hidden="true"
          className={`action-menu-caret${open ? ' is-open' : ''}`}
          size={theme.icon.size.md}
          stroke={theme.icon.stroke.md}
        />
      </button>

      {open ? (
        <div
          className="action-menu-panel"
          onKeyDown={(event) => void handleMenuArrowKeys(event)}
          role="menu"
        >
          {sections.map((section) => (
            <div className="action-menu-section" key={section.key}>
              {section.label ? (
                <div className="action-menu-section-label">{section.label}</div>
              ) : null}
              {section.items.map((item) => {
                const ItemIcon = item.icon;
  return (
                  <button
                    className="action-menu-item"
                    key={item.key}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                  >
                    {ItemIcon ? (
                      <ItemIcon aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                    ) : null}
                    <span className="action-menu-item-copy">
                      <span className="action-menu-item-label">{item.label}</span>
                      {item.description ? (
                        <span className="action-menu-item-description">{item.description}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
