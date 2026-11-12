import { useState } from 'react';
import type { Project } from '../types';
import { estimateOf } from '../lib/estimate';
import { yen } from '../lib/format';
import { surveyProgress } from '../lib/surveyDef';
import { addSampleProject, confirmDialog, createProject, deleteProject, duplicateProject, navigate, toast, updateProject, useAppState } from '../store';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Overlays';
import { TextField } from '../ui/fields';

function dateLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

const FLOW = [
  { icon: 'survey', title: '現地調査', text: '質問に答えて、測って、写真を撮る' },
  { icon: 'plan', title: '平面図', text: '測った数字から自動で作成。指で動かして調整' },
  { icon: 'cube', title: '3Dパース', text: '平面図がそのまま立体に。お客様に見せる' },
  { icon: 'yen', title: '見積もり', text: '面積と長さから自動で計算。見積書を印刷' },
];

export function Home() {
  const projects = useAppState((s) => s.projects);
  const settings = useAppState((s) => s.settings);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');

  const create = () => {
    const title = name.trim() || (customer.trim() ? `${customer.trim()}様邸 外構工事` : '新しい案件');
    const p = createProject(title);
    if (customer.trim()) {
      updateProject(p.id, (x) => ({ ...x, survey: { ...x.survey, answers: { ...x.survey.answers, customerName: customer.trim() } } }));
    }
    setCreating(false);
    setName('');
    setCustomer('');
    navigate({ name: 'project', id: p.id, tab: 'survey' });
  };

  const remove = async (p: Project) => {
    const ok = await confirmDialog({
      title: 'この案件を削除しますか？',
      body: `「${p.name}」の現調・平面図・見積もり・写真がすべて消えます。元に戻せません。`,
      okLabel: '削除する',
      danger: true,
    });
    if (ok) {
      deleteProject(p.id);
      toast('案件を削除しました');
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-inner">
          <h1 className="brand">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="home" size={18} />
            </span>
            外構かんたんプラン
          </h1>
          <button type="button" className="btn-icon on-dark" onClick={() => navigate({ name: 'settings' })} aria-label="設定">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main className="page">
        <section className="flow" aria-label="このアプリでできること">
          {FLOW.map((f, i) => (
            <div key={f.title} className="flow-step">
              <span className="flow-num">{i + 1}</span>
              <span className="flow-icon" aria-hidden="true">
                <Icon name={f.icon} size={22} />
              </span>
              <span className="flow-title">{f.title}</span>
              <span className="flow-text">{f.text}</span>
            </div>
          ))}
        </section>

        <div className="list-head">
          <h2 className="h2">案件</h2>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} />
            新しい案件
          </button>
        </div>

        {projects.length === 0 && (
          <div className="empty">
            <p>まだ案件がありません。「新しい案件」から始めるか、サンプルで使い方を確認できます。</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const p = addSampleProject();
                navigate({ name: 'project', id: p.id, tab: 'survey' });
              }}
            >
              サンプル案件を開く
            </button>
          </div>
        )}

        <ul className="cards">
          {projects.map((p) => {
            const a = p.survey.answers;
            const prog = surveyProgress(a, p.survey.photos.length);
            const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
            const est = estimateOf(p, settings);
            return (
              <li key={p.id} className="card project-card">
                <button type="button" className="project-main" onClick={() => navigate({ name: 'project', id: p.id, tab: p.plan ? 'plan' : 'survey' })}>
                  <span className="project-name">
                    {p.sample && <span className="tag">サンプル</span>}
                    {p.name}
                  </span>
                  <span className="project-sub">
                    {[a.customerName ? `${a.customerName} 様` : '', a.address].filter(Boolean).join('　') || 'お客様情報は未入力'}
                  </span>
                  <span className="project-stats">
                    <span className="stat">
                      <span className="stat-label">現調</span>
                      <span className="meter" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </span>
                      <span className="stat-value">{pct}%</span>
                    </span>
                    <span className="stat">
                      <span className="stat-label">平面図</span>
                      <span className="stat-value">{p.plan ? `部材 ${p.plan.items.length}点` : '未作成'}</span>
                    </span>
                    <span className="stat">
                      <span className="stat-label">見積（税込）</span>
                      <span className="stat-value stat-money">{est.total > 0 ? yen(est.total) : '—'}</span>
                    </span>
                  </span>
                </button>
                <div className="project-foot">
                  <span className="muted">更新 {dateLabel(p.updatedAt)}</span>
                  <span className="project-actions">
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => {
                        duplicateProject(p.id);
                        toast('案件を複製しました');
                      }}
                    >
                      <Icon name="copy" size={16} />
                      複製
                    </button>
                    <button type="button" className="btn-text danger" onClick={() => void remove(p)}>
                      <Icon name="trash" size={16} />
                      削除
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="footnote">データはこの端末のブラウザ内に保存されます。機種変更や共有には、設定の「バックアップ」を使ってください。</p>
      </main>

      {creating && (
        <Sheet title="新しい案件" onClose={() => setCreating(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <TextField id="new-customer" label="お客様のお名前" value={customer} onChange={setCustomer} placeholder="山田 太郎" />
            <TextField
              id="new-name"
              label="案件名（空欄なら自動で付けます）"
              value={name}
              onChange={setName}
              placeholder={customer.trim() ? `${customer.trim()}様邸 外構工事` : '〇〇様邸 外構工事'}
            />
            <button type="submit" className="btn btn-primary btn-lg">
              現地調査をはじめる
              <Icon name="next" size={18} />
            </button>
          </form>
        </Sheet>
      )}
    </div>
  );
}
