import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

import { useTheme } from '../../providers/theme/useTheme';

type TooltipSide = 'top' | 'bottom';

type TooltipProps = {
  readonly label: string;
  readonly children: ReactElement;
  readonly side?: TooltipSide;
};

type TooltipPosition = {
  readonly top: number;
  readonly left: number;
  readonly side: TooltipSide;
};

// The first tooltip in a session waits for intent; every one after that opens
// instantly, so a toolbar never feels sticky. Module scope is deliberate: the
// memory is per page load, not per component.
let tooltipHasShown = false;

/**
 * A small label that hangs off its trigger on hover or keyboard focus. The
 * trigger renders in place (wrapped in an inline anchor for events) and the
 * label portals to <body>, so table shells and panel overflow can never clip
 * it. Replaces native `title` on compact controls — same information, but
 * styled, positioned, and instant on every use after the first.
 */
export const Tooltip = ({ label, children, side = 'bottom' }: TooltipProps) => {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [isInstant, setIsInstant] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ top: 0, left: 0, side });
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);

  // The trigger gap and the viewport inset share the 8px grid step.
  const gap = Number.parseInt(theme.space[2], 10);
  const viewportGap = gap;
  const showDelayMs = Number.parseInt(theme.animation.delay.tooltip, 10);

  const clearTimer = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const computePosition = (): TooltipPosition | null => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) {
      return null;
    }
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const halfWidth = tooltipWidth / 2;
    // Center on the trigger, then keep the whole label inside the viewport.
    const left = Math.min(
      Math.max(viewportGap + halfWidth, rect.left + rect.width / 2),
      window.innerWidth - halfWidth - viewportGap,
    );
    // Flip to the other side when the preferred one cannot fit, then clamp so
    // an edge anchor never pushes the label off screen.
    const fitsAbove = rect.top - tooltipHeight - gap >= viewportGap;
    const fitsBelow = rect.bottom + gap + tooltipHeight <= window.innerHeight - viewportGap;
    const effectiveSide: TooltipSide =
      side === 'top' ? (fitsAbove ? 'top' : 'bottom') : fitsBelow ? 'bottom' : 'top';
    const preferredTop =
      effectiveSide === 'top' ? rect.top - tooltipHeight - gap : rect.bottom + gap;
    const maxTop = Math.max(viewportGap, window.innerHeight - tooltipHeight - viewportGap);
    const top = Math.min(Math.max(viewportGap, preferredTop), maxTop);
    return { top, left, side: effectiveSide };
  };

  useLayoutEffect(() => {
    if (!isVisible) {
      return;
    }
    const next = computePosition();
    if (next) {
      setPosition(next);
    }
  }, [isVisible, label, side]);

  useEffect(() => {
    if (!isVisible) {
      return undefined;
    }
    const hide = (): void => {
      clearTimer();
      setIsVisible(false);
    };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [isVisible]);

  const show = (delay: number): void => {
    clearTimer();
    if (tooltipHasShown || delay === 0) {
      tooltipHasShown = true;
      setIsInstant(true);
      setIsVisible(true);
      return;
    }
    setIsInstant(false);
    timerRef.current = window.setTimeout(() => {
      tooltipHasShown = true;
      setIsVisible(true);
    }, delay);
  };

  const hide = (): void => {
    clearTimer();
    setIsVisible(false);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- hover/focus wrapper for the trigger; the label is supplemental and the trigger keeps its own accessible name.
    <span
      className="tooltip-anchor"
      onBlur={hide}
      onFocus={() => show(0)}
      onMouseEnter={() => show(showDelayMs)}
      onMouseLeave={hide}
      ref={anchorRef}
    >
      {children}
      {isVisible
        ? createPortal(
            <span
              className={`tooltip${position.side === 'top' ? ' tooltip-top' : ''}`}
              data-instant={isInstant ? '' : undefined}
              ref={tooltipRef}
              role="tooltip"
              style={{ top: position.top, left: position.left }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
};
