import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

type FittedContentOptions = {
  readonly bodyRef: RefObject<HTMLElement | null>;
  readonly contentRef: RefObject<HTMLElement | null>;
  /** How many metrics are selected — the first probe renders all of them. */
  readonly proposedFields: number;
  /** The fewest metrics to keep; a tile never renders zero. */
  readonly minimumFields: number;
  /** Legend items the size allows — trimmed further when the tile narrows. */
  readonly proposedLegend: number;
  /** The fewest legend items to keep (the chart's key must survive). */
  readonly minimumLegend: number;
  /** Changes that re-probe from the full selection (size, display mode). */
  readonly resetKey: string;
};

export type FittedContent = {
  readonly fieldCount: number;
  readonly legendCount: number;
};

/**
 * How much of a tile's content actually fits its box right now.
 *
 * The static density caps are hints, not verdicts: this measures the real box
 * (and trims, pre-paint, while the content overflows). The legend sheds first
 * — the chart's bar still reads without its full key — and the metrics trim
 * one at a time after it, so a quarter tile shows as many metrics as its
 * current width holds and a narrower board degrades gracefully instead of
 * ever clipping a row.
 */
export const useFittedContent = ({
  bodyRef,
  contentRef,
  proposedFields,
  minimumFields,
  proposedLegend,
  minimumLegend,
  resetKey,
}: FittedContentOptions): FittedContent => {
  const [fitted, setFitted] = useState<FittedContent>({
    fieldCount: proposedFields,
    legendCount: proposedLegend,
  });
  const [measureTick, setMeasureTick] = useState(0);
  const lastWidthRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    setFitted({ fieldCount: proposedFields, legendCount: proposedLegend });
  }, [proposedFields, proposedLegend, resetKey]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    lastWidthRef.current = body.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = body.clientWidth;
      if (lastWidthRef.current !== width) {
        lastWidthRef.current = width;
        // A new width re-probes from the full content — and always signals a
        // measure pass, since resetting to the same counts is a no-op to React.
        setFitted({ fieldCount: proposedFields, legendCount: proposedLegend });
      }
      setMeasureTick((tick) => tick + 1);
    });
    observer.observe(body);
    const content = contentRef.current;
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [bodyRef, contentRef, proposedFields, proposedLegend]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const overflowsVertically = body.scrollHeight > body.clientHeight + 1;
    const overflowsHorizontally = body.scrollWidth > body.clientWidth + 1;
    if (!overflowsVertically && !overflowsHorizontally) return;
    if (fitted.legendCount > minimumLegend) {
      setFitted({ fieldCount: fitted.fieldCount, legendCount: fitted.legendCount - 1 });
    } else if (fitted.fieldCount > minimumFields) {
      setFitted({ fieldCount: fitted.fieldCount - 1, legendCount: fitted.legendCount });
    }
  }, [bodyRef, fitted, minimumFields, minimumLegend, measureTick]);

  return fitted;
};
