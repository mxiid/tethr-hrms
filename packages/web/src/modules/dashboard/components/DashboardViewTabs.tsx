import { IconPencil, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { useTheme } from '../../../providers/theme/useTheme';
import { useDashboardViews } from '../hooks/useDashboardViews';
import type { DashboardView } from '../states/dashboardViewsState';

import { CreateViewPanel } from './CreateViewPanel';

export const DashboardViewTabs = () => {
  const { theme } = useTheme();
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

  return (
    <div className="dashboard-view-tabs" role="tablist">
      {views.map((view) => {
        const isActive = view.id === activeViewId;
        const isRenaming = renamingId === view.id;
        return (
          <div
            aria-selected={isActive}
            className={`dashboard-view-tab${isActive ? ' is-active' : ''}`}
            key={view.id}
            role="tab"
          >
            {isRenaming ? (
              <input
                autoFocus
                className="dashboard-view-tab-input"
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
                className="dashboard-view-tab-label"
                onClick={() => switchView(view.id)}
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
                  <IconPencil size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
                </button>
                {views.length > 1 ? (
                  <button
                    aria-label={`Delete ${view.name}`}
                    className="icon-button"
                    onClick={() => deleteView(view.id)}
                    type="button"
                  >
                    <IconX size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
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
