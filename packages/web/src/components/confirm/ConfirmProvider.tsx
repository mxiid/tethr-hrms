import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { ConfirmDialog, type ConfirmRequest } from './ConfirmDialog';

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
  readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * Resolves true when the user accepts, false on cancel, Escape, or backdrop
 * click — destructive handlers can await it inline:
 *
 *   const confirmed = await confirm({ title: 'Void this draft?', tone: 'danger' });
 *   if (!confirmed) return;
 */
export const useConfirm = (): ConfirmContextValue['confirm'] => {
  const value = useContext(ConfirmContext);
  if (value === null) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  return value.confirm;
};

/**
 * One confirmation dialog for the whole app, mounted above the router. Only a
 * single dialog can be pending; starting another settles the first as
 * cancelled, and unmounting the provider resolves any pending request false so
 * a handler can never hang.
 */
export const ConfirmProvider = ({ children }: { readonly children: ReactNode }) => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const idRef = useRef(0);

  const settle = useCallback((value: boolean): void => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        idRef.current += 1;
        setRequest({ ...options, id: idRef.current });
      }),
    [],
  );

  useEffect(
    () => () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
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
