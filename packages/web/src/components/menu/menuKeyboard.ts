import type { KeyboardEvent } from 'react';

/**
 * Arrow-key roving across a menu's `[role="menuitem"]` children.
 *
 * Call from the menu container's `onKeyDown`; typing targets (input, textarea)
 * keep their own caret keys, and the return value reports whether the event
 * was handled.
 */
export const handleMenuArrowKeys = (event: KeyboardEvent<HTMLElement>): boolean => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return false;
  }
  if (
    event.key !== 'ArrowDown' &&
    event.key !== 'ArrowUp' &&
    event.key !== 'Home' &&
    event.key !== 'End'
  ) {
    return false;
  }
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  if (items.length === 0) {
    return false;
  }
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLElement);
  if (event.key === 'Home') {
    items[0].focus();
    return true;
  }
  if (event.key === 'End') {
    items[items.length - 1].focus();
    return true;
  }
  const start = current === -1 ? (event.key === 'ArrowUp' ? 0 : -1) : current;
  const next =
    event.key === 'ArrowDown' ? (start + 1) % items.length : (start - 1 + items.length) % items.length;
  items[next].focus();
  return true;
};
