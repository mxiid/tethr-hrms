import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import {
  CLOCK_IN_ME_MUTATION,
  CLOCK_OUT_ME_MUTATION,
  MY_TIME_ENTRIES_QUERY,
} from '../graphql/attendance.operations';

type MyTimeEntry = {
  readonly id: string;
  readonly date: string;
  readonly hours: number;
  readonly source: string;
};

type MyTimeEntriesData = { readonly myTimeEntries: readonly MyTimeEntry[] };

type SelfClock = {
  /** Most recent day first. */
  readonly entries: readonly MyTimeEntry[];
  readonly todayEntry: MyTimeEntry | null;
  readonly latestEntry: MyTimeEntry | null;
  readonly weekHours: number;
  readonly notice: string | null;
  readonly error: string | null;
  readonly clockingIn: boolean;
  readonly clockingOut: boolean;
  readonly clockIn: () => Promise<void>;
  readonly clockOut: () => Promise<void>;
};

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const today = (): string => isoDate(new Date());
const daysAgo = (days: number): string => isoDate(new Date(Date.now() - days * 86_400_000));

/**
 * Self-service clocking. Both mutations resolve the employee from the session on
 * the server, so nothing here ever sends an employee id — there is no way to
 * point it at a colleague. Shared so the home screen's check-in card and the
 * attendance page read the same numbers from one query.
 */
export const useSelfClock = (historyDays = 7): SelfClock => {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, refetch } = useQuery<MyTimeEntriesData>(MY_TIME_ENTRIES_QUERY, {
    variables: { from: daysAgo(historyDays), to: today() },
  });
  const [clockInMe, { loading: clockingIn }] = useMutation(CLOCK_IN_ME_MUTATION);
  const [clockOutMe, { loading: clockingOut }] = useMutation(CLOCK_OUT_ME_MUTATION);

  const entries = [...(data?.myTimeEntries ?? [])].sort((left, right) =>
    right.date.localeCompare(left.date),
  );
  const todayEntry = entries.find((entry) => entry.date === today()) ?? null;
  // Always the last seven days, whatever range was fetched, so the figure means
  // the same thing wherever it is shown.
  const weekStart = daysAgo(7);
  const weekHours = entries
    .filter((entry) => entry.date >= weekStart)
    .reduce((sum, entry) => sum + entry.hours, 0);

  const run = async (action: () => Promise<unknown>, message: string): Promise<void> => {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      await refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not go through');
    }
  };

  return {
    entries,
    todayEntry,
    latestEntry: entries[0] ?? null,
    weekHours,
    notice,
    error,
    clockingIn,
    clockingOut,
    clockIn: () => run(() => clockInMe(), 'Checked in'),
    clockOut: () => run(() => clockOutMe(), 'Checked out'),
  };
};
