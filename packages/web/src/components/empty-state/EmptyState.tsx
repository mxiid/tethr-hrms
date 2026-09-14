import { type TablerIcon } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { useTheme } from '../../providers/theme/useTheme';

type EmptyStateProps = {
  readonly icon: TablerIcon;
  readonly title: string;
  readonly description?: string;
  // Match the CTA to the cause: no button when the cause is permissions, a
  // "clear filters" when a filter hides everything, "Add…" when genuinely empty.
  readonly action?: ReactNode;
};

export const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => {
  const { theme } = useTheme();

  return (
    <div className="empty-state">
      <Icon size={theme.icon.size.xl} stroke={theme.icon.stroke.md} />
      <h3 className="empty-state-title">{title}</h3>
      {description ? <p className="empty-state-copy">{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
};
