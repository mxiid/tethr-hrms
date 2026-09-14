import type { ReactNode } from 'react';

type FieldGroupProps = {
  readonly title: string;
  readonly children: ReactNode;
};

/** A titled section in a record panel, so the fields read as General /
 * Employment / Dates rather than one flat list. */
export const FieldGroup = ({ title, children }: FieldGroupProps) => (
  <section className="record-field-group">
    <h3 className="record-field-group-title">{title}</h3>
    <div className="record-field-list">{children}</div>
  </section>
);
