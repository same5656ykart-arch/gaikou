import type { PlanItem, Shape } from '../types';
import { r2, uid } from './format';

// 部材カタログ。
// 単価はすべて「材工共・税抜」の参考値。設定画面の単価表で自社の単価に書き換えて使う。

export interface Variant {
  key: string;
  name: string;
  /** 参考単価（材工共・税抜） */
  price: number;
  /** フェンスなどの高さ(m) */
  height?: number;
  /** 置いたときのサイズ（幅×奥行） */
  size?: [number, number];
  /** 門扉などの幅(m) */
  width?: number;
}

export type QtyMode = 'area' | 'length' | 'wallArea' | 'count' | 'none';

export type PaletteGroup = 'base' | 'floor' | 'boundary' | 'structure' | 'green' | 'equip';

export interface CatalogItem {
  key: string;
  name: string;
  group: PaletteGroup;
  /** 見積書での工種 */
  work: string;
  shape: Shape;
  unit: string;
  qty: QtyMode;
  variants: Variant[];
  /** rect の初期サイズ */
  size?: [number, number];
  /** line の初期長さ */
  length?: number;
  /** 数量を手入力する部材のラベル（段数など） */
  countLabel?: string;
  /** 向きを 90 度回せる point */
  rotatable?: boolean;
  /** 単価に含まれる内容（素人向けの説明） */
  includes?: string;
  /** 平面図での塗り・線・模様 */
  fill: string;
  stroke: string;
  pattern?: string;
  /** 描画の重ね順（小さいほど下） */
  z: number;
}

export const PALETTE_GROUPS: { key: PaletteGroup; name: string }[] = [
  { key: 'floor', name: '床・舗装' },
  { key: 'boundary', name: '塀・フェンス' },
  { key: 'structure', name: '設置物' },
  { key: 'green', name: '植栽・庭' },
  { key: 'equip', name: '設備' },
  { key: 'base', name: '建物・車' },
];

export const WORKS = [
  '解体・撤去工事',
  '土間・舗装工事',
  'ブロック・フェンス工事',
  'エクステリア設置工事',
  '植栽・造園工事',
  '設備工事',
  '運搬・共通費',
  'その他',
] as const;

export const BLOCK_ROW_HEIGHT = 0.2; // ブロック 1 段の高さ(m)

