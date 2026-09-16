import {
  IconAdjustments,
  IconArrowLeft,
  IconArrowsSort,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconColumns,
  IconLink,
  IconListDetails,
  IconPencil,
  IconPlus,
  IconSortAscending,
  IconSortDescending,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useTheme } from '../../providers/theme/useTheme';
import { FilterBar, type FilterDefinition } from '../filter-bar/FilterBar';
import { focusFirstByName } from '../form/validation';
import { handleMenuArrowKeys } from '../menu/menuKeyboard';
import type { ViewColumnDescriptor } from '../table/DataTable';
import { Tooltip } from '../tooltip/Tooltip';

import type { ListViewController } from './useListView';

type ViewBarProps = {
  readonly view: ListViewController;
  /** The built-in view's name, e.g. "All employees". */
  readonly viewLabel: string;
  /** Rows currently visible, shown next to the view name. */
  readonly count: number;
  readonly filters: readonly FilterDefinition[];
  readonly columns: readonly ViewColumnDescriptor[];
  /** Page-specific buttons (New, Refresh) that belong at the end of the bar. */
  readonly actions?: ReactNode;
};

type PanelKey = 'view' | 'sort' | 'options';

type NamingState =
  { readonly mode: 'create' } | { readonly mode: 'rename'; readonly id: string } | null;

const FLOATING_PANEL_WIDTH = 280;

const clampPanelLeft = (rect: DOMRect): number =>
  Math.max(
    8,
    Math.min(rect.right - FLOATING_PANEL_WIDTH, window.innerWidth - FLOATING_PANEL_WIDTH - 8),
  );

/**
 * The view bar above every list: the view chip (name + visible count) with its
 * saved-preset menu, Filter, Sort, and Options. Filters and sorts stay local to
 * the URL until a custom view is saved; field visibility commits immediately —
 * the same split Twenty uses.
 */
