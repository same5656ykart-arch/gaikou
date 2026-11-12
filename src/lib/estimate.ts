import type { Answers, EstimateState, Plan, Project, Settings } from '../types';
import {
  BLOCK_ROW_HEIGHT,
  CATALOG,
  EXTRA_PRICES,
  WORKS,
  catalogOf,
  extraPrice,
  hasKind,
  itemQty,
  lineLength,
  priceKey,
  unitPrice,
  variantOf,
} from './catalog';
import { todayISO } from './format';

export interface EstimateLine {
  /** 行の ID。平面図由来は 'plan:kind:variant'、現調由来は 'extra:key'、手入力は 'manual:id' */
  id: string;
  source: 'plan' | 'survey' | 'auto' | 'manual';
  work: string;
  name: string;
  spec: string;
  qty: number;
  /** 自動計算された数量（手入力で上書きされている場合の比較用） */
  autoQty: number;
  unit: string;
  unitPrice: number;
  /** 設定・カタログ上の単価（手入力で上書きされている場合の比較用） */
  basePrice: number;
  amount: number;
  excluded: boolean;
  includes?: string;
}

export interface EstimateGroup {
  work: string;
  lines: EstimateLine[];
  subtotal: number;
}

export interface Estimate {
  lines: EstimateLine[];
  groups: EstimateGroup[];
  subtotal: number;
  overhead: number;
  discount: number;
  /** 税抜合計 */
  net: number;
  tax: number;
  total: number;
}

const COUNT_UNITS = new Set(['段', '基', '台', '本', '株', '箇所', '式']);