export const CATALOG: CatalogItem[] = [
  // ---- 建物・車（見積には入らない目安） ----
  {
    key: 'house',
    name: '建物',
    group: 'base',
    work: '',
    shape: 'rect',
    unit: '',
    qty: 'none',
    variants: [{ key: 'std', name: '既存の建物', price: 0 }],
    size: [8, 7],
    fill: '#ffffff',
    stroke: '#1d2f40',
    pattern: 'house',
    z: 2,
  },
  {
    key: 'car',
    name: '車（大きさの目安）',
    group: 'base',
    work: '',
    shape: 'rect',
    unit: '',
    qty: 'none',
    variants: [
      { key: 'normal', name: '普通車', price: 0, size: [1.8, 4.6] },
      { key: 'kei', name: '軽自動車', price: 0, size: [1.48, 3.4] },
      { key: 'minivan', name: 'ミニバン', price: 0, size: [1.85, 4.9] },
    ],
    size: [1.8, 4.6],
    fill: '#dfe6ee',
    stroke: '#5d6f82',
    z: 1,
  },

  // ---- 床・舗装 ----
  {
    key: 'concrete',
    name: '土間コンクリート',
    group: 'floor',
    work: '土間・舗装工事',
    shape: 'rect',
    unit: 'm²',
    qty: 'area',
    variants: [
      { key: 'brush', name: '刷毛引き仕上げ', price: 12000 },
      { key: 'trowel', name: '金ゴテ仕上げ', price: 12800 },
      { key: 'wash', name: '洗い出し仕上げ', price: 16500 },
      { key: 'stamp', name: 'スタンプコンクリート', price: 19500 },
    ],
    size: [3, 5.5],
    includes: 'すき取り・残土処分・砕石・ワイヤーメッシュ・打設・仕上げ（厚さ10cm）',
    fill: '#d9dbd8',
    stroke: '#8d9290',
    pattern: 'concrete',
    z: 0,
  },
  {
    key: 'asphalt',
    name: 'アスファルト舗装',
    group: 'floor',
    work: '土間・舗装工事',
    shape: 'rect',
    unit: 'm²',
    qty: 'area',
    variants: [{ key: 'std', name: '厚さ5cm', price: 7800 }],
    size: [3, 5.5],
    includes: 'すき取り・残土処分・砕石路盤・舗装',
    fill: '#70757c',
    stroke: '#4a4e55',
    z: 0,
  },
  {
    key: 'gravel',
    name: '砂利敷き・防草',
    group: 'floor',
    work: '土間・舗装工事',
    shape: 'rect',
    unit: 'm²',
    qty: 'area',
    variants: [
      { key: 'std', name: '防草シート＋砕石砂利', price: 4200 },
      { key: 'deco', name: '防草シート＋化粧砂利', price: 6800 },
      { key: 'sheet', name: '防草シートのみ', price: 2200 },
    ],
    size: [2, 4],
    includes: '草取り・整地・防草シート・砂利（厚さ4〜5cm）',
    fill: '#e7e2d6',
    stroke: '#a59f8f',
    pattern: 'gravel',
    z: 0,
  },
  {
    key: 'paving',
    name: 'インターロッキング・レンガ',
    group: 'floor',
    work: '土間・舗装工事',
    shape: 'rect',
    unit: 'm²',
    qty: 'area',
    variants: [
      { key: 'inter', name: 'インターロッキング', price: 13500 },
      { key: 'brick', name: 'レンガ敷き', price: 18500 },
    ],
    size: [2, 3],
    includes: 'すき取り・残土処分・路盤・敷砂・敷設',
    fill: '#dcc4b2',
    stroke: '#a37b62',
    pattern: 'brick',
    z: 0,
  },
  {
    key: 'tile',
    name: 'タイルテラス',
    group: 'floor',
    work: '土間・舗装工事',
    shape: 'rect',
    unit: 'm²',
    qty: 'area',
    variants: [
      { key: 't300', name: '300角タイル', price: 28500 },
      { key: 't600', name: '600角タイル', price: 33500 },
    ],
    size: [3, 2],
    includes: '下地コンクリート・タイル貼り・目地',
    fill: '#ebe4d8',
    stroke: '#a89c87',
    pattern: 'tile',
    z: 0,
  },
  {
    key: 'approach',
    name: 'アプローチ',
    group: 'floor',
    work: '土間・舗装工事',
    shape: 'rect',
    unit: 'm²',
    qty: 'area',
    variants: [
      { key: 'wash', name: 'コンクリート洗い出し', price: 16500 },
      { key: 'tile', name: 'タイル貼り', price: 26500 },
      { key: 'stone', name: '乱形石貼り', price: 31000 },
      { key: 'brick', name: 'レンガ敷き', price: 18500 },
    ],
    size: [1.2, 4],
    includes: '下地コンクリート・仕上げ',
    fill: '#e8d9bf',
    stroke: '#a68d63',
    pattern: 'stone',
    z: 0,
  },
  {
    key: 'steps',
    name: '階段・ステップ',
    group: 'floor',
    work: '土間・舗装工事',
    shape: 'rect',
    unit: '段',
    qty: 'count',
    countLabel: '段数',
    variants: [
      { key: 'wash', name: 'コンクリート洗い出し（幅1.2m程度）', price: 23000 },
      { key: 'tile', name: 'タイル貼り（幅1.2m程度）', price: 31000 },
    ],
    size: [1.2, 0.6],
    includes: '型枠・コンクリート・仕上げ。1段あたりの金額',
    fill: '#e3ddd0',
    stroke: '#8f8672',
    pattern: 'steps',
    z: 0,
  },

  // ---- 塀・フェンス ----
  {
    key: 'block',
    name: 'ブロック塀',
    group: 'boundary',
    work: 'ブロック・フェンス工事',
    shape: 'line',
    unit: 'm²',
    qty: 'wallArea',
    variants: [
      { key: 'cb', name: '普通ブロック', price: 13500 },
      { key: 'deco', name: '化粧ブロック', price: 19500 },
      { key: 'form', name: '型枠ブロック（土留め）', price: 24500 },
    ],
    length: 4,
    includes: '基礎・鉄筋・ブロック積み・天端仕上げ。長さ×高さの面積で計算',
    fill: '#9aa0a6',
    stroke: '#6d737a',
    z: 3,
  },
  {
    key: 'fence',
    name: 'フェンス',
    group: 'boundary',
    work: 'ブロック・フェンス工事',
    shape: 'line',
    unit: 'm',
    qty: 'length',
    variants: [
      { key: 'mesh', name: 'メッシュフェンス 高さ1.0m', price: 8800, height: 1.0 },
      { key: 'alumi', name: 'アルミフェンス 高さ0.8m', price: 16500, height: 0.8 },
      { key: 'privacy12', name: '目隠しフェンス 高さ1.2m', price: 26500, height: 1.2 },
      { key: 'privacy18', name: '目隠しフェンス 高さ1.8m', price: 36500, height: 1.8 },
      { key: 'wood18', name: '木調目隠しフェンス 高さ1.8m', price: 46500, height: 1.8 },
    ],
    length: 4,
    includes: '柱・本体・取り付け。下のブロックは段数に応じて別計上',
    fill: '#3f6b8f',
    stroke: '#3f6b8f',
    z: 3,
  },
  {
    key: 'curb',
    name: '縁石・見切り',
    group: 'boundary',
    work: 'ブロック・フェンス工事',
    shape: 'line',
    unit: 'm',
    qty: 'length',
    variants: [
      { key: 'pincoro', name: 'ピンコロ石', price: 7800 },
      { key: 'brick', name: 'レンガ見切り', price: 6200 },
      { key: 'conc', name: 'コンクリート縁石', price: 5200 },
    ],
    length: 3,
    includes: '基礎モルタル・据え付け',
    fill: '#8a7f73',
    stroke: '#8a7f73',
    z: 3,
  },
  {
    key: 'gate',
    name: '門扉',
    group: 'boundary',
    work: 'ブロック・フェンス工事',
    shape: 'point',
    unit: '基',
    qty: 'count',
    rotatable: true,
    variants: [
      { key: 'single', name: '片開き 幅0.8m', price: 125000, width: 0.8 },
      { key: 'double', name: '両開き 幅1.6m', price: 215000, width: 1.6 },
      { key: 'accordion', name: '伸縮門扉 幅3.0m', price: 158000, width: 3.0 },
    ],
    includes: '本体・柱・取り付け',
    fill: '#4a5560',
    stroke: '#2d3640',
    z: 4,
  },

  // ---- 設置物 ----
  {
    key: 'carport',
    name: 'カーポート',
    group: 'structure',
    work: 'エクステリア設置工事',
    shape: 'rect',
    unit: '基',
    qty: 'count',
    variants: [
      { key: 'one', name: '1台用', price: 285000, size: [2.7, 5.0] },
      { key: 'two', name: '2台用', price: 525000, size: [5.4, 5.0] },
      { key: 'oneStrong', name: '1台用（耐雪・耐風）', price: 425000, size: [2.7, 5.0] },
      { key: 'twoStrong', name: '2台用（耐雪・耐風）', price: 785000, size: [5.4, 5.0] },
    ],
    size: [2.7, 5.0],
    includes: '本体・組立・柱の基礎工事',
    fill: 'rgba(111,160,196,0.28)',
    stroke: '#3f6f93',
    pattern: 'carport',
    z: 2,
  },
  {
    key: 'cycleport',
    name: 'サイクルポート',
    group: 'structure',
    work: 'エクステリア設置工事',
    shape: 'rect',
    unit: '基',
    qty: 'count',
    variants: [{ key: 'std', name: '自転車3〜4台用', price: 195000 }],
    size: [2.2, 2.0],
    includes: '本体・組立・柱の基礎工事',
    fill: 'rgba(111,160,196,0.28)',
    stroke: '#3f6f93',
    pattern: 'carport',
    z: 2,
  },
  {
    key: 'deck',
    name: 'ウッドデッキ',
    group: 'structure',
    work: 'エクステリア設置工事',
    shape: 'rect',
    unit: 'm²',
    qty: 'area',
    variants: [
      { key: 'resin', name: '人工木', price: 38500 },
      { key: 'hardwood', name: '天然木（ハードウッド）', price: 46500 },
    ],
    size: [3.6, 1.8],
    includes: '束石・床下の骨組み・床板・幕板',
    fill: '#c9a276',
    stroke: '#8a633b',
    pattern: 'deck',
    z: 2,
  },
  {
    key: 'shed',
    name: '物置',
    group: 'structure',
    work: 'エクステリア設置工事',
    shape: 'rect',
    unit: '台',
    qty: 'count',
    variants: [
      { key: 'm', name: '中型（幅1.8m）', price: 155000, size: [1.8, 0.9] },
      { key: 's', name: '小型（幅1.3m）', price: 88000, size: [1.3, 0.75] },
      { key: 'l', name: '大型（幅2.6m）', price: 295000, size: [2.6, 1.6] },
    ],
    size: [1.8, 0.9],
    includes: '本体・組立・ブロック基礎・転倒防止',
    fill: '#cfd5da',
    stroke: '#6b7580',
    pattern: 'shed',
    z: 2,
  },
  {
    key: 'gatepost',
    name: '門柱',
    group: 'structure',
    work: 'ブロック・フェンス工事',
    shape: 'point',
    unit: '基',
    qty: 'count',
    rotatable: true,
    variants: [
      { key: 'func', name: '機能門柱（ポスト・表札・インターホン）', price: 155000 },
      { key: 'wall', name: '造作門柱（塗り壁）', price: 325000 },
      { key: 'tile', name: '造作門柱（タイル貼り）', price: 385000 },
    ],
    includes: '本体・ポスト・表札・基礎・インターホン移設',
    fill: '#4b3b30',
    stroke: '#2e231c',
    z: 4,
  },

  // ---- 植栽・庭 ----
  {
    key: 'lawn',
    name: '芝生',
    group: 'green',
    work: '植栽・造園工事',
    shape: 'rect',
    unit: 'm²',
    qty: 'area',
    variants: [
      { key: 'natural', name: '天然芝（高麗芝）', price: 3900 },
      { key: 'artificial', name: '人工芝', price: 10800 },
    ],
    size: [4, 3],
    includes: '整地・（人工芝は下地と防草シート）・芝張り',
    fill: '#b9d8a4',
    stroke: '#6f9a55',
    pattern: 'lawn',
    z: 0,
  },
  {
    key: 'flowerbed',
    name: '花壇',
    group: 'green',
    work: '植栽・造園工事',
    shape: 'rect',
    unit: 'm²',
    qty: 'area',
    variants: [
      { key: 'brick', name: 'レンガ花壇', price: 24500 },
      { key: 'block', name: '化粧ブロック花壇', price: 20500 },
    ],
    size: [2, 0.6],
    includes: '縁取り・培養土',
    fill: '#b08968',
    stroke: '#7a5637',
    pattern: 'flowerbed',
    z: 0,
  },
  {
    key: 'tree',
    name: '樹木',
    group: 'green',
    work: '植栽・造園工事',
    shape: 'point',
    unit: '本',
    qty: 'count',
    variants: [
      { key: 'symbol', name: 'シンボルツリー 高さ3m', price: 38500, height: 3.0 },
      { key: 'mid', name: '中木 高さ2m', price: 20500, height: 2.0 },
    ],
    includes: '樹木・植え込み・支柱・土壌改良',
    fill: '#6aa56a',
    stroke: '#3c7241',
    z: 4,
  },
  {
    key: 'shrub',
    name: '低木・下草',
    group: 'green',
    work: '植栽・造園工事',
    shape: 'point',
    unit: '株',
    qty: 'count',
    variants: [
      { key: 'shrub', name: '低木', price: 4800 },
      { key: 'ground', name: '下草・グランドカバー', price: 2200 },
    ],
    includes: '苗・植え込み',
    fill: '#8fc27f',
    stroke: '#4f8a4a',
    z: 4,
  },

  // ---- 設備 ----
  {
    key: 'faucet',
    name: '立水栓',
    group: 'equip',
    work: '設備工事',
    shape: 'point',
    unit: '箇所',
    qty: 'count',
    variants: [
      { key: 'stand', name: '立水栓（パン付き）', price: 48500 },
      { key: 'box', name: '散水栓（地面埋め込み）', price: 31000 },
    ],
    includes: '本体・給排水の配管3mまで',
    fill: '#3d8fd1',
    stroke: '#1f5f96',
    z: 4,
  },
  {
    key: 'light',
    name: '照明',
    group: 'equip',
    work: '設備工事',
    shape: 'point',
    unit: '箇所',
    qty: 'count',
    variants: [
      { key: 'pole', name: 'ポールライト', price: 28500 },
      { key: 'spot', name: 'スポットライト', price: 22500 },
    ],
    includes: '器具・配線・取り付け（12V ローボルト）',
    fill: '#f2b93b',
    stroke: '#a87412',
    z: 4,
  },
];

