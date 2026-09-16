/**
 * Focuses the first control matching one of `names` inside `container`.
 *
 * Submit-time validation keeps its form enabled and focuses the offending
 * control instead of disabling the button, so every caller needs this lookup:
 * the names are the ordered field identifiers the form just found missing.
 */
export const focusFirstByName = (container: HTMLElement | null, names: readonly string[]): void => {
  if (container === null) return;
  for (const name of names) {
    const control = container.querySelector<HTMLElement>(`[name="${name}"]`);
    if (control) {
      control.focus();
      return;
    }
  }
};
