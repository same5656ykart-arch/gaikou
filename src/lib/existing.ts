import type { Plan, PlanItem } from '../types';
import { BLOCK_ROW_HEIGHT, catalogOf, createItem, hasKind, isBaseItem, isRemoved, variantOf } from './catalog';
import { clamp, meters, r2 } from './format';

// 既存図（いまの敷地・建物・いまあるもの）を、できるだけタップだけで作るための道具。
// 道路は図の下（y = 0）。

export interface Pattern {
  key: string;
  name: string;
  desc: string;
  site: { width: number; depth: number };
  house: { x: number; y: number; w: number; h: number };
  floors: 1 | 2 | 3;
  door: 'left' | 'center' | 'right';
  roof: 'gable' | 'hip' | 'shed' | 'flat';
}

/** よくある敷地と建物の組み合わせ。近いものを選んでから、大きさを合わせる */
export const PATTERNS: Pattern[] = [
  {
    key: 'standard',
    name: '標準',
    desc: '手前に駐車場と庭',
    site: { width: 10, depth: 15 },
    house: { x: 1.2, y: 6.2, w: 7.6, h: 7.3 },
    floors: 2,
    door: 'center',
    roof: 'gable',
  },
  {
    key: 'wide',
    name: '間口が広い',
    desc: '建物の横に駐車',
    site: { width: 16, depth: 11 },
    house: { x: 1, y: 3.6, w: 9.1, h: 6.4 },
    floors: 2,
    door: 'right',
    roof: 'gable',
  },
  {
    key: 'narrow',
    name: '間口がせまい',
    desc: '奥に長い敷地',
    site: { width: 6.5, depth: 20 },
    house: { x: 0.5, y: 6.5, w: 5.5, h: 10 },
    floors: 2,
    door: 'center',
    roof: 'gable',
  },
  {
    key: 'front',
    name: '建物が道路ぎわ',
    desc: '庭は奥・駐車は横',
    site: { width: 10, depth: 16 },
    house: { x: 0.8, y: 1.5, w: 6.2, h: 8 },
    floors: 2,
    door: 'left',
    roof: 'hip',
  },
  {
    key: 'compact',
    name: 'コンパクト',
    desc: '小さめの敷地',
    site: { width: 8, depth: 12 },
    house: { x: 0.8, y: 5.2, w: 6.4, h: 6.3 },
    floors: 2,
    door: 'center',
    roof: 'shed',
  },
  {
    key: 'large',
    name: '広い敷地・平屋',
    desc: 'ゆったりした敷地',
    site: { width: 18, depth: 18 },
    house: { x: 3.5, y: 7.5, w: 12, h: 8.5 },
    floors: 1,
    door: 'center',
    roof: 'hip',
  },
];

export function patternOf(key: string | undefined): Pattern {
  return PATTERNS.find((p) => p.key === key) ?? PATTERNS[0];
}

/** パターンから、敷地と建物だけの既存図を作る */
export function planFromPattern(p: Pattern, roadWidth = 6): Plan {
  const house = createItem('house', 0, 0);
  return {
    site: { ...p.site },
    roadWidth,
    items: [{ ...house, ...p.house, props: { ...house.props, floors: p.floors, door: p.door, roof: p.roof } }],
  };
}

export function houseOf(plan: Plan): PlanItem | undefined {
  return plan.items.find((it) => it.kind === 'house');
}

/** これから作るもの（建物・既存物以外）が置かれているか */
export function hasProposal(plan: Plan): boolean {
  return plan.items.some((it) => hasKind(it.kind) && !isBaseItem(it));
}

const EPS = 0.06;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/**
 * 敷地の大きさを変える。右と奥の境界に沿っている線（塀・フェンス）は、境界といっしょに動かす。
 * 面や点の部材は動かさない。
 */
