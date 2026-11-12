import { useEffect, useRef, useState } from 'react';
import type { AnswerValue, Answers, PhotoRef, Project, Tab } from '../types';
import { existingSummary, hasProposal } from '../lib/existing';
import { clamp, uid } from '../lib/format';
import { deletePhoto, resizeImage, savePhoto, usePhotoUrl } from '../lib/photos';
import { generatePlan } from '../lib/planFromSurvey';
import { PHOTO_SLOTS, STEPS, answerText, isAnswered, stepProgress, surveyAlerts, visibleQuestions } from '../lib/surveyDef';
import type { Question, Step } from '../lib/surveyDef';
import { PlanEditor } from '../plan/PlanScreen';
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
  const [index, setIndex] = useState(() => Math.min(lastStep.get(project.id) ?? 0, STEPS.length - 1));
  const [printing, setPrinting] = useState(false);
  const a = project.survey.answers;
  const step = STEPS[index];
  const scroller = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const proposed = hasProposal(project.plan);

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
      // 道路の幅は図と 3D にも使うので、平面図にも反映する
      const plan = id === 'roadWidth' && typeof v === 'number' ? { ...p.plan, roadWidth: clamp(v, 2, 20) } : p.plan;
      return { ...p, plan, survey: { ...p.survey, answers } };
    });
  };

  /** ステップを移る。既存図から先へ進んだら、既存図は確認済みとする */
  const go = (next: number) => {
    if (step.custom === 'existing' && next > index && a.siteChecked !== 'yes') setAnswer('siteChecked', 'yes');
    setIndex(next);
  };

  const makePlan = async () => {
    const wants = Array.isArray(a.wants) ? a.wants : [];
    if (wants.length === 0) {
      toast('先に「ご要望」でやりたい工事を選んでください');
      setIndex(STEPS.findIndex((s) => s.id === 'wants'));
      return;
    }
    if (proposed) {
      const ok = await confirmDialog({
        title: '平面図を作り直しますか？',
        body: '追加した部材を消して、現調のご要望から置き直します。建物と既存のものはそのまま残ります。',
        okLabel: '作り直す',
        danger: true,
      });
      if (!ok) return;
    }
    updateProject(project.id, (p) => ({ ...p, plan: generatePlan(p.plan, p.survey.answers) }));
    toast('ご要望から平面図を自動で作成しました');
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
              onClick={() => go(i)}
            >
              <span className="step-chip-num">{complete ? <Icon name="check" size={13} /> : i + 1}</span>
              {s.title}
            </button>
          );
        })}
      </div>

      {step.custom === 'existing' ? (
        // 既存図は図を広く使うので、スクロールさせずに図＋パネルの配置にする
        <div className="survey-fill">
          <PlanEditor project={project} mode="existing" onGo={onGo} stepLabel={`ステップ ${index + 1} / ${STEPS.length}`} />
        </div>
      ) : (
        <div className="survey-scroll" ref={scroller}>
          <div className="survey-inner">
            <div className="step-head">
              <p className="eyebrow">
                ステップ {index + 1} / {STEPS.length}
              </p>
              <h2 className="h1">{step.title}</h2>
              <p className="lead">{step.lead}</p>
            </div>

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
      )}

      <div className="survey-nav">
        <button type="button" className="btn" disabled={index === 0} onClick={() => go(index - 1)}>
          <Icon name="back" size={18} />
          戻る
        </button>
        {index < STEPS.length - 1 ? (
          <button type="button" className="btn btn-primary" onClick={() => go(index + 1)}>
            次へ
            <Icon name="next" size={18} />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => (proposed ? onGo('plan') : void makePlan())}>
            {proposed ? '平面図へ' : '平面図を自動作成'}
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
  const plan = project.plan;
  const proposed = hasProposal(plan);

  return (
    <div className="summary">
      <div className="cta-card">
        {proposed ? (
          <>
            <p className="cta-text">平面図は作成済みです。ご要望を変えたときは、作り直すと反映されます（建物と既存のものはそのまま残ります）。</p>
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
            <p className="cta-text">既存図とご要望から、平面図・3D・見積もりのたたき台を自動で作ります。</p>
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
        if (s.custom === 'existing') {
          return (
            <section key={s.id} className="sum-sec">
              <div className="sum-head">
                <h3 className="h3">{s.title}</h3>
                <button type="button" className="btn-text" onClick={() => onEdit(i)}>
                  <Icon name="edit" size={15} />
                  直す
                </button>
              </div>
              {existingSummary(plan).map((r) => (
                <p key={r.label} className="sum-row">
                  <span>{r.label}</span>
                  <strong>{r.value}</strong>
                </p>
              ))}
              {a.siteChecked !== 'yes' && (
                <p className="sum-row">
                  <span>大きさの確認</span>
                  <em>まだ（パターンのまま）</em>
                </p>
              )}
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
