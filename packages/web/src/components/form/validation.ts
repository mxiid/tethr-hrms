// Focuses the first control matching one of `names` inside the container.
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
