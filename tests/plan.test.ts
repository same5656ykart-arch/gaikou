import { describe, expect, it } from 'vitest';
import { catalogOf, createItem, isBaseItem } from '../src/lib/catalog';
import { PATTERNS, addExisting, boundaryState, existingSummary, hasProposal, houseOf, planFromPattern, resizeSite, setBoundary } from '../src/lib/existing';
import { migrateProject, migrateSettings } from '../src/lib/migrate';
import { generatePlan } from '../src/lib/planFromSurvey';
import { SAMPLE_ANSWERS, makeSampleProject, sampleExistingPlan } from '../src/lib/sample';
import { STEPS, stepProgress, surveyAlerts } from '../src/lib/surveyDef';
import { moveEndpoint, moveItem, resizeRect, setLineLength, snap1, snapCandidates, snapSpan } from '../src/plan/geometry';
import type { Answers, Plan, Project, Settings } from '../src/types';

const kinds = (p: Plan) => p.items.map((it) => it.kind);

const settings: Settings = {
  company: { name: '', zip: '', address: '', tel: '', registrationNo: '', staff: '' },
  prices: {},
  taxRate: 10,
  overheadRate: 10,
};

/** 敷地と建物だけの既存図 */
function base(W: number, D: number, house: { x: number; y: number; w: number; h: number } | null, door = 'center'): Plan {
  const items = [];
  if (house) {
    const h = createItem('house', 0, 0);
    items.push({ ...h, ...house, props: { ...h.props, door } });
  }
  return { site: { width: W, depth: D }, roadWidth: 6, items };
}

describe('既存図のパターン', () => {
  it('どのパターンも、建物が敷地の中に入っている', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(5);
    for (const p of PATTERNS) {
      const plan = planFromPattern(p);
      const h = houseOf(plan)!;
      expect(kinds(plan), p.key).toEqual(['house']);
      expect(h.x, p.key).toBeGreaterThanOrEqual(0);
      expect(h.y, p.key).toBeGreaterThanOrEqual(0);
      expect(h.x + h.w, p.key).toBeLessThanOrEqual(plan.site.width);
      expect(h.y + h.h, p.key).toBeLessThanOrEqual(plan.site.depth);
      expect(h.props.floors).toBe(p.floors);
      expect(hasProposal(plan)).toBe(false);
    }
  });

  it('どのパターンからでも、ご要望どおりに自動で配置できる', () => {
    for (const p of PATTERNS) {
      const plan = generatePlan(planFromPattern(p), SAMPLE_ANSWERS);
      expect(hasProposal(plan), p.key).toBe(true);
      expect(kinds(plan), p.key).toContain('fence');
      // 車を停める場所がどのパターンでも作られる
      expect(kinds(plan), p.key).toContain('concrete');
    }
  });
});