export function resizeSite(plan: Plan, width: number, depth: number): Plan {
  const W0 = plan.site.width;
  const D0 = plan.site.depth;
  const W = r2(clamp(width, 2, 80));
  const D = r2(clamp(depth, 2, 80));
  if (W === W0 && D === D0) return plan;
  const mx = (x: number) => (near(x, W0) ? W : x);
  const my = (y: number) => (near(y, D0) ? D : y);
  return {
    ...plan,
    site: { width: W, depth: D },
    items: plan.items.map((it) => (hasKind(it.kind) && catalogOf(it.kind).shape === 'line' ? { ...it, x: mx(it.x), x2: mx(it.x2), y: my(it.y), y2: my(it.y2) } : it)),
  };
}

// ---------------------------------------------------------------------------
// 境界にあるもの（ブロック・フェンス）を、辺ごとに選ぶ

export type Side = 'left' | 'back' | 'right' | 'front';
export type BoundaryType = 'none' | 'block' | 'fence' | 'both';

export const SIDES: { key: Side; label: string }[] = [
  { key: 'left', label: '左' },
  { key: 'back', label: '奥' },
  { key: 'right', label: '右' },
  { key: 'front', label: '道路側' },
];

function sideLine(plan: Plan, side: Side): [number, number, number, number] {
  const W = plan.site.width;
  const D = plan.site.depth;
  if (side === 'left') return [0, 0, 0, D];
  if (side === 'right') return [W, 0, W, D];
  if (side === 'back') return [0, D, W, D];
  return [0, 0, W, 0];
}

function onSide(it: PlanItem, plan: Plan, side: Side): boolean {
  const [x1, y1] = sideLine(plan, side);
  if (side === 'left' || side === 'right') return near(it.x, x1) && near(it.x2, x1);
  return near(it.y, y1) && near(it.y2, y1);
}

/** その辺の境界線の上にある、既存のブロック塀・フェンス */
export function itemsOnSide(plan: Plan, side: Side): PlanItem[] {
  return plan.items.filter((it) => (it.kind === 'exBlock' || it.kind === 'exFence') && onSide(it, plan, side));
}

export function boundaryState(plan: Plan, side: Side): { type: BoundaryType; remove: boolean } {
  const items = itemsOnSide(plan, side);
  if (items.length === 0) return { type: 'none', remove: false };
  const fence = items.find((it) => it.kind === 'exFence');
  const type: BoundaryType = fence ? (Number(fence.props.baseRows ?? 0) > 0 ? 'both' : 'fence') : 'block';
  return { type, remove: items.every(isRemoved) };
}

/** 辺ごとに「なし／ブロック／フェンス／ブロック＋フェンス」を選ぶ。辺の端から端まで置く */
export function setBoundary(plan: Plan, side: Side, type: BoundaryType, remove: boolean): Plan {
  const cur = boundaryState(plan, side);
  const variant = remove ? 'remove' : 'keep';
  if (cur.type === type) {
    // 種類は同じ：残す／撤去だけを切り替える（高さなどの手直しは保つ）
    const ids = new Set(itemsOnSide(plan, side).map((it) => it.id));
    return { ...plan, items: plan.items.map((it) => (ids.has(it.id) ? { ...it, variant } : it)) };
  }
  const ids = new Set(itemsOnSide(plan, side).map((it) => it.id));
  const items = plan.items.filter((it) => !ids.has(it.id));
  if (type !== 'none') {
    const [x, y, x2, y2] = sideLine(plan, side);
    const it = createItem(type === 'block' ? 'exBlock' : 'exFence', 0, 0, variant);
    if (type === 'both') it.props.baseRows = 2;
    items.push({ ...it, x, y, x2, y2 });
  }
  return { ...plan, items };
}

// ---------------------------------------------------------------------------

