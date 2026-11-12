import type { Answers } from '../types';

// 現地調査ウィザードの質問定義。
// 専門用語を避け、選ぶだけ・測るだけで終わるようにしている。

export interface Option {
  v: string;
  label: string;
  desc?: string;
}

interface QBase {
  id: string;
  label: string;
  hint?: string;
  showIf?: (a: Answers) => boolean;
}

export type Question =
  | (QBase & { type: 'text' | 'tel' | 'date' | 'textarea'; placeholder?: string })
  | (QBase & { type: 'number'; unit: string; step?: number; min?: number; max?: number; quick?: number[]; mark?: string })
  | (QBase & { type: 'choice'; options: Option[] })
  | (QBase & { type: 'multi'; options: Option[] });

export interface Step {
  id: string;
  title: string;
  lead: string;
  questions: Question[];
  /** 専用の画面を持つステップ */
  custom?: 'size' | 'photos' | 'summary';
  tip?: string;
}

const has = (a: Answers, id: string, v: string) => {
  const x = a[id];
  return Array.isArray(x) ? x.includes(v) : x === v;
};

export const STEPS: Step[] = [
  {
    id: 'customer',
    title: 'お客様',
    lead: 'まずはお客様と現場の情報を入力します。',
    questions: [
      { id: 'customerName', type: 'text', label: 'お客様のお名前', placeholder: '山田 太郎' },
      { id: 'address', type: 'text', label: '工事する場所の住所', placeholder: '〇〇市〇〇町1-2-3' },
      { id: 'phone', type: 'tel', label: '電話番号', placeholder: '090-1234-5678' },
      { id: 'surveyDate', type: 'date', label: '調査した日' },
      { id: 'surveyor', type: 'text', label: '調査した人', placeholder: '担当者名' },
    ],
  },
  {
    id: 'size',
    title: '敷地のサイズ',
    lead: '図のA〜Fを順番に測ります。この数字から平面図と3Dが自動でできます。',
    custom: 'size',
    tip: 'メジャーが届かないときは、ブロック1個の横幅＝40cm、大人の1歩＝約70cmで数えても大丈夫。あとから直せます。',
    questions: [
      { id: 'siteWidth', type: 'number', mark: 'A', label: '敷地の幅（間口）', unit: 'm', step: 0.1, min: 2, max: 80, hint: '道路に沿って、敷地の端から端まで' },
      { id: 'siteDepth', type: 'number', mark: 'B', label: '敷地の奥行', unit: 'm', step: 0.1, min: 2, max: 80, hint: '道路との境から、いちばん奥まで' },
      { id: 'houseWidth', type: 'number', mark: 'C', label: '建物の幅', unit: 'm', step: 0.1, min: 2, max: 60, hint: '道路と平行な向きの長さ' },
      { id: 'houseDepth', type: 'number', mark: 'D', label: '建物の奥行', unit: 'm', step: 0.1, min: 2, max: 60 },
      { id: 'houseFront', type: 'number', mark: 'E', label: '道路から建物まで', unit: 'm', step: 0.1, min: 0, max: 60, hint: '道路との境から、建物の手前の壁まで' },
      { id: 'houseLeft', type: 'number', mark: 'F', label: '左の境から建物まで', unit: 'm', step: 0.1, min: 0, max: 60, hint: '道路から敷地を見て左側' },
      {
        id: 'houseDoor',
        type: 'choice',
        label: '玄関の位置（道路から見て）',
        options: [
          { v: 'left', label: '左寄り' },
          { v: 'center', label: 'まん中' },
          { v: 'right', label: '右寄り' },
        ],
      },
      {
        id: 'houseFloors',
        type: 'choice',
        label: '建物の階数',
        options: [
          { v: '1', label: '平屋' },
          { v: '2', label: '2階建て' },
          { v: '3', label: '3階建て' },
        ],
      },
    ],
  },
  {
    id: 'road',
    title: '道路・高さ',
    lead: '前の道路と、敷地との高さの差を確認します。',
    questions: [
      { id: 'roadWidth', type: 'number', label: '前の道路の幅', unit: 'm', step: 0.5, min: 1, max: 40, quick: [4, 6, 8], hint: '車1台がやっと通れる幅なら約4m、すれ違えるなら約6m' },
      {
        id: 'levelDiff',
        type: 'choice',
        label: '道路と敷地の高さの差',
        hint: '道路に立って、敷地の地面がどのくらい高いか',
        options: [
          { v: 'flat', label: 'ほぼ同じ', desc: '0〜10cm' },
          { v: 'low', label: '少し高い', desc: '10〜30cm' },
          { v: 'mid', label: '高い', desc: '30〜60cm' },
          { v: 'high', label: 'かなり高い', desc: '60cm以上' },
          { v: 'below', label: '道路より低い' },
        ],
      },
      {
        id: 'curbCut',
        type: 'choice',
        label: '車の乗り入れ口（歩道・縁石の切り下げ）',
        hint: '歩道や縁石が、車が入れるよう低くなっているか',
        options: [
          { v: 'yes', label: 'ある' },
          { v: 'no', label: 'ない' },
          { v: 'none', label: '歩道・縁石がない' },
          { v: 'unknown', label: 'わからない' },
        ],
      },
      {
        id: 'gutter',
        type: 'choice',
        label: '道路ぎわの側溝',
        options: [
          { v: 'u-lid', label: 'フタつきの溝' },
          { v: 'u-open', label: 'フタなしの溝' },
          { v: 'l', label: 'L字の縁石のみ' },
          { v: 'none', label: 'ない・わからない' },
        ],
      },
      {
        id: 'boundaryMarks',
        type: 'choice',
        label: '境界杭（となりとの境の目印）',
        hint: '敷地の四すみにある金属プレートやコンクリート杭',
        options: [
          { v: 'all', label: 'ぜんぶ見つけた' },
          { v: 'some', label: '一部だけ' },
          { v: 'none', label: '見つからない' },
        ],
      },
    ],
  },
  {
    id: 'ground',
    title: '地面',
    lead: 'いまの地面のようすを選びます。',
    questions: [
      {
        id: 'groundType',
        type: 'multi',
        label: 'いまの地面（あてはまるもの全部）',
        options: [
          { v: 'soil', label: '土' },
          { v: 'gravel', label: '砂利' },
          { v: 'concrete', label: 'コンクリート' },
          { v: 'asphalt', label: 'アスファルト' },
          { v: 'lawn', label: '芝' },
          { v: 'weeds', label: '雑草が多い' },
        ],
      },
      { id: 'weedArea', type: 'number', label: '草刈りが必要な広さ（だいたい）', unit: 'm²', step: 1, min: 0, max: 2000, hint: 'たて×よこ。車1台分で約15m²', showIf: (a) => has(a, 'groundType', 'weeds') },
      {
        id: 'drainage',
        type: 'choice',
        label: '水はけ',
        hint: '雨のあとの水たまり、コケ、ぬかるみがないか',
        options: [
          { v: 'good', label: '良い' },
          { v: 'bad', label: '水たまりができる' },
          { v: 'unknown', label: 'わからない' },
        ],
      },
      {
        id: 'slope',
        type: 'choice',
        label: '敷地の傾き',
        options: [
          { v: 'flat', label: 'ほぼ平ら' },
          { v: 'gentle', label: 'ゆるい坂' },
          { v: 'steep', label: '急な坂・段差あり' },
        ],
      },
    ],
  },
  {
    id: 'existing',
    title: '撤去するもの',
    lead: 'いまあるもので、残すもの・撤去するものを確認します。数字は見積もりに入ります。',
    questions: [
      {
        id: 'existingBlock',
        type: 'choice',
        label: 'いまあるブロック塀',
        options: [
          { v: 'none', label: 'ない' },
          { v: 'keep', label: 'ある（そのまま使う）' },
          { v: 'remove', label: 'ある（撤去したい）' },
        ],
      },
      { id: 'demoBlockLength', type: 'number', label: '撤去するブロック塀の長さ', unit: 'm', step: 0.5, min: 0, max: 200, showIf: (a) => a.existingBlock === 'remove' },
      { id: 'demoBlockHeight', type: 'number', label: '撤去するブロック塀の高さ', unit: 'm', step: 0.2, min: 0, max: 3, quick: [0.6, 1.0, 1.2, 1.6], hint: 'ブロック1段＝20cm。段数×0.2', showIf: (a) => a.existingBlock === 'remove' },
      {
        id: 'blockCondition',
        type: 'choice',
        label: 'ブロック塀の状態',
        options: [
          { v: 'ok', label: '問題なし' },
          { v: 'damaged', label: 'ひび・傾きがある' },
        ],
        showIf: (a) => a.existingBlock === 'keep',
      },
      {
        id: 'existingFence',
        type: 'choice',
        label: 'いまあるフェンス',
        options: [
          { v: 'none', label: 'ない' },
          { v: 'keep', label: 'ある（そのまま使う）' },
          { v: 'remove', label: 'ある（撤去したい）' },
        ],
      },
      { id: 'demoFenceLength', type: 'number', label: '撤去するフェンスの長さ', unit: 'm', step: 0.5, min: 0, max: 200, showIf: (a) => a.existingFence === 'remove' },
      { id: 'demoConcreteArea', type: 'number', label: '壊すコンクリート・アスファルトの広さ', unit: 'm²', step: 1, min: 0, max: 1000, hint: 'なければ空欄のまま。たて×よこ' },
      { id: 'demoTreeCount', type: 'number', label: '切って根も抜く木の本数', unit: '本', step: 1, min: 0, max: 100, hint: 'なければ空欄のまま' },
      { id: 'demoShedCount', type: 'number', label: '撤去する物置の数', unit: '台', step: 1, min: 0, max: 20, hint: 'なければ空欄のまま' },
      { id: 'existingNote', type: 'textarea', label: 'そのほか、残すもの・撤去するもの', placeholder: '例：古い門柱は撤去。庭石は残す。' },
    ],
  },
  {
    id: 'utilities',
    title: '設備の位置',
    lead: 'メーターや桝（マス）を探します。見つけたらチェックして、写真も撮っておきましょう。',
    tip: '桝（マス）は地面にある丸や四角のフタです。コンクリートを打つ場所にあると、高さの調整が必要になります。',
    questions: [
      {
        id: 'utilities',
        type: 'multi',
        label: '見つけたもの',
        options: [
          { v: 'waterMeter', label: '水道メーター' },
          { v: 'sewage', label: '汚水の桝' },
          { v: 'rain', label: '雨水の桝' },
          { v: 'gas', label: 'ガスメーター' },
          { v: 'boiler', label: '給湯器・エコキュート' },
          { v: 'ac', label: 'エアコン室外機' },
          { v: 'faucet', label: '外の水道（立水栓・散水栓）' },
          { v: 'outlet', label: '外のコンセント' },
          { v: 'septic', label: '浄化槽' },
          { v: 'pole', label: '電柱・支線' },
        ],
      },
      {
        id: 'utilitiesInArea',
        type: 'choice',
        label: '工事する場所に、メーターや桝がある？',
        options: [
          { v: 'no', label: 'ない' },
          { v: 'yes', label: 'ある' },
          { v: 'unknown', label: 'わからない' },
        ],
      },
      { id: 'utilitiesNote', type: 'textarea', label: 'メモ', placeholder: '例：駐車場の予定地に汚水桝が2つ。' },
    ],
  },
  {
    id: 'access',
    title: '工事のしやすさ',
    lead: '工事車両や機械が入れるかを確認します。金額に影響します。',
    questions: [
      {
        id: 'truckParking',
        type: 'choice',
        label: '工事のトラック（2t）を停める場所',
        options: [
          { v: 'site', label: '敷地の中に停められる' },
          { v: 'road', label: '前の道路に停められる' },
          { v: 'hard', label: '停めにくい' },
        ],
      },
      {
        id: 'machineAccess',
        type: 'choice',
        label: '小型ショベル（幅1.5mくらい）が入れる？',
        hint: '工事する場所まで、幅1.5m以上の通り道があるか',
        options: [
          { v: 'yes', label: '入れる' },
          { v: 'no', label: '入れない' },
          { v: 'unknown', label: 'わからない' },
        ],
      },
      {
        id: 'neighbors',
        type: 'choice',
        label: 'お隣の建物との距離',
        options: [
          { v: 'far', label: '余裕がある' },
          { v: 'near', label: '近い（1m未満）' },
        ],
      },
      {
        id: 'overhead',
        type: 'choice',
        label: '上にある障害物（電線・木の枝・ひさし）',
        options: [
          { v: 'no', label: 'ない' },
          { v: 'yes', label: 'ある' },
        ],
      },
      { id: 'accessNote', type: 'textarea', label: 'メモ', placeholder: '例：通学路のため朝8時台は車両通行不可。' },
    ],
  },
  {
    id: 'wants',
    title: 'ご要望',
    lead: 'お客様がやりたい工事を選びます。選んだ内容で平面図のたたき台を作ります。',
    questions: [
      {
        id: 'wants',
        type: 'multi',
        label: 'やりたい工事（あてはまるもの全部）',
        options: [
          { v: 'parking', label: '駐車場' },
          { v: 'carport', label: 'カーポート' },
          { v: 'approach', label: 'アプローチ', desc: '玄関までの通路' },
          { v: 'gatepost', label: '門柱・ポスト' },
          { v: 'fence', label: 'フェンス' },
          { v: 'lawn', label: '芝生' },
          { v: 'gravel', label: '砂利・雑草対策' },
          { v: 'deck', label: 'ウッドデッキ' },
          { v: 'plants', label: '植栽' },
          { v: 'light', label: '照明' },
          { v: 'faucet', label: '立水栓' },
          { v: 'shed', label: '物置' },
          { v: 'cycleport', label: 'サイクルポート' },
        ],
      },
      {
        id: 'carCount',
        type: 'choice',
        label: '停めたい車の台数',
        options: [
          { v: '1', label: '1台' },
          { v: '2', label: '2台' },
          { v: '3', label: '3台' },
          { v: '4', label: '4台' },
        ],
        showIf: (a) => has(a, 'wants', 'parking') || has(a, 'wants', 'carport'),
      },
      {
        id: 'fenceSides',
        type: 'multi',
        label: 'フェンスを付ける場所（道路から見て）',
        options: [
          { v: 'left', label: '左' },
          { v: 'right', label: '右' },
          { v: 'back', label: '奥' },
        ],
        showIf: (a) => has(a, 'wants', 'fence'),
      },
      {
        id: 'fenceType',
        type: 'choice',
        label: 'フェンスの種類',
        options: [
          { v: 'mesh', label: 'メッシュ', desc: '手頃・境界向き' },
          { v: 'alumi', label: 'アルミ', desc: 'すっきり' },
          { v: 'privacy18', label: '目隠し', desc: '高さ1.8m' },
        ],
        showIf: (a) => has(a, 'wants', 'fence'),
      },
      {
        id: 'lawnType',
        type: 'choice',
        label: '芝の種類',
        options: [
          { v: 'natural', label: '天然芝', desc: '安いが手入れが必要' },
          { v: 'artificial', label: '人工芝', desc: '手入れがほぼ不要' },
        ],
        showIf: (a) => has(a, 'wants', 'lawn'),
      },
      {
        id: 'taste',
        type: 'choice',
        label: 'お好みの雰囲気',
        options: [
          { v: 'modern', label: 'シンプルモダン' },
          { v: 'natural', label: 'ナチュラル' },
          { v: 'japanese', label: '和風' },
          { v: 'western', label: '洋風' },
          { v: 'any', label: 'おまかせ' },
        ],
      },
      {
        id: 'budget',
        type: 'choice',
        label: 'ご予算の目安',
        options: [
          { v: '-50', label: '50万円まで' },
          { v: '50-100', label: '50〜100万円' },
          { v: '100-200', label: '100〜200万円' },
          { v: '200-300', label: '200〜300万円' },
          { v: '300-', label: '300万円以上' },
          { v: 'unknown', label: '未定' },
        ],
      },
      {
        id: 'timing',
        type: 'choice',
        label: '工事の希望時期',
        options: [
          { v: 'asap', label: 'できるだけ早く' },
          { v: '3m', label: '3か月以内' },
          { v: '6m', label: '半年以内' },
          { v: 'unknown', label: '未定' },
        ],
      },
      { id: 'wantsNote', type: 'textarea', label: 'そのほかのご要望', placeholder: '例：自転車を3台置きたい。道路からリビングが見えないようにしたい。' },
    ],
  },
  {
    id: 'photos',
    title: '写真',
    lead: '枠をタップして撮影します。あとで見返せるよう、広めに撮るのがコツです。',
    custom: 'photos',
    questions: [],
  },
  {
    id: 'summary',
    title: 'まとめ',
    lead: '入力した内容を確認して、平面図を自動で作ります。',
    custom: 'summary',
    questions: [],
  },
];

