import type { Plan, PlanItem, Project } from '../types';
import { createItem } from '../lib/catalog';
import { PATTERNS, SIDES, addExisting, boundaryState, houseOf, planFromPattern, resizeSite, setBoundary } from '../lib/existing';
import type { BoundaryType, Pattern } from '../lib/existing';
import { clamp, r2 } from '../lib/format';
import { confirmDialog, updateProject } from '../store';
import { Icon } from '../ui/Icon';
import { Choice, NumField, TextField } from '../ui/fields';

// 既存図のパネル。パターンを選ぶ → 大きさを合わせる → 境界にあるものを選ぶ、の順に上から並べる。
// 図の上でドラッグしても、ここで数字を入れても同じ結果になる。

function Thumb({ p }: { p: Pattern }) {
  // 敷地の縦横比のまま、64px の枠に収める。下の帯が道路
  const s = 50 / Math.max(p.site.width, p.site.depth);
  const w = p.site.width * s;
  const d = p.site.depth * s;
  const ox = (64 - w) / 2;
  const oy = 4 + (50 - d) / 2;
  return (
    <svg className="pattern-thumb" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="0" y={oy + d} width="64" height={64 - oy - d} fill="#d5d9dd" />
      <rect x={ox} y={oy} width={w} height={d} fill="#f7f3e8" stroke="#16324a" strokeWidth="1.2" />
      <rect x={ox + p.house.x * s} y={oy + d - (p.house.y + p.house.h) * s} width={p.house.w * s} height={p.house.h * s} fill="#ffffff" stroke="#1d2f40" strokeWidth="1.6" />
    </svg>
  );
}

function matches(plan: Plan, p: Pattern): boolean {
  const h = houseOf(plan);
  return plan.site.width === p.site.width && plan.site.depth === p.site.depth && h !== undefined && h.x === p.house.x && h.y === p.house.y && h.w === p.house.w && h.h === p.house.h;
}

interface PickerProps {
  /** いま選ばれているパターンのキー（一致するものがなければ undefined） */
  current?: string;
  onPick: (p: Pattern) => void;
}

/** 敷地と建物のパターンを選ぶ。新しい案件を作るときにも使う */
export function PatternPicker({ current, onPick }: PickerProps) {
  return (
    <div className="patterns" role="group" aria-label="敷地と建物のパターン">
      {PATTERNS.map((p) => (
        <button key={p.key} type="button" className={'pattern' + (current === p.key ? ' is-on' : '')} aria-pressed={current === p.key} onClick={() => onPick(p)}>
          <Thumb p={p} />
          <span className="pattern-name">{p.name}</span>
          <span className="pattern-desc">
            {p.site.width}×{p.site.depth}m・{p.desc}
          </span>
        </button>
      ))}
    </div>
  );
}

const BOUNDARY_OPTIONS: { v: BoundaryType; label: string }[] = [
  { v: 'none', label: 'なし' },
  { v: 'block', label: 'ブロック' },
  { v: 'fence', label: 'フェンス' },
  { v: 'both', label: 'ブロック＋フェンス' },
];

const QUICK_ADD: { kind: string; label: string }[] = [
  { kind: 'exTree', label: '木' },
  { kind: 'masu', label: '桝（マス）' },
  { kind: 'meter', label: 'メーター' },
  { kind: 'exConcrete', label: 'コンクリート' },
  { kind: 'exShed', label: '物置' },
  { kind: 'exBlock', label: 'ブロック塀' },
  { kind: 'exFence', label: 'フェンス' },
];

interface Props {
  project: Project;
  plan: Plan;
  stepLabel?: string;
  commit: (next: Plan, key?: string) => void;
  onSelect: (id: string) => void;
  onFit: (next: Plan) => void;
}

