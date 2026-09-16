import {
  IconArrowsSort,
  IconEyeOff,
  IconSortAscending,
  IconSortDescending,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { handleMenuArrowKeys } from '../menu/menuKeyboard';

export type SortDirection = 'asc' | 'desc';

type ColumnHeaderMenuProps = {
  readonly label: string;
  /** Current direction when this column drives the sort, else null. */
  readonly sortDirection?: SortDirection | null;
  /** `null` removes the sort and falls back to the page's natural order. */
  readonly onSort?: (direction: SortDirection | null) => void;
  /** Omit to make the column non-hideable (e.g. the name/first column). */
  readonly onHide?: () => void;
  /** Aligns the cell (use `right` for numeric columns). */
  readonly align?: 'left' | 'right';
};

/**
 * A `<th>` that is itself the menu trigger — Twenty's column-head dropdown.
 * The panel is portaled to `document.body` with fixed positioning because the
 * table's scroll container (`overflow: auto`) would otherwise clip it.
 */
export const ColumnHeaderMenu = ({
  label,
  sortDirection = null,
  onSort,
  onHide,
  align = 'left',
}: ColumnHeaderMenuProps) => {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const openMenu = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({ top: rect.bottom + 4, left: align === 'right' ? Math.max(8, rect.right - 200) : rect.left });
    setOpen(true);
  };

  // Deliberate dismissals (Escape, choosing an item) return focus to the header
  // trigger; an outside click closes without stealing focus.
  const closeMenu = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    // Move focus into the menu so arrow keys work without a Tab first.
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMenu();
    };
    // The anchor goes stale the moment the table scrolls; closing is cleaner
    // than chasing the cell with fixed positioning.
    const onScroll = (): void => setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <th className={align === 'right' ? 'cell-numeric column-header' : 'column-header'}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`column-header-trigger${sortDirection ? ' is-sorted' : ''}`}
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span className="column-header-label">{label}</span>
        {sortDirection === 'asc' ? (
          <IconSortAscending aria-hidden="true"
            className="column-header-caret"
            size={14}
            stroke={2}
          />
        ) : sortDirection === 'desc' ? (
          <IconSortDescending aria-hidden="true"
            className="column-header-caret"
            size={14}
            stroke={2}
          />
        ) : (
          <IconArrowsSort aria-hidden="true" className="column-header-caret" size={14} stroke={2} />
        )}
      </button>

      {open && anchor
        ? createPortal(
            <div
              className="action-menu-panel column-header-panel"
              onKeyDown={(event) => void handleMenuArrowKeys(event)}
              ref={panelRef}
              role="menu"
              style={{ top: anchor.top, left: anchor.left }}
            >
              {onSort ? (
                <>
                  <button
                    className="action-menu-item"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      onSort('asc');
                      closeMenu();
                    }}
                  >
                    <IconSortAscending aria-hidden="true" size={16} stroke={2} />
                    <span className="action-menu-item-copy">
                      <span className="action-menu-item-label">Sort ascending</span>
                    </span>
                  </button>
                  <button
                    className="action-menu-item"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      onSort('desc');
                      closeMenu();
                    }}
                  >
                    <IconSortDescending aria-hidden="true" size={16} stroke={2} />
                    <span className="action-menu-item-copy">
                      <span className="action-menu-item-label">Sort descending</span>
                    </span>
                  </button>
                  {sortDirection ? (
                    <button
                      className="action-menu-item"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        onSort(null);
                        closeMenu();
                      }}
                    >
                      <IconX aria-hidden="true" size={16} stroke={2} />
                      <span className="action-menu-item-copy">
                        <span className="action-menu-item-label">Remove sort</span>
                      </span>
                    </button>
                  ) : null}
                </>
              ) : null}
              {onHide ? (
                <button
                  className="action-menu-item"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    onHide();
                    closeMenu();
                  }}
                >
                  <IconEyeOff aria-hidden="true" size={16} stroke={2} />
                  <span className="action-menu-item-copy">
                    <span className="action-menu-item-label">Hide column</span>
                  </span>
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </th>
  );
};
