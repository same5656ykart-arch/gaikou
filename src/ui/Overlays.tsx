import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useUi } from '../store';
import { Icon } from './Icon';

/** 確認ダイアログとトースト。App の最上位に 1 つだけ置く */
export function Overlays() {
  const ui = useUi();
  const okRef = useRef<HTMLButtonElement>(null);
  const c = ui.confirm;

  useEffect(() => {
    if (!c) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') c.resolve(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [c]);

  return (
    <>
      {c && (
        <div className="modal-backdrop" onClick={() => c.resolve(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-title" className="modal-title">
              {c.title}
            </h2>
            {c.body && <p className="modal-body">{c.body}</p>}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => c.resolve(false)}>
                {c.cancelLabel ?? 'やめる'}
              </button>
              <button ref={okRef} type="button" className={'btn ' + (c.danger ? 'btn-danger' : 'btn-primary')} onClick={() => c.resolve(true)}>
                {c.okLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="toasts" aria-live="polite">
        {ui.toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

/** 下からせり上がるシート（スマホ）／中央のダイアログ（PC） */
export function Sheet({ title, onClose, children, wide }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className={'sheet' + (wide ? ' sheet-wide' : '')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="閉じる">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
