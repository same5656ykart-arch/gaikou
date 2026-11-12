import type { PhotoRef, Project } from '../types';
import { jpDate } from '../lib/format';
import { usePhotoUrl } from '../lib/photos';
import { PHOTO_SLOTS, STEPS, answerText, isAnswered, surveyAlerts, visibleQuestions } from '../lib/surveyDef';

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
          {STEPS.filter((s) => !s.custom || s.custom === 'size').map((s) => (
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
