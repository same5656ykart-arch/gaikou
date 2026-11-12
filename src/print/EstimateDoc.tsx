import type { Project, Settings } from '../types';
import type { Estimate } from '../lib/estimate';
import { addDays, jpDate, num, yen } from '../lib/format';
import { usePhotoUrl } from '../lib/photos';
import { StaticPlan } from '../plan/PlanDrawing';

interface Props {
  project: Project;
  settings: Settings;
  estimate: Estimate;
}

/** 見積書（A4）。2 枚目以降に平面図と 3D パースを添付する */
export function EstimateDoc({ project, settings, estimate }: Props) {
  const a = project.survey.answers;
  const est = project.estimate;
  const co = settings.company;
  const perspective = usePhotoUrl(project.perspectiveId);
  const customer = typeof a.customerName === 'string' && a.customerName ? a.customerName : '';
  let no = 0;

  return (
    <>
      <article className="paper">
        <header className="doc-head">
          <h1 className="doc-title">御 見 積 書</h1>
          <dl className="doc-meta">
            <div>
              <dt>見積番号</dt>
              <dd>{est.number}</dd>
            </div>
            <div>
              <dt>発行日</dt>
              <dd>{jpDate(est.date)}</dd>
            </div>
          </dl>
        </header>

        <div className="doc-parties">
          <div className="doc-to">
            <p className="doc-customer">
              {customer || '　　　　　　'} <span>様</span>
            </p>
            <dl className="doc-info">
              <div>
                <dt>件名</dt>
                <dd>{project.name}</dd>
              </div>
              <div>
                <dt>工事場所</dt>
                <dd>{typeof a.address === 'string' ? a.address : ''}</dd>
              </div>
              <div>
                <dt>有効期限</dt>
                <dd>
                  {jpDate(addDays(est.date, est.validDays))} まで（発行日より{est.validDays}日間）
                </dd>
              </div>
            </dl>
            <p className="doc-greeting">下記のとおりお見積り申し上げます。</p>
            <div className="doc-total">
              <span className="doc-total-label">御見積金額（税込）</span>
              <span className="doc-total-value">{yen(estimate.total)}−</span>
            </div>
          </div>
          <div className="doc-from">
            <p className="doc-company">{co.name || '（会社名は設定で入力）'}</p>
            {co.zip && <p>〒{co.zip}</p>}
            {co.address && <p>{co.address}</p>}
            {co.tel && <p>TEL {co.tel}</p>}
            {co.registrationNo && <p>登録番号 {co.registrationNo}</p>}
            {co.staff && <p>担当 {co.staff}</p>}
          </div>
        </div>

        <table className="doc-table">
          <thead>
            <tr>
              <th className="c-no">No.</th>
              <th className="c-name">名称</th>
              <th className="c-spec">仕様</th>
              <th className="c-qty">数量</th>
              <th className="c-unit">単位</th>
              <th className="c-price">単価</th>
              <th className="c-amount">金額</th>
            </tr>
          </thead>
          <tbody>
            {estimate.groups.map((g) => {
              const lines = g.lines.filter((l) => !l.excluded);
              if (lines.length === 0) return null;
              return [
                <tr key={g.work} className="doc-group">
                  <td />
                  <td colSpan={5}>{g.work}</td>
                  <td className="c-amount">{yen(g.subtotal)}</td>
                </tr>,
                ...lines.map((l) => (
                  <tr key={l.id}>
                    <td className="c-no">{++no}</td>
                    <td className="c-name">{l.name}</td>
                    <td className="c-spec">{l.spec}</td>
                    <td className="c-qty">{num(l.qty)}</td>
                    <td className="c-unit">{l.unit}</td>
                    <td className="c-price">{Math.round(l.unitPrice).toLocaleString('ja-JP')}</td>
                    <td className="c-amount">{Math.round(l.amount).toLocaleString('ja-JP')}</td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>

        <div className="doc-bottom">
          <div className="doc-note">
            <p className="doc-note-title">備考</p>
            <p className="doc-note-body">{est.note || '　'}</p>
          </div>
          <table className="doc-sums">
            <tbody>
              <tr>
                <th>小計</th>
                <td>{yen(estimate.subtotal)}</td>
              </tr>
              {estimate.overhead > 0 && (
                <tr>
                  <th>諸経費（{num(est.overheadRate)}%）</th>
                  <td>{yen(estimate.overhead)}</td>
                </tr>
              )}
              {estimate.discount > 0 && (
                <tr>
                  <th>お値引き</th>
                  <td>−{yen(estimate.discount)}</td>
                </tr>
              )}
              <tr>
                <th>合計（税抜）</th>
                <td>{yen(estimate.net)}</td>
              </tr>
              <tr>
                <th>消費税（{settings.taxRate}%）</th>
                <td>{yen(estimate.tax)}</td>
              </tr>
              <tr className="doc-grand">
                <th>合計（税込）</th>
                <td>{yen(estimate.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article className="paper">
        <header className="doc-head doc-head-sub">
          <h1 className="doc-title-sub">平面図</h1>
          <p className="doc-sub-meta">
            {project.name}　／　敷地 {num(project.plan.site.width)}m × {num(project.plan.site.depth)}m（道路は図の下側）
          </p>
        </header>
        <div className="doc-plan">
          <StaticPlan plan={project.plan} idp="print-" />
        </div>
        <p className="doc-caption">この図は打ち合わせ用の概略図です。実際の寸法は現地での実測によります。</p>
      </article>

      {perspective && (
        <article className="paper">
          <header className="doc-head doc-head-sub">
            <h1 className="doc-title-sub">完成イメージ</h1>
            <p className="doc-sub-meta">{project.name}</p>
          </header>
          <img className="doc-persp" src={perspective} alt="完成イメージの3Dパース" />
          <p className="doc-caption">完成イメージは色・形・大きさが実際と異なる場合があります。</p>
        </article>
      )}
    </>
  );
}
