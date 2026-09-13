import { useCallback, useState } from 'react';

type UseInlineCreateOptions<TDraft extends object, TRecord> = {
  readonly createEmptyDraft: () => TDraft;
  /** The Create action stays disabled until this says the draft is valid. */
  readonly isComplete: (draft: TDraft) => boolean;
  /** Fires the real create mutation once, then returns the created record. */
  readonly createRecord: (draft: TDraft) => Promise<TRecord | null>;
  readonly onCreated?: (record: TRecord) => void | Promise<void>;
};

export type InlineCreate<TDraft, TRecord> = {
  readonly draft: TDraft | null;
  readonly createdRecord: TRecord | null;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly canCreate: boolean;
  readonly start: (patch?: Partial<TDraft>) => void;
  readonly patchDraft: (patch: Partial<TDraft>) => void;
  readonly setError: (message: string | null) => void;
  readonly commit: () => Promise<TRecord | null>;
  readonly discard: () => void;
  readonly clearCreated: () => void;
};

/**
 * Collect-then-create: the draft row and the panel collect a local draft, and
 * nothing reaches the server until `commit()`. That is the path Twenty ships
 * behind its record-creation-form flag, and the only safe one here — a
 * half-typed employee would otherwise land in headcount, payroll readiness and
 * the org chart permanently.
 */
export const useInlineCreate = <TDraft extends object, TRecord>({
  createEmptyDraft,
  isComplete,
  createRecord,
  onCreated,
}: UseInlineCreateOptions<TDraft, TRecord>): InlineCreate<TDraft, TRecord> => {
  const [draft, setDraft] = useState<TDraft | null>(null);
  const [createdRecord, setCreatedRecord] = useState<TRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    (patch?: Partial<TDraft>): void => {
      setError(null);
      setCreatedRecord(null);
      setDraft({ ...createEmptyDraft(), ...patch });
    },
    [createEmptyDraft],
  );

  const patchDraft = useCallback((patch: Partial<TDraft>): void => {
    setDraft((current) => (current === null ? current : { ...current, ...patch }));
  }, []);

  const discard = useCallback((): void => {
    setDraft(null);
    setError(null);
  }, []);

  const clearCreated = useCallback((): void => setCreatedRecord(null), []);

  const commit = useCallback(async (): Promise<TRecord | null> => {
    if (draft === null || !isComplete(draft)) return null;
    setIsSaving(true);
    setError(null);
    try {
      const record = await createRecord(draft);
      if (record !== null) {
        setDraft(null);
        setCreatedRecord(record);
        await onCreated?.(record);
      }
      return record;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the record');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [createRecord, draft, isComplete, onCreated]);

  return {
    draft,
    createdRecord,
    isSaving,
    error,
    canCreate: draft !== null && isComplete(draft),
    start,
    patchDraft,
    setError,
    commit,
    discard,
    clearCreated,
  };
};
