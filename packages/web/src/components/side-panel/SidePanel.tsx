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
  // moment it closes, so latch the last content rather than letting it vanish
  // before the width reaches zero. The latest children are tracked in a ref on
  // every open render (no re-render), and only copied into state on the
  // open→closed edge — that way typing in a panel form costs no extra pass.
  const [lastChildren, setLastChildren] = useState<ReactNode>(children);
  const [isRendered, setIsRendered] = useState(isOpen);
  const latestChildren = useRef(children);

  useEffect(() => {
    if (isOpen) {
      latestChildren.current = children;
    }
  }, [isOpen, children]);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      return;
    }
    if (isRendered) {
      setLastChildren(latestChildren.current);
    }
  }, [isOpen, isRendered]);

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
      aria-label={title}
      className={`side-panel${isOpen ? ' is-open' : ''}`}
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
          {headerContent ?? <h2 className="side-panel-title">{title}</h2>}
          <button
            aria-label={`Close ${title}`}
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