describe('境界にあるもの', () => {
  const plan = planFromPattern(PATTERNS[0]); // 10 × 15

  it('辺を選ぶと、端から端まで置かれる', () => {
    const p = setBoundary(plan, 'left', 'block', false);
    const wall = p.items.find((it) => it.kind === 'exBlock')!;
    expect(wall).toMatchObject({ x: 0, y: 0, x2: 0, y2: 15, variant: 'keep' });
    expect(boundaryState(p, 'left')).toEqual({ type: 'block', remove: false });
    expect(boundaryState(p, 'right')).toEqual({ type: 'none', remove: false });
  });

  it('種類を変えると置き換わり、撤去の切り替えは高さを保つ', () => {
    let p = setBoundary(plan, 'back', 'both', false);
    expect(boundaryState(p, 'back').type).toBe('both');
    expect(p.items.filter((it) => it.kind === 'exFence')).toHaveLength(1);
    p = { ...p, items: p.items.map((it) => (it.kind === 'exFence' ? { ...it, props: { ...it.props, baseRows: 4 } } : it)) };
    p = setBoundary(p, 'back', 'both', true);
    expect(boundaryState(p, 'back')).toEqual({ type: 'both', remove: true });
    expect(p.items.find((it) => it.kind === 'exFence')!.props.baseRows).toBe(4);
    p = setBoundary(p, 'back', 'none', false);
    expect(p.items.some((it) => it.kind === 'exFence' || it.kind === 'exBlock')).toBe(false);
  });

  it('敷地の大きさを変えると、境界の塀もいっしょに動く', () => {
    let p = setBoundary(plan, 'right', 'fence', false);
    p = setBoundary(p, 'back', 'block', false);
    p = resizeSite(p, 12, 18);
    expect(p.site).toEqual({ width: 12, depth: 18 });
    expect(p.items.find((it) => it.kind === 'exFence')).toMatchObject({ x: 12, y: 0, x2: 12, y2: 18 });
    expect(p.items.find((it) => it.kind === 'exBlock')).toMatchObject({ x: 0, y: 18, x2: 12, y2: 18 });
    expect(boundaryState(p, 'right').type).toBe('fence');
    // 建物は動かない
    expect(houseOf(p)).toMatchObject({ x: 1.2, y: 6.2 });
  });

  it('いまあるものを足すと、敷地の中に置かれる', () => {
    let p = plan;
    for (const kind of ['exTree', 'masu', 'meter', 'exConcrete', 'exShed', 'exBlock', 'exTree', 'exTree']) {
      const res = addExisting(p, kind);
      p = res.plan;
      const it = p.items.find((x) => x.id === res.id)!;
      expect(it.kind).toBe(kind);
      expect(it.x, kind).toBeGreaterThanOrEqual(0);
      expect(it.y, kind).toBeGreaterThanOrEqual(0);
      expect(it.x, kind).toBeLessThanOrEqual(10);
      expect(it.y, kind).toBeLessThanOrEqual(15);
    }
    // 同じ種類を続けて置いても重ならない
    const trees = p.items.filter((it) => it.kind === 'exTree');
    expect(new Set(trees.map((t) => t.x)).size).toBe(3);
  });

  it('まとめに、敷地・建物・境界・そのほかが出る', () => {
    const rows = existingSummary(sampleExistingPlan());
    const get = (label: string) => rows.find((r) => r.label === label)?.value;
    expect(get('敷地（間口 × 奥行）')).toContain('12.0m × 16.0m');
    expect(get('建物（幅 × 奥行）')).toContain('2階建て');
    expect(get('道路から建物まで')).toBe('6.5m');
    expect(get('奥の境界')).toBe('ブロック塀・ブロック3段（0.6m）（残す）');
    expect(get('既存の木')).toBe('1か所（うち撤去 1）');
    expect(get('汚水の桝')).toBe('1か所');
  });
});

