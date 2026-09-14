import { IconClock, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';

import { useTheme } from '../../../providers/theme/useTheme';
import { useSelfClock } from '../hooks/useSelfClock';

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' }).format(
    new Date(`${value}T00:00:00`),
  );

const formatWeekday = (value: string): string =>
  new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date(`${value}T00:00:00`));

/**
 * The employee attendance screen: today's total, the running week, the two clock
 * actions, and the days already recorded. Everything resolves the employee from
 * the session server-side, so this card never sends an employee id.
 */
export const ClockInOutCard = () => {
  const { theme } = useTheme();
  const clock = useSelfClock(30);

  return (
    <>
      {/* No card heading: the page header above already says what this is, and a
          second title inside the card only repeats it. */}
      <section className="table-shell clock-card">
        {clock.notice ? <p className="form-success">{clock.notice}</p> : null}
        {clock.error ? (
          <p className="auth-error" role="alert">
            {clock.error}
          </p>
        ) : null}

        <div className="field-list">
          <div className="field-row">
            <span className="field-label">Today</span>
            <span className="field-value">
              {clock.todayEntry
                ? `${clock.todayEntry.hours.toFixed(2)} hours recorded`
                : 'Nothing yet'}
            </span>
          </div>
          <div className="field-row">
            <span className="field-label">Last 7 days</span>
            <span className="field-value">{clock.weekHours.toFixed(2)} hours</span>
          </div>
        </div>

        <div className="page-actions clock-actions">
          <button
            className="button button-primary"
            disabled={clock.clockingIn}
            type="button"
            onClick={() => void clock.clockIn()}
          >
            <IconPlayerPlay size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {clock.clockingIn ? 'Checking in...' : 'Check in'}
          </button>
          <button
            className="button button-secondary"
            disabled={clock.clockingOut}
            type="button"
            onClick={() => void clock.clockOut()}
          >
            <IconPlayerStop size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            {clock.clockingOut ? 'Checking out...' : 'Check out'}
          </button>
        </div>
      </section>

      <section className="table-shell">
        <div className="table-title-row">
          <div className="table-title">
            <IconClock size={theme.icon.size.md} /> Recorded days
          </div>
          <div className="table-density">Last 30 days</div>
        </div>
        <div className="stack-list">
          {clock.entries.map((entry) => (
            <div className="stack-row" key={entry.id}>
              <div className="stack-row-copy">
                <div className="employee-primary">{formatWeekday(entry.date)}</div>
                <div className="employee-secondary">
                  {formatDate(entry.date)} · {entry.source === 'clock' ? 'Clocked' : 'Recorded'}
                </div>
              </div>
              <div className="stack-row-figure">{entry.hours.toFixed(2)} h</div>
            </div>
          ))}
          {clock.entries.length === 0 ? (
            <div className="table-empty">No hours recorded in the last 30 days.</div>
          ) : null}
        </div>
      </section>
    </>
  );
};