const BY_KEY = new Map(CATALOG.map((c) => [c.key, c]));

export function catalogOf(kind: string): CatalogItem {
  const c = BY_KEY.get(kind);
  if (!c) throw new Error(`unknown item kind: ${kind}`);
  return c;
}

export function hasKind(kind: string): boolean {
  return BY_KEY.has(kind);
}

export function variantOf(kind: string, variant: string): Variant {
  const c = catalogOf(kind);
  return c.variants.find((v) => v.key === variant) ?? c.variants[0];
}

/** 現調の結果（撤去など）から見積に入る項目。平面図には描かない。 */
export interface ExtraPrice {
  key: string;
  work: string;
  name: string;
  spec: string;
  unit: string;
  price: number;
}

export const EXTRA_PRICES: ExtraPrice[] = [
  { key: 'demoBlock', work: '解体・撤去工事', name: '既存ブロック塀 解体・処分', spec: '長さ×高さ', unit: 'm²', price: 7200 },
  { key: 'demoFence', work: '解体・撤去工事', name: '既存フェンス 撤去・処分', spec: '', unit: 'm', price: 2600 },
  { key: 'demoConcrete', work: '解体・撤去工事', name: '既存コンクリート はつり・処分', spec: '厚さ10cm程度', unit: 'm²', price: 5600 },
  { key: 'demoTree', work: '解体・撤去工事', name: '樹木 伐採・抜根・処分', spec: '中木程度', unit: '本', price: 22500 },
  { key: 'demoShed', work: '解体・撤去工事', name: '既存物置 解体・処分', spec: '', unit: '台', price: 31000 },
  { key: 'weeding', work: '解体・撤去工事', name: '草刈り・整地', spec: '', unit: 'm²', price: 950 },
  { key: 'lightTrans', work: '設備工事', name: '照明用トランス・タイマー', spec: '屋外コンセントから接続', unit: '式', price: 36500 },
  { key: 'machine', work: '運搬・共通費', name: '重機回送・資材運搬費', spec: '小型ショベル・ダンプ', unit: '式', price: 33000 },
];

