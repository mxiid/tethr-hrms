import type { MainColorName } from '@hrms/ui';
import type { CSSProperties, ReactNode } from 'react';

type ChipColorStyle = CSSProperties & { readonly '--chip-color': string };

// The one place that turns a domain color into the chip's CSS variable, replacing
// the helper that was copy-pasted across eight modules.
const chipColorStyle = (color: MainColorName): ChipColorStyle => ({
  '--chip-color': `var(--hrms-color-tag-${color})`,
});

type StatusChipProps = {
  readonly label: string;
  readonly color: MainColorName;
  // A dot by default; pass an icon for statuses that read better with one.
  readonly icon?: ReactNode;
  readonly showDot?: boolean;
  // Extra positioning/contextual classes (e.g. a profile header chip).
  readonly className?: string;
};

export const StatusChip = ({
  label,
  color,
  icon,
  showDot = true,
  className,
}: StatusChipProps) => (
  <span className={className ? `chip ${className}` : 'chip'} style={chipColorStyle(color)}>
    {icon ?? (showDot ? <span className="chip-dot" /> : null)}
    {label}
  </span>
);
