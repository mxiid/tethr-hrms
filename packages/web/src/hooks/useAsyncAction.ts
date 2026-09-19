import { useCallback, useRef, useState } from 'react';

export type AsyncActionResult = {
  readonly isPending: boolean;
  readonly error: string | null;
  readonly clearError: () => void;
  /**
   * Runs an async action with pending/error bookkeeping. Never rejects — the
   * error is captured into `error` (and reported with the action's fallback
   * message) so `void run(...)` call sites can never produce an unhandled
   * rejection, and a failed action can no longer leave a page silently blank.
   */
  readonly run: (action: () => Promise<void>, fallbackMessage?: string) => Promise<void>;
};

// The shared pending/error contract for fire-and-forget UI actions. Kept
// deliberately tiny: pages render `error` in their own banner and read
// `isPending` to disable the trigger button.
export const useAsyncAction = (): AsyncActionResult => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks the latest run so a slow earlier action cannot clobber a newer one's
  // state (e.g. two rapid clicks on different rows).
  const runIdRef = useRef(0);

  const clearError = useCallback(() => setError(null), []);

  const run = useCallback(async (action: () => Promise<void>, fallbackMessage?: string) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsPending(true);
    try {
      await action();
    } catch (caught) {
      if (runIdRef.current === runId) {
        setError(caught instanceof Error ? caught.message : (fallbackMessage ?? 'Something went wrong'));
      }
    } finally {
      if (runIdRef.current === runId) {
        setIsPending(false);
      }
    }
  }, []);

  return { isPending, error, clearError, run };
};
