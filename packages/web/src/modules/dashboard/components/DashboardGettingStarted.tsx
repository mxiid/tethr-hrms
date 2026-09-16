import {
  IconArrowUpRight,
  IconChevronDown,
  IconCircleCheck,
  IconLock,
  IconX,
} from '@tabler/icons-react';
import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useConfirm } from '../../../components/confirm/ConfirmProvider';
import { useTheme } from '../../../providers/theme/useTheme';
import { useAuth } from '../../auth/hooks/useAuth';

import { useGettingStartedSteps } from './gettingStartedSteps';

// Collapsing is a glance-level choice and stays session-only; dismissal is
// permanent per workspace once the user confirms it.
const collapsedAtom = atom(false);

export const DashboardGettingStarted = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const confirm = useConfirm();
  const { steps, loading, error } = useGettingStartedSteps();
  const [collapsed, setCollapsed] = useAtom(collapsedAtom);
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [askedThisSession, setAskedThisSession] = useState(false);

  const organizationId = user?.organizationId ?? 'none';
  const dismissedAtom = useMemo(
    () =>
      atomWithStorage(`hrms.dashboard.gettingStartedDismissed.${organizationId}`, false, undefined, {
        getOnInit: true,
      }),
    [organizationId],
  );
  const [dismissed, setDismissed] = useAtom(dismissedAtom);

  const done = steps.filter((step) => step.complete).length;
  const total = steps.length;

  // Closing it (or crossing the last step) always hides it now; the dialog only
  // decides whether that hiding is permanent for this workspace.
  const promptDismiss = async (): Promise<void> => {
    setSessionDismissed(true);
    setAskedThisSession(true);
    const keepHidden = await confirm({
      title: "Don't show getting started again?",
      body: 'It stays hidden for this workspace.',
      confirmLabel: "Don't show again",
      cancelLabel: 'Not now',
    });
    if (keepHidden) {
      setDismissed(true);
    }
  };

  // Crossing the whole checklist asks the same question, once per session.
  // promptDismiss is intentionally not a dependency: it is rebuilt per render
  // and the state it sets (askedThisSession) is what stops the loop.
  useEffect(() => {
    if (total > 0 && done === total && !dismissed && !askedThisSession) {
      void promptDismiss();
    }
  }, [total, done, dismissed, askedThisSession]);

  // Nothing to show: still loading the first time, dismissed permanently or for
  // this session, unsupported role, or the whole walkthrough is done.
  if (dismissed || sessionDismissed) return null;
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
            <IconChevronDown aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
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
          onClick={() => void promptDismiss()}
          type="button"
        >
          <IconX aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
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
                  <StepIcon aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
                </span>
                <span className="onboarding-step-copy">
                  <span className="employee-primary">{step.title}</span>
                  <span className="employee-secondary">{step.detail}</span>
                </span>
                <span className="onboarding-step-status">
                  <StatusIcon aria-hidden="true" size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
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
