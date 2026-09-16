import { useEffect, useState } from 'react';

import { Modal } from '../modal/Modal';

import type { ConfirmOptions } from './ConfirmProvider';

type ConfirmDialogProps = {
  readonly request: ConfirmOptions | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
};

/**
 * The single confirm surface: a small modal whose copy comes from the pending
 * request. The last request is latched so the title and body survive the exit
 * transition once `request` clears.
 */
export const ConfirmDialog = ({ request, onCancel, onConfirm }: ConfirmDialogProps) => {
  const [shown, setShown] = useState<ConfirmOptions | null>(request);

  useEffect(() => {
    if (request !== null) {
      setShown(request);
    }
  }, [request]);

  return (
    <Modal
      footer={
        <>
          <button className="button button-secondary" onClick={onCancel} type="button">
            {shown?.cancelLabel ?? 'Cancel'}
          </button>
          <button
            className={`button ${shown?.tone === 'danger' ? 'button-danger' : 'button-primary'}`}
            onClick={onConfirm}
            type="button"
          >
            {shown?.confirmLabel ?? 'Confirm'}
          </button>
        </>
      }
      isOpen={request !== null}
      onClose={onCancel}
      title={shown?.title ?? ''}
      width="sm"
    >
      {shown?.body ? <p className="confirm-body">{shown.body}</p> : null}
    </Modal>
  );
};
