import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SortDirection } from '../table/ColumnHeaderMenu';

export type ListSort = {
  readonly key: string;
  readonly direction: SortDirection;
};

export type ListFilters = Readonly<Record<string, readonly string[]>>;

export type ListViewState = {
  readonly filters: ListFilters;
  readonly sorts: readonly ListSort[];
  readonly hiddenColumns: readonly string[];
};

export type ListViewPreset = {
  readonly id: string;
  readonly name: string;
  readonly state: ListViewState;
};

export type ListViewController = {
  readonly filters: ListFilters;
  readonly sorts: readonly ListSort[];
  readonly hiddenColumns: ReadonlySet<string>;
  readonly presets: readonly ListViewPreset[];
  readonly activePreset: ListViewPreset | null;
  readonly isDirty: boolean;
  readonly setFilter: (key: string, values: readonly string[]) => void;
  readonly clearFilters: () => void;
  readonly toggleSort: (key: string) => void;
  readonly setSort: (key: string, direction: SortDirection | null) => void;
  readonly hideColumn: (key: string) => void;
  readonly showColumn: (key: string) => void;
  readonly showAllColumns: () => void;
  readonly applyPreset: (id: string | null) => void;
  readonly createPreset: (name: string) => void;
  readonly updateActivePreset: () => void;
  readonly renamePreset: (id: string, name: string) => void;
  readonly deletePreset: (id: string) => void;
};

type UseListViewOptions = {
  readonly routeKey: string;
  readonly defaultSorts?: readonly ListSort[];
  /** Namespaces this view's URL params, so a page can host more than one list
   * (Billing's groups / rates / invoices) without their state colliding. */
  readonly paramKeyPrefix?: string;
};

// One storage key holding every route's presets, so a stale route can be
// cleaned up without touching the others.
const PRESET_STORAGE_KEY = 'hrms.list-views';

const parseSorts = (raw: string): readonly ListSort[] =>
  raw.split(',').flatMap((entry) => {
    const [key, direction] = entry.split(':');
    if (!key || (direction !== 'asc' && direction !== 'desc')) return [];
    return [{ key, direction }];
  });

const stateArraysEqual = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
};

const sortsEqual = (left: readonly ListSort[], right: readonly ListSort[]): boolean =>
  left.length === right.length &&
  left.every(
    (sort, index) => sort.key === right[index]?.key && sort.direction === right[index]?.direction,
  );

const stateEquals = (left: ListViewState, right: ListViewState): boolean => {
  const leftFilters = Object.entries(left.filters).sort(([a], [b]) => a.localeCompare(b));
  const rightFilters = Object.entries(right.filters).sort(([a], [b]) => a.localeCompare(b));
  if (leftFilters.length !== rightFilters.length) return false;
  for (let index = 0; index < leftFilters.length; index += 1) {
    const [leftKey, leftValues] = leftFilters[index] ?? [];
    const [rightKey, rightValues] = rightFilters[index] ?? [];
    if (leftKey !== rightKey || !stateArraysEqual(leftValues ?? [], rightValues ?? [])) {
      return false;
    }
  }
  return (
    sortsEqual(left.sorts, right.sorts) && stateArraysEqual(left.hiddenColumns, right.hiddenColumns)
  );
};

const readPresets = (routeKey: string): readonly ListViewPreset[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const store = JSON.parse(raw) as Record<string, ListViewPreset[]>;
    return store[routeKey] ?? [];
  } catch {
    return [];
  }
};

const writePresets = (routeKey: string, presets: readonly ListViewPreset[]): void => {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    const store = raw ? (JSON.parse(raw) as Record<string, ListViewPreset[]>) : {};
    if (presets.length === 0) {
      delete store[routeKey];
    } else {
      store[routeKey] = [...presets];
    }
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Private mode or a full quota: presets simply don't persist.
  }
};

