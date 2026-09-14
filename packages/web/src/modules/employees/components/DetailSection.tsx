import { IconChevronDown } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';

import { useTheme } from '../../../providers/theme/useTheme';

type DetailSectionProps = {
  readonly title: string;
  readonly badge?: ReactNode;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
};

// Open by default: the profile page's tabs already narrow the record down to a
// few sections, so collapsing them again would hide content for no reason. The
// toggle stays for anyone who wants to fold a long one away.
export const DetailSection = ({
  title,
  badge,
  defaultOpen = true,
  children,
}: DetailSectionProps) => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="detail-section">
      <button
        aria-expanded={open}
        className="detail-section-toggle"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="detail-section-toggle-label">
          <IconChevronDown
            className={`detail-section-chevron${open ? ' is-open' : ''}`}
            size={theme.icon.size.sm}
            stroke={theme.icon.stroke.sm}
          />
          <h3 className="section-title">{title}</h3>
        </span>
        {badge}
      </button>
      {open ? <div className="detail-section-body">{children}</div> : null}
    </section>
  );
};
