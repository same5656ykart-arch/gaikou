import { describe, expect, it } from 'vitest';
import { catalogOf, createItem } from '../src/lib/catalog';
import { canGenerate, generatePlan } from '../src/lib/planFromSurvey';
import { SAMPLE_ANSWERS } from '../src/lib/sample';
import { surveyAlerts } from '../src/lib/surveyDef';
import { moveEndpoint, moveItem, resizeRect, setLineLength, snap1, snapCandidates, snapSpan } from '../src/plan/geometry';
import type { Answers, Plan } from '../src/types';

const kinds = (p: Plan) => p.items.map((it) => it.kind);

describe('generatePlan', () => {
  it('敷地の幅と奥行がないと作れない', () => {
    expect(canGenerate({})).toBe(false);
    expect(canGenerate({ siteWidth: 10 })).toBe(false);
    expect(canGenerate({ siteWidth: 10, siteDepth: 15 })).toBe(true);
  });

  it('サンプルの現調から、要望した部材がそろう', () => {
    const p = generatePlan(SAMPLE_ANSWERS);
    expect(p.site).toEqual({ width: 12, depth: 16 });
    const ks = kinds(p);
    for (const k of ['house', 'concrete', 'car', 'carport', 'approach', 'gatepost', 'fence', 'lawn', 'gravel', 'deck', 'tree', 'light']) {
      expect(ks, k).toContain(k);
    }
    expect(ks.filter((k) => k === 'car')).toHaveLength(2);
    expect(ks.filter((k) => k === 'fence')).toHaveLength(3);
    const house = p.items.find((it) => it.kind === 'house')!;
    expect(house).toMatchObject({ x: 2, y: 6.5, w: 8, h: 7 });
  });

  it('面の部材はすべて敷地の中に収まる', () => {
    const cases: Answers[] = [
      SAMPLE_ANSWERS,
      { ...SAMPLE_ANSWERS, siteWidth: 6, siteDepth: 20, houseWidth: 5, houseDepth: 9, houseFront: 2, houseLeft: 0.5 },
      { ...SAMPLE_ANSWERS, siteWidth: 20, siteDepth: 8, houseWidth: 9, houseDepth: 6, houseFront: 1, houseLeft: 8, houseDoor: 'right' },
      { ...SAMPLE_ANSWERS, siteWidth: 9, siteDepth: 12, houseWidth: 8.5, houseDepth: 8, houseFront: 3, houseLeft: 0.2, carCount: '4', wants: ['parking', 'carport', 'approach', 'gatepost', 'fence', 'lawn', 'gravel', 'deck', 'plants', 'light', 'faucet', 'shed', 'cycleport'] },
      { siteWidth: 10, siteDepth: 15, wants: ['parking', 'approach', 'plants', 'shed', 'cycleport', 'faucet', 'light'] },
    ];
    for (const a of cases) {
      const p = generatePlan(a);
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
    const side = generatePlan({ siteWidth: 12, siteDepth: 14, houseWidth: 8, houseDepth: 8, houseFront: 2, houseLeft: 0.5, wants: ['parking'], carCount: '2' });
    const c1 = side.items.find((it) => it.kind === 'concrete')!;
    expect(c1.w).toBeLessThanOrEqual(3);
    expect(c1.h).toBeGreaterThanOrEqual(10);
    const parallel = generatePlan({ siteWidth: 12, siteDepth: 12, houseWidth: 11, houseDepth: 8, houseFront: 3, houseLeft: 0.5, wants: ['parking'], carCount: '1' });
    const c2 = parallel.items.find((it) => it.kind === 'concrete')!;
    expect(c2.w).toBe(6);
    expect(c2.h).toBe(2.6);
  });
});

describe('surveyAlerts', () => {
  it('高低差・乗り入れ・重機の注意を出す', () => {
    const titles = surveyAlerts({ levelDiff: 'high', curbCut: 'no', machineAccess: 'no', wants: ['parking'] }).map((a) => a.title);
    expect(titles).toContain('道路との高さの差が大きい');
    expect(titles).toContain('車の乗り入れ口がない');
    expect(titles).toContain('小型ショベルが入れない');
  });
  it('問題がなければ何も出さない', () => {
    expect(surveyAlerts({ levelDiff: 'flat', curbCut: 'yes', machineAccess: 'yes', boundaryMarks: 'all' })).toHaveLength(0);
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
