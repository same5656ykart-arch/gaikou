import type { Answers, ManualLine, Plan, Project, Settings } from '../types';
import { createItem } from './catalog';
import { roundQty } from './estimate';
import { patternOf, planFromPattern } from './existing';
import { clamp, uid } from './format';

// 以前の版で保存したデータを、いまの形に合わせる。
// - 以前は敷地・建物の寸法を現調の回答（A〜F）として持ち、平面図は後から作っていた。
//   いまは案件を作った時点で、建物入りの既存図（plan）を持つ。
// - 以前は撤去するものを数字で答えていた。いまは既存図に置いたものから計算するので、
//   答えてあった分は見積の手入力行に移して、金額が消えないようにする。

function num(v: unknown): number | undefined {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : undefined;
}

function planFromOldAnswers(a: Answers): Plan {
  const W = clamp(num(a.siteWidth) ?? 10, 2, 80);
  const D = clamp(num(a.siteDepth) ?? 15, 2, 80);
  if (num(a.siteWidth) === undefined || num(a.siteDepth) === undefined) {
    const plan = planFromPattern(patternOf('standard'), clamp(num(a.roadWidth) ?? 6, 2, 20));
    return plan;
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const hw = clamp(num(a.houseWidth) ?? r1(W * 0.65), 2, W);
  const hd = clamp(num(a.houseDepth) ?? r1(D * 0.45), 2, D);
  const hy = clamp(num(a.houseFront) ?? r1(Math.min(6, (D - hd) * 0.7)), 0, D - hd);
  const hx = clamp(num(a.houseLeft) ?? r1((W - hw) / 2), 0, W - hw);
  const house = createItem('house', 0, 0);
  const door = a.houseDoor === 'left' || a.houseDoor === 'right' ? a.houseDoor : 'center';
  return {
    site: { width: W, depth: D },
    roadWidth: clamp(num(a.roadWidth) ?? 6, 2, 20),
    items: [{ ...house, x: hx, y: hy, w: hw, h: hd, props: { ...house.props, floors: clamp(num(a.houseFloors) ?? 2, 1, 3), door } }],
  };
}

const OLD_KEYS = [
  'siteWidth',
  'siteDepth',
  'houseWidth',
  'houseDepth',
  'houseFront',
  'houseLeft',
  'houseDoor',
  'houseFloors',
  'existingBlock',
  'demoBlockLength',
  'demoBlockHeight',
  'existingFence',
  'demoFenceLength',
  'demoConcreteArea',
  'demoTreeCount',
  'demoShedCount',
  'truckParking',
  'machineAccess',
  'neighbors',
  'overhead',
];

/** 以前の単価表のキー → いまのキー */
const OLD_PRICE_KEYS: Record<string, string> = {
  demoBlock: 'exBlock:remove',
  demoFence: 'exFence:remove',
  demoConcrete: 'exConcrete:remove',
  demoTree: 'exTree:remove',
  demoShed: 'exShed:remove',
};

export function migrateSettings(s: Settings): Settings {
  if (!Object.keys(OLD_PRICE_KEYS).some((k) => k in s.prices)) return s;
  const prices = { ...s.prices };
  for (const [from, to] of Object.entries(OLD_PRICE_KEYS)) {
    if (from in prices) {
      if (!(to in prices)) prices[to] = prices[from];
      delete prices[from];
    }
  }
  return { ...s, prices };
}

export function migrateProject(p: Project, prices: Record<string, number>): Project {
  const a = p.survey.answers;
  const old = OLD_KEYS.some((k) => a[k] !== undefined);
  // plan は以前の版では null のことがあった
  const stored = p.plan as Plan | null | undefined;
  if (stored && !old) return p;

  const manual: ManualLine[] = [];
  const add = (name: string, qty: number, unit: string, priceKey: string, fallback: number) => {
    if (qty > 0) manual.push({ id: uid(), name, spec: '現調の回答から', qty: roundQty(qty, unit), unit, unitPrice: prices[priceKey] ?? fallback });
  };
  if (a.existingBlock === 'remove') add('既存ブロック塀 解体・処分', (num(a.demoBlockLength) ?? 0) * (num(a.demoBlockHeight) ?? 0), 'm²', 'demoBlock', 7200);
  if (a.existingFence === 'remove') add('既存フェンス 撤去・処分', num(a.demoFenceLength) ?? 0, 'm', 'demoFence', 2600);
  add('既存コンクリート はつり・処分', num(a.demoConcreteArea) ?? 0, 'm²', 'demoConcrete', 5600);
  add('樹木 伐採・抜根・処分', num(a.demoTreeCount) ?? 0, '本', 'demoTree', 22500);
  add('既存物置 解体・処分', num(a.demoShedCount) ?? 0, '台', 'demoShed', 31000);

  const answers: Answers = { ...a };
  for (const k of OLD_KEYS) delete answers[k];
  // 寸法を入れてあった案件は、既存図を確認済みとして扱う
  if (num(a.siteWidth) !== undefined && num(a.siteDepth) !== undefined) answers.siteChecked = 'yes';

  return {
    ...p,
    survey: { ...p.survey, answers },
    plan: stored ?? planFromOldAnswers(a),
    estimate: { ...p.estimate, manual: [...p.estimate.manual, ...manual] },
  };
}
