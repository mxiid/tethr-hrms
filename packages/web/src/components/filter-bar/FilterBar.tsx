import { IconChevronDown, IconFilter, IconPlus, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTheme } from '../../providers/theme/useTheme';

export type FilterOption = {
  readonly value: string;
  readonly label: string;
};

export type FilterDefinition = {
  readonly key: string;
  readonly label: string;
  readonly options: readonly FilterOption[];
};

type FilterBarProps = {
  readonly filters: readonly FilterDefinition[];
  readonly values: Readonly<Record<string, readonly string[]>>;
  readonly onChange: (key: string, selected: readonly string[]) => void;
};

type PanelAnchor = { readonly top: number; readonly left: number };

// Matches the floating panel's max width so an anchor near the right edge can
// be nudged left far enough for the whole panel to stay on screen.
const FLOATING_PANEL_MAX_WIDTH = 320;

/**
 * Twenty's filter row: nothing permanent while resting (just a light "+ Filter"
 * button), one removable accent-tinted chip per applied filter, and the chip
 * itself reopens the editor. The whole row disappears when nothing is applied.
 *
 * The open panel is portaled to `document.body` with fixed positioning because
 * every in-table usage sits inside `.table-shell` (`overflow: hidden`), which
 * would otherwise clip the options.
 */
export const FilterBar = ({ filters, values, onChange }: FilterBarProps) => {
  const { theme } = useTheme();
  const [openKey, setOpenKey] = useState<string | 'add' | null>(null);
  // Where the open panel is anchored: a chip, or the "+ Filter" button. Kept
  // so checking the first option of a filter doesn't move the panel from the
  // button that opened it to the chip that just materialized.
  const [panelAtAdd, setPanelAtAdd] = useState(false);
  const [anchor, setAnchor] = useState<PanelAnchor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const closePanel = (): void => {
    setOpenKey(null);
    setPanelAtAdd(false);
    setAnchor(null);
  };

  // Keep the panel on screen: right-align it to the trigger where it fits,
  // otherwise shift it left as far as the panel's max width needs.
  const anchorAt = (element: HTMLElement): PanelAnchor => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.bottom + 4,
      left: Math.max(
        8,
        Math.min(rect.right - 200, window.innerWidth - FLOATING_PANEL_MAX_WIDTH - 8),
      ),
    };
  };

  useEffect(() => {
    if (openKey === null) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closePanel();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closePanel();
      }
    };
    // The anchor goes stale the moment anything scrolls it; closing is cleaner
    // than chasing the trigger with fixed positioning (same call ColumnHeaderMenu
    // makes for its portaled panel). Scrolling inside the panel itself (a long
    // option list) must not count.
    const onScroll = (event: Event): void => {
      if (panelRef.current?.contains(event.target as Node)) return;
      closePanel();
    };
    const onResize = (): void => closePanel();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [openKey]);

  const selectedFor = (key: string): readonly string[] => values[key] ?? [];
  // A filter with no options (e.g. a currency picker on an empty portfolio)
  // would open an empty panel — hide the whole bar instead of offering it.
  const available = filters.filter((filter) => filter.options.length > 0);
  const applied = available.filter((filter) => selectedFor(filter.key).length > 0);

  const toggleValue = (key: string, value: string): void => {
    const selected = selectedFor(key);
    onChange(
      key,
      selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value],
    );
  };

  const panelFor = (filter: FilterDefinition) => {
    const selected = selectedFor(filter.key);
    return (
      <>
        <div className="filter-menu-label">{filter.label}</div>
        {filter.options.map((option) => (
          <label className="filter-menu-option" key={option.value}>
            <input
              checked={selected.includes(option.value)}
              name={`filter-${filter.key}-${option.value}`}
              type="checkbox"
              onChange={() => toggleValue(filter.key, option.value)}
            />
            {option.label}
          </label>
        ))}
        {selected.length > 0 ? (
          <button
            className="filter-menu-clear"
            type="button"
            onClick={() => onChange(filter.key, [])}
          >
            Clear {filter.label.toLowerCase()}
          </button>
        ) : null}
      </>
    );
  };

  const openFilter = available.find((filter) => filter.key === openKey) ?? null;
  const addPanelOpen = openKey === 'add' || (openFilter !== null && panelAtAdd);

  if (available.length === 0) return null;

  return (
    <div className="filter-bar" ref={containerRef}>
      {applied.map((filter) => {
        const selected = selectedFor(filter.key);
        const chipPanelOpen = openKey === filter.key && !panelAtAdd;
        return (
          <div className="filter-menu filter-chip-applied" key={filter.key}>
            <button
              aria-expanded={chipPanelOpen}
              className="filter-chip-applied-main"
              type="button"
              onClick={(event) => {
                if (chipPanelOpen) {
                  closePanel();
                  return;
                }
                setPanelAtAdd(false);
                setAnchor(anchorAt(event.currentTarget));
                setOpenKey(filter.key);
              }}
            >
              <span className="filter-chip-applied-label">
                {filter.label}
                {selected.length === 1
                  ? `: ${filter.options.find((option) => option.value === selected[0])?.label ?? selected[0]}`
                  : ''}
              </span>
              {selected.length > 1 ? (
                <span className="filter-chip-count">{selected.length}</span>
              ) : null}
              <IconChevronDown aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            </button>
            <button
              aria-label={`Clear ${filter.label}`}
              className="filter-chip-remove"
              type="button"
              onClick={() => onChange(filter.key, [])}
            >
              <IconX aria-hidden="true" size={12} stroke={2} />
            </button>
          </div>
        );
      })}

      <div className="filter-menu">
        <button
          aria-expanded={addPanelOpen}
          className="filter-add-button"
          type="button"
          onClick={(event) => {
            if (addPanelOpen) {
              closePanel();
              return;
            }
            setPanelAtAdd(false);
            setAnchor(anchorAt(event.currentTarget));
            setOpenKey('add');
          }}
        >
          {applied.length === 0 ? (
            <IconFilter aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          ) : (
            <IconPlus aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          )}
          Filter
        </button>
      </div>

      {openKey !== null && anchor
        ? createPortal(
            <div
              className="filter-menu-panel filter-menu-panel-floating"
              ref={panelRef}
              style={{ top: anchor.top, left: anchor.left }}
            >
              {openKey === 'add' ? (
                <>
                  <div className="filter-menu-label">Add filter</div>
                  {available.map((filter) => {
                    const count = selectedFor(filter.key).length;
                    return (
                      <button
                        className="filter-menu-option filter-menu-option-button"
                        key={filter.key}
                        type="button"
                        onClick={() => {
                          setPanelAtAdd(true);
                          setOpenKey(filter.key);
                        }}
                      >
                        {filter.label}
                        {count > 0 ? <span className="filter-chip-count">{count}</span> : null}
                      </button>
                    );
                  })}
                </>
              ) : openFilter ? (
                panelFor(openFilter)
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