export const ViewBar = ({ view, viewLabel, count, filters, columns, actions }: ViewBarProps) => {
  const { theme } = useTheme();
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const [optionsStep, setOptionsStep] = useState<'root' | 'fields'>('root');
  const [naming, setNaming] = useState<NamingState>(null);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
    align: 'left' | 'right';
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const viewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sortTriggerRef = useRef<HTMLButtonElement | null>(null);
  const optionsTriggerRef = useRef<HTMLButtonElement | null>(null);

  const closePanel = (): void => {
    setPanel(null);
    setNaming(null);
    setNameError(null);
    setOptionsStep('root');
    setAnchor(null);
  };

  const openPanelAt = (
    key: PanelKey,
    element: HTMLElement | null,
    align: 'left' | 'right',
  ): void => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 4,
      left: align === 'left' ? Math.max(8, rect.left) : clampPanelLeft(rect),
      align,
    });
    setPanel(key);
  };

  const togglePanel = (
    key: PanelKey,
    element: HTMLElement | null,
    align: 'left' | 'right',
  ): void => {
    if (panel === key) {
      closePanel();
      return;
    }
    setOptionsStep('root');
    setNaming(null);
    openPanelAt(key, element, align);
  };

  useEffect(() => {
    if (panel === null) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closePanel();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closePanel();
    };
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
  }, [panel]);

  // Move focus into the menu so arrow keys work without a Tab first; the naming
  // form keeps its own autoFocus when it is the reason the panel is open.
  useEffect(() => {
    if (panel === null || naming !== null) return undefined;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [panel, naming]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const startCreate = (): void => {
    setDraftName('');
    setNameError(null);
    setNaming({ mode: 'create' });
    openPanelAt('view', viewTriggerRef.current, 'left');
  };

  const startRename = (id: string, name: string): void => {
    setDraftName(name);
    setNameError(null);
    setNaming({ mode: 'rename', id });
    openPanelAt('view', viewTriggerRef.current, 'left');
  };

  const onSaveView = (): void => {
    if (view.activePreset) {
      view.updateActivePreset();
      return;
    }
    startCreate();
  };

  const onSubmitName = (event: FormEvent): void => {
    event.preventDefault();
    if (naming === null) return;
    const name = draftName.trim();
    if (!name) {
      setNameError('Enter a view name to save.');
      focusFirstByName(panelRef.current, ['view-name']);
      return;
    }
    setNameError(null);
    if (naming.mode === 'create') {
      view.createPreset(name);
    } else {
      view.renamePreset(naming.id, name);
    }
    closePanel();
  };

  const onCopyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Clipboard unavailable (insecure context/denied) — the address bar is
      // still the source of truth, so there is nothing else to do.
      setCopied(false);
    }
  };

  const visibleColumnCount = columns.filter(
    (column) => column.hideable === false || !view.hiddenColumns.has(column.key),
  ).length;
  const sortableColumns = columns.filter((column) => column.sortable);
  const activeViewName = view.activePreset?.name ?? viewLabel;

  return (
    <div className="view-bar" ref={containerRef}>
      <div className="view-bar-group">
        <div className="view-menu">
          <button
            aria-expanded={panel === 'view'}
            aria-haspopup="menu"
            className="view-chip"
            onClick={() => togglePanel('view', viewTriggerRef.current, 'left')}
            ref={viewTriggerRef}
            type="button"
          >
            <IconListDetails aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            <span className="view-chip-name">{activeViewName}</span>
            <span className="view-chip-count">{count}</span>
            <IconChevronDown aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          </button>
        </div>

        {view.isDirty ? (
          <button className="view-save-button" onClick={onSaveView} type="button">
            {view.activePreset ? 'Save view' : 'Save as view'}
          </button>
        ) : null}

        <FilterBar filters={filters} values={view.filters} onChange={view.setFilter} />
      </div>

      <div className="view-bar-group view-bar-group-end">
        <div className="view-menu">
          <button
            aria-expanded={panel === 'sort'}
            aria-haspopup="menu"
            className="view-bar-button"
            onClick={() => togglePanel('sort', sortTriggerRef.current, 'right')}
            ref={sortTriggerRef}
            type="button"
          >
            <IconArrowsSort aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            Sort{view.sorts.length > 0 ? ` · ${view.sorts.length}` : ''}
          </button>
        </div>

        <div className="view-menu">
          <button
            aria-expanded={panel === 'options'}
            aria-haspopup="menu"
            className="view-bar-button"
            onClick={() => togglePanel('options', optionsTriggerRef.current, 'right')}
            ref={optionsTriggerRef}
            type="button"
          >
            <IconAdjustments aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
            Options
          </button>
        </div>

        {actions ? <div className="view-bar-actions">{actions}</div> : null}
      </div>

      {panel !== null && anchor
        ? createPortal(
            <div
              className="view-menu-panel view-menu-panel-floating"
              onKeyDown={(event) => void handleMenuArrowKeys(event)}
              ref={panelRef}
              role="menu"
              style={{
                top: anchor.top,
                left: anchor.left,
                transformOrigin: anchor.align === 'right' ? 'top right' : 'top left',
              }}
            >
              {panel === 'view' ? (
                <>
                  <button
                    className={`view-menu-item${view.activePreset === null ? ' is-active' : ''}`}
                    onClick={() => {
                      view.applyPreset(null);
                      closePanel();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {view.activePreset === null ? (
                      <IconCheck aria-hidden="true" size={16} stroke={2} />
                    ) : (
                      <span className="view-menu-spacer" />
                    )}
                    <span className="truncate">{viewLabel}</span>
                    <span className="view-menu-meta">{count}</span>
                  </button>
                  {view.presets.map((preset) => {
                    const isActive = view.activePreset?.id === preset.id;
                    return (
                      <div className="view-menu-row" key={preset.id}>
                        <button
                          className={`view-menu-item${isActive ? ' is-active' : ''}`}
                          onClick={() => {
                            view.applyPreset(preset.id);
                            closePanel();
                          }}
                          role="menuitem"
                          type="button"
                        >
                          {isActive ? (
                            <IconCheck aria-hidden="true" size={16} stroke={2} />
                          ) : (
                            <span className="view-menu-spacer" />
                          )}
                          <span className="truncate">{preset.name}</span>
                        </button>
                        {isActive ? (
                          <span className="view-menu-row-actions">
                            <Tooltip label={`Rename ${preset.name}`}>
                              <button
                                aria-label={`Rename ${preset.name}`}
                                className="icon-button view-menu-icon"
                                onClick={() => startRename(preset.id, preset.name)}
                                type="button"
                              >
                                <IconPencil aria-hidden="true" size={14} stroke={2} />
                              </button>
                            </Tooltip>
                            <Tooltip label={`Delete ${preset.name}`}>
                              <button
                                aria-label={`Delete ${preset.name}`}
                                className="icon-button view-menu-icon"
                                onClick={() => {
                                  view.deletePreset(preset.id);
                                  closePanel();
                                }}
                                type="button"
                              >
                                <IconTrash aria-hidden="true" size={14} stroke={2} />
                              </button>
                            </Tooltip>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                  <div className="view-menu-divider" />
                  {naming !== null ? (
                    <>
                      <form className="view-menu-form" onSubmit={onSubmitName}>
                        <input
                          aria-label={naming.mode === 'create' ? 'New view name' : 'View name'}
                          autoFocus
                          name="view-name"
                          onChange={(event) => {
                            setDraftName(event.target.value);
                            setNameError(null);
                          }}
                          placeholder="View name"
                          value={draftName}
                        />
                        <button className="button button-primary" type="submit">
                          {naming.mode === 'create' ? 'Create' : 'Save'}
                        </button>
                      </form>
                      {nameError ? (
                        <p className="auth-error" role="alert">
                          {nameError}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <button
                      className="view-menu-item"
                      onClick={startCreate}
                      role="menuitem"
                      type="button"
                    >
                      <IconPlus aria-hidden="true" size={16} stroke={2} />
                      <span>Create custom view</span>
                    </button>
                  )}
                </>
              ) : null}

              {panel === 'sort' ? (
                <>
                  <div className="view-menu-label">Sort by</div>
                  {sortableColumns.map((column) => {
                    const index = view.sorts.findIndex((sort) => sort.key === column.key);
                    const sort = index >= 0 ? view.sorts[index] : undefined;
                    const SortIcon =
                      sort === undefined
                        ? IconPlus
                        : sort.direction === 'asc'
                          ? IconSortAscending
                          : IconSortDescending;
                    return (
                      <div className="view-menu-row" key={column.key}>
                        <button
                          className={`view-menu-item${sort ? ' is-active' : ''}`}
                          onClick={() => view.toggleSort(column.key)}
                          role="menuitem"
                          type="button"
                        >
                          {view.sorts.length > 1 && sort ? (
                            <span className="view-sort-index">{index + 1}</span>
                          ) : (
                            <SortIcon aria-hidden="true" size={16} stroke={2} />
                          )}
                          <span className="truncate">{column.header}</span>
                          {sort ? <span className="view-menu-meta">{sort.direction}</span> : null}
                        </button>
                        {sort ? (
                          <span className="view-menu-row-actions">
                            <Tooltip label={`Remove sort on ${column.header}`}>
                              <button
                                aria-label={`Remove sort on ${column.header}`}
                                className="icon-button view-menu-icon"
                                onClick={() => view.setSort(column.key, null)}
                                type="button"
                              >
                                <IconX aria-hidden="true" size={14} stroke={2} />
                              </button>
                            </Tooltip>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                  {view.sorts.length === 0 ? (
                    <p className="view-menu-hint">
                      Click a field to sort ascending; click again for descending.
                    </p>
                  ) : view.sorts.length > 1 ? (
                    <p className="view-menu-hint">
                      Earlier fields win; the number shows precedence.
                    </p>
                  ) : null}
                </>
              ) : null}

              {panel === 'options' ? (
                optionsStep === 'root' ? (
                  <>
                    <button
                      className="view-menu-item"
                      onClick={() => setOptionsStep('fields')}
                      role="menuitem"
                      type="button"
                    >
                      <IconColumns aria-hidden="true" size={16} stroke={2} />
                      <span>Fields</span>
                      <span className="view-menu-meta">{visibleColumnCount} shown</span>
                      <IconChevronRight aria-hidden="true" size={14} stroke={2} />
                    </button>
                    <button
                      className="view-menu-item"
                      onClick={() => void onCopyLink()}
                      role="menuitem"
                      type="button"
                    >
                      <IconLink aria-hidden="true" size={16} stroke={2} />
                      <span>{copied ? 'Link copied' : 'Copy link to view'}</span>
                    </button>
                    <button
                      className="view-menu-item"
                      onClick={startCreate}
                      role="menuitem"
                      type="button"
                    >
                      <IconPlus aria-hidden="true" size={16} stroke={2} />
                      <span>Create custom view</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="view-menu-row view-menu-row-heading">
                      <button
                        className="view-menu-item"
                        onClick={() => setOptionsStep('root')}
                        type="button"
                      >
                        <IconArrowLeft aria-hidden="true" size={16} stroke={2} />
                        <span>Fields</span>
                      </button>
                      <span className="view-menu-meta">{visibleColumnCount} shown</span>
                    </div>
                    <div className="view-menu-scroll">
                      {columns.map((column) => {
                        const visible =
                          column.hideable === false || !view.hiddenColumns.has(column.key);
                        return (
                          <label
                            className={`view-field-option${column.hideable ? '' : ' is-pinned'}`}
                            key={column.key}
                          >
                            <input
                              checked={visible}
                              disabled={!column.hideable}
                              name={`column-${column.key}`}
                              onChange={(event) => {
                                if (event.target.checked) view.showColumn(column.key);
                                else view.hideColumn(column.key);
                              }}
                              type="checkbox"
                            />
                            <span className="truncate">{column.header || column.key}</span>
                            {column.hideable ? null : (
                              <span className="view-menu-meta">Pinned</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </>
                )
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