export const PHOTO_SLOTS: { key: string; label: string; must?: boolean }[] = [
  { key: 'front', label: '道路から正面の全体', must: true },
  { key: 'left', label: '左ななめから', must: true },
  { key: 'right', label: '右ななめから', must: true },
  { key: 'entrance', label: '玄関まわり' },
  { key: 'parking', label: '駐車場の予定地' },
  { key: 'boundaryL', label: '左の境界' },
  { key: 'boundaryR', label: '右の境界' },
  { key: 'boundaryB', label: '奥の境界' },
  { key: 'meter', label: 'メーター・桝' },
  { key: 'level', label: '高さの差がわかる写真' },
  { key: 'road', label: '前の道路・搬入経路' },
  { key: 'other', label: 'そのほか' },
];

export function visibleQuestions(step: Step, a: Answers): Question[] {
  return step.questions.filter((q) => !q.showIf || q.showIf(a));
}

export function isAnswered(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** ステップごとの回答数（メモ欄は数えない） */
export function stepProgress(step: Step, a: Answers, photoCount = 0): { done: number; total: number } {
  if (step.custom === 'photos') {
    return { done: Math.min(photoCount, 3), total: 3 };
  }
  const qs = visibleQuestions(step, a).filter((q) => q.type !== 'textarea');
  // 「なければ空欄」の質問は必須扱いにしない
  const required = qs.filter((q) => !(q.type === 'number' && /^demo(Concrete|Tree|Shed)/.test(q.id)));
  return { done: required.filter((q) => isAnswered(a[q.id])).length, total: required.length };
}

export function surveyProgress(a: Answers, photoCount: number): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const s of STEPS) {
    if (s.custom === 'summary') continue;
    const p = stepProgress(s, a, photoCount);
    done += p.done;
    total += p.total;
  }
  return { done, total };
}

