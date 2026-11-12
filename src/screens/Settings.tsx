import { useRef, useState } from 'react';
import type { Company, Project, Settings } from '../types';
import { CATALOG, EXTRA_PRICES, WORKS, priceKey } from '../lib/catalog';
import { todayISO, yen } from '../lib/format';
import { blobToDataUrl, dataUrlToBlob, downloadBlob, loadPhoto, savePhoto } from '../lib/photos';
import { confirmDialog, getState, goBack, normalizeState, replaceAll, toast, updateSettings, useAppState } from '../store';
import { Icon } from '../ui/Icon';
import { NumField, TextField } from '../ui/fields';

interface PriceRow {
  key: string;
  work: string;
  name: string;
  spec: string;
  unit: string;
  base: number;
}

const PRICE_ROWS: PriceRow[] = [
  ...EXTRA_PRICES.map((e) => ({ key: e.key, work: e.work, name: e.name, spec: e.spec, unit: e.unit, base: e.price })),
  ...CATALOG.filter((c) => c.qty !== 'none').flatMap((c) =>
    c.variants.filter((v) => !v.skip).map((v) => ({ key: priceKey(c.key, v.key), work: c.work, name: c.name, spec: v.name, unit: c.unit, base: v.price })),
  ),
];

interface Backup {
  app: 'gaikou';
  version: 1;
  exportedAt: string;
  projects: Project[];
  settings: Settings;
  photos: Record<string, string>;
}

