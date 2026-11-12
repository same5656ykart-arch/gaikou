import { Suspense, lazy, useState } from 'react';
import type { Tab } from '../types';
import { goBack, navigate, updateProject, useProject } from '../store';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Overlays';
import { TextField } from '../ui/fields';
import { EstimateScreen } from './Estimate';
import { SurveyScreen } from './Survey';
import { PlanScreen } from '../plan/PlanScreen';

// three.js は大きいので、3D タブを開いたときに読み込む
const View3D = lazy(() => import('../view3d/View3D'));

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'survey', label: '現調', icon: 'survey' },
  { key: 'plan', label: '平面図', icon: 'plan' },
  { key: 'view3d', label: '3D', icon: 'cube' },
  { key: 'estimate', label: '見積', icon: 'yen' },
];

export function ProjectScreen({ id, tab }: { id: string; tab: Tab }) {
  const project = useProject(id);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');

  if (!project) {
    return (
      <div className="screen">
        <main className="page">
          <div className="empty">
            <p>この案件は見つかりませんでした。</p>
            <button type="button" className="btn" onClick={() => navigate({ name: 'home' }, { replace: true })}>
              案件一覧へ
            </button>
          </div>
        </main>
      </div>
    );
  }

  const go = (t: Tab) => navigate({ name: 'project', id, tab: t }, { replace: true });

  return (
    <div className="screen project">
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="btn-icon on-dark" onClick={goBack} aria-label="案件一覧へ戻る">
            <Icon name="back" />
          </button>
          <button
            type="button"
            className="project-title"
            onClick={() => {
              setName(project.name);
              setRenaming(true);
            }}
            title="案件名を変更"
          >
            <span className="project-title-text">{project.name}</span>
            <Icon name="edit" size={15} />
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="作業の切り替え">
        {TABS.map((t, i) => (
          <button key={t.key} type="button" className={'tab' + (tab === t.key ? ' is-on' : '')} aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key)}>
            <span className="tab-icon">
              <Icon name={t.icon} size={22} />
            </span>
            <span className="tab-label">
              <span className="tab-num">{i + 1}</span>
              {t.label}
            </span>
          </button>
        ))}
      </nav>

      <div className={'project-body tab-' + tab}>
        {tab === 'survey' && <SurveyScreen project={project} onGo={go} />}
        {tab === 'plan' && <PlanScreen project={project} onGo={go} />}
        {tab === 'view3d' && (
          <Suspense fallback={<div className="loading">3Dを準備しています…</div>}>
            <View3D project={project} onGo={go} />
          </Suspense>
        )}
        {tab === 'estimate' && <EstimateScreen project={project} onGo={go} />}
      </div>

      {renaming && (
        <Sheet title="案件名を変更" onClose={() => setRenaming(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) updateProject(id, (p) => ({ ...p, name: name.trim() }));
              setRenaming(false);
            }}
          >
            <TextField id="rename" label="案件名" value={name} onChange={setName} />
            <button type="submit" className="btn btn-primary btn-lg">
              変更する
            </button>
          </form>
        </Sheet>
      )}
    </div>
  );
}
