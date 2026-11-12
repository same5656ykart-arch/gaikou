import { useEffect, useRef, useState } from 'react';
import type { AnswerValue, Answers, PhotoRef, Project, Tab } from '../types';
import { meters, uid } from '../lib/format';
import { deletePhoto, resizeImage, savePhoto, usePhotoUrl } from '../lib/photos';
import { canGenerate, generatePlan } from '../lib/planFromSurvey';
import { PHOTO_SLOTS, STEPS, answerText, isAnswered, stepProgress, surveyAlerts, visibleQuestions } from '../lib/surveyDef';
import type { Question, Step } from '../lib/surveyDef';
import { confirmDialog, toast, updateProject } from '../store';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Overlays';
import { Choice, NumField, TextField } from '../ui/fields';
import { PrintOverlay } from '../print/PrintOverlay';
import { SurveySheet } from '../print/SurveySheet';

// 案件ごとに、最後に開いていたステップを覚えておく（タブを行き来しても戻れるように）
const lastStep = new Map<string, number>();

interface Props {
  project: Project;
  onGo: (t: Tab) => void;
}

export function SurveyScreen({ project, onGo }: Props) {
  const [index, setIndex] = useState(() => lastStep.get(project.id) ?? 0);
  const [printing, setPrinting] = useState(false);
  const a = project.survey.answers;
  const step = STEPS[index];
  const scroller = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lastStep.set(project.id, index);
    scroller.current?.scrollTo(0, 0);
    const el = chips.current?.querySelector<HTMLElement>('.is-on');
    const box = chips.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2 });
  }, [index, project.id]);

  const setAnswer = (id: string, v: AnswerValue | undefined) => {
    updateProject(project.id, (p) => {
      const answers = { ...p.survey.answers };
      if (v === undefined || v === '') delete answers[id];
      else answers[id] = v;
      return { ...p, survey: { ...p.survey, answers } };
    });
  };

  const makePlan = async () => {
    if (!canGenerate(a)) {
      toast('先に「敷地のサイズ」で幅と奥行を入力してください');
      setIndex(STEPS.findIndex((s) => s.id === 'size'));
      return;
    }
    if (project.plan && project.plan.items.length > 0) {
      const ok = await confirmDialog({
        title: '平面図を作り直しますか？',
        body: 'いまの平面図は消えて、現調の内容から新しく作り直します。',
        okLabel: '作り直す',
        danger: true,
      });
      if (!ok) return;
    }
    updateProject(project.id, (p) => ({ ...p, plan: generatePlan(p.survey.answers) }));
    toast('平面図を自動で作成しました');
    onGo('plan');
  };

  return (
    <div className="survey">
      <div className="steps" ref={chips} role="tablist" aria-label="現地調査の項目">
        {STEPS.map((s, i) => {
          const pr = stepProgress(s, a, project.survey.photos.length);
          const complete = s.custom !== 'summary' && pr.total > 0 && pr.done >= pr.total;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={'step-chip' + (i === index ? ' is-on' : '') + (complete ? ' is-done' : '')}
              onClick={() => setIndex(i)}
            >
              <span className="step-chip-num">{complete ? <Icon name="check" size={13} /> : i + 1}</span>
              {s.title}
            </button>
          );
        })}
      </div>

      <div className="survey-scroll" ref={scroller}>
        <div className="survey-inner">
          <div className="step-head">
            <p className="eyebrow">
              ステップ {index + 1} / {STEPS.length}
            </p>
            <h2 className="h1">{step.title}</h2>
            <p className="lead">{step.lead}</p>
          </div>

          {step.custom === 'size' && <SizeStep step={step} a={a} setAnswer={setAnswer} />}
          {step.custom === 'photos' && <PhotosStep project={project} />}
          {step.custom === 'summary' && (
            <SummaryStep project={project} onEdit={(i) => setIndex(i)} onMakePlan={() => void makePlan()} onGo={onGo} onPrint={() => setPrinting(true)} />
          )}
          {!step.custom && <QuestionList step={step} a={a} setAnswer={setAnswer} />}

          {step.tip && (
            <div className="tip">
              <Icon name="info" size={18} />
              <p>{step.tip}</p>
            </div>
          )}
        </div>
      </div>

      <div className="survey-nav">
        <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <Icon name="back" size={18} />
          戻る
        </button>
        {index < STEPS.length - 1 ? (
          <button type="button" className="btn btn-primary" onClick={() => setIndex(index + 1)}>
            次へ
            <Icon name="next" size={18} />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => (project.plan ? onGo('plan') : void makePlan())}>
            {project.plan ? '平面図へ' : '平面図を自動作成'}
            <Icon name="next" size={18} />
          </button>
        )}
      </div>

      {printing && (
        <PrintOverlay title="現調シート" onClose={() => setPrinting(false)}>
          <SurveySheet project={project} />
        </PrintOverlay>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface QProps {
  step: Step;
  a: Answers;
  setAnswer: (id: string, v: AnswerValue | undefined) => void;
}

function QuestionField({ q, a, setAnswer }: { q: Question; a: Answers; setAnswer: QProps['setAnswer'] }) {
  const v = a[q.id];
  if (q.type === 'number') {
    return (
      <div className="q">
        <NumField
          id={'q-' + q.id}
          label={
            <>
              {q.mark && <span className="mark">{q.mark}</span>}
              {q.label}
            </>
          }
          value={typeof v === 'number' ? v : undefined}
          onChange={(n) => setAnswer(q.id, n)}
          unit={q.unit}
          step={q.step}
          min={q.min}
          max={q.max}
          stepper
          hint={q.hint}
        />
        {q.quick && (
          <div className="quick">
            {q.quick.map((n) => (
              <button key={n} type="button" className={'chip' + (v === n ? ' is-on' : '')} onClick={() => setAnswer(q.id, n)}>
                {n}
                {q.unit}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (q.type === 'choice' || q.type === 'multi') {
    return (
      <div className="q">
        <p className="field-label" id={'ql-' + q.id}>
          {q.label}
        </p>
        {q.hint && <p className="field-hint above">{q.hint}</p>}
        <Choice
          label={q.label}
          options={q.options}
          multi={q.type === 'multi'}
          value={q.type === 'multi' ? (Array.isArray(v) ? v : []) : typeof v === 'string' ? v : undefined}
          onChange={(nv) => setAnswer(q.id, nv)}
        />
      </div>
    );
  }
  return (
    <div className="q">
      <TextField
        id={'q-' + q.id}
        label={q.label}
        type={q.type === 'textarea' ? 'text' : q.type}
        multiline={q.type === 'textarea'}
        value={typeof v === 'string' ? v : ''}
        onChange={(s) => setAnswer(q.id, s)}
        placeholder={q.placeholder}
        hint={q.hint}
      />
    </div>
  );
}

function QuestionList({ step, a, setAnswer }: QProps) {
  return (
    <div className="qlist">
      {visibleQuestions(step, a).map((q) => (
        <QuestionField key={q.id} q={q} a={a} setAnswer={setAnswer} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 敷地のサイズ：図を見ながら A〜F を測る

function numOf(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function SizeDiagram({ a, active }: { a: Answers; active: string | null }) {
  // 未入力のところは仮の寸法で描く
  const W = numOf(a.siteWidth) ?? 12;
  const D = numOf(a.siteDepth) ?? 15;
  const hw = Math.min(numOf(a.houseWidth) ?? W * 0.62, W);
  const hd = Math.min(numOf(a.houseDepth) ?? D * 0.42, D);
  const hy = Math.min(numOf(a.houseFront) ?? (D - hd) * 0.62, D - hd);
  const hx = Math.min(numOf(a.houseLeft) ?? (W - hw) / 2, W - hw);
  const VW = 360;
  const s = Math.min(210 / W, 210 / D);
  const sw = W * s;
  const sd = D * s;
  const ox = (VW - sw) / 2;
  const oy = 16;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + sd - y * s; // y は奥が上
  const cls = (id: string) => 'dim' + (active === id ? ' is-active' : '') + (numOf(a[id]) !== undefined ? ' is-set' : '');
  const val = (id: string) => (numOf(a[id]) !== undefined ? meters(numOf(a[id])!) : '');

  const pillWidth = (id: string) => (val(id) ? 30 + val(id).length * 7.2 : 22);
  /** align: ラベルのどこを x に合わせるか */
  const Label = ({ id, mark, x, y, align = 'center' }: { id: string; mark: string; x: number; y: number; align?: 'center' | 'right' }) => {
    const text = val(id);
    const w = pillWidth(id);
    const cx = align === 'right' ? x - w / 2 : x;
    return (
      <g className={cls(id)} transform={`translate(${cx},${y})`}>
        <rect className="dim-pill" x={-w / 2} y={-11} width={w} height={22} rx={11} />
        <text className="dim-mark" x={text ? -w / 2 + 12 : 0} y={4.5} textAnchor="middle">
          {mark}
        </text>
        {text && (
          <text className="dim-val" x={-w / 2 + 22} y={4.5}>
            {text}
          </text>
        )}
      </g>
    );
  };
  const HLine = ({ id, x1, x2, y }: { id: string; x1: number; x2: number; y: number }) => (
    <path className={cls(id) + ' dim-line'} d={`M${x1} ${y}H${x2}M${x1} ${y - 5}v10M${x2} ${y - 5}v10`} />
  );
  const VLine = ({ id, x, y1, y2 }: { id: string; x: number; y1: number; y2: number }) => (
    <path className={cls(id) + ' dim-line'} d={`M${x} ${y1}V${y2}M${x - 5} ${y1}h10M${x - 5} ${y2}h10`} />
  );

  const roadY = oy + sd;
  const houseTop = Y(hy + hd);
  const houseBottom = Y(hy);
  return (
    <svg className="size-diagram" viewBox={`0 0 ${VW} ${sd + 78}`} role="img" aria-label="敷地と建物の測る場所を示した図">
      <rect className="dg-road" x={0} y={roadY} width={VW} height={62} />
      <text className="dg-road-label" x={16} y={roadY + 50}>
        道路
      </text>
      <rect className="dg-site" x={ox} y={oy} width={sw} height={sd} />
      <rect className="dg-house" x={X(hx)} y={houseTop} width={hw * s} height={hd * s} />
      <text className="dg-house-label" x={X(hx + hw * 0.3)} y={houseBottom - 10} textAnchor="middle">
        建物
      </text>

      {/* A 間口 */}
      <HLine id="siteWidth" x1={ox} x2={ox + sw} y={roadY + 20} />
      <Label id="siteWidth" mark="A" x={ox + sw / 2} y={roadY + 20} />
      {/* B 奥行 */}
      <VLine id="siteDepth" x={ox + sw + 16} y1={oy} y2={roadY} />
      <Label id="siteDepth" mark="B" x={Math.min(ox + sw + 16, VW - 4 - pillWidth('siteDepth') / 2)} y={oy + sd * 0.25} />
      {/* C 建物の幅 */}
      <HLine id="houseWidth" x1={X(hx)} x2={X(hx + hw)} y={houseTop + 15} />
      <Label id="houseWidth" mark="C" x={X(hx + hw * 0.42)} y={houseTop + 15} />
      {/* D 建物の奥行 */}
      <VLine id="houseDepth" x={X(hx + hw) - 15} y1={houseTop} y2={houseBottom} />
      <Label id="houseDepth" mark="D" x={X(hx + hw) - 15} y={houseTop + (houseBottom - houseTop) * 0.62} />
      {/* E 道路から建物 */}
      <VLine id="houseFront" x={X(hx + hw * 0.5)} y1={houseBottom} y2={roadY} />
      <Label id="houseFront" mark="E" x={X(hx + hw * 0.5)} y={(houseBottom + roadY) / 2} />
      {/* F 左の境から建物：すき間がせまいので、ラベルは敷地の外（左）に出す */}
      <HLine id="houseLeft" x1={ox} x2={X(hx)} y={Y(hy + hd * 0.5)} />
      <Label id="houseLeft" mark="F" x={ox - 6} y={Y(hy + hd * 0.5)} align="right" />
    </svg>
  );
}

function SizeStep({ step, a, setAnswer }: QProps) {
  const [active, setActive] = useState<string | null>(null);
  const qs = visibleQuestions(step, a);
  const nums = qs.filter((q) => q.type === 'number');
  const rest = qs.filter((q) => q.type !== 'number');
  const area = numOf(a.siteWidth) && numOf(a.siteDepth) ? numOf(a.siteWidth)! * numOf(a.siteDepth)! : null;
  return (
    <div className="size-step">
      <div className="size-figure">
        <SizeDiagram a={a} active={active} />
        {area !== null && (
          <p className="size-area">
            敷地の広さ 約 <strong>{Math.round(area)}</strong> m²（{Math.round(area / 3.3058)} 坪）
          </p>
        )}
      </div>
      <div className="size-fields">
        <div className="size-grid">
          {nums.map((q) => (
            <div key={q.id} onFocusCapture={() => setActive(q.id)} onBlurCapture={() => setActive((cur) => (cur === q.id ? null : cur))}>
              <QuestionField q={q} a={a} setAnswer={setAnswer} />
            </div>
          ))}
        </div>
        <div className="qlist">
          {rest.map((q) => (
            <QuestionField key={q.id} q={q} a={a} setAnswer={setAnswer} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 写真

function Thumb({ photo, onOpen }: { photo: PhotoRef; onOpen: () => void }) {
  const url = usePhotoUrl(photo.id);
  return (
    <button type="button" className="thumb" onClick={onOpen} aria-label="写真を大きく表示">
      {url ? <img src={url} alt="" /> : <span className="thumb-loading" />}
    </button>
  );
}

function PhotoViewer({ photo, onClose, onDelete }: { photo: PhotoRef; onClose: () => void; onDelete: () => void }) {
  const url = usePhotoUrl(photo.id);
  const slot = PHOTO_SLOTS.find((s) => s.key === photo.slot);
  return (
    <Sheet title={slot?.label ?? '写真'} onClose={onClose} wide>
      <div className="viewer">
        {url && <img src={url} alt={slot?.label ?? ''} />}
        <button type="button" className="btn btn-danger-outline" onClick={onDelete}>
          <Icon name="trash" size={18} />
          この写真を削除
        </button>
      </div>
    </Sheet>
  );
}

function PhotosStep({ project }: { project: Project }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PhotoRef | null>(null);
  const photos = project.survey.photos;

  const add = async (slot: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(slot);
    const added: PhotoRef[] = [];
    try {
      for (const f of Array.from(files)) {
        const blob = await resizeImage(f);
        const ref: PhotoRef = { id: uid(), slot, createdAt: Date.now() };
        await savePhoto(ref.id, blob);
        added.push(ref);
      }
    } catch {
      toast('写真を読み込めませんでした。別の写真で試してください。');
    }
    if (added.length > 0) {
      updateProject(project.id, (p) => ({ ...p, survey: { ...p.survey, photos: [...p.survey.photos, ...added] } }));
    }
    setBusy(null);
  };

  const remove = (ref: PhotoRef) => {
    void deletePhoto(ref.id);
    updateProject(project.id, (p) => ({ ...p, survey: { ...p.survey, photos: p.survey.photos.filter((x) => x.id !== ref.id) } }));
    setViewing(null);
  };

  return (
    <div className="photo-grid">
      {PHOTO_SLOTS.map((s) => {
        const list = photos.filter((p) => p.slot === s.key);
        return (
          <div key={s.key} className={'photo-slot' + (list.length > 0 ? ' has-photo' : '')}>
            <div className="photo-slot-head">
              <span className="photo-slot-label">{s.label}</span>
              {s.must && list.length === 0 && <span className="tag tag-warn">必ず撮る</span>}
              {list.length > 0 && <span className="tag tag-ok">{list.length}枚</span>}
            </div>
            <div className="thumbs">
              {list.map((p) => (
                <Thumb key={p.id} photo={p} onOpen={() => setViewing(p)} />
              ))}
              <label className={'thumb thumb-add' + (busy === s.key ? ' is-busy' : '')}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    void add(s.key, e.target.files);
                    e.target.value = '';
                  }}
                />
                <Icon name="camera" size={24} />
                <span>{busy === s.key ? '保存中…' : '撮る・選ぶ'}</span>
              </label>
            </div>
          </div>
        );
      })}
      {viewing && <PhotoViewer photo={viewing} onClose={() => setViewing(null)} onDelete={() => remove(viewing)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// まとめ

interface SummaryProps {
  project: Project;
  onEdit: (stepIndex: number) => void;
  onMakePlan: () => void;
  onGo: (t: Tab) => void;
  onPrint: () => void;
}

function SummaryStep({ project, onEdit, onMakePlan, onGo, onPrint }: SummaryProps) {
  const a = project.survey.answers;
  const alerts = surveyAlerts(a);
  const ready = canGenerate(a);
  const plan = project.plan;
  const sizeChanged = plan !== null && ready && (plan.site.width !== a.siteWidth || plan.site.depth !== a.siteDepth);

  return (
    <div className="summary">
      <div className="cta-card">
        {!ready ? (
          <>
            <p className="cta-text">平面図を作るには、敷地の幅（A）と奥行（B）が必要です。</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => onEdit(STEPS.findIndex((s) => s.id === 'size'))}>
              敷地のサイズを入力する
            </button>
          </>
        ) : plan ? (
          <>
            <p className="cta-text">
              {sizeChanged ? '敷地のサイズが平面図と違っています。作り直すと現調の内容が反映されます。' : '平面図は作成済みです。現調の内容を変えたときは、作り直すと反映されます。'}
            </p>
            <div className="cta-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={() => onGo('plan')}>
                平面図を開く
                <Icon name="next" size={18} />
              </button>
              <button type="button" className="btn btn-lg" onClick={onMakePlan}>
                <Icon name="magic" size={18} />
                作り直す
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="cta-text">測った数字とご要望から、平面図・3D・見積もりのたたき台を自動で作ります。</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={onMakePlan}>
              <Icon name="magic" size={18} />
              平面図を自動作成
            </button>
          </>
        )}
      </div>

      {alerts.length > 0 && (
        <section className="alerts" aria-label="気をつけるポイント">
          <h3 className="h3">気をつけるポイント</h3>
          {alerts.map((al) => (
            <div key={al.title} className={'alert alert-' + al.level}>
              <Icon name={al.level === 'warn' ? 'alert' : 'info'} size={18} />
              <div>
                <p className="alert-title">{al.title}</p>
                <p className="alert-body">{al.body}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {STEPS.map((s, i) => {
        if (s.custom === 'summary') return null;
        if (s.custom === 'photos') {
          return (
            <section key={s.id} className="sum-sec">
              <div className="sum-head">
                <h3 className="h3">{s.title}</h3>
                <button type="button" className="btn-text" onClick={() => onEdit(i)}>
                  <Icon name="edit" size={15} />
                  直す
                </button>
              </div>
              <p className="sum-row">
                <span>撮った写真</span>
                <strong>{project.survey.photos.length}枚</strong>
              </p>
            </section>
          );
        }
        const qs = visibleQuestions(s, a);
        return (
          <section key={s.id} className="sum-sec">
            <div className="sum-head">
              <h3 className="h3">{s.title}</h3>
              <button type="button" className="btn-text" onClick={() => onEdit(i)}>
                <Icon name="edit" size={15} />
                直す
              </button>
            </div>
            {qs.map((q) => {
              const text = answerText(q, a[q.id]);
              if (!text && q.type === 'textarea') return null;
              return (
                <p key={q.id} className="sum-row">
                  <span>{q.label}</span>
                  {isAnswered(a[q.id]) ? <strong>{text}</strong> : <em>未入力</em>}
                </p>
              );
            })}
          </section>
        );
      })}

      <button type="button" className="btn" onClick={onPrint}>
        <Icon name="print" size={18} />
        現調シートを印刷・PDF保存
      </button>
    </div>
  );
}
