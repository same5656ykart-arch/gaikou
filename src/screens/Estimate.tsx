import { useMemo, useState } from 'react';
import type { EstimateState, ManualLine, Project, Tab } from '../types';
import { buildEstimate } from '../lib/estimate';
import type { EstimateLine } from '../lib/estimate';
import { num, uid, yen } from '../lib/format';
import { surveyAlerts } from '../lib/surveyDef';
import { navigate, updateProject, useAppState } from '../store';
import { Icon } from '../ui/Icon';
import { NumField, TextField } from '../ui/fields';
import { EstimateDoc } from '../print/EstimateDoc';
import { PrintOverlay } from '../print/PrintOverlay';

interface Props {
  project: Project;
  onGo: (t: Tab) => void;
}

const SOURCE_LABEL: Record<EstimateLine['source'], string> = {
  plan: '平面図から',
  survey: '現調から',
  auto: '自動',
  manual: '手入力',
};

export function EstimateScreen({ project, onGo }: Props) {
  const settings = useAppState((s) => s.settings);
  const [printing, setPrinting] = useState(false);
  const est = project.estimate;
  const result = useMemo(() => buildEstimate(project.plan, project.survey.answers, est, settings), [project.plan, project.survey.answers, est, settings]);
  const alerts = useMemo(() => surveyAlerts(project.survey.answers), [project.survey.answers]);

  const patch = (fn: (e: EstimateState) => EstimateState) => updateProject(project.id, (p) => ({ ...p, estimate: fn(p.estimate) }));

  const setExcluded = (id: string, excluded: boolean) =>
    patch((e) => ({ ...e, excluded: excluded ? [...e.excluded.filter((x) => x !== id), id] : e.excluded.filter((x) => x !== id) }));

  const setOverride = (field: 'qtyOverrides' | 'priceOverrides', id: string, v: number | undefined) =>
    patch((e) => {
      const next = { ...e[field] };
      if (v === undefined) delete next[id];
      else next[id] = v;
      return { ...e, [field]: next };
    });

  const patchManual = (id: string, fn: (m: ManualLine) => ManualLine) => patch((e) => ({ ...e, manual: e.manual.map((m) => (m.id === id ? fn(m) : m)) }));

  const addManual = () => patch((e) => ({ ...e, manual: [...e.manual, { id: uid(), name: '', spec: '', qty: 1, unit: '式', unitPrice: 0 }] }));

  const empty = result.lines.length === 0;
  const companyMissing = !settings.company.name;

  return (
    <div className="estimate">
      <div className="estimate-inner">
        <div className="step-head">
          <h2 className="h1">見積もり</h2>
          <p className="lead">平面図の面積・長さ・個数から自動で計算しています。数量と単価はここで直せます。</p>
        </div>

        {empty && (
          <div className="empty">
            <p>見積もりに入る部材がまだありません。平面図に駐車場やフェンスを置くと、ここに自動で並びます。</p>
            <button type="button" className="btn btn-primary" onClick={() => onGo('plan')}>
              平面図へ
              <Icon name="next" size={18} />
            </button>
          </div>
        )}

        {alerts.length > 0 && (
          <details className="alerts-fold" open={alerts.some((a) => a.level === 'warn')}>
            <summary>
              <Icon name="alert" size={18} />
              現調で見つかった注意点（{alerts.length}件）
            </summary>
            {alerts.map((al) => (
              <div key={al.title} className={'alert alert-' + al.level}>
                <Icon name={al.level === 'warn' ? 'alert' : 'info'} size={18} />
                <div>
                  <p className="alert-title">{al.title}</p>
                  <p className="alert-body">{al.body}</p>
                </div>
              </div>
            ))}
          </details>
        )}

        {result.groups.map((g) => (
          <section key={g.work} className="est-group">
            <div className="est-group-head">
              <h3 className="h3">{g.work}</h3>
              <span className="est-group-sum">{yen(g.subtotal)}</span>
            </div>
            <ul className="est-lines">
              {g.lines.map((l) => {
                const manual = l.source === 'manual' ? est.manual.find((m) => `manual:${m.id}` === l.id) : undefined;
                return (
                  <li key={l.id} className={'est-line' + (l.excluded ? ' is-off' : '')}>
                    <div className="est-line-top">
                      <label className="est-check">
                        <input type="checkbox" checked={!l.excluded} onChange={(e) => setExcluded(l.id, !e.target.checked)} aria-label={`${l.name}を見積もりに入れる`} />
                      </label>
                      <div className="est-name">
                        {manual ? (
                          <input className="input input-sm" value={manual.name} placeholder="名称（例：桝の高さ調整）" aria-label="名称" onChange={(e) => patchManual(manual.id, (m) => ({ ...m, name: e.target.value }))} />
                        ) : (
                          <>
                            <span className="est-title">{l.name}</span>
                            {l.spec && <span className="est-spec">{l.spec}</span>}
                          </>
                        )}
                      </div>
                      <span className="est-amount">{yen(l.excluded ? 0 : l.amount)}</span>
                    </div>
                    <div className="est-line-edit">
                      <NumField
                        compact
                        id={`qty-${l.id}`}
                        label="数量"
                        unit={manual ? undefined : l.unit}
                        step={1}
                        min={0}
                        max={99999}
                        allowEmpty={false}
                        value={l.qty}
                        onChange={(v) => {
                          if (v === undefined) return;
                          if (manual) patchManual(manual.id, (m) => ({ ...m, qty: v }));
                          else setOverride('qtyOverrides', l.id, v === l.autoQty ? undefined : v);
                        }}
                      />
                      {manual && (
                        <div className="field field-compact">
                          <label className="field-label" htmlFor={`unit-${l.id}`}>
                            単位
                          </label>
                          <input id={`unit-${l.id}`} className="input" value={manual.unit} onChange={(e) => patchManual(manual.id, (m) => ({ ...m, unit: e.target.value }))} />
                        </div>
                      )}
                      <NumField
                        compact
                        id={`price-${l.id}`}
                        label="単価"
                        unit="円"
                        step={100}
                        min={0}
                        max={99999999}
                        allowEmpty={false}
                        value={l.unitPrice}
                        onChange={(v) => {
                          if (v === undefined) return;
                          if (manual) patchManual(manual.id, (m) => ({ ...m, unitPrice: v }));
                          else setOverride('priceOverrides', l.id, v === l.basePrice ? undefined : v);
                        }}
                      />
                      {manual ? (
                        <button type="button" className="btn-icon danger" aria-label="この行を削除" onClick={() => patch((e) => ({ ...e, manual: e.manual.filter((m) => m.id !== manual.id) }))}>
                          <Icon name="trash" size={18} />
                        </button>
                      ) : (
                        <span className="est-source">{SOURCE_LABEL[l.source]}</span>
                      )}
                    </div>
                    {!manual && (l.qty !== l.autoQty || l.unitPrice !== l.basePrice) && (
                      <p className="est-note">
                        手で直しています（自動計算：{num(l.autoQty)}
                        {l.unit} × {yen(l.basePrice)}）
                        <button
                          type="button"
                          className="btn-text"
                          onClick={() => {
                            setOverride('qtyOverrides', l.id, undefined);
                            setOverride('priceOverrides', l.id, undefined);
                          }}
                        >
                          自動に戻す
                        </button>
                      </p>
                    )}
                    {l.includes && <p className="est-includes">含まれるもの：{l.includes}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <button type="button" className="btn" onClick={addManual}>
          <Icon name="plus" size={18} />
          行を手入力で追加
        </button>

        <section className="totals">
          <div className="total-row">
            <span>小計</span>
            <strong>{yen(result.subtotal)}</strong>
          </div>
          <div className="total-row">
            <span className="total-edit">
              諸経費
              <NumField compact id="overhead" unit="%" step={1} min={0} max={50} allowEmpty={false} value={est.overheadRate} onChange={(v) => v !== undefined && patch((e) => ({ ...e, overheadRate: v }))} />
            </span>
            <strong>{yen(result.overhead)}</strong>
          </div>
          <div className="total-row">
            <span className="total-edit">
              お値引き
              <NumField compact id="discount" unit="円" step={1000} min={0} max={99999999} allowEmpty={false} value={est.discount} onChange={(v) => v !== undefined && patch((e) => ({ ...e, discount: v }))} />
            </span>
            <strong>{result.discount > 0 ? '−' + yen(result.discount) : yen(0)}</strong>
          </div>
          <div className="total-row">
            <span>合計（税抜）</span>
            <strong>{yen(result.net)}</strong>
          </div>
          <div className="total-row">
            <span>消費税（{settings.taxRate}%）</span>
            <strong>{yen(result.tax)}</strong>
          </div>
          <div className="total-row total-grand">
            <span>お見積金額（税込）</span>
            <strong>{yen(result.total)}</strong>
          </div>
        </section>

        <section className="est-meta">
          <h3 className="h3">見積書に載せる情報</h3>
          <div className="row-2">
            <TextField id="est-number" label="見積番号" value={est.number} onChange={(v) => patch((e) => ({ ...e, number: v }))} />
            <TextField id="est-date" label="発行日" type="date" value={est.date} onChange={(v) => patch((e) => ({ ...e, date: v }))} />
          </div>
          <NumField id="est-valid" label="有効期限" unit="日間" step={1} min={1} max={365} allowEmpty={false} value={est.validDays} onChange={(v) => v !== undefined && patch((e) => ({ ...e, validDays: Math.round(v) }))} />
          <TextField id="est-note" label="備考" multiline value={est.note} onChange={(v) => patch((e) => ({ ...e, note: v }))} placeholder="例：工期は約2週間です。天候により前後することがあります。" />
          {companyMissing && (
            <div className="alert alert-info">
              <Icon name="info" size={18} />
              <div>
                <p className="alert-title">会社情報が未入力です</p>
                <p className="alert-body">
                  見積書に会社名・住所・電話番号を載せるには、設定で入力してください。
                  <button type="button" className="btn-text" onClick={() => navigate({ name: 'settings' })}>
                    設定を開く
                  </button>
                </p>
              </div>
            </div>
          )}
        </section>

        <p className="footnote">単価は参考値です。設定の「単価表」で自社の単価に変更すると、すべての案件に反映されます。</p>
      </div>

      <div className="estimate-bar">
        <div className="estimate-bar-total">
          <span>税込</span>
          <strong>{yen(result.total)}</strong>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setPrinting(true)} disabled={empty}>
          <Icon name="print" size={18} />
          見積書をつくる
        </button>
      </div>

      {printing && (
        <PrintOverlay title="見積書" onClose={() => setPrinting(false)}>
          <EstimateDoc project={project} settings={settings} estimate={result} />
        </PrintOverlay>
      )}
    </div>
  );
}
