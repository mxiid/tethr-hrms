import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';

import { prefersCoarsePointer } from '../form/pointer';

export type RecordFieldType = 'text' | 'email' | 'tel' | 'number' | 'date' | 'select' | 'checkbox';

export type RecordFieldOption = {
  readonly value: string;
  readonly label: string;
};

// `name` is required for autofill/autocomplete to work; derive a stable slug
// from the label when a call site doesn't pass one explicitly.
const nameFromLabel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type FieldRowProps = {
  readonly label: string;
  readonly type: RecordFieldType;
  /** The committed value, as a string (checkboxes use 'true'/'false'). */
  readonly value: string;
  /** Form control name; defaults to a slug of the label. */
  readonly name?: string;
  /** HTML autocomplete hint for identity/contact fields. */
  readonly autoComplete?: string;
  /** Turn off browser spellcheck for emails, codes, and identifiers. */
  readonly spellCheck?: boolean;
  readonly inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal';
  /** Formatted display for read mode; defaults to the raw value. */
  readonly display?: ReactNode;
  readonly options?: readonly RecordFieldOption[];
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly readOnly?: boolean;
  /** Create mode: the control is always shown and every keystroke flows to
   * `onChange`; the draft updates live. Live mode omits this. */
  readonly alwaysEditing?: boolean;
  readonly min?: number;
  readonly onChange?: (value: string) => void;
  /** Live mode: fired on Enter/blur (or immediately for selects/checkboxes)
   * when the value actually changed. Escape discards. */
  readonly onCommit?: (value: string) => void;
};

/**
 * One label/value row in a record panel. In live mode the value is a display
 * that turns into its typed control on click — Enter or blur commits, Escape
 * discards, and an unchanged field commits nothing. In create mode the control
 * is always visible and writes straight into the local draft.
 */
export const FieldRow = ({
  label,
  type,
  value,
  name,
  autoComplete,
  spellCheck,
  inputMode,
  display,
  options,
  placeholder,
  required,
  readOnly,
  alwaysEditing = false,
  min,
  onChange,
  onCommit,
}: FieldRowProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const fieldName = name ?? nameFromLabel(label);
  const fieldId = useId();

  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing, value]);

  const beginEdit = (): void => {
    if (readOnly) return;
    if (type === 'checkbox') {
      onCommit?.(value === 'true' ? 'false' : 'true');
      return;
    }
    setDraft(value);
    setEditing(true);
  };

  const commit = (): void => {
    setEditing(false);
    if (draft !== value) onCommit?.(draft);
  };

  const cancel = (): void => {
    setEditing(false);
    setDraft(value);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (!alwaysEditing) {
        // Live mode: discard the field edit, not the whole record panel — the
        // panel's Escape handler listens on document, so stop it here first.
        event.stopPropagation();
        cancel();
      }
      // Create mode deliberately lets Escape bubble: it discards the draft and
      // closes the panel (nothing has been created yet).
    }
  };

  const handleChange = (next: string): void => {
    if (alwaysEditing) {
      onChange?.(next);
      return;
    }
    if (type === 'select') {
      setEditing(false);
      if (next !== value) onCommit?.(next);
      return;
    }
    setDraft(next);
  };

  const editorValue = alwaysEditing ? value : draft;
  const showEditor = alwaysEditing || editing;
  const displayValue =
    display ??
    (type === 'checkbox' ? (value === 'true' ? 'Yes' : 'No') : value === '' ? '—' : value);

  const renderEditor = (): ReactNode => {
    if (type === 'checkbox') {
      return (
        <input
          checked={editorValue === 'true'}
          className="record-field-checkbox"
          disabled={readOnly}
          id={fieldId}
          name={fieldName}
          onChange={(event) => handleChange(event.target.checked ? 'true' : 'false')}
          type="checkbox"
        />
      );
    }
    if (type === 'select') {
      return (
        <select
          aria-label={required ? `${label} (required)` : label}
          autoFocus={!alwaysEditing && !prefersCoarsePointer()}
          className="record-field-control"
          disabled={readOnly}
          name={fieldName}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={onKeyDown}
          value={editorValue}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {(options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        aria-label={required ? `${label} (required)` : label}
        autoComplete={autoComplete}
        autoFocus={!alwaysEditing && !prefersCoarsePointer()}
        className="record-field-control"
        disabled={readOnly}
        inputMode={inputMode}
        min={min}
        name={fieldName}
        onBlur={() => {
          if (!alwaysEditing) commit();
        }}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={spellCheck}
        type={type}
        value={editorValue}
      />
    );
  };

  const labelContent = (
    <>
      {label}
      {required ? (
        <span aria-hidden="true" className="record-field-required">
          *
        </span>
      ) : null}
    </>
  );
  // A rendered checkbox shares its label with the control (one hit target, no
  // dead zone); every other control is named directly, so the label stays a
  // plain span there.
  const labelIsForControl = type === 'checkbox' && showEditor;

  return (
    <div className="record-field">
      {labelIsForControl ? (
        <label className="record-field-label" htmlFor={fieldId}>
          {labelContent}
        </label>
      ) : (
        <span className="record-field-label">{labelContent}</span>
      )}
      <span className="record-field-value">
        {showEditor ? (
          renderEditor()
        ) : readOnly ? (
          <span className="record-field-static">{displayValue}</span>
        ) : (
          <button
            className={`record-field-display${value === '' ? ' is-empty' : ''}`}
            onClick={beginEdit}
            title={`Edit ${label}`}
            type="button"
          >
            {displayValue}
          </button>
        )}
      </span>
    </div>
  );
};