export function priceKey(kind: string, variant: string): string {
  return `${kind}:${variant}`;
}

/** 設定の上書きを反映した単価 */
export function unitPrice(prices: Record<string, number>, kind: string, variant: string): number {
  const k = priceKey(kind, variant);
  const o = prices[k];
  return typeof o === 'number' ? o : variantOf(kind, variant).price;
}

export function extraPrice(prices: Record<string, number>, key: string): number {
  const o = prices[key];
  if (typeof o === 'number') return o;
  return EXTRA_PRICES.find((e) => e.key === key)?.price ?? 0;
}

export function lineLength(it: PlanItem): number {
  return Math.hypot(it.x2 - it.x, it.y2 - it.y);
}

/** ブロック塀の高さ(m) */
export function blockHeight(it: PlanItem): number {
  const rows = Number(it.props.rows ?? 3);
  return r2(rows * BLOCK_ROW_HEIGHT);
}

/** 部材 1 つの数量（丸める前） */
export function itemQty(it: PlanItem): number {
  const c = catalogOf(it.kind);
  switch (c.qty) {
    case 'area':
      return it.w * it.h;
    case 'length':
      return lineLength(it);
    case 'wallArea':
      return lineLength(it) * blockHeight(it);
    case 'count':
      return c.countLabel ? Math.max(1, Math.round(it.count)) : 1;
    default:
      return 0;
  }
}

