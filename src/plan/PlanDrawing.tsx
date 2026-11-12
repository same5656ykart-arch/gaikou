import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Plan, PlanItem } from '../types';
import { catalogOf, hasKind, isRemoved, lineLength, variantOf } from '../lib/catalog';
import { meters } from '../lib/format';

// 平面図の描画。エディタと印刷（見積書の添付図）の両方で使う。
// 座標は m。SVG では y を反転（奥が上）して描く。

interface Props {
  plan: Plan;
  /** 1px あたりの m。文字やハンドルを画面上で一定の大きさに保つために使う */
  mpp: number;
  /** defs の ID がページ内で重ならないようにする接頭辞 */
  idp: string;
  onItemDown?: (e: ReactPointerEvent, item: PlanItem) => void;
  showGrid?: boolean;
}

/** 重ね順（カタログの z）で並べる。同じ z の中では配列の順 */
export function sortedItems(plan: Plan): PlanItem[] {
  return plan.items
    .filter((it) => hasKind(it.kind))
    .map((it, i) => ({ it, i, z: catalogOf(it.kind).z }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((x) => x.it);
}

export function treeRadius(it: PlanItem): number {
  if (it.kind === 'tree') return it.variant === 'mid' ? 0.6 : 0.95;
  if (it.kind === 'exTree') return 0.8;
  if (it.kind === 'shrub') return it.variant === 'ground' ? 0.22 : 0.32;
  return 0.2;
}

/** point 部材の見た目の大きさ（幅・奥行）。回転を反映 */
export function pointSize(it: PlanItem): [number, number] {
  let w = 0.4;
  let d = 0.4;
  if (it.kind === 'gatepost') [w, d] = it.variant === 'func' ? [0.45, 0.18] : [1.2, 0.2];
  else if (it.kind === 'gate') [w, d] = [variantOf('gate', it.variant).width ?? 0.8, 0.12];
  else if (it.kind === 'tree' || it.kind === 'shrub' || it.kind === 'exTree') w = d = treeRadius(it) * 2;
  else if (it.kind === 'masu') w = d = 0.44;
  else if (it.kind === 'meter') [w, d] = [0.44, 0.28];
  else if (it.kind === 'faucet') w = d = 0.34;
  else if (it.kind === 'light') w = d = 0.3;
  return it.rot === 90 ? [d, w] : [w, d];
}

/** 敷地の境界線の上にある線か（長さは敷地の寸法と同じなので、ラベルを省く） */
function onBoundary(it: PlanItem, plan: Plan): boolean {
  const e = 0.06;
  const W = plan.site.width;
  const D = plan.site.depth;
  const both = (a: number, b: number, v: number) => Math.abs(a - v) < e && Math.abs(b - v) < e;
  return both(it.x, it.x2, 0) || both(it.x, it.x2, W) || both(it.y, it.y2, 0) || both(it.y, it.y2, D);
}

function Defs({ idp }: { idp: string }) {
  return (
    <defs>
      <pattern id={`${idp}gravel`} width="0.5" height="0.5" patternUnits="userSpaceOnUse">
        <rect width="0.5" height="0.5" fill="#e7e2d6" />
        <circle cx="0.08" cy="0.1" r="0.035" fill="#b3ab99" />
        <circle cx="0.3" cy="0.06" r="0.028" fill="#c9c2b2" />
        <circle cx="0.42" cy="0.24" r="0.035" fill="#a9a190" />
        <circle cx="0.18" cy="0.3" r="0.03" fill="#bdb5a3" />
        <circle cx="0.33" cy="0.42" r="0.035" fill="#b3ab99" />
        <circle cx="0.06" cy="0.44" r="0.025" fill="#c9c2b2" />
      </pattern>
      <pattern id={`${idp}lawn`} width="0.4" height="0.4" patternUnits="userSpaceOnUse">
        <rect width="0.4" height="0.4" fill="#b9d8a4" />
        <path d="M0.06 0.16l0.03-0.09M0.12 0.16l0-0.1M0.26 0.34l0.03-0.09M0.32 0.34l-0.01-0.1" stroke="#7fae63" strokeWidth="0.018" fill="none" />
      </pattern>
      <pattern id={`${idp}tile`} width="0.6" height="0.6" patternUnits="userSpaceOnUse">
        <rect width="0.6" height="0.6" fill="#ebe4d8" />
        <path d="M0 0H0.6M0 0V0.6" stroke="#b9ae9a" strokeWidth="0.025" fill="none" />
      </pattern>
      <pattern id={`${idp}brick`} width="0.4" height="0.2" patternUnits="userSpaceOnUse">
        <rect width="0.4" height="0.2" fill="#dcc4b2" />
        <path d="M0 0H0.4M0 0.1H0.4M0 0V0.1M0.2 0.1V0.2" stroke="#b08d75" strokeWidth="0.018" fill="none" />
      </pattern>
      <pattern id={`${idp}stone`} width="0.9" height="0.8" patternUnits="userSpaceOnUse">
        <rect width="0.9" height="0.8" fill="#e8d9bf" />
        <path
          d="M0 0.3L0.25 0.22L0.4 0.4L0.7 0.34L0.9 0.3M0.25 0.22L0.3 0M0.7 0.34L0.62 0M0.4 0.4L0.34 0.66L0 0.72M0.34 0.66L0.66 0.7L0.9 0.72M0.66 0.7L0.7 0.34M0.3 0.8L0.34 0.66M0.62 0.8L0.66 0.7"
          stroke="#b79f76"
          strokeWidth="0.022"
          fill="none"
        />
      </pattern>
      <pattern id={`${idp}deck`} width="0.14" height="0.14" patternUnits="userSpaceOnUse">
        <rect width="0.14" height="0.14" fill="#c9a276" />
        <path d="M0 0H0.14" stroke="#9c7447" strokeWidth="0.02" fill="none" />
      </pattern>
      <pattern id={`${idp}carport`} width="0.5" height="0.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="0.5" height="0.5" fill="rgba(111,160,196,0.22)" />
        <path d="M0 0V0.5" stroke="rgba(63,111,147,0.45)" strokeWidth="0.03" fill="none" />
      </pattern>
      <pattern id={`${idp}remove`} width="0.3" height="0.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0V0.3" stroke="#c2362b" strokeOpacity="0.55" strokeWidth="0.05" fill="none" />
      </pattern>
      <pattern id={`${idp}flowerbed`} width="0.4" height="0.4" patternUnits="userSpaceOnUse">
        <rect width="0.4" height="0.4" fill="#a98566" />
        <circle cx="0.1" cy="0.12" r="0.06" fill="#6fa862" />
        <circle cx="0.3" cy="0.3" r="0.06" fill="#86b96f" />
        <circle cx="0.3" cy="0.1" r="0.03" fill="#e58aa0" />
        <circle cx="0.1" cy="0.32" r="0.03" fill="#f0c95a" />
      </pattern>
    </defs>
  );
}

/** 撤去するものを示す赤 */
const REMOVE = '#c2362b';

const PATTERNED = new Set(['gravel', 'lawn', 'tile', 'brick', 'stone', 'deck', 'carport', 'flowerbed']);

function rectFill(it: PlanItem, idp: string): string {
  const c = catalogOf(it.kind);
  // 仕様によって模様を変えるもの
  if (it.kind === 'approach') {
    if (it.variant === 'tile') return `url(#${idp}tile)`;
    if (it.variant === 'brick') return `url(#${idp}brick)`;
    if (it.variant === 'wash') return '#e3dccb';
    return `url(#${idp}stone)`;
  }
  if (it.kind === 'lawn' && it.variant === 'artificial') return '#9fd08a';
  if (it.kind === 'gravel' && it.variant === 'sheet') return '#8e9488';
  if (c.pattern && PATTERNED.has(c.pattern)) return `url(#${idp}${c.pattern})`;
  return c.fill;
}

function RectExtras({ it }: { it: PlanItem }): ReactNode {
  const { x, y, w, h } = it;
  const top = -(y + h);
  if (it.kind === 'house') {
    // 玄関の位置を三角で示す（道路側の壁）
    const door = it.props.door === 'left' ? 0.25 : it.props.door === 'right' ? 0.75 : 0.5;
    const dx = x + w * door;
    return (
      <>
        <path d={`M${x} ${top}L${x + w} ${-y}M${x + w} ${top}L${x} ${-y}`} stroke="#c5ced6" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
        <path d={`M${dx - 0.45} ${-y}h0.9`} stroke="#e8590c" strokeWidth={5} vectorEffect="non-scaling-stroke" fill="none" />
        <path d={`M${dx} ${-y + 0.12}l-0.22 0.34h0.44z`} fill="#e8590c" />
      </>
    );
  }
  if (it.kind === 'car') {
    const vertical = h >= w;
    const r = Math.min(w, h) * 0.22;
    // フロントガラスとリアガラス
    const glass = vertical
      ? `M${x + w * 0.14} ${top + h * 0.7}h${w * 0.72}l${-w * 0.08} ${-h * 0.1}h${-w * 0.56}zM${x + w * 0.2} ${top + h * 0.2}h${w * 0.6}l${w * 0.05} ${h * 0.08}h${-w * 0.7}z`
      : `M${x + w * 0.3} ${top + h * 0.14}v${h * 0.72}l${w * 0.1} ${-h * 0.08}v${-h * 0.56}zM${x + w * 0.8} ${top + h * 0.2}v${h * 0.6}l${-w * 0.08} ${h * 0.05}v${-h * 0.7}z`;
    return (
      <>
        <rect x={x} y={top} width={w} height={h} rx={r} fill="#dfe6ee" stroke="#5d6f82" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        <path d={glass} fill="#9fb2c6" />
      </>
    );
  }
  if (it.kind === 'carport' || it.kind === 'cycleport') {
    const p = 0.12;
    const both = w >= 4.5;
    const ys = [top + h * 0.22, top + h * 0.78];
    return (
      <>
        {ys.map((py) => (
          <rect key={`l${py}`} x={x + 0.08} y={py - p / 2} width={p} height={p} fill="#3f6f93" />
        ))}
        {both && ys.map((py) => <rect key={`r${py}`} x={x + w - 0.08 - p} y={py - p / 2} width={p} height={p} fill="#3f6f93" />)}
      </>
    );
  }
  if (it.kind === 'steps') {
    const n = Math.max(1, Math.round(it.count));
    const lines: string[] = [];
    for (let i = 1; i < n; i++) lines.push(`M${x} ${top + (h * i) / n}h${w}`);
    return <path d={lines.join('')} stroke="#8f8672" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />;
  }
  if (it.kind === 'shed' || it.kind === 'exShed') {
    return <path d={`M${x} ${top}L${x + w} ${-y}M${x + w} ${top}L${x} ${-y}`} stroke="#8d97a1" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />;
  }
  return null;
}

function RectShape({ it, idp }: { it: PlanItem; idp: string }) {
  const c = catalogOf(it.kind);
  const { x, y, w, h } = it;
  const dashed = it.kind === 'carport' || it.kind === 'cycleport';
  return (
    <>
      {it.kind !== 'car' && (
        <rect
          x={x}
          y={-(y + h)}
          width={w}
          height={h}
          fill={rectFill(it, idp)}
          stroke={c.stroke}
          strokeWidth={it.kind === 'house' ? 2.5 : 1.2}
          strokeDasharray={dashed ? '6 4' : undefined}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <RectExtras it={it} />
      {isRemoved(it) && <rect x={x} y={-(y + h)} width={w} height={h} fill={`url(#${idp}remove)`} stroke={REMOVE} strokeWidth={2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" />}
    </>
  );
}

/** 名前と大きさ。図形とは別に、いちばん上の層に描く */
function RectLabel({ it, mpp }: { it: PlanItem; mpp: number }) {
  const c = catalogOf(it.kind);
  const { x, y, w, h } = it;
  const top = -(y + h);
  const fs = 11 * mpp;
  const wPx = w / mpp;
  const hPx = h / mpp;
  const removed = isRemoved(it);
  const name = it.kind === 'car' ? '' : removed ? '撤去' : c.name;
  const showName = name !== '' && wPx > name.length * 11 + 6 && hPx > 18;
  const showSize = showName && it.kind !== 'house' && hPx > 34 && wPx > 62;
  if (!showName) return null;
  return (
    <>
      <text className={'plan-label' + (removed ? ' is-remove' : '')} x={x + w / 2} y={top + h / 2 + (showSize ? -fs * 0.2 : fs * 0.36)} fontSize={fs} textAnchor="middle">
        {name}
      </text>
      {showSize && (
        <text className="plan-sub" x={x + w / 2} y={top + h / 2 + fs * 1.05} fontSize={fs * 0.9} textAnchor="middle">
          {it.kind === 'steps' ? `${Math.round(it.count)}段` : `${meters(w).replace('m', '')}×${meters(h)}`}
        </text>
      )}
    </>
  );
}

/**
 * 線のラベル。これから作るものは長さ、既存のものは「既存ブロック」などの名前、撤去するものは「撤去」。
 * boundary = 敷地の境界上（長さは敷地の寸法と同じなので省く）
 */
function LineLabel({ it, mpp, boundary, plan }: { it: PlanItem; mpp: number; boundary: boolean; plan: Plan }) {
  const len = lineLength(it);
  const old = it.kind === 'exBlock' || it.kind === 'exFence';
  const removed = isRemoved(it);
  if (len / mpp <= 56 || (boundary && !old)) return null;
  const x1 = it.x;
  const y1 = -it.y;
  const x2 = it.x2;
  const y2 = -it.y2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // 文字が逆さにならない向きにそろえる。縦の線は、図面の習慣どおり下から上へ読む向き（-90 度）
  let angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  if (angle >= 90 || angle < -90) angle += 180;
  let text = meters(len);
  if (old) {
    const name = removed ? '撤去' : it.kind === 'exBlock' ? '既存ブロック' : Number(it.props.baseRows ?? 0) > 0 ? '既存ブロック＋フェンス' : '既存フェンス';
    text = boundary ? name : `${name} ${meters(len)}`;
  }
  // 境界上のラベルは、敷地の寸法と重ならないよう内側に寄せる。
  // 文字を線に沿って回したあとの「下」が敷地の内側になるのは、奥の辺と左の辺
  const e = 0.06;
  const inwardIsDown = (Math.abs(it.y - plan.site.depth) < e && Math.abs(it.y2 - plan.site.depth) < e) || (Math.abs(it.x) < e && Math.abs(it.x2) < e);
  const offset = boundary ? (inwardIsDown ? 15 : -8) : -6;
  return (
    <text className={'plan-len' + (removed ? ' is-remove' : '')} x={mx} y={my} fontSize={10 * mpp} textAnchor="middle" transform={`rotate(${angle} ${mx} ${my}) translate(0 ${offset * mpp})`}>
      {text}
    </text>
  );
}

function LineItem({ it }: { it: PlanItem }) {
  const len = lineLength(it);
  const x1 = it.x;
  const y1 = -it.y;
  const x2 = it.x2;
  const y2 = -it.y2;
  const ux = len > 0 ? (x2 - x1) / len : 1;
  const uy = len > 0 ? (y2 - y1) / len : 0;
  // 直交方向
  const nx = -uy;
  const ny = ux;

  if (it.kind === 'exBlock') {
    const removed = isRemoved(it);
    return (
      <>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={removed ? '#e3aaa4' : '#b3b7bc'} strokeWidth={0.15} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={removed ? REMOVE : '#70767d'} strokeWidth={removed ? 2 : 1} vectorEffect="non-scaling-stroke" strokeDasharray={removed ? '7 4' : '1 5'} />
      </>
    );
  }
  if (it.kind === 'block') {
    return (
      <>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8b9198" strokeWidth={0.15} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5d646b" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="1 5" />
      </>
    );
  }
  if (it.kind === 'curb') {
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8a7f73" strokeWidth={0.1} strokeDasharray="0.1 0.03" />;
  }
  // フェンス：線と、2m ごとの柱
  const posts: ReactNode[] = [];
  const n = Math.max(1, Math.round(len / 2));
  const t = 0.11;
  for (let i = 0; i <= n; i++) {
    const px = x1 + (ux * len * i) / n;
    const py = y1 + (uy * len * i) / n;
    posts.push(<line key={i} x1={px - nx * t} y1={py - ny * t} x2={px + nx * t} y2={py + ny * t} stroke={it.kind === 'exFence' ? '#6c7680' : '#2f5879'} strokeWidth={2} vectorEffect="non-scaling-stroke" />);
  }
  const baseRows = Number(it.props.baseRows ?? 0);
  if (it.kind === 'exFence') {
    const removed = isRemoved(it);
    return (
      <>
        {baseRows > 0 && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={removed ? '#e3aaa4' : '#b3b7bc'} strokeWidth={0.15} />}
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={removed ? REMOVE : '#6c7680'} strokeWidth={2} strokeDasharray={removed ? '7 4' : undefined} vectorEffect="non-scaling-stroke" />
        {!removed && posts}
      </>
    );
  }
  const privacy = it.variant.startsWith('privacy') || it.variant.startsWith('wood');
  return (
    <>
      {baseRows > 0 && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b4b9be" strokeWidth={0.15} />}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={it.variant.startsWith('wood') ? '#8a5a2b' : '#2f5879'} strokeWidth={privacy ? 3.5 : 2} vectorEffect="non-scaling-stroke" />
      {posts}
    </>
  );
}

function PointItem({ it }: { it: PlanItem }) {
  const x = it.x;
  const y = -it.y;
  if (it.kind === 'tree' || it.kind === 'shrub') {
    const r = treeRadius(it);
    const c = catalogOf(it.kind);
    return (
      <>
        <circle cx={x} cy={y} r={r} fill={c.fill} fillOpacity={0.55} stroke={c.stroke} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        {it.kind === 'tree' && (
          <>
            <circle cx={x} cy={y} r={r * 0.55} fill="none" stroke={c.stroke} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={x} cy={y} r={0.07} fill="#5b4632" />
          </>
        )}
      </>
    );
  }
  if (it.kind === 'exTree') {
    const r = treeRadius(it);
    const removed = isRemoved(it);
    const k = r * 0.6;
    return (
      <>
        <circle cx={x} cy={y} r={r} fill="#a9bfa6" fillOpacity={0.45} stroke={removed ? REMOVE : '#5f7f61'} strokeWidth={removed ? 2 : 1.4} strokeDasharray={removed ? '7 4' : undefined} vectorEffect="non-scaling-stroke" />
        <circle cx={x} cy={y} r={0.07} fill="#5b4632" />
        {removed && <path d={`M${x - k} ${y - k}L${x + k} ${y + k}M${x + k} ${y - k}L${x - k} ${y + k}`} stroke={REMOVE} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
      </>
    );
  }
  if (it.kind === 'masu') {
    // 図面でよく使う記号：丸に×（汚水）、二重丸（雨水）
    const r = 0.2;
    const k = r * 0.7;
    return (
      <>
        <circle cx={x} cy={y} r={r} fill="#ffffff" stroke="#4a5560" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        {it.variant === 'rain' ? (
          <circle cx={x} cy={y} r={r * 0.5} fill="none" stroke="#4a5560" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        ) : (
          <path d={`M${x - k} ${y - k}L${x + k} ${y + k}M${x + k} ${y - k}L${x - k} ${y + k}`} stroke="#4a5560" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        )}
      </>
    );
  }
  if (it.kind === 'meter') {
    const gas = it.variant === 'gas';
    return (
      <>
        <rect x={x - 0.22} y={y - 0.14} width={0.44} height={0.28} rx={0.04} fill={gas ? '#f6e3b0' : '#cfe0f2'} stroke={gas ? '#9a7a1c' : '#3d6c9c'} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        <text x={x} y={y + 0.075} fontSize={0.2} fontWeight={700} textAnchor="middle" fill={gas ? '#7a5f10' : '#2d5580'}>
          {gas ? 'G' : 'M'}
        </text>
      </>
    );
  }
  if (it.kind === 'faucet') {
    return (
      <>
        <circle cx={x} cy={y} r={0.17} fill="#3d8fd1" stroke="#1f5f96" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        <path d={`M${x - 0.09} ${y}h0.18M${x} ${y - 0.09}v0.18`} stroke="#fff" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </>
    );
  }
  if (it.kind === 'light') {
    return (
      <>
        <circle cx={x} cy={y} r={0.42} fill="#f2b93b" fillOpacity={0.22} />
        <circle cx={x} cy={y} r={0.13} fill="#f2b93b" stroke="#a87412" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      </>
    );
  }
  const [w, d] = pointSize(it);
  if (it.kind === 'gate') {
    // 門扉：扉の線と、開く向きの弧
    const horizontal = it.rot !== 90;
    const half = (horizontal ? w : d) / 2;
    // 扉の先端が描く弧。蝶番を中心に、敷地の内側へ開く
    let arc = '';
    if (it.variant === 'double') {
      arc = horizontal
        ? `M${x} ${y}A${half} ${half} 0 0 0 ${x - half} ${y - half}M${x} ${y}A${half} ${half} 0 0 1 ${x + half} ${y - half}`
        : `M${x} ${y}A${half} ${half} 0 0 0 ${x + half} ${y - half}M${x} ${y}A${half} ${half} 0 0 1 ${x + half} ${y + half}`;
    } else if (it.variant !== 'accordion') {
      arc = horizontal
        ? `M${x + half} ${y}A${half * 2} ${half * 2} 0 0 0 ${x - half} ${y - half * 2}`
        : `M${x} ${y - half}A${half * 2} ${half * 2} 0 0 1 ${x + half * 2} ${y + half}`;
    }
    return (
      <>
        {arc && <path d={arc} fill="none" stroke="#6d7780" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        <rect x={x - w / 2} y={y - d / 2} width={w} height={d} fill="#4a5560" />
      </>
    );
  }
  // 門柱
  const c = catalogOf(it.kind);
  const fill = it.kind === 'gatepost' && it.variant !== 'func' ? '#bfb5a6' : c.fill;
  return <rect x={x - w / 2} y={y - d / 2} width={w} height={d} fill={fill} stroke={c.stroke} strokeWidth={1.2} vectorEffect="non-scaling-stroke" rx={0.03} />;
}

export function PlanDrawing({ plan, mpp, idp, onItemDown, showGrid = true }: Props) {
  const W = plan.site.width;
  const D = plan.site.depth;
  const road = plan.roadWidth;
  const fs = 12 * mpp;
  const far = 60;
  const grid: string[] = [];
  if (showGrid) {
    for (let x = 1; x < W; x++) grid.push(`M${x} 0V${-D}`);
    for (let y = 1; y < D; y++) grid.push(`M0 ${-y}H${W}`);
  }
  const hit = 22 * mpp;
  const items = sortedItems(plan);

  return (
    <>
      <Defs idp={idp} />
      {/* まわりの土地と道路 */}
      <rect x={-far} y={-D - far} width={W + far * 2} height={D + far * 2} fill="#eef1ee" />
      <rect x={-far} y={0} width={W + far * 2} height={road} fill="#d5d9dd" />
      <path d={`M${-far} ${road / 2}H${W + far}`} stroke="#ffffff" strokeWidth={2} strokeDasharray="14 12" vectorEffect="non-scaling-stroke" />
      <text className="plan-road" x={W / 2} y={Math.min(road - 0.4, road / 2 + fs * 1.6)} fontSize={fs} textAnchor="middle">
        道路
      </text>

      {/* 敷地 */}
      <rect x={0} y={-D} width={W} height={D} fill="#f7f3e8" />
      {showGrid && <path d={grid.join('')} stroke="#e4decd" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />}

      {items.map((it) => {
        const c = catalogOf(it.kind);
        const interactive = onItemDown !== undefined;
        return (
          <g key={it.id} data-id={it.id} className={interactive ? 'plan-item' : undefined} onPointerDown={interactive ? (e) => onItemDown(e, it) : undefined}>
            {c.shape === 'rect' && <RectShape it={it} idp={idp} />}
            {c.shape === 'line' && (
              <>
                <LineItem it={it} />
                {interactive && <line x1={it.x} y1={-it.y} x2={it.x2} y2={-it.y2} stroke="transparent" strokeWidth={hit} strokeLinecap="round" />}
              </>
            )}
            {c.shape === 'point' && (
              <>
                <PointItem it={it} />
                {interactive && <circle cx={it.x} cy={-it.y} r={Math.max(hit / 2, Math.max(...pointSize(it)) / 2)} fill="transparent" />}
              </>
            )}
          </g>
        );
      })}

      {/* ラベルは図形の上にまとめて描く。上に別の面が重なって隠れるものは出さない */}
      <g pointerEvents="none">
        {items.map((it, i) => {
          const shape = catalogOf(it.kind).shape;
          if (shape === 'rect') {
            const cx = it.x + it.w / 2;
            const cy = it.y + it.h / 2;
            const covered = items.slice(i + 1).some((o) => o.kind !== 'car' && catalogOf(o.kind).shape === 'rect' && cx > o.x && cx < o.x + o.w && cy > o.y && cy < o.y + o.h);
            return covered ? null : <RectLabel key={it.id} it={it} mpp={mpp} />;
          }
          if (shape === 'line') return <LineLabel key={it.id} it={it} mpp={mpp} boundary={onBoundary(it, plan)} plan={plan} />;
          return null;
        })}
      </g>

      {/* 敷地の境界線と寸法 */}
      <rect x={0} y={-D} width={W} height={D} fill="none" stroke="#16324a" strokeWidth={2} strokeDasharray="10 4 2 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
      <text className="plan-dim" x={W / 2} y={fs * 1.25} fontSize={fs} textAnchor="middle">
        間口 {meters(W)}
      </text>
      <text className="plan-dim" x={-fs * 0.6} y={-D / 2} fontSize={fs} textAnchor="middle" transform={`rotate(-90 ${-fs * 0.6} ${-D / 2})`}>
        奥行 {meters(D)}
      </text>
    </>
  );
}

/** 寸法などを入れる丸いタグ */
export function SizeTag({ x, y, text, fs, vertical, tone, align }: { x: number; y: number; text: string; fs: number; vertical?: boolean; tone?: 'guide'; align?: 'start' }) {
  // 全角文字は幅が広いので、文字の種類ごとに幅を見積もる
  const units = [...text].reduce((n, ch) => n + (ch.charCodeAt(0) > 0xff ? 1 : 0.6), 0);
  const w = (units + 1.1) * fs;
  const h = fs * 1.7;
  // align="start" は、x をタグの左端にする
  const cx = align === 'start' ? x + w / 2 : x;
  return (
    <g className={'size-tag' + (tone ? ' size-tag-' + tone : '')} transform={`translate(${cx} ${y})${vertical ? ' rotate(-90)' : ''}`} pointerEvents="none">
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} />
      <text y={fs * 0.36} fontSize={fs} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

/** 既存図：建物の大きさと、道路・左の境界からの距離 */
export function HouseDims({ house, mpp, showSize }: { house: PlanItem; mpp: number; showSize: boolean }) {
  const fs = 11 * mpp;
  const cx = house.x + house.w / 2;
  const cy = house.y + house.h / 2;
  // 「左から」の線は、建物の手前寄りの高さに引く
  const ly = house.y + house.h * 0.22;
  return (
    <g className="house-dims" pointerEvents="none">
      {house.y > 0.05 && (
        <>
          <path className="dim-guide" d={`M${cx} 0V${-house.y}`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <SizeTag x={cx} y={-house.y / 2} text={`道路から ${meters(house.y)}`} fs={fs} tone="guide" />
        </>
      )}
      {house.x > 0.05 && (
        <>
          <path className="dim-guide" d={`M0 ${-ly}H${house.x}`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {/* すき間はせまいことが多いので、タグは建物の中（左端）に出す */}
          <SizeTag x={house.x + 6 * mpp} y={-ly} text={`左から ${meters(house.x)}`} fs={fs} tone="guide" align="start" />
        </>
      )}
      {showSize && (
        <>
          <SizeTag x={cx} y={-(house.y + house.h) + 14 * mpp} text={`幅 ${meters(house.w)}`} fs={fs} tone="guide" />
          <SizeTag x={house.x + house.w - 14 * mpp} y={-cy} text={`奥行 ${meters(house.h)}`} fs={fs} tone="guide" vertical />
        </>
      )}
    </g>
  );
}

/** 図全体が入る表示範囲（m）。印刷用の静的な図にも使う */
export function planBounds(plan: Plan): { x: number; y: number; w: number; h: number } {
  const road = Math.min(plan.roadWidth, 3.2);
  const pad = 1.2;
  return {
    x: -pad - 0.6,
    y: -plan.site.depth - pad,
    w: plan.site.width + pad * 2 + 0.6,
    h: plan.site.depth + pad + road,
  };
}

/** 操作なしの静的な平面図（印刷用）。dims を付けると、建物の寸法と距離も入れる（既存図用） */
export function StaticPlan({ plan, idp, widthPx = 680, dims = false }: { plan: Plan; idp: string; widthPx?: number; dims?: boolean }) {
  const b = planBounds(plan);
  const mpp = b.w / widthPx;
  const house = dims ? plan.items.find((it) => it.kind === 'house') : undefined;
  return (
    <svg className="plan-static" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} role="img" aria-label={dims ? '既存図' : '平面図'}>
      <PlanDrawing plan={plan} mpp={mpp} idp={idp} />
      {house && <HouseDims house={house} mpp={mpp} showSize />}
    </svg>
  );
}
