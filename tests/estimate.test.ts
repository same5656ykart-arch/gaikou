import { describe, expect, it } from 'vitest';
import { createItem } from '../src/lib/catalog';
import { buildEstimate, newEstimateState, roundQty, surveyQuantities } from '../src/lib/estimate';
import type { Plan, Settings } from '../src/types';

const settings: Settings = {
  company: { name: '', zip: '', address: '', tel: '', registrationNo: '', staff: '' },
  prices: {},
  taxRate: 10,
  overheadRate: 10,
};

function planWith(...items: ReturnType<typeof createItem>[]): Plan {
  return { site: { width: 10, depth: 15 }, roadWidth: 6, items };
}

function concrete(w: number, h: number) {
  const it = createItem('concrete', 5, 5, 'brush');
  it.w = w;
  it.h = h;
  return it;
}

describe('roundQty', () => {
  it('面積・長さは 0.1 単位で切り上げる', () => {
    expect(roundQty(29.61, 'm²')).toBe(29.7);
    expect(roundQty(29.7, 'm²')).toBe(29.7);
    expect(roundQty(16.5, 'm²')).toBe(16.5); // 3 × 5.5 の浮動小数の誤差で増えない
    expect(roundQty(0.30000000000000004, 'm')).toBe(0.3);
  });
  it('個数は整数にする', () => {
    expect(roundQty(2, '基')).toBe(2);
    expect(roundQty(3, '段')).toBe(3);
  });
});

describe('buildEstimate', () => {
  const est = newEstimateState(settings, 1);

  it('平面図の面積 × 単価で金額を出し、同じ仕様はまとめる', () => {
    const r = buildEstimate(planWith(concrete(3, 5.5), concrete(2, 2)), {}, est, settings);
    const line = r.lines.find((l) => l.id === 'plan:concrete:brush')!;
    expect(line.qty).toBe(20.5);
    expect(line.unitPrice).toBe(12000);
    expect(line.amount).toBe(246000);
  });

  it('小計 → 諸経費 → 消費税 の順に計算する', () => {
    const r = buildEstimate(planWith(concrete(3, 5.5), concrete(2, 2)), {}, est, settings);
    // コンクリート 246,000 + 重機回送 33,000
    expect(r.subtotal).toBe(279000);
    expect(r.overhead).toBe(27900);
    expect(r.net).toBe(306900);
    expect(r.tax).toBe(30690);
    expect(r.total).toBe(337590);
  });

  it('フェンスは長さで、下のブロックは面積で別に計上する', () => {
    const fence = createItem('fence', 5, 5, 'mesh');
    fence.x = 0;
    fence.y = 0;
    fence.x2 = 0;
    fence.y2 = 10;
    fence.props.baseRows = 2;
    const r = buildEstimate(planWith(fence), {}, est, settings);
    expect(r.lines.find((l) => l.id === 'plan:fence:mesh')!.qty).toBe(10);
    const block = r.lines.find((l) => l.id === 'plan:block:cb')!;
    expect(block.qty).toBe(4); // 10m × 2段(0.4m)
    expect(block.amount).toBe(54000);
    // フェンスだけなら重機回送は入らない
    expect(r.lines.some((l) => l.id === 'extra:machine')).toBe(false);
  });

  it('ブロック塀は 長さ × 高さ', () => {
    const b = createItem('block', 5, 5, 'deco');
    b.x = 0;
    b.x2 = 5;
    b.props.rows = 4;
    const r = buildEstimate(planWith(b), {}, est, settings);
    expect(r.lines.find((l) => l.id === 'plan:block:deco')!.qty).toBe(4);
  });

  it('建物と車は見積もりに入らない', () => {
    const r = buildEstimate(planWith(createItem('house', 5, 8), createItem('car', 5, 3)), {}, est, settings);
    expect(r.lines).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it('現調の撤去数量が見積もりに入る', () => {
    const answers = { existingBlock: 'remove', demoBlockLength: 10, demoBlockHeight: 1.2, demoTreeCount: 2, groundType: ['weeds'], weedArea: 30 };
    expect(surveyQuantities(answers)).toMatchObject({ demoBlock: 12, demoTree: 2, weeding: 30 });
    const r = buildEstimate(null, answers, est, settings);
    expect(r.lines.find((l) => l.id === 'extra:demoBlock')!.amount).toBe(12 * 7200);
    expect(r.lines.find((l) => l.id === 'extra:demoTree')!.amount).toBe(45000);
    expect(r.lines.some((l) => l.id === 'extra:machine')).toBe(true);
  });

  it('設定の単価表・行ごとの手入力・除外が反映される', () => {
    const plan = planWith(concrete(2, 5));
    const custom = { ...settings, prices: { 'concrete:brush': 10000 } };
    expect(buildEstimate(plan, {}, est, custom).lines[0].amount).toBe(100000);
    const overridden = { ...est, priceOverrides: { 'plan:concrete:brush': 9000 }, qtyOverrides: { 'plan:concrete:brush': 12 } };
    const r = buildEstimate(plan, {}, overridden, custom);
    expect(r.lines[0].amount).toBe(108000);
    expect(r.lines[0].autoQty).toBe(10);
    expect(r.lines[0].basePrice).toBe(10000);
    const excluded = buildEstimate(plan, {}, { ...est, excluded: ['plan:concrete:brush', 'extra:machine'] }, settings);
    expect(excluded.total).toBe(0);
  });

  it('値引きと手入力の行', () => {
    const e = { ...est, discount: 5000, overheadRate: 0, manual: [{ id: 'a', name: '桝の高さ調整', spec: '', qty: 2, unit: '箇所', unitPrice: 8000 }] };
    const r = buildEstimate(null, {}, e, settings);
    expect(r.subtotal).toBe(16000);
    expect(r.net).toBe(11000);
    expect(r.total).toBe(12100);
  });

  it('照明があればトランスを 1 式だけ足す', () => {
    const r = buildEstimate(planWith(createItem('light', 1, 1), createItem('light', 2, 2)), {}, est, settings);
    expect(r.lines.find((l) => l.id === 'plan:light:pole')!.qty).toBe(2);
    expect(r.lines.find((l) => l.id === 'extra:lightTrans')!.qty).toBe(1);
  });
});
