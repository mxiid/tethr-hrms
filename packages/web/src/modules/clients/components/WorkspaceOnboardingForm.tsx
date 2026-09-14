import { useState, type FormEvent } from 'react';

import {
  OnboardingCard,
  OnboardingEditButton,
  OnboardingFlow,
  OnboardingReviewRow,
  RequiredMark,
  useOnboardingSteps,
  type OnboardingStep,
} from '../../../components/onboarding/OnboardingFlow';

export const NEW_CLIENT_OPTION = 'new';

export type WorkspaceOnboardingFormValues = {
  readonly clientId: string;
  readonly legalName: string;
  readonly displayName: string;
  readonly defaultLocale: string;
  readonly defaultCurrency: string;
  readonly adminEmail: string;
  readonly adminPassword: string;
  readonly hrAdminEmail: string;
  readonly hrAdminPassword: string;
};

type ClientOption = {
  readonly id: string;
  readonly name: string;
};

type WorkspaceOnboardingFormProps = {
  readonly initialValues: WorkspaceOnboardingFormValues;
  readonly clients: readonly ClientOption[];
  readonly submitting: boolean;
  readonly formError: string | null;
  readonly onSubmit: (values: WorkspaceOnboardingFormValues) => void;
  readonly onCancel: () => void;
};

const STEPS: readonly OnboardingStep[] = [
  { key: 'workspace', label: 'Client and workspace', hint: 'Who this is for' },
  { key: 'administrators', label: 'Administrators', hint: 'Who gets access' },
  { key: 'review', label: 'Review and confirm', hint: 'Check before creating' },
];

const MINIMUM_PASSWORD_LENGTH = 8;