const newPresetId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `view-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * The list view state behind the view bar: filters, sorts, and column
 * visibility. The query string is the source of truth so "Copy link to view"
 * genuinely shares what is on screen; named presets are snapshots stored in
 * localStorage, keyed by route.
 */
export const useListView = ({
  routeKey,
  defaultSorts,
  paramKeyPrefix,
}: UseListViewOptions): ListViewController => {
  const [searchParams, setSearchParams] = useSearchParams();
  const prefix = paramKeyPrefix ? `${paramKeyPrefix}.` : '';
  const filterPrefix = `${prefix}filter[`;
  const sortParam = `${prefix}sort`;
  const hiddenParam = `${prefix}hidden`;
  const viewParam = `${prefix}view`;
  // Defaults are read once — pages pass a literal, and re-reading it every
  // render would invalidate every memo that depends on the state.
  const defaultSortsRef = useRef<readonly ListSort[]>(defaultSorts ?? []);
  const defaultState = useMemo<ListViewState>(
    () => ({ filters: {}, sorts: defaultSortsRef.current, hiddenColumns: [] }),
    [],
  );
  const [presets, setPresets] = useState<readonly ListViewPreset[]>(() => readPresets(routeKey));

  const currentState = useMemo<ListViewState>(() => {
    const filters: Record<string, readonly string[]> = {};
    for (const [rawKey, rawValue] of searchParams.entries()) {
      if (!rawKey.startsWith(filterPrefix) || !rawKey.endsWith(']')) continue;
      const key = rawKey.slice(filterPrefix.length, -1);
      if (!key) continue;
      const values = rawValue.split(',').filter((value) => value !== '');
      if (values.length > 0) filters[key] = values;
    }
    const sorts = searchParams.has(sortParam)
      ? parseSorts(searchParams.get(sortParam) ?? '')
      : defaultSortsRef.current;
    const hiddenColumns = (searchParams.get(hiddenParam) ?? '').split(',').filter(Boolean);
    return { filters, sorts, hiddenColumns };
  }, [searchParams, filterPrefix, sortParam, hiddenParam]);

  const activePresetId = searchParams.get(viewParam);
  const activePreset = useMemo(
    () => presets.find((preset) => preset.id === activePresetId) ?? null,
    [presets, activePresetId],
  );
  const isDirty = !stateEquals(currentState, activePreset?.state ?? defaultState);

  const hiddenSet = useMemo(
    () => new Set(currentState.hiddenColumns),
    [currentState.hiddenColumns],
  );

  const applyState = useCallback(
    (state: ListViewState, presetId: string | null): void => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const key of [...next.keys()]) {
            if (key.startsWith(filterPrefix)) next.delete(key);
          }
          next.delete(sortParam);
          next.delete(hiddenParam);
          next.delete(viewParam);
          for (const [key, values] of Object.entries(state.filters)) {
            if (values.length > 0) next.set(`${filterPrefix}${key}]`, values.join(','));
          }
          if (sortsEqual(state.sorts, defaultSortsRef.current)) {
            // Equal to the defaults: no parameter, so a fresh link reads as the
            // built-in view. An explicit empty sort still needs its param to
            // override a non-empty default.
            next.delete(sortParam);
          } else {
            next.set(sortParam, state.sorts.map((sort) => `${sort.key}:${sort.direction}`).join(','));
          }
          if (state.hiddenColumns.length > 0) {
            next.set(hiddenParam, state.hiddenColumns.join(','));
          }
          if (presetId !== null) next.set(viewParam, presetId);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, filterPrefix, sortParam, hiddenParam, viewParam],
  );

  const persist = useCallback(
    (next: readonly ListViewPreset[]): void => {
      setPresets(next);
      writePresets(routeKey, next);
    },
    [routeKey],
  );

  const setFilter = useCallback(
    (key: string, values: readonly string[]): void => {
      const filters = { ...currentState.filters };
      if (values.length === 0) {
        delete filters[key];
      } else {
        filters[key] = [...values];
      }
      applyState({ ...currentState, filters }, activePresetId);
    },
    [activePresetId, applyState, currentState],
  );

  const clearFilters = useCallback((): void => {
    applyState({ ...currentState, filters: {} }, activePresetId);
  }, [activePresetId, applyState, currentState]);

  const setSort = useCallback(
    (key: string, direction: SortDirection | null): void => {
      const existing = currentState.sorts.findIndex((sort) => sort.key === key);
      let sorts: ListSort[];
      if (direction === null) {
        sorts = currentState.sorts.filter((sort) => sort.key !== key);
      } else if (existing === -1) {
        sorts = [...currentState.sorts, { key, direction }];
      } else {
        sorts = currentState.sorts.map((sort) => (sort.key === key ? { key, direction } : sort));
      }
      applyState({ ...currentState, sorts }, activePresetId);
    },
    [activePresetId, applyState, currentState],
  );

  const toggleSort = useCallback(
    (key: string): void => {
      const sort = currentState.sorts.find((entry) => entry.key === key);
      setSort(key, sort === undefined ? 'asc' : sort.direction === 'asc' ? 'desc' : null);
    },
    [currentState.sorts, setSort],
  );

  const hideColumn = useCallback(
    (key: string): void => {
      if (currentState.hiddenColumns.includes(key)) return;
      applyState(
        { ...currentState, hiddenColumns: [...currentState.hiddenColumns, key] },
        activePresetId,
      );
    },
    [activePresetId, applyState, currentState],
  );

  const showColumn = useCallback(
    (key: string): void => {
      applyState(
        {
          ...currentState,
          hiddenColumns: currentState.hiddenColumns.filter((column) => column !== key),
        },
        activePresetId,
      );
    },
    [activePresetId, applyState, currentState],
  );

  const showAllColumns = useCallback((): void => {
    applyState({ ...currentState, hiddenColumns: [] }, activePresetId);
  }, [activePresetId, applyState, currentState]);

  const applyPreset = useCallback(
    (id: string | null): void => {
      if (id === null) {
        applyState(defaultState, null);
        return;
      }
      const preset = presets.find((entry) => entry.id === id);
      if (!preset) return;
      applyState(preset.state, preset.id);
    },
    [applyState, defaultState, presets],
  );

  const createPreset = useCallback(
    (name: string): void => {
      const preset: ListViewPreset = {
        id: newPresetId(),
        name: name.trim() || 'Untitled view',
        state: currentState,
      };
      persist([...presets, preset]);
      applyState(preset.state, preset.id);
    },
    [applyState, currentState, persist, presets],
  );

  const updateActivePreset = useCallback((): void => {
    if (!activePreset) return;
    persist(
      presets.map((preset) =>
        preset.id === activePreset.id ? { ...preset, state: currentState } : preset,
      ),
    );
  }, [activePreset, currentState, persist, presets]);

  const renamePreset = useCallback(
    (id: string, name: string): void => {
      const trimmed = name.trim();
      if (!trimmed) return;
      persist(presets.map((preset) => (preset.id === id ? { ...preset, name: trimmed } : preset)));
    },
    [persist, presets],
  );

  const deletePreset = useCallback(
    (id: string): void => {
      persist(presets.filter((preset) => preset.id !== id));
      if (activePresetId === id) {
        applyState(defaultState, null);
      }
    },
    [activePresetId, applyState, defaultState, persist, presets],
  );

  return {
    filters: currentState.filters,
    sorts: currentState.sorts,
    hiddenColumns: hiddenSet,
    presets,
    activePreset,
    isDirty,
    setFilter,
    clearFilters,
    toggleSort,
    setSort,
    hideColumn,
    showColumn,
    showAllColumns,
    applyPreset,
    createPreset,
    updateActivePreset,
    renamePreset,
    deletePreset,
  };
};
