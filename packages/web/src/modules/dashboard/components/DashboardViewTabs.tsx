import { IconPencil, IconX } from '@tabler/icons-react';
import { useState, type KeyboardEvent } from 'react';

import { useConfirm } from '../../../components/confirm/ConfirmProvider';
import { prefersCoarsePointer } from '../../../components/form/pointer';
import { useTheme } from '../../../providers/theme/useTheme';
import { useDashboardViews } from '../hooks/useDashboardViews';
import type { DashboardView } from '../states/dashboardViewsState';

import { CreateViewPanel } from './CreateViewPanel';

export const DashboardViewTabs = () => {
  const { theme } = useTheme();
  const confirm = useConfirm();
  const { views, activeViewId, switchView, renameView, deleteView } = useDashboardViews();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const startRename = (view: DashboardView): void => {
    setRenamingId(view.id);
    setDraftName(view.name);
  };

  const commitRename = (id: string): void => {
    const trimmed = draftName.trim();
    if (trimmed) renameView(id, trimmed);
    setRenamingId(null);
  };

  const onDeleteView = async (view: DashboardView): Promise<void> => {
    const confirmed = await confirm({
      title: 'Delete this dashboard view?',
      body: 'The view and its widget layout will be removed from this dashboard.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    deleteView(view.id);
  };

  const onTabListKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    if (tabs.length === 0) {
      return;
    }
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    // The rename input lives in the same container; let its caret keys through.
    if (current === -1) {
      return;
    }
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : event.key === 'ArrowRight'
            ? (current + 1 + tabs.length) % tabs.length
            : (current - 1 + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  };

  return (
    <div className="dashboard-view-tabs" onKeyDown={onTabListKeyDown} role="tablist">
      {views.map((view) => {
        const isActive = view.id === activeViewId;
        const isRenaming = renamingId === view.id;
        return (
          <div
            className={`dashboard-view-tab${isActive ? ' is-active' : ''}`}
            key={view.id}
          >
            {isRenaming ? (
              <input
                autoFocus={!prefersCoarsePointer()}
                className="dashboard-view-tab-input"
                name="dashboard-view-name"
                onBlur={() => commitRename(view.id)}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename(view.id);
                  if (event.key === 'Escape') setRenamingId(null);
                }}
                value={draftName}
              />
            ) : (
              <button
                aria-selected={isActive}
                className="dashboard-view-tab-label"
                onClick={() => switchView(view.id)}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                {view.name}
              </button>
            )}
            {isActive && !isRenaming ? (
              <span className="dashboard-view-tab-actions">
                <button
                  aria-label={`Rename ${view.name}`}
                  className="icon-button"
                  onClick={() => startRename(view)}
                  type="button"
                >
                  <IconPencil aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                </button>
                {views.length > 1 ? (
                  <button
                    aria-label={`Delete ${view.name}`}
                    className="icon-button"
                    onClick={() => void onDeleteView(view)}
                    type="button"
                  >
                    <IconX aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
        );
      })}
      <CreateViewPanel />
    </div>
  );
};
