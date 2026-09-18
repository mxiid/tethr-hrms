/**
 * True when the primary pointer is coarse (touch). `autoFocus` should be
 * skipped in that case so opening a panel never forces the soft keyboard up.
 */
export const prefersCoarsePointer = (): boolean => window.matchMedia('(pointer: coarse)').matches;