describe('generatePlan', () => {
  it('既存図（建物・いまあるもの）は残し、その上に要望した部材を置く', () => {
    const existing = sampleExistingPlan();
    const p = generatePlan(existing, SAMPLE_ANSWERS);
    expect(p.site).toEqual({ width: 12, depth: 16 });
    expect(p.items.filter(isBaseItem)).toEqual(existing.items);
    const ks = kinds(p);
    for (const k of ['house', 'concrete', 'car', 'carport', 'approach', 'gatepost', 'fence', 'lawn', 'gravel', 'deck', 'tree', 'light']) {
      expect(ks, k).toContain(k);
    }
    expect(ks.filter((k) => k === 'car')).toHaveLength(2);
    expect(ks.filter((k) => k === 'house')).toHaveLength(1);
  });

  it('作り直しても、既存図は変わらず、提案だけが入れ替わる', () => {
    const first = generatePlan(sampleExistingPlan(), SAMPLE_ANSWERS);
    const again = generatePlan(first, { ...SAMPLE_ANSWERS, wants: ['parking'], carCount: '1' });
    expect(again.items.filter(isBaseItem)).toEqual(first.items.filter(isBaseItem));
    expect(kinds(again).filter((k) => !['house', 'exBlock', 'exTree', 'masu', 'meter'].includes(k)).sort()).toEqual(['car', 'concrete']);
  });

  it('既存のブロックを残す辺はその上にフェンスを付け、既存のフェンスを残す辺には付けない', () => {
    let existing = planFromPattern(PATTERNS[0]);
    existing = setBoundary(existing, 'left', 'block', false); // 残すブロック → 上にフェンス
    existing = setBoundary(existing, 'back', 'fence', false); // 残すフェンス → 付けない
    existing = setBoundary(existing, 'right', 'both', true); // 撤去 → ブロックから新設
    const p = generatePlan(existing, { wants: ['fence'], fenceSides: ['left', 'back', 'right'] });
    const fences = p.items.filter((it) => it.kind === 'fence');
    expect(fences).toHaveLength(2);
    expect(fences.find((f) => f.x === 0 && f.x2 === 0)!.props.baseRows).toBe(0);
    expect(fences.find((f) => f.x === 10 && f.x2 === 10)!.props.baseRows).toBe(2);
  });

  it('面の部材はすべて敷地の中に収まる', () => {
    const all: Answers = { ...SAMPLE_ANSWERS, carCount: '4', wants: ['parking', 'carport', 'approach', 'gatepost', 'fence', 'lawn', 'gravel', 'deck', 'plants', 'light', 'faucet', 'shed', 'cycleport'] };
    const cases: [Plan, Answers][] = [
      [sampleExistingPlan(), SAMPLE_ANSWERS],
      [base(6, 20, { x: 0.5, y: 2, w: 5, h: 9 }), SAMPLE_ANSWERS],
      [base(20, 8, { x: 8, y: 1, w: 9, h: 6 }, 'right'), SAMPLE_ANSWERS],
      [base(9, 12, { x: 0.2, y: 3, w: 8.5, h: 8 }), all],
      [base(10, 15, null), all],
      ...PATTERNS.map((p): [Plan, Answers] => [planFromPattern(p), all]),
    ];
    for (const [existing, a] of cases) {
      const p = generatePlan(existing, a);
      const W = p.site.width;
      const D = p.site.depth;
      for (const it of p.items) {
        const shape = catalogOf(it.kind).shape;
        if (shape === 'rect') {
          expect(it.w, it.kind).toBeGreaterThan(0);
          expect(it.h, it.kind).toBeGreaterThan(0);
          expect(it.x, it.kind).toBeGreaterThanOrEqual(-0.001);
          expect(it.y, it.kind).toBeGreaterThanOrEqual(-0.001);
          expect(it.x + it.w, it.kind).toBeLessThanOrEqual(W + 0.001);
          expect(it.y + it.h, it.kind).toBeLessThanOrEqual(D + 0.001);
        } else if (shape === 'point') {
          expect(it.x, it.kind).toBeGreaterThan(0);
          expect(it.x, it.kind).toBeLessThan(W);
          expect(it.y, it.kind).toBeGreaterThan(0);
          expect(it.y, it.kind).toBeLessThan(D);
        }
      }
    }
  });

  it('建物の手前がせまいときは、建物の横か道路沿いに駐車する', () => {
    const side = generatePlan(base(12, 14, { x: 0.5, y: 2, w: 8, h: 8 }), { wants: ['parking'], carCount: '2' });
    const c1 = side.items.find((it) => it.kind === 'concrete')!;
    expect(c1.w).toBeLessThanOrEqual(3);
    expect(c1.h).toBeGreaterThanOrEqual(10);
    const parallel = generatePlan(base(12, 12, { x: 0.5, y: 3, w: 11, h: 8 }), { wants: ['parking'], carCount: '1' });
    const c2 = parallel.items.find((it) => it.kind === 'concrete')!;
    expect(c2.w).toBe(6);
    expect(c2.h).toBe(2.6);
  });
});

describe('現調', () => {
  it('「工事のしやすさ」はなく、既存図のステップがある', () => {
    expect(STEPS.map((s) => s.title)).toEqual(['お客様', '既存図', '道路・高さ', '地面', '設備の位置', 'ご要望', '写真', 'まとめ']);
  });

  it('既存図は、確かめたら完了になる', () => {
    const step = STEPS.find((s) => s.custom === 'existing')!;
    expect(stepProgress(step, {})).toEqual({ done: 0, total: 1 });
    expect(stepProgress(step, { siteChecked: 'yes' })).toEqual({ done: 1, total: 1 });
  });

  it('高低差・乗り入れ・ブロックの傷みの注意を出す', () => {
    const titles = surveyAlerts({ levelDiff: 'high', curbCut: 'no', blockCondition: 'damaged', wants: ['parking'] }).map((a) => a.title);
    expect(titles).toContain('道路との高さの差が大きい');
    expect(titles).toContain('車の乗り入れ口がない');
    expect(titles).toContain('既存ブロック塀にひび・傾きがある');
  });

  it('問題がなければ何も出さない', () => {
    expect(surveyAlerts({ levelDiff: 'flat', curbCut: 'yes', boundaryMarks: 'all' })).toHaveLength(0);
  });
});

