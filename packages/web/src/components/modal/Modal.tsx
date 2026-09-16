import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState, type ReactNode, type TransitionEvent } from 'react';
import { createPortal } from 'react-dom';

import { useTheme } from '../../providers/theme/useTheme';

type ModalWidth = 'sm' | 'md' | 'lg' | 'xl';

// The dialog survives `isOpen={false}` just long enough to play its exit
// transition; the fallback timer covers reduced motion, where no transition
// fires and `transitionend` never arrives.
type ModalLifecycle = 'closed' | 'open' | 'closing';

type ModalProps = {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly width?: ModalWidth;
};

const CLOSE_FALLBACK_MS = 400;

/**
 * The shared dialog. Renders in a body portal above every surface, closes on
 * Escape, backdrop click, or the close button, locks background scroll, and
 * returns focus to the trigger on close. Body content reuses the app's existing
 * `.config-form` field styling, so forms move in here unchanged.
 */
export const Modal = ({ isOpen, onClose, title, children, footer, width = 'md' }: ModalProps) => {
  const { theme } = useTheme();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [lifecycle, setLifecycle] = useState<ModalLifecycle>(isOpen ? 'open' : 'closed');
  // Read through a ref so the open/close effect doesn't depend on the inline
  // handler identity — otherwise it would re-run (and steal focus back to the
  // dialog) on every keystroke in a form.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setLifecycle('open');
      return;
    }
    setLifecycle((current) => (current === 'open' ? 'closing' : current));
  }, [isOpen]);

  useEffect(() => {
    if (lifecycle !== 'closing') {
      return undefined;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLifecycle('closed');
      return undefined;
    }
    const timer = window.setTimeout(() => setLifecycle('closed'), CLOSE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [lifecycle]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      // A field with `autoFocus` has already taken focus during commit; only
      // fall back to the dialog itself when nothing inside it did.
      if (dialog && !dialog.contains(document.activeElement)) {
        dialog.focus();
      }
    });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusFrame);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  if (lifecycle === 'closed') {
    return null;
  }

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>): void => {
    if (lifecycle === 'closing' && event.target === event.currentTarget) {
      setLifecycle('closed');
    }
  };

  return createPortal(
    <div
      className={`modal-backdrop${lifecycle === 'closing' ? ' is-closing' : ''}`}
      style={{ zIndex: theme.zIndex.lastLayer }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div
        aria-label={title}
        aria-modal="true"
        className={`modal-dialog modal-dialog-${width}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button aria-label="Close" className="icon-button" onClick={onClose} type="button">
            <IconX size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
};
