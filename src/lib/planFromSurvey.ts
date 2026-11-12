import type { Answers, Plan, PlanItem } from '../types';
import { catalogOf, createItem, isBaseItem } from './catalog';
import { boundaryState } from './existing';
import type { Side } from './existing';
import { clamp, r2 } from './format';

// 既存図（敷地・建物・いまあるもの）と現調のご要望から、平面図のたたき台を自動で作る。
// 道路は図の下（y = 0）。あくまで出発点で、あとは平面図の画面で動かして調整する。

interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function numOr(v: unknown, d: number): number {
  if (v === undefined || v === null || v === '') return d;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : d;
}

function overlap(a: R, b: R, margin = 0): boolean {
  return a.x < b.x + b.w + margin && a.x + a.w > b.x - margin && a.y < b.y + b.h + margin && a.y + a.h > b.y - margin;
}

function inside(px: number, py: number, r: R, margin = 0): boolean {
  return px > r.x - margin && px < r.x + r.w + margin && py > r.y - margin && py < r.y + r.h + margin;
}

function rect(kind: string, variant: string | undefined, r: R, patch: Partial<PlanItem> = {}): PlanItem {
  const it = createItem(kind, 0, 0, variant);
  return { ...it, x: r2(r.x), y: r2(r.y), w: r2(r.w), h: r2(r.h), ...patch, props: { ...it.props, ...(patch.props ?? {}) } };
}

function point(kind: string, variant: string | undefined, x: number, y: number): PlanItem {
  return createItem(kind, r2(x), r2(y), variant);
}

function line(kind: string, variant: string | undefined, x: number, y: number, x2: number, y2: number, props: PlanItem['props'] = {}): PlanItem {
  const it = createItem(kind, 0, 0, variant);
  return { ...it, x: r2(x), y: r2(y), x2: r2(x2), y2: r2(y2), props: { ...it.props, ...props } };
}

/**
 * 既存図はそのまま残し、その上に「これから作るもの」を置く。
 * すでに置いてあった提案の部材は捨てて、作り直す。
 */