/** いまあるものを、建物や他のものと重ならない場所に置く */
export function addExisting(plan: Plan, kind: string): { plan: Plan; id: string } {
  const W = plan.site.width;
  const D = plan.site.depth;
  const house = houseOf(plan);
  const frontDepth = house ? clamp(house.y, 0, D) : D;
  // 建物の手前の庭に、置くたびに少しずつ横へずらして置く（種類が違っても重ならないように）
  const placed0 = plan.items.filter((it) => hasKind(it.kind) && catalogOf(it.kind).group === 'existing' && !SIDES.some((s) => onSide(it, plan, s.key))).length;
  const baseY = frontDepth >= 2 ? frontDepth / 2 : Math.min(D - 0.6, (house ? house.y + house.h : 0) + 1);
  const cx = clamp(1.2 + ((placed0 * 1.4) % Math.max(1.4, W - 2.4)), 0.6, W - 0.6);
  const it = createItem(kind, cx, clamp(baseY, 0.6, D - 0.6));
  const shape = catalogOf(kind).shape;
  let placed = it;
  if (shape === 'rect') {
    placed = { ...it, x: r2(clamp(it.x, 0, Math.max(0, W - it.w))), y: r2(clamp(it.y, 0, Math.max(0, D - it.h))) };
  } else if (shape === 'line') {
    const len = Math.min(4, W);
    placed = { ...it, x: r2(clamp(cx - len / 2, 0, W - len)), x2: r2(clamp(cx - len / 2, 0, W - len) + len) };
  }
  return { plan: { ...plan, items: [...plan.items, placed] }, id: placed.id };
}

const FLOORS = ['', '平屋', '2階建て', '3階建て'];
const DOORS: Record<string, string> = { left: '左寄り', center: 'まん中', right: '右寄り' };
const TYPE_LABEL: Record<BoundaryType, string> = { none: 'なし', block: 'ブロック塀', fence: 'フェンス', both: 'ブロック＋フェンス' };

/** 既存図の内容を、確認画面や現調シートに出す形にまとめる */
export function existingSummary(plan: Plan): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const W = plan.site.width;
  const D = plan.site.depth;
  rows.push({ label: '敷地（間口 × 奥行）', value: `${meters(W)} × ${meters(D)}（約${Math.round(W * D)}m²・${Math.round((W * D) / 3.3058)}坪）` });
  const house = houseOf(plan);
  if (house) {
    rows.push({
      label: '建物（幅 × 奥行）',
      value: `${meters(house.w)} × ${meters(house.h)}・${FLOORS[clamp(Number(house.props.floors ?? 2), 1, 3)]}・玄関 ${DOORS[String(house.props.door ?? 'center')] ?? 'まん中'}`,
    });
    rows.push({ label: '道路から建物まで', value: meters(house.y) });
    rows.push({ label: '左の境から建物まで', value: meters(house.x) });
  } else {
    rows.push({ label: '建物', value: 'なし' });
  }
  for (const s of SIDES) {
    const st = boundaryState(plan, s.key);
    if (st.type === 'none') continue;
    const items = itemsOnSide(plan, s.key);
    const block = items.find((it) => it.kind === 'exBlock');
    const fence = items.find((it) => it.kind === 'exFence');
    const rowsCount = block ? Number(block.props.rows ?? 5) : Number(fence?.props.baseRows ?? 0);
    const height = rowsCount > 0 ? `・ブロック${rowsCount}段（${(rowsCount * BLOCK_ROW_HEIGHT).toFixed(1)}m）` : '';
    rows.push({ label: `${s.label}の境界`, value: `${TYPE_LABEL[st.type]}${height}（${st.remove ? '撤去する' : '残す'}）` });
  }
  const others = new Map<string, { total: number; removed: number }>();
  for (const it of plan.items) {
    if (!hasKind(it.kind) || catalogOf(it.kind).group !== 'existing') continue;
    if ((it.kind === 'exBlock' || it.kind === 'exFence') && SIDES.some((s) => onSide(it, plan, s.key))) continue;
    const name = catalogOf(it.kind).qty === 'none' ? variantOf(it.kind, it.variant).name : catalogOf(it.kind).name;
    const cur = others.get(name) ?? { total: 0, removed: 0 };
    cur.total++;
    if (isRemoved(it)) cur.removed++;
    others.set(name, cur);
  }
  for (const [name, c] of others) {
    rows.push({ label: name, value: `${c.total}か所${c.removed > 0 ? `（うち撤去 ${c.removed}）` : ''}` });
  }
  return rows;
}
