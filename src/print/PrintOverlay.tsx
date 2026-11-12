import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';

const PAPER_PX = 794; // A4 の幅（210mm）を 96dpi で表したもの

/**
 * 印刷プレビュー。画面では A4 の紙を縮小して見せ、印刷時は紙だけを出す。
 * 「印刷」からブラウザの印刷画面を開き、そこで PDF 保存もできる。
 */
export function PrintOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 24) / PAPER_PX));
    fit();
    window.addEventListener('resize', fit);
    document.body.classList.add('printing');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('printing');
    };
  }, [onClose]);

  // 印刷時にアプリ本体（.app）を丸ごと隠すため、その外（body 直下）に描く
  return createPortal(
    <div className="print-root" role="dialog" aria-modal="true" aria-label={title}>
      <div className="print-bar">
        <button type="button" className="btn-icon on-dark" onClick={onClose} aria-label="閉じる">
          <Icon name="close" />
        </button>
        <span className="print-title">{title}</span>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Icon name="print" size={18} />
          印刷・PDF保存
        </button>
      </div>
      <p className="print-hint">印刷画面の送信先で「PDFに保存」を選ぶと、PDFファイルにできます。</p>
      <div className="print-pages" style={{ ['--paper-scale' as string]: String(scale) }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