/** 回答を表示用の文字列にする */
export function answerText(q: Question, v: unknown): string {
  if (!isAnswered(v)) return '';
  if (q.type === 'choice') return q.options.find((o) => o.v === v)?.label ?? String(v);
  if (q.type === 'multi') {
    const arr = Array.isArray(v) ? v : [];
    return arr.map((x) => q.options.find((o) => o.v === x)?.label ?? x).join('、');
  }
  if (q.type === 'number') return `${v}${q.unit}`;
  return String(v);
}

export interface SurveyAlert {
  level: 'warn' | 'info';
  title: string;
  body: string;
}

/** 現調の回答から、見積もり・提案で気をつける点を拾う */
export function surveyAlerts(a: Answers): SurveyAlert[] {
  const out: SurveyAlert[] = [];
  const wants = Array.isArray(a.wants) ? a.wants : [];
  const parking = wants.includes('parking') || wants.includes('carport');
  if (a.levelDiff === 'mid' || a.levelDiff === 'high') {
    out.push({
      level: 'warn',
      title: '道路との高さの差が大きい',
      body: '土留めブロックや階段・スロープが必要になることがあります。土を削って運び出す費用も増えるため、平面図に「階段・ステップ」「型枠ブロック（土留め）」を追加して確認してください。',
    });
  }
  if (a.levelDiff === 'below') {
    out.push({
      level: 'warn',
      title: '敷地が道路より低い',
      body: '雨水が流れ込みやすい敷地です。排水（溝・排水桝）の計画を経験者に確認してください。',
    });
  }
  if (parking && a.curbCut === 'no') {
    out.push({
      level: 'warn',
      title: '車の乗り入れ口がない',
      body: '歩道・縁石の切り下げ工事が必要です。道路を管理する役所への申請（数週間かかります）と別途費用がかかります。',
    });
  }
  if (parking && a.gutter === 'u-open') {
    out.push({
      level: 'info',
      title: '側溝にフタがない',
      body: '車が乗り入れる部分に、溝フタ（グレーチング）の設置が必要です。見積もりに手入力で追加してください。',
    });
  }
  if (a.boundaryMarks === 'some' || a.boundaryMarks === 'none') {
    out.push({
      level: 'warn',
      title: '境界杭を確認できていない',
      body: 'フェンスやブロックを境界ぎわに作る前に、お客様・お隣と境界の位置を確認してください。',
    });
  }
  if (a.drainage === 'bad') {
    out.push({
      level: 'info',
      title: '水はけが悪い',
      body: 'コンクリートの勾配や排水桝、暗きょ排水の追加を検討してください。',
    });
  }
  if (a.slope === 'steep') {
    out.push({
      level: 'warn',
      title: '敷地に急な傾き・段差がある',
      body: '整地や土留めの費用が増えます。3Dは平らな地面で表示されるため、実際の高さは現地で確認してください。',
    });
  }
  if (a.blockCondition === 'damaged') {
    out.push({
      level: 'warn',
      title: '既存ブロック塀にひび・傾きがある',
      body: 'その上にフェンスを付けるのは危険です。撤去して作り直す提案を検討してください。',
    });
  }
  if (a.utilitiesInArea === 'yes') {
    out.push({
      level: 'info',
      title: '工事範囲にメーター・桝がある',
      body: 'コンクリートを打つ場合は桝の高さ調整（1か所 5,000〜15,000円程度）が必要です。数を数えて手入力で追加してください。',
    });
  }
  if (a.machineAccess === 'no') {
    out.push({
      level: 'warn',
      title: '小型ショベルが入れない',
      body: '手作業になるため、掘削や運搬の手間が増えます。「重機回送・資材運搬費」を外し、人力作業の割増を手入力で追加してください。',
    });
  }
  if (a.truckParking === 'hard') {
    out.push({
      level: 'info',
      title: 'トラックを停めにくい',
      body: '近くの駐車場代や、資材を手で運ぶ費用（小運搬）がかかることがあります。',
    });
  }
  const road = typeof a.roadWidth === 'number' ? a.roadWidth : Number(a.roadWidth);
  if (Number.isFinite(road) && road > 0 && road < 4) {
    out.push({
      level: 'info',
      title: '前の道路がせまい',
      body: '生コン車やダンプが入れないことがあります。小型車での搬入になり費用が上がる場合があります。',
    });
  }
  if (a.overhead === 'yes' && wants.includes('carport')) {
    out.push({
      level: 'info',
      title: 'カーポートの上に障害物がある',
      body: '電線・ひさし・木の枝と屋根がぶつからないか、高さを確認してください。',
    });
  }
  if (a.neighbors === 'near') {
    out.push({
      level: 'info',
      title: 'お隣が近い',
      body: '工事前のあいさつと、ほこり・音への配慮（養生シートなど）を忘れずに。',
    });
  }
  return out;
}
