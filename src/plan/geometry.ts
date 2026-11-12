import type { Plan, PlanItem } from '../types';
import { BLOCK_ROW_HEIGHT, catalogOf, hasKind, itemQty, lineLength, unitPrice, variantOf } from '../lib/catalog';
import { roundQty } from '../lib/estimate';
import { r2 } from '../lib/format';

// 平面図の編集で使う計算（スナップ・移動・サイズ変更）。画面に依存しない純粋な関数。

export const GRID = 0.1;
export const MIN_SIZE = 0.2;

export interface Cands {
  xs: number[];
  ys: number[];
}

/** 吸着させる候補：敷地の境界と、ほかの部材の端 */
export function snapCandidates(plan: Plan, excludeId: string): Cands {
  const xs = [0, plan.site.width];
  const ys = [0, plan.site.depth];
  for (const it of plan.items) {
    if (it.id === excludeId || !hasKind(it.kind)) continue;
    const shape = catalogOf(it.kind).shape;
    if (shape === 'rect') {
      xs.push(it.x, it.x + it.w);
      ys.push(it.y, it.y + it.h);
    } else if (shape === 'line') {
      xs.push(it.x, it.x2);
      ys.push(it.y, it.y2);
    }
  }
  return { xs, ys };
}

const grid = (v: number) => r2(Math.round(v / GRID) * GRID);

/** 候補に近ければ吸着、そうでなければ 10cm 刻みに丸める */
export function snap1(v: number, cands: number[], tol: number): number {
  let best: number | null = null;
  let bestD = tol;
  for (const c of cands) {
    const d = Math.abs(c - v);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best !== null ? r2(best) : grid(v);
}

/** 幅のあるものの位置。手前の端か奥の端が候補に近ければ吸着 */
export function snapSpan(lo: number, size: number, cands: number[], tol: number): number {
  let best: number | null = null;
  let bestD = tol;
  for (const c of cands) {
    for (const delta of [c - lo, c - (lo + size)]) {
      const d = Math.abs(delta);
      if (d <= bestD) {
        bestD = d;
        best = lo + delta;
      }
    }
  }
  return best !== null ? r2(best) : grid(lo);
}

export function moveItem(orig: PlanItem, dx: number, dy: number, c: Cands, tol: number): PlanItem {
  const shape = catalogOf(orig.kind).shape;
  if (shape === 'rect') {
    return { ...orig, x: snapSpan(orig.x + dx, orig.w, c.xs, tol), y: snapSpan(orig.y + dy, orig.h, c.ys, tol) };
  }
  if (shape === 'line') {
    const loX = Math.min(orig.x, orig.x2);
    const loY = Math.min(orig.y, orig.y2);
    const nx = snapSpan(loX + dx, Math.abs(orig.x2 - orig.x), c.xs, tol) - loX;
    const ny = snapSpan(loY + dy, Math.abs(orig.y2 - orig.y), c.ys, tol) - loY;
    return { ...orig, x: r2(orig.x + nx), y: r2(orig.y + ny), x2: r2(orig.x2 + nx), y2: r2(orig.y2 + ny) };
  }
  return { ...orig, x: grid(orig.x + dx), y: grid(orig.y + dy) };
}

/** handle は 'n' 's' 'e' 'w' の組み合わせ（n=奥, s=手前, e=右, w=左） */
export function resizeRect(orig: PlanItem, handle: string, wx: number, wy: number, c: Cands, tol: number): PlanItem {
  let x1 = orig.x;
  let x2 = orig.x + orig.w;
  let y1 = orig.y;
  let y2 = orig.y + orig.h;
  if (handle.includes('w')) x1 = Math.min(snap1(wx, c.xs, tol), x2 - MIN_SIZE);
  if (handle.includes('e')) x2 = Math.max(snap1(wx, c.xs, tol), x1 + MIN_SIZE);
  if (handle.includes('s')) y1 = Math.min(snap1(wy, c.ys, tol), y2 - MIN_SIZE);
  if (handle.includes('n')) y2 = Math.max(snap1(wy, c.ys, tol), y1 + MIN_SIZE);
  return { ...orig, x: r2(x1), y: r2(y1), w: r2(x2 - x1), h: r2(y2 - y1) };
}

/** 線の端点を動かす。もう一方の端とそろう位置にも吸着する（まっすぐ引きやすい） */
export function moveEndpoint(orig: PlanItem, which: 1 | 2, wx: number, wy: number, c: Cands, tol: number): PlanItem {
  const ox = which === 1 ? orig.x2 : orig.x;
  const oy = which === 1 ? orig.y2 : orig.y;
  let nx = snap1(wx, [...c.xs, ox], tol);
  let ny = snap1(wy, [...c.ys, oy], tol);
  if (Math.hypot(nx - ox, ny - oy) < MIN_SIZE) {
    // つぶれないよう、最小の長さを保つ
    if (Math.abs(wx - ox) >= Math.abs(wy - oy)) nx = r2(ox + (wx >= ox ? MIN_SIZE : -MIN_SIZE));
    else ny = r2(oy + (wy >= oy ? MIN_SIZE : -MIN_SIZE));
  }
  return which === 1 ? { ...orig, x: nx, y: ny } : { ...orig, x2: nx, y2: ny };
}

/** 線の長さを数値で指定（始点を固定して終点を伸び縮みさせる） */
export function setLineLength(it: PlanItem, len: number): PlanItem {
  const cur = lineLength(it);
  const ux = cur > 0 ? (it.x2 - it.x) / cur : 1;
  const uy = cur > 0 ? (it.y2 - it.y) / cur : 0;
  return { ...it, x2: r2(it.x + ux * len), y2: r2(it.y + uy * len) };
}

export interface ItemCost {
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  /** フェンスの下のブロック */
  base?: { qty: number; unitPrice: number; amount: number };
}

/** 部材 1 つの概算（プロパティパネルの表示用） */
export function itemCost(it: PlanItem, prices: Record<string, number>): ItemCost | null {
  const c = catalogOf(it.kind);
  if (c.qty === 'none' || variantOf(it.kind, it.variant).skip) return null;
  const qty = roundQty(itemQty(it), c.unit);
  const price = unitPrice(prices, it.kind, it.variant);
  const cost: ItemCost = { qty, unit: c.unit, unitPrice: price, amount: Math.round(qty * price) };
  if (it.kind === 'fence' || it.kind === 'exFence') {
    const rows = Number(it.props.baseRows ?? 0);
    if (rows > 0) {
      const bq = roundQty(lineLength(it) * rows * BLOCK_ROW_HEIGHT, 'm²');
      const bp = it.kind === 'fence' ? unitPrice(prices, 'block', 'cb') : unitPrice(prices, 'exBlock', 'remove');
      cost.base = { qty: bq, unitPrice: bp, amount: Math.round(bq * bp) };
    }
  }
  return cost;
}
