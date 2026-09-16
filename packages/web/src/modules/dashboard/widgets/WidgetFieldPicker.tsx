import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical, IconSettings } from '@tabler/icons-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { useTheme } from '../../../providers/theme/useTheme';

import type { WidgetFieldDefinition } from './types';

type WidgetFieldPickerProps = {
  readonly title: string;
  readonly fields: readonly WidgetFieldDefinition[];
  readonly selectedFieldIds: readonly string[];
  /** How many of the selected metrics the current tile size renders. */
  readonly visibleCount: number;
  readonly sizeLabel: string;
  readonly onToggleField: (fieldId: string, enabled: boolean) => void;
  readonly onReorderFields: (fieldIds: readonly string[]) => void;
  /** Present when a larger allowed size would render everything selected. */
  readonly onEnlarge?: () => void;
};

type FieldRowProps = {
  readonly field: WidgetFieldDefinition;
  readonly onToggleField: (fieldId: string, enabled: boolean) => void;
};

type SortableFieldRowProps = FieldRowProps & {
  /** Selected but beyond the current size's capacity. */
  readonly hidden: boolean;
};

const SortableFieldRow = ({ field, hidden, onToggleField }: SortableFieldRowProps) => {
  const { theme } = useTheme();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      className={`field-picker-row${hidden ? ' is-hidden' : ''}${isDragging ? ' is-dragging' : ''}`}
      ref={setNodeRef}
      style={style}
    >
      <button
        aria-label={`Reorder ${field.label}`}
        className="icon-button field-picker-grip"
        type="button"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical aria-hidden="true" size={theme.icon.size.sm} stroke={theme.icon.stroke.sm} />
      </button>
      <label className="checkbox-field">
        <input
          checked
          name={`field-${field.id}`}
          onChange={(event) => onToggleField(field.id, event.target.checked)}
          type="checkbox"
        />
        {field.label}
      </label>
    </div>
  );
};

const PlainFieldRow = ({ field, onToggleField }: FieldRowProps) => (
  <div className="field-picker-row">
    <span aria-hidden="true" className="field-picker-grip-spacer" />
    <label className="checkbox-field">
      <input
        checked={false}
        name={`field-${field.id}`}
        onChange={(event) => onToggleField(field.id, event.target.checked)}
        type="checkbox"
      />
      {field.label}
    </label>
  </div>
);

/**
 * The metrics picker: one ordered list shared by every size. Drag the grips to
 * set display order (the first N render at the current size), metrics beyond
 * the size's capacity read muted, and when the selection outgrows the size a
 * single "Enlarge to add" action switches to the size that shows them all —
 * every control here affects what the widget actually renders.
 */
export const WidgetFieldPicker = ({
  title,
  fields,
  selectedFieldIds,
  visibleCount,
  sizeLabel,
  onToggleField,
  onReorderFields,
  onEnlarge,
}: WidgetFieldPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const onClickOutside = (event: MouseEvent): void => {
      if (anchorRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const selectedFields = selectedFieldIds
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is WidgetFieldDefinition => field !== undefined);
  const unselectedFields = fields.filter((field) => !selectedFieldIds.includes(field.id));
  const showing = Math.min(visibleCount, selectedFields.length);
  const canEnlarge = selectedFields.length > visibleCount && onEnlarge !== undefined;

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = selectedFieldIds.indexOf(String(active.id));
    const newIndex = selectedFieldIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderFields(arrayMove([...selectedFieldIds], oldIndex, newIndex));
  };

  return (
    <div className="dropdown-anchor" ref={anchorRef}>
      <button
        aria-label={`Choose metrics for ${title}`}
        className="icon-button"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <IconSettings aria-hidden="true" size={16} stroke={2} />
      </button>
      {isOpen ? (
        <div
          aria-label={`Metrics for ${title}`}
          className="dropdown-panel dropdown-panel-widget-fields"
          role="group"
        >
          <div className="account-dropdown-label">Metrics</div>
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd} sensors={sensors}>
            <SortableContext items={[...selectedFieldIds]} strategy={verticalListSortingStrategy}>
              {selectedFields.map((field, index) => (
                <SortableFieldRow
                  field={field}
                  hidden={index >= visibleCount}
                  key={field.id}
                  onToggleField={onToggleField}
                />
              ))}
            </SortableContext>
          </DndContext>
          {unselectedFields.map((field) => (
            <PlainFieldRow field={field} key={field.id} onToggleField={onToggleField} />
          ))}
          <div className="field-picker-footer">
            <span className="field-picker-count">
              {selectedFields.length === 0
                ? `Nothing selected · ${sizeLabel}`
                : `Showing ${showing} of ${selectedFields.length} · ${sizeLabel}`}
            </span>
            {canEnlarge ? (
              <button className="link-button field-picker-enlarge" onClick={onEnlarge} type="button">
                Enlarge to add
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
