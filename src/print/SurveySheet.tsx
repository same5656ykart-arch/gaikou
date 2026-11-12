import type { PhotoRef, Project } from '../types';
import { isBaseItem } from '../lib/catalog';
import { existingSummary } from '../lib/existing';
import { jpDate } from '../lib/format';
import { usePhotoUrl } from '../lib/photos';
import { PHOTO_SLOTS, STEPS, answerText, isAnswered, surveyAlerts, visibleQuestions } from '../lib/surveyDef';
import { StaticPlan } from '../plan/PlanDrawing';

function Photo({ photo }: { photo: PhotoRef }) {
  const url = usePhotoUrl(photo.id);
  const label = PHOTO_SLOTS.find((s) => s.key === photo.slot)?.label ?? '';
  return (
    <figure className="sheet-photo">
      {url ? <img src={url} alt={label} /> : <div className="sheet-photo-empty" />}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/** 現地調査シート（A4）。社内での共有・確認用 */
export function SurveySheet({ project }: { project: Project }) {
  const a = project.survey.answers;
  const alerts = surveyAlerts(a);
  const photos = project.survey.photos;
  // 既存図には、これから作る部材は出さない
  const existing = { ...project.plan, items: project.plan.items.filter(isBaseItem) };
  // 写真は 1 ページに 6 枚
  const pages: PhotoRef[][] = [];
  for (let i = 0; i < photos.length; i += 6) pages.push(photos.slice(i, i + 6));

  return (
    <>
      <article className="paper">
        <header className="doc-head doc-head-sub">
          <h1 className="doc-title-sub">現地調査シート</h1>
          <p className="doc-sub-meta">
            {project.name}
            {typeof a.surveyDate === 'string' && a.surveyDate ? `　／　調査日 ${jpDate(a.surveyDate)}` : ''}
            {typeof a.surveyor === 'string' && a.surveyor ? `　／　調査 ${a.surveyor}` : ''}
          </p>
        </header>

        {alerts.length > 0 && (
          <section className="sheet-sec sheet-alerts">
            <h2>気をつけるポイント</h2>
            <ul>
              {alerts.map((al) => (
                <li key={al.title}>
                  <strong>{al.title}</strong>：{al.body}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="sheet-cols">
          <section className="sheet-sec">
            <h2>既存図</h2>
            <dl>
              {existingSummary(project.plan).map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
              {typeof a.existingNote === 'string' && a.existingNote && (
                <div>
                  <dt>メモ</dt>
                  <dd>{a.existingNote}</dd>
                </div>
              )}
            </dl>
          </section>
          {STEPS.filter((s) => !s.custom).map((s) => (
            <section key={s.id} className="sheet-sec">
              <h2>{s.title}</h2>
              <dl>
                {visibleQuestions(s, a).map((q) => {
                  const answered = isAnswered(a[q.id]);
                  if (!answered && q.type === 'textarea') return null;
                  return (
                    <div key={q.id}>
                      <dt>{q.label}</dt>
                      <dd>{answered ? answerText(q, a[q.id]) : '—'}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>
      </article>

      <article className="paper">
        <header className="doc-head doc-head-sub">
          <h1 className="doc-title-sub">既存図</h1>
          <p className="doc-sub-meta">{project.name}　／　いまの敷地・建物・いまあるもの（道路は図の下側。赤い点線は撤去するもの）</p>
        </header>
        <div className="doc-plan">
          <StaticPlan plan={existing} idp="sheet-" dims />
        </div>
        <p className="doc-caption">この図は現地調査の記録用の概略図です。</p>
      </article>

      {pages.map((page, i) => (
        <article key={i} className="paper">
          <header className="doc-head doc-head-sub">
            <h1 className="doc-title-sub">現地写真</h1>
            <p className="doc-sub-meta">
              {project.name}　／　{i + 1} / {pages.length}
            </p>
          </header>
          <div className="sheet-photos">
            {page.map((p) => (
              <Photo key={p.id} photo={p} />
            ))}
          </div>
        </article>
      ))}
    </>
  );
}
