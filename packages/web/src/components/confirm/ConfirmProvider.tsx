import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { ConfirmDialog } from './ConfirmDialog';

export type ConfirmTone = 'default' | 'danger';

export type ConfirmOptions = {
  readonly title: string;
  /** One sentence on what will happen; keep it factual. */
  readonly body?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly tone?: ConfirmTone;
};

type ConfirmContextValue = {
  readonly confirm: (options: ConfirmOptions, signal?: AbortSignal) => Promise<boolean>;
};

type PendingConfirm = {
  readonly resolve: (value: boolean) => void;
  readonly signal?: AbortSignal;
  readonly onAbort: () => void;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * Resolves true when the user accepts, false on cancel, Escape, backdrop
 * click, supersession, or the caller unmounting. Destructive handlers can
 * await it inline:
 *
 *   const confirmed = await confirm({ title: 'Void this draft?', tone: 'danger' });
 *   if (!confirmed) return;
 *
 * The hook owns the caller's lifecycle: a pending confirmation settles false
 * when the component that asked for it unmounts, so a dialog retained across
 * a route change can never resume an old handler on the new route.
 */
export const useConfirm = (): ConfirmContextValue['confirm'] => {
  const value = useContext(ConfirmContext);
  if (value === null) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    // A fresh controller per mount keeps StrictMode's mount→cleanup→mount safe.
    const controller = new AbortController();
    controllerRef.current = controller;
    return () => controller.abort();
  }, []);
  return useCallback(
    (options: ConfirmOptions) => value.confirm(options, controllerRef.current?.signal),
    [value],
  );
};

/**
 * One confirmation dialog for the whole app, mounted above the router. Only a
 * single dialog can be pending; starting another settles the first as
 * cancelled, an aborted caller signal settles its request false, and
 * unmounting the provider resolves anything still pending so a handler can
 * never hang.
 */
export const ConfirmProvider = ({ children }: { readonly children: ReactNode }) => {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const settle = useCallback((value: boolean): void => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      pending.signal?.removeEventListener('abort', pending.onAbort);
      pending.resolve(value);
    }
    setRequest(null);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions, signal?: AbortSignal): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        // A second confirmation supersedes the first as cancelled.
        if (pendingRef.current !== null) {
          const pending = pendingRef.current;
          pendingRef.current = null;
          pending.signal?.removeEventListener('abort', pending.onAbort);
          pending.resolve(false);
        }
        if (signal?.aborted) {
          resolve(false);
          return;
        }
        const onAbort = (): void => settle(false);
        pendingRef.current = { resolve, signal, onAbort };
        signal?.addEventListener('abort', onAbort);
        setRequest({ ...options });
      }),
    [settle],
  );

  useEffect(
    () => () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) {
        pending.signal?.removeEventListener('abort', pending.onAbort);
        pending.resolve(false);
      }
    },
    [],
  );

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        onCancel={() => settle(false)}
        onConfirm={() => settle(true)}
        request={request}
      />
    </ConfirmContext.Provider>
  );
};