export function ExistingPanel({ project, plan, stepLabel, commit, onSelect, onFit }: Props) {
  const a = project.survey.answers;
  const house = houseOf(plan);
  const W = plan.site.width;
  const D = plan.site.depth;
  const current = PATTERNS.find((p) => matches(plan, p))?.key;

  const setAnswer = (id: string, v: string) =>
    updateProject(project.id, (p) => {
      const answers = { ...p.survey.answers };
      if (v === '') delete answers[id];
      else answers[id] = v;
      return { ...p, survey: { ...p.survey, answers } };
    });

  const applyPattern = async (p: Pattern) => {
    if (plan.items.some((it) => it.kind !== 'house')) {
      const ok = await confirmDialog({
        title: 'パターンを変えますか？',
        body: '敷地と建物を、選んだパターンに置き換えます。図に置いてあるもの（既存のもの・追加した部材）は消えます。「元に戻す」で取り消せます。',
        okLabel: '変える',
      });
      if (!ok) return;
    }
    const next = planFromPattern(p, plan.roadWidth);
    commit(next);
    onFit(next);
  };

  const patchHouse = (patch: Partial<PlanItem>, key: string) => {
    if (!house) return;
    commit({ ...plan, items: plan.items.map((it) => (it.id === house.id ? { ...it, ...patch } : it)) }, 'house-' + key);
  };
  const setHouseProp = (k: string, v: string | number) => {
    if (!house) return;
    commit({ ...plan, items: plan.items.map((it) => (it.id === house.id ? { ...it, props: { ...it.props, [k]: v } } : it)) });
  };

  const addHouse = () => {
    const w = r2(clamp(W * 0.7, 2, W));
    const h = r2(clamp(D * 0.45, 2, D));
    const it = createItem('house', 0, 0);
    commit({ ...plan, items: [{ ...it, x: r2((W - w) / 2), y: r2(Math.max(0, D - h - 1.5)), w, h }, ...plan.items] });
  };

  const add = (kind: string) => {
    const res = addExisting(plan, kind);
    commit(res.plan);
    onSelect(res.id);
  };

  // 残すブロックがあるときだけ、状態を聞く（ひび・傾きがあると、上にフェンスを付けられない）
  const keptBlock = plan.items.some((it) => it.variant === 'keep' && (it.kind === 'exBlock' || (it.kind === 'exFence' && Number(it.props.baseRows ?? 0) > 0)));

  return (
    <div className="existing-panel">
      <div className="step-head">
        {stepLabel && <p className="eyebrow">{stepLabel}</p>}
        <h2 className="h1">既存図</h2>
        <p className="lead">いまの敷地と建物を描きます。近いパターンを選んで、大きさを合わせるだけです。</p>
      </div>

      <section className="ex-sec">
        <h3 className="ex-title">
          <span className="mark">1</span>近いパターンを選ぶ
        </h3>
        <PatternPicker current={current} onPick={(p) => void applyPattern(p)} />
      </section>

      <section className="ex-sec">
        <h3 className="ex-title">
          <span className="mark">2</span>大きさを合わせる
        </h3>
        <p className="field-hint">数字を入れるか、図の上で建物や敷地の端（四角のつまみ）をドラッグします。道路は図の下側です。</p>
        <div className="row-2">
          <NumField id="ex-site-w" compact label="敷地の幅（間口）" unit="m" step={0.1} min={2} max={80} allowEmpty={false} stepper value={W} onChange={(v) => v !== undefined && commit(resizeSite(plan, v, D), 'site-w')} />
          <NumField id="ex-site-d" compact label="敷地の奥行" unit="m" step={0.1} min={2} max={80} allowEmpty={false} stepper value={D} onChange={(v) => v !== undefined && commit(resizeSite(plan, W, v), 'site-d')} />
        </div>
        {house ? (
          <>
            <div className="row-2">
              <NumField id="ex-house-w" compact label="建物の幅" unit="m" step={0.1} min={1} max={80} allowEmpty={false} stepper value={house.w} onChange={(v) => v !== undefined && patchHouse({ w: v }, 'w')} />
              <NumField id="ex-house-h" compact label="建物の奥行" unit="m" step={0.1} min={1} max={80} allowEmpty={false} stepper value={house.h} onChange={(v) => v !== undefined && patchHouse({ h: v }, 'h')} />
              <NumField id="ex-house-y" compact label="道路から建物まで" unit="m" step={0.1} min={0} max={80} allowEmpty={false} stepper value={house.y} onChange={(v) => v !== undefined && patchHouse({ y: v }, 'y')} />
              <NumField id="ex-house-x" compact label="左の境から建物まで" unit="m" step={0.1} min={0} max={80} allowEmpty={false} stepper value={house.x} onChange={(v) => v !== undefined && patchHouse({ x: v }, 'x')} />
            </div>
            <div className="row-2 ex-house-props">
              <div className="field field-compact">
                <span className="field-label">階数</span>
                <Choice
                  dense
                  label="階数"
                  options={[
                    { v: '1', label: '平屋' },
                    { v: '2', label: '2階' },
                    { v: '3', label: '3階' },
                  ]}
                  value={String(house.props.floors ?? 2)}
                  onChange={(v) => typeof v === 'string' && v !== '' && setHouseProp('floors', Number(v))}
                />
              </div>
              <div className="field field-compact">
                <span className="field-label">玄関（道路から見て）</span>
                <Choice
                  dense
                  label="玄関の位置"
                  options={[
                    { v: 'left', label: '左' },
                    { v: 'center', label: '中' },
                    { v: 'right', label: '右' },
                  ]}
                  value={String(house.props.door ?? 'center')}
                  onChange={(v) => typeof v === 'string' && v !== '' && setHouseProp('door', v)}
                />
              </div>
            </div>
          </>
        ) : (
          <button type="button" className="btn" onClick={addHouse}>
            <Icon name="plus" size={18} />
            建物を置く
          </button>
        )}
      </section>

      <section className="ex-sec">
        <h3 className="ex-title">
          <span className="mark">3</span>境界にいまあるもの
        </h3>
        <p className="field-hint">辺ごとに選ぶと、端から端まで図に入ります。高さは図でタップして直せます。</p>
        {SIDES.map((sd) => {
          const st = boundaryState(plan, sd.key);
          return (
            <div key={sd.key} className="side-row">
              <span className="side-name">{sd.label}</span>
              <div className="side-opts" role="radiogroup" aria-label={`${sd.label}の境界にあるもの`}>
                {BOUNDARY_OPTIONS.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={st.type === o.v}
                    className={'chip chip-sm' + (st.type === o.v ? ' is-on' : '')}
                    onClick={() => commit(setBoundary(plan, sd.key, o.v, o.v === 'none' ? false : st.remove))}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {st.type !== 'none' && (
                <label className="side-remove">
                  <input type="checkbox" checked={st.remove} onChange={(e) => commit(setBoundary(plan, sd.key, st.type, e.target.checked))} />
                  撤去する
                </label>
              )}
            </div>
          );
        })}
        {keptBlock && (
          <div className="field field-compact">
            <span className="field-label">残すブロック塀の状態</span>
            <Choice
              dense
              label="残すブロック塀の状態"
              options={[
                { v: 'ok', label: '問題なし' },
                { v: 'damaged', label: 'ひび・傾きがある' },
              ]}
              value={typeof a.blockCondition === 'string' ? a.blockCondition : undefined}
              onChange={(v) => typeof v === 'string' && setAnswer('blockCondition', v)}
            />
          </div>
        )}
      </section>

      <section className="ex-sec">
        <h3 className="ex-title">
          <span className="mark">4</span>そのほか、いまあるもの
        </h3>
        <p className="field-hint">押すと図に入るので、ドラッグで場所を合わせます。撤去するものは、図でタップして「工事での扱い」を変えます。</p>
        <div className="quick-add">
          {QUICK_ADD.map((q) => (
            <button key={q.kind} type="button" className="chip" onClick={() => add(q.kind)}>
              <Icon name="plus" size={14} />
              {q.label}
            </button>
          ))}
        </div>
        <TextField
          id="ex-note"
          label="メモ（残すもの・撤去するもの）"
          multiline
          value={typeof a.existingNote === 'string' ? a.existingNote : ''}
          onChange={(v) => setAnswer('existingNote', v)}
          placeholder="例：古い門柱は撤去。庭石は残す。"
        />
      </section>
    </div>
  );
}