/** 面積・長さは 0.1 単位で切り上げ、個数は整数 */
export function roundQty(qty: number, unit: string): number {
  if (COUNT_UNITS.has(unit)) return Math.round(qty);
  return Math.ceil(qty * 10 - 1e-6) / 10;
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/** 現調の回答から、撤去などの数量を取り出す */
export function surveyQuantities(a: Answers): Record<string, number> {
  const q: Record<string, number> = {};
  if (a.existingBlock === 'remove') q.demoBlock = n(a.demoBlockLength) * n(a.demoBlockHeight);
  if (a.existingFence === 'remove') q.demoFence = n(a.demoFenceLength);
  q.demoConcrete = n(a.demoConcreteArea);
  q.demoTree = n(a.demoTreeCount);
  q.demoShed = n(a.demoShedCount);
  if (Array.isArray(a.groundType) && a.groundType.includes('weeds')) q.weeding = n(a.weedArea);
  return q;
}

interface RawLine {
  id: string;
  source: EstimateLine['source'];
  work: string;
  name: string;
  spec: string;
  qty: number;
  unit: string;
  basePrice: number;
  includes?: string;
}

function planLines(plan: Plan | null, prices: Record<string, number>): RawLine[] {
  if (!plan) return [];
  const sums = new Map<string, { kind: string; variant: string; qty: number }>();
  const add = (kind: string, variant: string, qty: number) => {
    if (qty <= 0) return;
    const k = priceKey(kind, variant);
    const cur = sums.get(k);
    if (cur) cur.qty += qty;
    else sums.set(k, { kind, variant, qty });
  };
  for (const it of plan.items) {
    if (!hasKind(it.kind)) continue;
    const c = catalogOf(it.kind);
    if (c.qty === 'none') continue;
    add(it.kind, variantOf(it.kind, it.variant).key, itemQty(it));
    // フェンスの下のブロックは普通ブロックとして別計上
    if (it.kind === 'fence') {
      const rows = n(it.props.baseRows);
      if (rows > 0) add('block', 'cb', lineLength(it) * rows * BLOCK_ROW_HEIGHT);
    }
  }
  const out: RawLine[] = [];
  // カタログの並び順で出す
  for (const c of CATALOG) {
    for (const v of c.variants) {
      const s = sums.get(priceKey(c.key, v.key));
      if (!s) continue;
      out.push({
        id: `plan:${c.key}:${v.key}`,
        source: 'plan',
        work: c.work,
        name: c.name,
        spec: v.name,
        qty: s.qty,
        unit: c.unit,
        basePrice: unitPrice(prices, c.key, v.key),
        includes: c.includes,
      });
    }
  }
  return out;
}

function extraLine(key: string, qty: number, source: RawLine['source'], prices: Record<string, number>): RawLine {
  const e = EXTRA_PRICES.find((x) => x.key === key)!;
  return {
    id: `extra:${key}`,
    source,
    work: e.work,
    name: e.name,
    spec: e.spec,
    qty,
    unit: e.unit,
    basePrice: extraPrice(prices, key),
  };
}

/** 重機を使う工事（土を動かす・基礎を作る）が含まれるか */
const MACHINE_KINDS = new Set(['concrete', 'asphalt', 'paving', 'tile', 'approach', 'steps', 'block', 'carport']);

export function buildEstimate(
  plan: Plan | null,
  answers: Answers,
  est: EstimateState,
  settings: Settings,
): Estimate {
  const raw: RawLine[] = [];
  const sq = surveyQuantities(answers);
  for (const key of ['demoBlock', 'demoFence', 'demoConcrete', 'demoTree', 'demoShed', 'weeding']) {
    if ((sq[key] ?? 0) > 0) raw.push(extraLine(key, sq[key], 'survey', settings.prices));
  }
  const pl = planLines(plan, settings.prices);
  raw.push(...pl);
  if (plan?.items.some((it) => it.kind === 'light')) {
    raw.push(extraLine('lightTrans', 1, 'auto', settings.prices));
  }
  const needsMachine =
    (plan?.items.some((it) => MACHINE_KINDS.has(it.kind)) ?? false) ||
    (sq.demoBlock ?? 0) > 0 ||
    (sq.demoConcrete ?? 0) > 0;
  if (needsMachine) raw.push(extraLine('machine', 1, 'auto', settings.prices));

  for (const m of est.manual) {
    raw.push({
      id: `manual:${m.id}`,
      source: 'manual',
      work: 'その他',
      name: m.name || '（名称未入力）',
      spec: m.spec,
      qty: m.qty,
      unit: m.unit,
      basePrice: m.unitPrice,
    });
  }

  const excluded = new Set(est.excluded);
  const lines: EstimateLine[] = raw.map((r) => {
    const autoQty = r.source === 'manual' ? r.qty : roundQty(r.qty, r.unit);
    const qo = est.qtyOverrides[r.id];
    const po = est.priceOverrides[r.id];
    const qty = r.source !== 'manual' && typeof qo === 'number' ? qo : autoQty;
    const price = r.source !== 'manual' && typeof po === 'number' ? po : r.basePrice;
    return {
      id: r.id,
      source: r.source,
      work: r.work,
      name: r.name,
      spec: r.spec,
      qty,
      autoQty,
      unit: r.unit,
      unitPrice: price,
      basePrice: r.basePrice,
      amount: Math.round(qty * price),
      excluded: excluded.has(r.id),
      includes: r.includes,
    };
  });

  const groups: EstimateGroup[] = [];
  for (const work of WORKS) {
    const ls = lines.filter((l) => l.work === work);
    if (ls.length === 0) continue;
    groups.push({
      work,
      lines: ls,
      subtotal: ls.reduce((s, l) => s + (l.excluded ? 0 : l.amount), 0),
    });
  }

  const subtotal = groups.reduce((s, g) => s + g.subtotal, 0);
  const overhead = Math.round((subtotal * Math.max(0, est.overheadRate)) / 100);
  const discount = Math.min(Math.max(0, Math.round(est.discount)), subtotal + overhead);
  const net = subtotal + overhead - discount;
  const tax = Math.floor((net * settings.taxRate) / 100);
  return { lines, groups, subtotal, overhead, discount, net, tax, total: net + tax };
}

export function estimateOf(p: Project, settings: Settings): Estimate {
  return buildEstimate(p.plan, p.survey.answers, p.estimate, settings);
}

export function newEstimateState(settings: Settings, seq: number): EstimateState {
  const date = todayISO();
  return {
    number: `${date.replace(/-/g, '')}-${String(seq).padStart(2, '0')}`,
    date,
    validDays: 30,
    overheadRate: settings.overheadRate,
    discount: 0,
    excluded: [],
    priceOverrides: {},
    qtyOverrides: {},
    manual: [],
    note: '',
  };
}
