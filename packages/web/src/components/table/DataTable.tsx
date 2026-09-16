import { useMemo, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import { SkeletonRows } from '../skeleton/Skeleton';
import type { ListSort } from '../view-bar/useListView';

import { ColumnHeaderMenu, type SortDirection } from './ColumnHeaderMenu';

export type ColumnDefinition<TRow> = {
  readonly key: string;
  readonly header: string;
  /** Shown in the cell's `data-label` (and as the header for unlabeled action
   * columns), defaulting to `header`. */
  readonly label?: string;
  /** `right` applies the existing `.cell-numeric` treatment. */
  readonly align?: 'left' | 'right';
  /** Feeds the `<colgroup>`. */
  readonly width?: string;
  /** Omit (or set false) to pin the column, e.g. the name column. */
  readonly hideable?: boolean;
  /** Omit to make the column unsortable. */
  readonly sortValue?: (row: TRow) => string | number;
  readonly render: (row: TRow) => ReactNode;
};

export type ViewColumnDescriptor = {
  readonly key: string;
  readonly header: string;
  readonly hideable: boolean;
  readonly sortable: boolean;
};

export type DraftRow<TRow> = {
  readonly rowKey: string;
  readonly renderCell: (column: ColumnDefinition<TRow>) => ReactNode;
};

type DataTableProps<TRow> = {
  readonly columns: readonly ColumnDefinition<TRow>[];
  readonly rows: readonly TRow[];
  readonly getRowKey: (row: TRow) => string;
  readonly loading?: boolean;
  readonly emptyState?: ReactNode;
  readonly sorts?: readonly ListSort[];
  readonly onSort?: (key: string, direction: SortDirection | null) => void;
  readonly hiddenColumns?: ReadonlySet<string>;
  readonly onHideColumn?: (key: string) => void;
  readonly onRowClick?: (row: TRow) => void;
  readonly selectedRowKey?: string | null;
  readonly rowClassName?: (row: TRow) => string;
  readonly draftRow?: DraftRow<TRow> | null;
  readonly tableClassName?: string;
  readonly skeletonRows?: number;
  readonly ariaLabel?: string;
};

/** The view bar only needs a column's identity, not its renderer. */
export const toViewColumns = <TRow,>(
  columns: readonly ColumnDefinition<TRow>[],
): readonly ViewColumnDescriptor[] =>
  columns.map((column) => ({
    key: column.key,
    header: column.header,
    hideable: column.hideable !== false,
    sortable: column.sortValue !== undefined,
  }));

const compareValues = (left: string | number, right: string | number): number =>
  typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right));

const sortRows = <TRow,>(
  rows: readonly TRow[],
  columns: readonly ColumnDefinition<TRow>[],
  sorts: readonly ListSort[],
): readonly TRow[] => {
  if (sorts.length === 0) return rows;
  const activeSorts = sorts.flatMap((sort) => {
    const column = columns.find((entry) => entry.key === sort.key);
    if (!column?.sortValue) return [];
    return [{ direction: sort.direction, sortValue: column.sortValue }];
  });
  if (activeSorts.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const { direction, sortValue } of activeSorts) {
      const result = compareValues(sortValue(left), sortValue(right));
      if (result !== 0) return direction === 'asc' ? result : -result;
    }
    return 0;
  });
};

const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('a, button, input, select, textarea, label') !== null;

/**
 * The shared list table: column definitions in, full markup out — colgroup,
 * header menus (sort + hide), hidden columns, skeleton rows, the empty-state
 * cell with its colSpan computed once, `data-label` for the ≤760px stacked
 * cards, row selection, and a pinned draft row for inline creation.
 *
 * Sorting is applied here, over the already-loaded rows, from the caller's
 * `sorts` (the view bar and the column headers write to the same state).
 */
export const DataTable = <TRow,>({
  columns,
  rows,
  getRowKey,
  loading = false,
  emptyState,
  sorts = [],
  onSort,
  hiddenColumns,
  onHideColumn,
  onRowClick,
  selectedRowKey,
  rowClassName,
  draftRow,
  tableClassName = 'data-table',
  skeletonRows = 5,
  ariaLabel,
}: DataTableProps<TRow>) => {
  const visibleColumns = useMemo(
    () =>
      columns.filter(
        (column) => column.hideable === false || hiddenColumns?.has(column.key) !== true,
      ),
    [columns, hiddenColumns],
  );
  const sortedRows = useMemo(() => sortRows(rows, columns, sorts), [rows, columns, sorts]);

  const onRowClickEvent = (event: MouseEvent<HTMLTableRowElement>, row: TRow): void => {
    if (onRowClick === undefined || isInteractiveTarget(event.target)) return;
    onRowClick(row);
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: TRow): void => {
    if (onRowClick === undefined || isInteractiveTarget(event.target)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onRowClick(row);
  };

  return (
    <div
      className={tableClassName === 'employee-table' ? 'employee-table-wrap' : 'data-table-wrap'}
    >
      <table aria-label={ariaLabel} className={tableClassName}>
        <colgroup>
          {visibleColumns.map((column) => (
            <col key={column.key} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {visibleColumns.map((column) => {
              const label = column.label ?? column.header;
              const sortDirection =
                sorts.find((sort) => sort.key === column.key)?.direction ?? null;
              const canSort = column.sortValue !== undefined && onSort !== undefined;
              const canHide = column.hideable !== false && onHideColumn !== undefined;
              if (!canSort && !canHide) {
                return (
                  <th
                    aria-label={label || undefined}
                    className={column.align === 'right' ? 'cell-numeric' : undefined}
                    key={column.key}
                  >
                    {column.header}
                  </th>
                );
              }
              return (
                <ColumnHeaderMenu
                  align={column.align}
                  key={column.key}
                  label={column.header}
                  onHide={canHide ? () => onHideColumn(column.key) : undefined}
                  onSort={canSort ? (direction) => onSort(column.key, direction) : undefined}
                  sortDirection={canSort ? sortDirection : null}
                />
              );
            })}
          </tr>
        </thead>
        <tbody>
          {draftRow ? (
            <tr className="data-table-draft-row">
              {visibleColumns.map((column) => (
                <td
                  className={column.align === 'right' ? 'cell-numeric' : undefined}
                  data-label={(column.label ?? column.header) || undefined}
                  key={column.key}
                >
                  {draftRow.renderCell(column)}
                </td>
              ))}
            </tr>
          ) : null}
          {loading ? (
            <SkeletonRows columnCount={visibleColumns.length} rows={skeletonRows} />
          ) : null}
          {!loading &&
            sortedRows.map((row) => {
              const rowKey = getRowKey(row);
              const classes = [
                'data-table-row',
                onRowClick !== undefined ? 'is-clickable' : null,
                selectedRowKey === rowKey ? 'is-selected' : null,
                rowClassName?.(row) ?? null,
              ]
                .filter((entry): entry is string => typeof entry === 'string' && entry !== '')
                .join(' ');
              return (
                <tr
                  className={classes}
                  key={rowKey}
                  onClick={(event) => onRowClickEvent(event, row)}
                  onKeyDown={(event) => onRowKeyDown(event, row)}
                  tabIndex={onRowClick !== undefined ? 0 : undefined}
                >
                  {visibleColumns.map((column) => (
                    <td
                      className={column.align === 'right' ? 'cell-numeric' : undefined}
                      data-label={(column.label ?? column.header) || undefined}
                      key={column.key}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          {!loading && sortedRows.length === 0 && draftRow == null ? (
            <tr>
              <td className="table-empty" colSpan={visibleColumns.length}>
                {emptyState}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
};