export function SettingsScreen() {
  const settings = useAppState((s) => s.settings);
  const projectCount = useAppState((s) => s.projects.length);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const co = settings.company;
  const setCompany = (k: keyof Company, v: string) => updateSettings((s) => ({ ...s, company: { ...s.company, [k]: v } }));
  const changed = Object.keys(settings.prices).length;

  const setPrice = (key: string, base: number, v: number | undefined) =>
    updateSettings((s) => {
      const prices = { ...s.prices };
      if (v === undefined || v === base) delete prices[key];
      else prices[key] = v;
      return { ...s, prices };
    });

  const exportAll = async () => {
    setBusy(true);
    try {
      const st = getState();
      const photos: Record<string, string> = {};
      for (const p of st.projects) {
        const ids = [...p.survey.photos.map((x) => x.id), ...(p.perspectiveId ? [p.perspectiveId] : [])];
        for (const id of ids) {
          const blob = await loadPhoto(id);
          if (blob) photos[id] = await blobToDataUrl(blob);
        }
      }
      const data: Backup = { app: 'gaikou', version: 1, exportedAt: new Date().toISOString(), projects: st.projects, settings: st.settings, photos };
      downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `外構かんたんプラン_バックアップ_${todayISO()}.json`);
      toast('バックアップを書き出しました');
    } catch {
      toast('バックアップを書き出せませんでした');
    }
    setBusy(false);
  };

  const importAll = async (file: File | undefined) => {
    if (!file) return;
    let data: Backup;
    try {
      data = JSON.parse(await file.text()) as Backup;
      if (data.app !== 'gaikou' || !Array.isArray(data.projects)) throw new Error('not a backup');
    } catch {
      toast('このファイルは読み込めません。書き出したバックアップ（.json）を選んでください。');
      return;
    }
    const ok = await confirmDialog({
      title: 'バックアップを読み込みますか？',
      body: `案件 ${data.projects.length}件を読み込みます。同じ案件は上書きされ、会社情報と単価表はバックアップの内容に置き換わります。`,
      okLabel: '読み込む',
    });
    if (!ok) return;
    setBusy(true);
    try {
      for (const [id, url] of Object.entries(data.photos ?? {})) await savePhoto(id, await dataUrlToBlob(url));
      const st = getState();
      // 以前の版のバックアップも読めるよう、いまの形にそろえてから取り込む
      const incoming = normalizeState({ projects: data.projects, settings: data.settings });
      const ids = new Set(incoming.projects.map((p) => p.id));
      replaceAll({ projects: [...incoming.projects, ...st.projects.filter((p) => !ids.has(p.id))], settings: incoming.settings });
      toast('バックアップを読み込みました');
    } catch {
      toast('読み込みの途中で失敗しました');
    }
    setBusy(false);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="btn-icon on-dark" onClick={goBack} aria-label="戻る">
            <Icon name="back" />
          </button>
          <h1 className="brand">設定</h1>
        </div>
      </header>
      <main className="page settings">
        <section className="card pad">
          <h2 className="h2">会社情報</h2>
          <p className="lead">見積書の右上に印刷されます。</p>
          <div className="stack">
            <TextField id="co-name" label="会社名・屋号" value={co.name} onChange={(v) => setCompany('name', v)} placeholder="株式会社〇〇エクステリア" />
            <div className="row-2">
              <TextField id="co-zip" label="郵便番号" value={co.zip} onChange={(v) => setCompany('zip', v)} placeholder="000-0000" />
              <TextField id="co-tel" label="電話番号" type="tel" value={co.tel} onChange={(v) => setCompany('tel', v)} placeholder="000-000-0000" />
            </div>
            <TextField id="co-address" label="住所" value={co.address} onChange={(v) => setCompany('address', v)} />
            <div className="row-2">
              <TextField id="co-reg" label="インボイス登録番号" value={co.registrationNo} onChange={(v) => setCompany('registrationNo', v)} placeholder="T0000000000000" />
              <TextField id="co-staff" label="担当者" value={co.staff} onChange={(v) => setCompany('staff', v)} />
            </div>
          </div>
        </section>

        <section className="card pad">
          <h2 className="h2">見積もりの初期値</h2>
          <div className="row-2">
            <NumField id="set-overhead" label="諸経費（新しい案件）" unit="%" step={1} min={0} max={50} allowEmpty={false} stepper value={settings.overheadRate} onChange={(v) => v !== undefined && updateSettings((s) => ({ ...s, overheadRate: v }))} />
            <NumField id="set-tax" label="消費税率" unit="%" step={1} min={0} max={30} allowEmpty={false} stepper value={settings.taxRate} onChange={(v) => v !== undefined && updateSettings((s) => ({ ...s, taxRate: v }))} />
          </div>
        </section>

        <section className="card pad">
          <div className="list-head">
            <h2 className="h2">単価表</h2>
            {changed > 0 && (
              <button
                type="button"
                className="btn-text"
                onClick={async () => {
                  const ok = await confirmDialog({ title: '単価をすべて初期値に戻しますか？', body: `変更した ${changed}件の単価が参考値に戻ります。`, okLabel: '初期値に戻す', danger: true });
                  if (ok) updateSettings((s) => ({ ...s, prices: {} }));
                }}
              >
                すべて初期値に戻す
              </button>
            )}
          </div>
          <p className="lead">材料と工事費を合わせた、税抜の単価です。はじめは参考値が入っています。自社の単価に書き換えると、すべての案件の見積もりに反映されます。</p>
          {WORKS.map((work) => {
            const rows = PRICE_ROWS.filter((r) => r.work === work);
            if (rows.length === 0) return null;
            return (
              <div key={work} className="price-group">
                <h3 className="h3">{work}</h3>
                <ul className="price-list">
                  {rows.map((r) => {
                    const cur = settings.prices[r.key];
                    const edited = typeof cur === 'number';
                    return (
                      <li key={r.key} className={'price-row' + (edited ? ' is-edited' : '')}>
                        <div className="price-name">
                          <span className="est-title">{r.name}</span>
                          {r.spec && <span className="est-spec">{r.spec}</span>}
                          {edited && (
                            <button type="button" className="btn-text" onClick={() => setPrice(r.key, r.base, undefined)}>
                              初期値 {yen(r.base)} に戻す
                            </button>
                          )}
                        </div>
                        <NumField compact id={`price-${r.key}`} unit={`円/${r.unit}`} step={100} min={0} max={99999999} allowEmpty={false} value={edited ? cur : r.base} onChange={(v) => setPrice(r.key, r.base, v)} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="card pad">
          <h2 className="h2">バックアップ</h2>
          <p className="lead">データはこの端末のブラウザの中だけに保存されています。機種変更の前や、別の端末に移すときに書き出してください。（いま {projectCount}件の案件があります）</p>
          <div className="row-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void exportAll()}>
              <Icon name="download" size={18} />
              バックアップを書き出す
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={18} />
              バックアップを読み込む
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                void importAll(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
