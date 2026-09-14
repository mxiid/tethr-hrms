import type { CSSProperties } from 'react';

// Shared height scale keyed to real content heights, so placeholders occupy the
// same space the loaded content will.
export type SkeletonHeight = 'xs' | 's' | 'm' | 'l' | 'xl';

const HEIGHT_PX: Record<SkeletonHeight, number> = {
  xs: 13, // one line of text
  s: 16,
  m: 24,
  l: 32, // one table row
  xl: 40,
};

type SkeletonProps = {
  readonly height?: SkeletonHeight;
  readonly width?: string | number;
  readonly borderRadius?: string;
  // Static gray bars (cheap) for table cells; the shimmer is reserved for
  // lower-count surfaces (panels, cards, dropdowns).
  readonly isStatic?: boolean;
  readonly style?: CSSProperties;
};

export const Skeleton = ({
  height = 'xs',
  width = '100%',
  borderRadius,
  isStatic = false,
  style,
}: SkeletonProps) => (
  <span
    aria-hidden="true"
    className={`skeleton${isStatic ? ' skeleton-static' : ''}`}
    style={{ height: HEIGHT_PX[height], width, borderRadius, ...style }}
  />
);

type SkeletonRowsProps = {
  readonly columnCount: number;
  readonly rows?: number;
};

/**
 * Drop-in placeholder rows for an existing `<tbody>`: keeps the real header and
 * column widths, so swapping in the data causes zero reflow.
 */
export const SkeletonRows = ({ columnCount, rows = 6 }: SkeletonRowsProps) => (
  <>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <tr aria-hidden="true" key={rowIndex}>
        {Array.from({ length: columnCount }).map((_, columnIndex) => (
          <td key={columnIndex}>
            <Skeleton
              isStatic
              height="xs"
              width={columnIndex === 0 ? '70%' : '45%'}
            />
          </td>
        ))}
      </tr>
    ))}
  </>
);

type SkeletonTextProps = {
  readonly lines?: number;
};

export const SkeletonText = ({ lines = 3 }: SkeletonTextProps) => (
  <div className="skeleton-text" aria-hidden="true">
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton key={index} height="xs" width={index === lines - 1 ? '60%' : '100%'} />
    ))}
  </div>
);