export function generatePlan(base: Plan, a: Answers): Plan {
  const W = base.site.width;
  const D = base.site.depth;
  const wants = new Set(Array.isArray(a.wants) ? a.wants : []);
  const kept = base.items.filter(isBaseItem);

  // ---- 建物（既存図にあるものを使う。なければ敷地の奥に建物がないものとして扱う） ----
  const houseItem = kept.find((it) => it.kind === 'house');
  const hasHouse = houseItem !== undefined;
  const hx = hasHouse ? clamp(houseItem.x, 0, W) : 0;
  const hy = hasHouse ? clamp(houseItem.y, 0, D) : D;
  const hw = hasHouse ? clamp(houseItem.w, 0, W - hx) : W;
  const hd = hasHouse ? clamp(houseItem.h, 0, D - hy) : 0;
  const house: R = { x: hx, y: hy, w: hw, h: hd };
  const doorProp = houseItem?.props.door;
  const door = doorProp === 'left' || doorProp === 'right' ? doorProp : 'center';
  const doorX = hx + hw * (door === 'left' ? 0.25 : door === 'right' ? 0.75 : 0.5);
  const leftGap = hx;
  const rightGap = W - hx - hw;
  const backGap = D - hy - hd;

  const floor: PlanItem[] = []; // 地面の仕上げ
  const cars: PlanItem[] = [];
  const structures: PlanItem[] = [];
  const lines: PlanItem[] = [];
  const points: PlanItem[] = [];

  // ---- 駐車場 ----
  const wantsParking = wants.has('parking') || wants.has('carport');
  const carCount = wantsParking ? clamp(numOr(a.carCount, wants.has('parking') ? 2 : 1), 1, 4) : 0;
  const parkSide: 'left' | 'right' = door === 'left' ? 'right' : door === 'right' ? 'left' : rightGap >= leftGap ? 'right' : 'left';
  let park: R | null = null;
  let parkType: 'front' | 'side' | 'parallel' | null = null;
  if (carCount > 0) {
    const sideGap = parkSide === 'right' ? rightGap : leftGap;
    if (hy >= 4.8) {
      // 建物の手前に、道路から直角に入れる
      const w = r1(Math.min(carCount * 2.7, W));
      const h = r1(Math.min(hy, 5.5));
      park = { x: parkSide === 'right' ? W - w : 0, y: 0, w, h };
      parkType = 'front';
    } else if (sideGap >= 2.5) {
      // 建物の横に縦に並べる
      const w = r1(Math.min(sideGap, 3.0));
      const h = r1(Math.min(D, Math.max(5.5, carCount * 5.2)));
      park = { x: parkSide === 'right' ? W - w : 0, y: 0, w, h };
      parkType = 'side';
    } else if (hy >= 2.2) {
      // 道路と平行に停める
      const w = r1(Math.min(W, carCount * 6.0));
      const h = r1(Math.min(hy, 2.6));
      park = { x: parkSide === 'right' ? W - w : 0, y: 0, w, h };
      parkType = 'parallel';
    }
  }
  if (park && parkType) {
    if (wants.has('parking')) floor.push(rect('concrete', 'brush', park));
    if (parkType === 'front') {
      const n = Math.max(1, Math.min(carCount, Math.floor(park.w / 2.4)));
      const stall = park.w / n;
      const v = park.h >= 5.0 ? 'normal' : park.h >= 3.8 ? 'kei' : null;
      if (v) {
        const [cw, cl] = catalogOf('car').variants.find((x) => x.key === v)!.size!;
        for (let i = 0; i < n; i++) {
          cars.push(rect('car', v, { x: park.x + stall * (i + 0.5) - cw / 2, y: (park.h - cl) / 2, w: cw, h: cl }));
        }
      }
    } else if (parkType === 'side') {
      const n = Math.max(1, Math.min(carCount, Math.floor(park.h / 5.0)));
      for (let i = 0; i < n; i++) {
        cars.push(rect('car', 'normal', { x: park.x + (park.w - 1.8) / 2, y: 0.4 + i * 5.2, w: 1.8, h: 4.6 }));
      }
    } else {
      const n = Math.max(1, Math.min(carCount, Math.floor(park.w / 5.5)));
      for (let i = 0; i < n; i++) {
        cars.push(rect('car', 'normal', { x: park.x + 0.5 + i * 6.0, y: Math.max(0.1, (park.h - 1.8) / 2), w: 4.6, h: 1.8 }));
      }
    }
    if (wants.has('carport') && parkType !== 'parallel') {
      if (parkType === 'front' && carCount >= 2 && park.w >= 5.4) {
        const h = Math.min(5.0, park.h);
        structures.push(rect('carport', 'two', { x: parkSide === 'right' ? W - 5.4 : 0, y: Math.min(0.5, park.h - h), w: 5.4, h }));
      } else {
        const w = Math.min(2.7, park.w);
        const h = Math.min(5.0, park.h);
        structures.push(rect('carport', 'one', { x: parkSide === 'right' ? W - w : 0, y: Math.min(0.5, park.h - h), w, h }));
      }
    }
  }

  // ---- アプローチ ----
  const AW = 1.2;
  let approach: R | null = null;
  if (wants.has('approach') && hasHouse && hy >= 0.8) {
    const ax = clamp(doorX - AW / 2, 0, W - AW);
    const hitsPark = park !== null && ax < park.x + park.w - 0.2 && ax + AW > park.x + 0.2;
    if (!hitsPark) approach = { x: ax, y: 0, w: AW, h: hy };
    else if (park && hy - park.h >= 0.6) approach = { x: ax, y: park.h, w: AW, h: hy - park.h };
  }
  if (approach) floor.push(rect('approach', 'wash', approach));

  const blocked = (x: number, y: number, margin = 0.3) =>
    x < 0.2 || x > W - 0.2 || y < 0.2 || y > D - 0.2 || inside(x, y, house, margin) || (park !== null && inside(x, y, park, margin));

  // ---- 門柱 ----
  let gatepostLeft = true;
  if (wants.has('gatepost')) {
    let gx: number;
    let gy: number;
    if (approach) {
      gy = approach.y + Math.min(1.0, approach.h / 2);
      gx = approach.x - 0.45;
      if (blocked(gx, gy, 0.1)) {
        gx = approach.x + AW + 0.45;
        gatepostLeft = false;
      }
    } else {
      gx = clamp(doorX - 1.2, 0.4, W - 0.4);
      gy = park && inside(gx, Math.min(1.0, hy / 2), park, 0.1) ? park.h + 0.4 : Math.min(1.0, hy / 2);
    }
    if (gy < hy || !inside(gx, gy, house)) points.push(point('gatepost', 'func', clamp(gx, 0.3, W - 0.3), Math.max(0.3, gy)));
  }

  // ---- 植栽 ----
  let tree: { x: number; y: number } | null = null;
  if (wants.has('plants')) {
    const baseY = (approach?.y ?? 0) + 1.3;
    const candidates: [number, number][] = approach
      ? gatepostLeft
        ? [
            [approach.x + AW + 0.9, baseY],
            [approach.x - 0.9, baseY + 0.9],
          ]
        : [
            [approach.x - 0.9, baseY],
            [approach.x + AW + 0.9, baseY + 0.9],
          ]
      : [];
    candidates.push([0.9, 0.9], [W - 0.9, 0.9], [0.9, D - 0.9], [W - 0.9, D - 0.9]);
    const spot = candidates.find(([x, y]) => !blocked(x, y, 0.6));
    if (spot) {
      tree = { x: spot[0], y: spot[1] };
      points.push(point('tree', 'symbol', tree.x, tree.y));
      const shrubs: [number, number][] = [
        [tree.x + 0.75, tree.y - 0.55],
        [tree.x - 0.7, tree.y - 0.6],
        [tree.x + 0.15, tree.y - 0.95],
      ];
      for (const [x, y] of shrubs) {
        const onApproach = approach !== null && inside(x, y, approach, 0.15);
        if (!blocked(x, y, 0.2) && !onApproach) points.push(point('shrub', 'shrub', x, y));
      }
    }
  }

  // ---- 庭側の空きスペース（駐車場とアプローチを除いた、建物の手前） ----
  let frontLo = 0;
  let frontHi = W;
  if (park) {
    if (parkSide === 'right') frontHi = park.x;
    else frontLo = park.x + park.w;
  }
  if (approach && approach.y === 0 && approach.x + AW > frontLo && approach.x < frontHi) {
    const leftW = approach.x - frontLo;
    const rightW = frontHi - (approach.x + AW);
    if (leftW >= rightW) frontHi = approach.x;
    else frontLo = approach.x + AW;
  }
  const frontW = frontHi - frontLo;

  // ---- 芝生・デッキ ----
  let backUsed = false;
  if (wants.has('lawn')) {
    const v = a.lawnType === 'artificial' ? 'artificial' : 'natural';
    if (backGap >= 2) {
      floor.push(rect('lawn', v, { x: hx, y: hy + hd, w: hw, h: backGap }));
      backUsed = true;
    } else if (frontW >= 1.5 && hy >= 1.5) {
      floor.push(rect('lawn', v, { x: frontLo, y: 0, w: frontW, h: hy }));
    }
  }
  if (wants.has('deck')) {
    if (backGap >= 2) {
      const dw = Math.min(3.6, hw);
      structures.push(rect('deck', 'resin', { x: hx + (hw - dw) / 2, y: hy + hd, w: dw, h: Math.min(1.8, backGap) }));
    } else {
      const lo = Math.max(frontLo, hx);
      const hi = Math.min(frontHi, hx + hw);
      if (hi - lo >= 2.4 && hy >= 3) {
        structures.push(rect('deck', 'resin', { x: lo, y: hy - 1.8, w: Math.min(3.6, hi - lo), h: 1.8 }));
      }
    }
  }

  // ---- 砂利（建物まわりの雑草対策） ----
  if (wants.has('gravel')) {
    const strip = (side: 'left' | 'right') => {
      const gap = side === 'left' ? leftGap : rightGap;
      if (gap < 0.4) return;
      const y0 = park && parkType === 'side' && side === parkSide ? Math.max(hy, park.h) : hy;
      if (D - y0 < 0.5) return;
      floor.unshift(rect('gravel', 'std', { x: side === 'left' ? 0 : hx + hw, y: y0, w: gap, h: D - y0 }));
    };
    strip('left');
    strip('right');
    if (backGap >= 0.4 && !backUsed) floor.unshift(rect('gravel', 'std', { x: hx, y: hy + hd, w: hw, h: backGap }));
  }

  // ---- フェンス ----
  // 既存のフェンスを残す辺には付けない。既存のブロックを残す辺は、その上に付ける。
  if (wants.has('fence')) {
    const sides = (Array.isArray(a.fenceSides) && a.fenceSides.length > 0 ? a.fenceSides : ['left', 'right', 'back']) as Side[];
    const v = typeof a.fenceType === 'string' ? a.fenceType : 'mesh';
    const span: Record<string, [number, number, number, number]> = {
      left: [0, 0, 0, D],
      back: [0, D, W, D],
      right: [W, 0, W, D],
    };
    for (const side of ['left', 'back', 'right'] as const) {
      if (!sides.includes(side)) continue;
      const st = boundaryState(base, side);
      const keptHere = st.type !== 'none' && !st.remove;
      if (keptHere && st.type !== 'block') continue;
      const [x, y, x2, y2] = span[side];
      lines.push(line('fence', v, x, y, x2, y2, { baseRows: keptHere ? 0 : 2 }));
    }
  }

  // ---- 物置・サイクルポート ----
  if (wants.has('shed')) {
    const spots: R[] = [
      { x: 0.1, y: D - 1.0, w: 1.8, h: 0.9 },
      { x: W - 1.9, y: D - 1.0, w: 1.8, h: 0.9 },
    ];
    const s = spots.find((r) => !overlap(r, house, 0.05) && (!park || !overlap(r, park)));
    if (s) structures.push(rect('shed', 'm', s));
  }
  if (wants.has('cycleport')) {
    const otherGap = parkSide === 'right' ? leftGap : rightGap;
    if (otherGap >= 2.3) {
      structures.push(rect('cycleport', 'std', { x: parkSide === 'right' ? 0.05 : W - 2.25, y: hy + 0.5, w: 2.2, h: 2.0 }));
    } else if (frontW >= 2.3 && hy >= 2.6) {
      structures.push(rect('cycleport', 'std', { x: parkSide === 'right' ? frontLo : frontHi - 2.2, y: hy - 2.1, w: 2.2, h: 2.0 }));
    }
  }

  // ---- 立水栓・照明 ----
  if (wants.has('faucet')) {
    if (leftGap >= 0.6) points.push(point('faucet', 'stand', hx - 0.3, Math.min(D - 0.3, hy + 1.0)));
    else if (hy >= 0.6) points.push(point('faucet', 'stand', hx + 0.5, hy - 0.3));
  }
  if (wants.has('light')) {
    if (approach) {
      const l1: [number, number] = [approach.x + AW + 0.25, approach.y + approach.h * 0.3];
      const l2: [number, number] = [approach.x - 0.25, approach.y + approach.h * 0.72];
      for (const [x, y] of [l1, l2]) if (!blocked(x, y, 0)) points.push(point('light', 'pole', x, y));
    } else if (hy >= 0.6) {
      points.push(point('light', 'pole', clamp(doorX + 1.0, 0.3, W - 0.3), hy - 0.4));
    }
    if (tree) points.push(point('light', 'spot', tree.x + 0.45, tree.y + 0.45));
  }

  return { ...base, items: [...kept, ...floor, ...cars, ...structures, ...lines, ...points] };
}
