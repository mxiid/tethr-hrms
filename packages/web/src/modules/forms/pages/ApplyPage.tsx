import { useMutation, useQuery } from '@apollo/client';
import type { FormFieldType } from '@hrms/shared';
import { IconFileText, IconLoader2, IconUpload } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { uploadToSignedUrl } from '../../../app/upload';
import { StatusChip } from '../../../components/chip/StatusChip';
import { useTheme } from '../../../providers/theme/useTheme';
import {
  PREPARE_FORM_UPLOAD_MUTATION,
  PUBLIC_FORM_QUERY,
  SUBMIT_FORM_MUTATION,
} from '../graphql/forms.operations';

type PublicFormField = {
  readonly id: string;
  readonly fieldKey: string;
  readonly label: string;
  readonly type: FormFieldType;
  readonly required: boolean;
  readonly options: readonly string[];
  readonly sortOrder: number;
  readonly helpText: string | null;
};

type PublicFormRecord = {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly PublicFormField[];
};

type UploadedFile = {
  readonly fieldKey: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
};

type SubmitReceipt = {
  readonly id: string;
  readonly submittedAt: string;
};

// The anonymous application page: rendered from a signed form link, with file
// answers going straight to object storage through a signed URL.
export const ApplyPage = () => {
  const { theme } = useTheme();
  const { token = '' } = useParams<{ token: string }>();
  const { data, loading, error } = useQuery<{ readonly formByLink: PublicFormRecord }>(
    PUBLIC_FORM_QUERY,
    { variables: { token }, skip: token.length === 0, fetchPolicy: 'network-only' },
  );
  const [prepareUpload] = useMutation(PREPARE_FORM_UPLOAD_MUTATION);
  const [submitForm, { loading: submitting }] = useMutation(SUBMIT_FORM_MUTATION);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, UploadedFile>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmitReceipt | null>(null);

  const form = data?.formByLink ?? null;

  const onFileSelected = async (field: PublicFormField, file: File | null): Promise<void> => {
    if (!file) return;
    setUploadingField(field.fieldKey);
    setFormError(null);
    try {
      const contentType = file.type || 'application/octet-stream';
      const prepared = await prepareUpload({
        variables: {
          input: {
            token,
            fieldKey: field.fieldKey,
            fileName: file.name,
            contentType,
            sizeBytes: file.size,
          },
        },
      });
      const access = prepared.data?.prepareFormFileUpload;
      if (!access) throw new Error('Could not prepare the upload');
      await uploadToSignedUrl(access, file);
      setFiles((current) => ({
        ...current,
        [field.fieldKey]: {
          fieldKey: field.fieldKey,
          storageKey: access.storageKey,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
        },
      }));
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not upload the file');
    } finally {
      setUploadingField(null);
    }
  };

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!form) return;
    setFormError(null);
    for (const field of form.fields) {
      if (!field.required) continue;
      if (field.type === 'file' && files[field.fieldKey] === undefined) {
        setFormError(`${field.label} is required`);
        return;
      }
      if (field.type !== 'file' && !(answers[field.fieldKey] ?? '').trim()) {
        setFormError(`${field.label} is required`);
        return;
      }
    }
    try {
      const result = await submitForm({
        variables: {
          input: {
            token,
            answers: Object.entries(answers)
              .filter(([, value]) => value.trim() !== '')
              .map(([fieldKey, value]) => ({ fieldKey, value })),
            files: Object.values(files).map((file) => ({ ...file })),
          },
        },
      });
      setReceipt(result.data?.submitForm ?? null);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not submit the form');
    }
  };

  if (loading) {
    return (
      <main className="public-apply">
        <section className="public-apply-card">
          <p className="page-subtitle">Loading the form…</p>
        </section>
      </main>
    );
  }
  if (error || !form) {
    return (
      <main className="public-apply">
        <section className="public-apply-card">
          <h1 className="auth-title">This link is no longer valid</h1>
          <p className="page-subtitle">
            Ask the person who sent it for a fresh link — they expire for security.
          </p>
        </section>
      </main>
    );
  }
  if (receipt) {
    return (
      <main className="public-apply">
        <section className="public-apply-card">
          <StatusChip color="green" label="Submitted" />
          <h1 className="auth-title">Thank you — we have your application</h1>
          <p className="page-subtitle">
            Reference {receipt.id.slice(0, 8)}. We will be in touch if there is a fit.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="public-apply">
      <section className="public-apply-card">
        <h1 className="auth-title">{form.name}</h1>
        <p className="page-subtitle">
          Fields marked <span aria-hidden="true">*</span> are required.
        </p>
        <form className="config-form" onSubmit={onSubmit}>
          {form.fields.map((field) => (
            <div className="field" key={field.id}>
              <label htmlFor={`apply-${field.fieldKey}`}>
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  id={`apply-${field.fieldKey}`}
                  value={answers[field.fieldKey] ?? ''}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, [field.fieldKey]: event.target.value }))
                  }
                />
              ) : field.type === 'select' ? (
                <select
                  id={`apply-${field.fieldKey}`}
                  value={answers[field.fieldKey] ?? ''}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, [field.fieldKey]: event.target.value }))
                  }
                >
                  <option value="">Select…</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === 'file' ? (
                <div>
                  <input
                    accept=".pdf,.doc,.docx,.txt,.rtf"
                    id={`apply-${field.fieldKey}`}
                    type="file"
                    onChange={(event) => void onFileSelected(field, event.target.files?.[0] ?? null)}
                  />
                  {uploadingField === field.fieldKey ? (
                    <span className="employee-secondary">
                      <IconLoader2 size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />{' '}
                      Uploading…
                    </span>
                  ) : files[field.fieldKey] ? (
                    <span className="employee-secondary">
                      <IconFileText size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />{' '}
                      {files[field.fieldKey].fileName}
                    </span>
                  ) : (
                    <span className="employee-secondary">
                      <IconUpload size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} /> PDF or
                      Word, up to 10 MB
                    </span>
                  )}
                </div>
              ) : (
                <input
                  id={`apply-${field.fieldKey}`}
                  type={
                    field.type === 'number'
                      ? 'number'
                      : field.type === 'date'
                        ? 'date'
                        : field.type === 'email'
                          ? 'email'
                          : 'text'
                  }
                  value={answers[field.fieldKey] ?? ''}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, [field.fieldKey]: event.target.value }))
                  }
                />
              )}
              {field.helpText ? <span className="employee-secondary">{field.helpText}</span> : null}
            </div>
          ))}
          {formError ? (
            <p className="auth-error" role="alert">
              {formError}
            </p>
          ) : null}
          <button
            className="button button-primary"
            disabled={submitting || uploadingField !== null}
            type="submit"
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </form>
      </section>
    </main>
  );
};
