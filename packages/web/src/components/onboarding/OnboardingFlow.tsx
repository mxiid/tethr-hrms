import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconPencil,
} from '@tabler/icons-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { useTheme } from '../../providers/theme/useTheme';

/**
 * The shared chrome for a multi-step intake: a page takeover with a narrow
 * column of titled cards, a vertical step rail, and a sticky action footer.
 *
 * It lives outside `modules/` because more than one module needs it and modules
 * must not import from each other. It owns presentation only — each caller keeps
 * its own field state, validation, and submit.
 */

export type OnboardingStep = {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
};

/**
 * The step machine. `stepValidity` is indexed by step: a step can only be left
 * once its own entry is true, and the rail only exposes steps already reached.
 */
export const useOnboardingSteps = (stepValidity: readonly boolean[]) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [maxReachedIndex, setMaxReachedIndex] = useState(0);

  const stepValid = stepValidity[stepIndex] ?? false;
  const isLastStep = stepIndex === stepValidity.length - 1;

  const goToStep = (index: number): void => {
    if (index <= maxReachedIndex) setStepIndex(index);
  };

  const goNext = (): void => {
    if (!stepValid) return;
    const next = Math.min(stepIndex + 1, stepValidity.length - 1);
    setStepIndex(next);
    setMaxReachedIndex((current) => Math.max(current, next));
  };

  const goBack = (): void => setStepIndex((current) => Math.max(current - 1, 0));

  return { stepIndex, maxReachedIndex, stepValid, isLastStep, goToStep, goNext, goBack };
};

/** A titled white card holding one coherent group of fields. */
export const OnboardingCard = ({
  title,
  note,
  action,
  children,
}: {
  readonly title: string;
  readonly note?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) => (
  <section className="onboarding-card">
    <div className="onboarding-card-head">
      <div>
        <h3 className="onboarding-card-title">{title}</h3>
        {note ? <p className="onboarding-card-note">{note}</p> : null}
      </div>
      {action}
    </div>
    <div className="onboarding-card-body">{children}</div>
  </section>
);

export const OnboardingReviewRow = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) => (
  <div className="field-row">
    <span className="field-label">{label}</span>
    <span className="field-value">{value}</span>
  </div>
);

/** "Edit" affordance for a review card, jumping back to the step it summarises. */
export const OnboardingEditButton = ({ onClick }: { readonly onClick: () => void }) => {
  const { theme } = useTheme();
  return (
    <button className="onboarding-card-edit" type="button" onClick={onClick}>
      <IconPencil size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
      Edit
    </button>
  );
};

export const RequiredMark = () => <span className="required-mark">*</span>;

type OnboardingFlowProps = {
  readonly title: string;
  readonly subtitle: string;
  readonly backLabel: string;
  readonly steps: readonly OnboardingStep[];
  readonly stepIndex: number;
  readonly maxReachedIndex: number;
  readonly stepValid: boolean;
  readonly isLastStep: boolean;
  readonly submitting: boolean;
  readonly submitLabel: string;
  readonly formError: string | null;
  readonly helpContent: ReactNode;
  readonly children: ReactNode;
  readonly onStepSelect: (index: number) => void;
  readonly onBack: () => void;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent) => void;
};

export const OnboardingFlow = ({
  title,
  subtitle,
  backLabel,
  steps,
  stepIndex,
  maxReachedIndex,
  stepValid,
  isLastStep,
  submitting,
  submitLabel,
  formError,
  helpContent,
  children,
  onStepSelect,
  onBack,
  onCancel,
  onSubmit,
}: OnboardingFlowProps) => {
  const { theme } = useTheme();

  return (
    <form className="onboarding-flow" onSubmit={onSubmit}>
      <header className="onboarding-flow-header">
        <button className="onboarding-flow-back" type="button" onClick={onCancel}>
          <IconArrowLeft size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
          {backLabel}
        </button>
        <h1 className="onboarding-flow-title">{title}</h1>
        <p className="onboarding-flow-subtitle">{subtitle}</p>
      </header>

      <div className="onboarding-flow-body">
        <div className="onboarding-flow-main">
          {formError ? (
            <p className="auth-error" role="alert">
              {formError}
            </p>
          ) : null}
          {children}
        </div>

        <aside className="onboarding-flow-rail" aria-label="Progress">
          <ol className="step-rail">
            {steps.map((step, index) => (
              <li
                className={`step-rail-item${index === stepIndex ? ' is-active' : ''}${
                  index < stepIndex ? ' is-complete' : ''
                }`}
                key={step.key}
              >
                <button
                  className="step-rail-button"
                  disabled={index > maxReachedIndex}
                  type="button"
                  onClick={() => onStepSelect(index)}
                >
                  <span className="step-rail-index">
                    {index < stepIndex ? (
                      <IconCheck size={theme.icon.size.sm} stroke={theme.icon.stroke.md} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="step-rail-copy">
                    <span className="step-rail-label">{step.label}</span>
                    <span className="step-rail-hint">{step.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <details className="onboarding-help">
            <summary className="onboarding-help-summary">
              Help and support
              <IconChevronDown size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
            </summary>
            <div className="onboarding-help-body">{helpContent}</div>
          </details>
        </aside>
      </div>

      <footer className="onboarding-flow-footer">
        <span className="onboarding-flow-progress">
          Step {stepIndex + 1} of {steps.length} · {steps[stepIndex]?.label}
        </span>
        <div className="page-actions">
          {stepIndex > 0 ? (
            <button className="button button-secondary" type="button" onClick={onBack}>
              <IconArrowLeft size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              Back
            </button>
          ) : (
            <button className="button button-secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="button button-primary" disabled={!stepValid || submitting} type="submit">
            {isLastStep ? (
              submitting ? (
                'Saving...'
              ) : (
                submitLabel
              )
            ) : (
              <>
                Continue
                <IconArrowRight size={theme.icon.size.md} stroke={theme.icon.stroke.md} />
              </>
            )}
          </button>
        </div>
      </footer>
    </form>
  );
};
