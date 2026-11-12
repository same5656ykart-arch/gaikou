import type { Answers, Plan, Project, Settings } from '../types';
import { createItem } from './catalog';
import { newEstimateState } from './estimate';
import { setBoundary } from './existing';
import { todayISO, uid } from './format';
import { generatePlan } from './planFromSurvey';

// はじめて開いたときに入れるサンプル案件。ひととおりの機能を触れるようにしてある。

export const SAMPLE_ANSWERS: Answers = {
  customerName: '山田 太郎',
  address: '埼玉県さいたま市見沼区〇〇町 1-2-3',
  phone: '090-0000-0000',
  surveyor: '（サンプル）',
  siteChecked: 'yes',
  roadWidth: 6,
  levelDiff: 'low',
  curbCut: 'yes',
  gutter: 'u-lid',
  boundaryMarks: 'some',
  groundType: ['soil', 'weeds'],
  weedArea: 40,
  drainage: 'good',
  slope: 'flat',
  utilities: ['waterMeter', 'sewage', 'rain', 'ac'],
  utilitiesInArea: 'yes',
  utilitiesNote: '駐車場の予定地に汚水桝が1つ。',
  wants: ['parking', 'carport', 'approach', 'gatepost', 'fence', 'lawn', 'gravel', 'deck', 'plants', 'light'],
  carCount: '2',
  fenceSides: ['left', 'right', 'back'],
  fenceType: 'mesh',
  lawnType: 'natural',
  taste: 'natural',
  budget: '200-300',
  timing: '3m',
  wantsNote: '道路からリビングが見えにくいようにしたい。',
};

/** サンプルの既存図：敷地 12×16m、建物 8×7m。奥に古いブロック塀、庭に木、駐車場の予定地に桝がある */
export function sampleExistingPlan(): Plan {
  const house = createItem('house', 0, 0);
  let plan: Plan = {
    site: { width: 12, depth: 16 },
    roadWidth: 6,
    items: [{ ...house, x: 2, y: 6.5, w: 8, h: 7, props: { ...house.props, floors: 2, door: 'left' } }],
  };
  // 奥の境界のブロック塀（3段）は残して、その上にフェンスを付ける
  plan = setBoundary(plan, 'back', 'block', false);
  plan = { ...plan, items: plan.items.map((it) => (it.kind === 'exBlock' ? { ...it, props: { ...it.props, rows: 3 } } : it)) };
  const oldTree = createItem('exTree', 8.2, 3.2, 'remove');
  const masu = createItem('masu', 9.6, 4.6, 'sewage');
  const meter = createItem('meter', 1.2, 0.5, 'water');
  return { ...plan, items: [...plan.items, oldTree, masu, meter] };
}

export function makeSampleProject(settings: Settings): Project {
  const now = Date.now();
  const answers: Answers = { ...SAMPLE_ANSWERS, surveyDate: todayISO() };
  const plan = generatePlan(sampleExistingPlan(), answers);
  // 自動作成に少し手を加えた状態にしておく（玄関前の植え込み）
  const bed = createItem('flowerbed', 1.2, 5.9, 'brick');
  bed.x = 0.3;
  bed.y = 5.6;
  bed.w = 2.6;
  bed.h = 0.7;
  const firstLine = plan.items.findIndex((it) => it.kind === 'fence');
  plan.items.splice(firstLine < 0 ? plan.items.length : firstLine, 0, bed);
  plan.items.push(createItem('tree', 1.1, 3.4, 'mid'), createItem('shrub', 2.2, 4.4, 'shrub'), createItem('shrub', 0.9, 4.6, 'ground'));
  return {
    id: uid(),
    name: '山田様邸 新築外構工事（サンプル）',
    createdAt: now,
    updatedAt: now,
    sample: true,
    survey: { answers, photos: [] },
    plan,
    estimate: { ...newEstimateState(settings, 1), note: 'サンプルの見積もりです。単価は参考値のため、設定の単価表で自社の単価に変更してください。' },
  };
}