describe('以前の版のデータの移行', () => {
  const sample = makeSampleProject(settings);

  it('いまの形のデータはそのまま', () => {
    expect(migrateProject(sample, {})).toBe(sample);
  });

  it('平面図がない案件は、回答の寸法から既存図を作る', () => {
    const old = {
      ...sample,
      plan: null,
      survey: { answers: { customerName: '佐藤', siteWidth: 9.5, siteDepth: 14, houseWidth: 7, houseDepth: 6.5, houseFront: 5.5, houseLeft: 1, houseDoor: 'right', houseFloors: '1', roadWidth: 4 }, photos: [] },
    } as unknown as Project;
    const p = migrateProject(old, {});
    expect(p.plan.site).toEqual({ width: 9.5, depth: 14 });
    expect(p.plan.roadWidth).toBe(4);
    expect(houseOf(p.plan)).toMatchObject({ x: 1, y: 5.5, w: 7, h: 6.5 });
    expect(houseOf(p.plan)!.props).toMatchObject({ floors: 1, door: 'right' });
    expect(p.survey.answers.siteWidth).toBeUndefined();
    expect(p.survey.answers.siteChecked).toBe('yes');
    expect(p.survey.answers.customerName).toBe('佐藤');
    // 何も入っていなかった案件は標準のパターンから
    const empty = migrateProject({ ...sample, plan: null, survey: { answers: { machineAccess: 'no' }, photos: [] } } as unknown as Project, {});
    expect(empty.plan.site).toEqual({ width: 10, depth: 15 });
    expect(empty.survey.answers.machineAccess).toBeUndefined();
  });

  it('数字で答えてあった撤去は、見積の手入力行に移して金額を保つ', () => {
    const old: Project = {
      ...sample,
      survey: { answers: { ...sample.survey.answers, existingBlock: 'remove', demoBlockLength: 10, demoBlockHeight: 1.2, demoTreeCount: 2 }, photos: [] },
    };
    const p = migrateProject(old, { demoTree: 20000 });
    expect(p.plan).toBe(old.plan);
    const added = p.estimate.manual.slice(old.estimate.manual.length);
    expect(added.map((m) => [m.name, m.qty, m.unit, m.unitPrice])).toEqual([
      ['既存ブロック塀 解体・処分', 12, 'm²', 7200],
      ['樹木 伐採・抜根・処分', 2, '本', 20000],
    ]);
    // 2 回目は何も足さない
    expect(migrateProject(p, {})).toBe(p);
  });

  it('単価表のキーを新しい名前に移す', () => {
    const s = migrateSettings({ ...settings, prices: { demoBlock: 8000, 'concrete:brush': 11000 } });
    expect(s.prices).toEqual({ 'exBlock:remove': 8000, 'concrete:brush': 11000 });
    expect(migrateSettings(settings)).toBe(settings);
  });
});

describe('平面図の編集', () => {
  const plan: Plan = { site: { width: 10, depth: 15 }, roadWidth: 6, items: [] };
  const house = createItem('house', 5, 9);
  plan.items.push(house); // x 1..9, y 5.5..12.5
  const c = snapCandidates(plan, 'other');

  it('近くの端には吸着し、遠ければ 10cm 刻みに丸める', () => {
    expect(snap1(0.12, c.xs, 0.2)).toBe(0);
    expect(snap1(3.37, c.xs, 0.2)).toBe(3.4);
    expect(snapSpan(6.9, 3, c.xs, 0.2)).toBe(7); // 右端が敷地の右(10)に付く
  });

  it('移動：敷地の角に吸着する', () => {
    const it = createItem('concrete', 3, 3); // 3×5.5
    const moved = moveItem(it, -1.45, -0.2, c, 0.2);
    expect(moved.x).toBe(0);
    expect(moved.y).toBe(0);
    expect(moved.w).toBe(3);
  });

  it('サイズ変更：反対側の辺は動かず、つぶれない', () => {
    const it = createItem('concrete', 3, 3);
    const r = resizeRect({ ...it, x: 0, y: 0 }, 'ne', 4.21, 5.33, c, 0.05);
    expect(r).toMatchObject({ x: 0, y: 0, w: 4.2, h: 5.3 });
    const tiny = resizeRect({ ...it, x: 0, y: 0 }, 'e', -3, 0, c, 0.05);
    expect(tiny.w).toBe(0.2);
  });

  it('線：端点はもう一方とそろう位置に吸着し、長さを数値で変えられる', () => {
    const f = createItem('fence', 5, 2); // (3,2)-(7,2)
    const moved = moveEndpoint(f, 2, 6.9, 2.08, c, 0.15);
    expect(moved.y2).toBe(2);
    expect(moved.x2).toBe(6.9);
    const longer = setLineLength(f, 6.5);
    expect(longer.x2).toBe(9.5);
    expect(longer.y2).toBe(2);
  });
});
