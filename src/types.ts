// アプリ全体で使うデータ型

export type Shape = 'rect' | 'line' | 'point';

/** 平面図に置く部材 1 つ。座標は m。原点は敷地の左手前（道路側）の角、x は右、y は奥。 */
export interface PlanItem {
  id: string;
  /** カタログのキー（concrete, fence など） */
  kind: string;
  /** 仕様（グレード）のキー */
  variant: string;
  /** rect: 左手前の角 / point: 中心 / line: 始点 */
  x: number;
  y: number;
  /** rect のサイズ（幅・奥行） */
  w: number;
  h: number;
  /** line の終点 */
  x2: number;
  y2: number;
  /** point の向き（0 or 90 度） */
  rot: number;
  /** 段数など、数量を手で決める部材用 */
  count: number;
  /** 高さ(m)・ブロック段数・建物の階数など */
  props: Record<string, string | number>;
}

export interface Plan {
  site: { width: number; depth: number };
  /** 前面道路の幅(m)。図と 3D の表示用 */
  roadWidth: number;
  items: PlanItem[];
}

export type AnswerValue = string | number | string[];
export type Answers = Record<string, AnswerValue | undefined>;

export interface PhotoRef {
  id: string;
  slot: string;
  createdAt: number;
}

export interface Survey {
  answers: Answers;
  photos: PhotoRef[];
}

export interface ManualLine {
  id: string;
  name: string;
  spec: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface EstimateState {
  /** 見積番号 */
  number: string;
  /** 発行日 (YYYY-MM-DD) */
  date: string;
  /** 有効期限（日数） */
  validDays: number;
  /** 諸経費率 (%) */
  overheadRate: number;
  /** 値引き（円） */
  discount: number;
  /** 見積から外した行の ID */
  excluded: string[];
  /** 行ごとの単価の手入力 */
  priceOverrides: Record<string, number>;
  /** 行ごとの数量の手入力 */
  qtyOverrides: Record<string, number>;
  manual: ManualLine[];
  note: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sample?: boolean;
  survey: Survey;
  /** 既存図（敷地・建物・いまあるもの）と、これから作る部材。案件を作った時点で建物入りで用意する */
  plan: Plan;
  estimate: EstimateState;
  /** 提案書に載せる 3D パース画像（写真ストアの ID） */
  perspectiveId?: string;
}

export interface Company {
  name: string;
  zip: string;
  address: string;
  tel: string;
  registrationNo: string;
  staff: string;
}

export interface Settings {
  company: Company;
  /** 単価の上書き。キーは 'kind:variant' または撤去項目のキー */
  prices: Record<string, number>;
  /** 消費税率 (%) */
  taxRate: number;
  /** 新規案件の諸経費率 (%) */
  overheadRate: number;
}

export type Tab = 'survey' | 'plan' | 'view3d' | 'estimate';