/** 新しい部材を作る。cx, cy は置きたい中心位置 */
export function createItem(kind: string, cx: number, cy: number, variantKey?: string): PlanItem {
  const c = catalogOf(kind);
  const v = c.variants.find((x) => x.key === variantKey) ?? c.variants[0];
  const it: PlanItem = {
    id: uid(),
    kind,
    variant: v.key,
    x: cx,
    y: cy,
    w: 0,
    h: 0,
    x2: cx,
    y2: cy,
    rot: 0,
    count: 1,
    props: {},
  };
  if (c.shape === 'rect') {
    const [w, h] = v.size ?? c.size ?? [2, 2];
    it.w = w;
    it.h = h;
    it.x = r2(cx - w / 2);
    it.y = r2(cy - h / 2);
  } else if (c.shape === 'line') {
    const len = c.length ?? 3;
    it.x = r2(cx - len / 2);
    it.x2 = r2(cx + len / 2);
    it.y = r2(cy);
    it.y2 = r2(cy);
  } else {
    it.x = r2(cx);
    it.y = r2(cy);
  }
  if (kind === 'steps') it.count = 2;
  if (kind === 'block') it.props.rows = 3;
  if (kind === 'fence') it.props.baseRows = 0;
  if (kind === 'house') {
    it.props.floors = 2;
    it.props.roof = 'gable';
    it.props.wall = 'white';
    it.props.door = 'center';
  }
  return it;
}
