import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { useTheme } from '../../../providers/theme/useTheme';

type FilterOption = {
  readonly value: string;
  readonly label: string;
};

type DirectoryFilterMenuProps = {
  readonly label: string;
  readonly options: readonly FilterOption[];
  readonly selected: readonly string[];
  readonly onChange: (selected: readonly string[]) => void;
};

/**
 * A multi-select filter chip: the closed chip carries a count badge so active
 * filters stay visible without opening it, matching the filter row on Deel's
 * People table.
 */
export const DirectoryFilterMenu = ({
  label,
  options,
  selected,
  onChange,
}: DirectoryFilterMenuProps) => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggleValue = (value: string): void =>
    onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value],
    );

  return (
    <div className="filter-menu" ref={containerRef}>
      <button
        aria-expanded={open}
        className={`filter-chip${selected.length > 0 ? ' is-active' : ''}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        {selected.length > 0 ? <span className="filter-chip-count">{selected.length}</span> : null}
        <IconChevronDown size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
      </button>

      {open ? (
        <div className="filter-menu-panel">
          {options.map((option) => (
            <label className="filter-menu-option" key={option.value}>
              <input
                checked={selected.includes(option.value)}
                type="checkbox"
                onChange={() => toggleValue(option.value)}
              />
              {option.label}
            </label>
          ))}
          {selected.length > 0 ? (
            <button className="filter-menu-clear" type="button" onClick={() => onChange([])}>
              Clear {label.toLowerCase()}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
