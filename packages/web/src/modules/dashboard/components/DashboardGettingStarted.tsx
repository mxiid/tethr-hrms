import {
  IconArrowUpRight,
  IconChevronDown,
  IconCircleCheck,
  IconLock,
  IconX,
} from '@tabler/icons-react';
import { atom, useAtom } from 'jotai';
import { Link } from 'react-router-dom';

import { useTheme } from '../../../providers/theme/useTheme';

import { useGettingStartedSteps } from './gettingStartedSteps';

// Session-only: the panel is a persistent onboarding nudge that clears itself
// once every step is done, so dismiss/collapse reset on refresh by design.
const dismissedAtom = atom(false);
const collapsedAtom = atom(false);

export const DashboardGettingStarted = () => {
  const { theme } = useTheme();
  const { steps, loading, error } = useGettingStartedSteps();
  const [dismissed, setDismissed] = useAtom(dismissedAtom);
  const [collapsed, setCollapsed] = useAtom(collapsedAtom);

  const done = steps.filter((step) => step.complete).length;
  const total = steps.length;

  // Nothing to show: still loading the first time, dismissed, unsupported role,
  // or the user has finished the whole walkthrough.
  if (dismissed) return null;
  if (loading && total === 0) return null;
  if (error) return null;
  if (total === 0 || done === total) return null;

  const percent = Math.round((done / total) * 100);
  const open = !collapsed;

  return (
    <section className={`dashboard-getting-started${open ? ' is-open' : ''}`}>
      <div className="dashboard-getting-started-header">
        <button
          aria-expanded={open}
          className="dashboard-getting-started-toggle"
          onClick={() => setCollapsed((value) => !value)}
          type="button"
        >
          <span className="dashboard-getting-started-chevron">
            <IconChevronDown size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          </span>
          <span className="dashboard-getting-started-title">Getting started</span>
          <span className="dashboard-getting-started-count">{done} of {total} done</span>
          <span aria-hidden="true" className="dashboard-getting-started-bar">
            <span style={{ width: `${percent}%` }} />
          </span>
        </button>
        <button
          aria-label="Dismiss getting started"
          className="icon-button"
          onClick={() => setDismissed(true)}
          type="button"
        >
          <IconX size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
        </button>
      </div>

      {open ? (
        <div className="onboarding-step-list">
          {steps.map((step) => {
            const StepIcon = step.icon;
            const StatusIcon = step.locked
              ? IconLock
              : step.complete
                ? IconCircleCheck
                : IconArrowUpRight;
            const body = (
              <>
                <span className="onboarding-step-icon">
                  <StepIcon size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                </span>
                <span className="onboarding-step-copy">
                  <span className="employee-primary">{step.title}</span>
                  <span className="employee-secondary">{step.detail}</span>
                </span>
                <span className="onboarding-step-status">
                  <StatusIcon size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                </span>
              </>
            );
            return step.locked ? (
              <div className="onboarding-step is-disabled" key={step.id}>
                {body}
              </div>
            ) : (
              <Link className="onboarding-step" key={step.id} to={step.to}>
                {body}
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
};
