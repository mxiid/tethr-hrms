import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useTheme } from '../../providers/theme/useTheme';

type SidePanelProps = {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  /** Replaces the static title in the header — used for the inline name fields
   * when creating or editing a record in place. */
  readonly headerContent?: ReactNode;
  /** Accessible name for the landmark and close button when the header shows a
   * record rather than the generic title (e.g. the selected employee's name). */
  readonly ariaLabel?: string;
};

/**
 * A right-side record panel that pushes the list narrower, like Twenty's record
 * panel: a flex sibling of the list, never an overlay. No backdrop and no body
 * scroll-lock — the list stays visible, scrollable, and clickable while open.
 * The outer `<aside>` animates its width (0 → the side-panel token) and clips
 * the fixed-width body, so content doesn't reflow mid-transition. Closes on
 * Escape and the header button, and returns focus to the trigger on close.
 */
export const SidePanel = ({
  isOpen,
  onClose,
  title,
  children,
  headerContent,
  ariaLabel,
}: SidePanelProps) => {
  const { theme } = useTheme();
  const panelRef = useRef<HTMLElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Stable handler ref so the open/close effect doesn't re-run on parent
  // re-renders (which would steal focus while a panel form is being typed in).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  // Kept through the close transition: the parent clears its selection the
  // moment it closes, so latch the last content — title and header included —
  // rather than letting the panel swap to its generic title (or empty header)
  // while the width still animates. The latest values are tracked in refs on
  // every open render (no re-render), and only copied into state on the
  // open→closed edge — that way typing in a panel form costs no extra pass.
  const [lastChildren, setLastChildren] = useState<ReactNode>(children);
  const [lastTitle, setLastTitle] = useState(title);
  const [lastHeaderContent, setLastHeaderContent] = useState<ReactNode>(headerContent);
  const [lastAriaLabel, setLastAriaLabel] = useState<string | undefined>(ariaLabel);
  const [isRendered, setIsRendered] = useState(isOpen);
  const latestChildren = useRef(children);
  const latestTitle = useRef(title);
  const latestHeaderContent = useRef(headerContent);
  const latestAriaLabel = useRef<string | undefined>(ariaLabel);

  useEffect(() => {
    if (isOpen) {
      latestChildren.current = children;
      latestTitle.current = title;
      latestHeaderContent.current = headerContent;
      latestAriaLabel.current = ariaLabel;
    }
  }, [isOpen, children, title, headerContent, ariaLabel]);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      return;
    }
    if (isRendered) {
      setLastChildren(latestChildren.current);
      setLastTitle(latestTitle.current);
      setLastHeaderContent(latestHeaderContent.current);
      setLastAriaLabel(latestAriaLabel.current);
    }
  }, [isOpen, isRendered]);

  const shownTitle = isOpen ? title : lastTitle;
  const shownHeaderContent = isOpen ? headerContent : lastHeaderContent;
  const shownAriaLabel = (isOpen ? ariaLabel : lastAriaLabel) ?? shownTitle;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent): void => {
      // Escape while a note is being typed would close the panel and discard
      // the draft; leave the key to the textarea.
      if (event.key === 'Escape' && !(event.target instanceof HTMLTextAreaElement)) {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      // A field with `autoFocus` (the create panel's name input) has already
      // taken focus during commit; only fall back to the panel itself.
      if (panel && !panel.contains(document.activeElement)) {
        panel.focus();
      }
    });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.cancelAnimationFrame(focusFrame);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  return (
    <aside
      aria-hidden={!isOpen}
      aria-label={shownAriaLabel}
      className={`side-panel${isOpen ? ' is-open' : ''}`}
      {...(!isOpen ? { inert: '' } : {})}
      onTransitionEnd={(event) => {
        if (event.propertyName === 'width' && !isOpen) {
          setIsRendered(false);
        }
      }}
      ref={panelRef}
      tabIndex={-1}
    >
      <div className="side-panel-body">
        <div className="side-panel-header">
          {shownHeaderContent ?? <h2 className="side-panel-title">{shownTitle}</h2>}
          <button
            aria-label={`Close ${shownAriaLabel}`}
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <IconX size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
          </button>
        </div>
        <div className="side-panel-content">
          {isOpen ? children : isRendered ? lastChildren : null}
        </div>
      </div>
    </aside>
  );
};