export const WorkspaceOnboardingForm = ({
  initialValues,
  clients,
  submitting,
  formError,
  onSubmit,
  onCancel,
}: WorkspaceOnboardingFormProps) => {
  const [form, setForm] = useState<WorkspaceOnboardingFormValues>(initialValues);

  const isNewClient = form.clientId === NEW_CLIENT_OPTION;
  const selectedClient = clients.find((client) => client.id === form.clientId) ?? null;

  const workspaceValid =
    form.legalName.trim() !== '' &&
    form.defaultLocale.trim() !== '' &&
    form.defaultCurrency.trim().length === 3;
  const administratorsValid =
    form.adminEmail.trim() !== '' &&
    form.adminPassword.length >= MINIMUM_PASSWORD_LENGTH &&
    form.hrAdminEmail.trim() !== '' &&
    form.hrAdminPassword.length >= MINIMUM_PASSWORD_LENGTH;

  const { stepIndex, maxReachedIndex, stepValid, isLastStep, goToStep, goNext, goBack } =
    useOnboardingSteps([workspaceValid, administratorsValid, true]);

  const setField = (key: keyof WorkspaceOnboardingFormValues, value: string): void =>
    setForm((current) => ({ ...current, [key]: value }));

  const onFormSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (!isLastStep) {
      goNext();
      return;
    }
    onSubmit(form);
  };

  return (
    <OnboardingFlow
      backLabel="Client portfolio"
      formError={formError}
      isLastStep={isLastStep}
      maxReachedIndex={maxReachedIndex}
      stepIndex={stepIndex}
      stepValid={stepValid}
      steps={STEPS}
      submitLabel="Onboard workspace"
      submitting={submitting}
      subtitle="Set up a workspace for a client and provision the two administrators who run it."
      title="New workspace"
      helpContent={
        <>
          <p>
            A client can hold more than one workspace — one per legal entity. Pick an existing
            client to add a second entity, or create a new client for a new engagement.
          </p>
          <p>
            Both administrators are created immediately and can sign in straight away. Share the
            initial passwords through a secure channel, never over email.
          </p>
        </>
      }
      onBack={goBack}
      onCancel={onCancel}
      onStepSelect={goToStep}
      onSubmit={onFormSubmit}
    >
      {stepIndex === 0 ? (
        <>
          <OnboardingCard note="The client this workspace belongs to." title="Client">
            <div className="field">
              <label htmlFor="client-select">Client</label>
              <select
                id="client-select"
                value={form.clientId}
                onChange={(event) => setField('clientId', event.target.value)}
              >
                <option value={NEW_CLIENT_OPTION}>+ New client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <p className="field-hint">
                {isNewClient
                  ? 'A new client will be created, taking its name from the workspace legal name below.'
                  : `This workspace will be added under ${selectedClient?.name ?? 'the selected client'}.`}
              </p>
            </div>
          </OnboardingCard>

          <OnboardingCard
            note="The legal entity this workspace represents."
            title="Workspace details"
          >
            <div className="field">
              <label htmlFor="client-legal-name">
                Workspace legal name <RequiredMark />
              </label>
              <input
                id="client-legal-name"
                required
                value={form.legalName}
                onChange={(event) => setField('legalName', event.target.value)}
              />
              <p className="field-hint">
                The registered entity name. Used on contracts, payslips, and other legal documents.
              </p>
            </div>
            <div className="field">
              <label htmlFor="client-display-name">Workspace display name</label>
              <input
                id="client-display-name"
                value={form.displayName}
                onChange={(event) => setField('displayName', event.target.value)}
              />
              <p className="field-hint">
                What people see in the app. Leave empty to reuse the legal name.
              </p>
            </div>
          </OnboardingCard>

          <OnboardingCard
            note="Applied to new records in this workspace. Both can be changed later."
            title="Regional defaults"
          >
            <div className="onboarding-field-pair">
              <div className="field">
                <label htmlFor="client-locale">
                  Locale <RequiredMark />
                </label>
                <input
                  id="client-locale"
                  required
                  value={form.defaultLocale}
                  onChange={(event) => setField('defaultLocale', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="client-currency">
                  Currency <RequiredMark />
                </label>
                <input
                  id="client-currency"
                  maxLength={3}
                  required
                  value={form.defaultCurrency}
                  onChange={(event) =>
                    setField('defaultCurrency', event.target.value.toUpperCase())
                  }
                />
              </div>
            </div>
            <p className="field-hint">
              Currency is a three-letter ISO code, for example USD, GBP, or PKR.
            </p>
          </OnboardingCard>
        </>
      ) : null}

      {stepIndex === 1 ? (
        <>
          <OnboardingCard
            note="Signs in to the client portal. Sees their own workforce and approves requests."
            title="Client administrator"
          >
            <div className="field">
              <label htmlFor="client-admin-email">
                Email <RequiredMark />
              </label>
              <input
                id="client-admin-email"
                required
                type="email"
                value={form.adminEmail}
                onChange={(event) => setField('adminEmail', event.target.value)}
              />
              <p className="field-hint">Someone on the client&apos;s side, not on your team.</p>
            </div>
            <div className="field">
              <label htmlFor="client-admin-password">
                Initial password <RequiredMark />
              </label>
              <input
                id="client-admin-password"
                minLength={MINIMUM_PASSWORD_LENGTH}
                required
                type="password"
                value={form.adminPassword}
                onChange={(event) => setField('adminPassword', event.target.value)}
              />
              <p className="field-hint">
                At least {MINIMUM_PASSWORD_LENGTH} characters. Hand it over securely.
              </p>
            </div>
          </OnboardingCard>

          <OnboardingCard
            note="Your own operator for this workspace. Runs HR operations day to day."
            title="Tethr administrator"
          >
            <div className="field">
              <label htmlFor="client-hr-admin-email">
                Email <RequiredMark />
              </label>
              <input
                id="client-hr-admin-email"
                required
                type="email"
                value={form.hrAdminEmail}
                onChange={(event) => setField('hrAdminEmail', event.target.value)}
              />
              <p className="field-hint">A member of your Tethr team.</p>
            </div>
            <div className="field">
              <label htmlFor="client-hr-admin-password">
                Initial password <RequiredMark />
              </label>
              <input
                id="client-hr-admin-password"
                minLength={MINIMUM_PASSWORD_LENGTH}
                required
                type="password"
                value={form.hrAdminPassword}
                onChange={(event) => setField('hrAdminPassword', event.target.value)}
              />
              <p className="field-hint">At least {MINIMUM_PASSWORD_LENGTH} characters.</p>
            </div>
          </OnboardingCard>
        </>
      ) : null}

      {stepIndex === 2 ? (
        <>
          <OnboardingCard
            action={<OnboardingEditButton onClick={() => goToStep(0)} />}
            title="Client and workspace"
          >
            <div className="field-list onboarding-review">
              <OnboardingReviewRow
                label="Client"
                value={
                  isNewClient
                    ? `New client — ${form.legalName || 'unnamed'}`
                    : (selectedClient?.name ?? 'Not set')
                }
              />
              <OnboardingReviewRow label="Legal name" value={form.legalName || 'Not set'} />
              <OnboardingReviewRow
                label="Display name"
                value={form.displayName || `${form.legalName || 'Not set'} (same as legal name)`}
              />
              <OnboardingReviewRow label="Locale" value={form.defaultLocale || 'Not set'} />
              <OnboardingReviewRow label="Currency" value={form.defaultCurrency || 'Not set'} />
            </div>
          </OnboardingCard>

          <OnboardingCard
            action={<OnboardingEditButton onClick={() => goToStep(1)} />}
            title="Administrators"
          >
            <div className="field-list onboarding-review">
              <OnboardingReviewRow
                label="Client administrator"
                value={form.adminEmail || 'Not set'}
              />
              <OnboardingReviewRow
                label="Tethr administrator"
                value={form.hrAdminEmail || 'Not set'}
              />
            </div>
            <p className="field-hint">
              Passwords are not shown here. Both accounts are created and usable immediately.
            </p>
          </OnboardingCard>
        </>
      ) : null}
    </OnboardingFlow>
  );
};
