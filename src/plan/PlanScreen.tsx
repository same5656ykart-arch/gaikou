import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Plan, PlanItem, Project, Tab } from '../types';
import { CATALOG, PALETTE_GROUPS, catalogOf, createItem, hasKind, isBaseItem, lineLength, unitPrice, variantOf } from '../lib/catalog';
import { buildEstimate } from '../lib/estimate';
import { clamp, meters, num, r2, uid, yen } from '../lib/format';
import { hasProposal, houseOf, resizeSite } from '../lib/existing';
import { generatePlan } from '../lib/planFromSurvey';
import { confirmDialog, toast, updateProject, useAppState } from '../store';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Overlays';
import { NumField } from '../ui/fields';
import { ExistingPanel } from './ExistingPanel';
import { HouseDims, PlanDrawing, SizeTag, planBounds, pointSize } from './PlanDrawing';
import { GRID, itemCost, moveEndpoint, moveItem, resizeRect, setLineLength, snapCandidates } from './geometry';
import type { Cands } from './geometry';

interface Props {
  project: Project;
  onGo: (t: Tab) => void;
}

export function PlanScreen({ project, onGo }: Props) {
  return <PlanEditor project={project} mode="plan" onGo={onGo} />;
}

// ---------------------------------------------------------------------------

interface View {
  cx: number;
  cy: number;
  /** 1px あたりの m */
  mpp: number;
}

type Drag =
  | { mode: 'pan'; pid: number; sx: number; sy: number; view: View; moved: boolean; tapId?: string }
  | { mode: 'move'; pid: number; sx: number; sy: number; wx: number; wy: number; orig: PlanItem; cands: Cands; moved: boolean }
  | { mode: 'resize'; pid: number; handle: string; ox: number; oy: number; orig: PlanItem; cands: Cands; moved: boolean }
  | { mode: 'end'; pid: number; which: 1 | 2; ox: number; oy: number; orig: PlanItem; cands: Cands; moved: boolean }
  | { mode: 'site'; pid: number; handle: string; ox: number; oy: number; orig: Plan; moved: boolean }
  | { mode: 'pinch'; d0: number; view: View; wx: number; wy: number };

const MIN_MPP = 0.004;
const MAX_MPP = 0.25;

/** 図全体が入る表示にする。せまい画面では、左上の道具箱に図が隠れないよう上を空ける */
function fitView(plan: Plan, w: number, h: number): View {
  const b = planBounds(plan);
  const top = w < 700 ? 52 : 0;
  const mpp = clamp(Math.max(b.w / Math.max(w, 1), b.h / Math.max(h - top, 1)) * 1.03, MIN_MPP, MAX_MPP);
  return {
    cx: b.x + b.w / 2,
    cy: -(b.y + b.h / 2) + (top / 2) * mpp,
    mpp,
  };
}

interface EditorProps extends Props {
  /**
   * existing：現調の「既存図」。敷地・建物・いまあるものだけを描く。
   * plan：平面図。既存図の上に、これから作る部材を置く。
   */
  mode: 'existing' | 'plan';
  /** 既存図のパネルの上に出す「ステップ 2 / 8」など */
  stepLabel?: string;
}

export function PlanEditor({ project, mode, onGo, stepLabel }: EditorProps) {
  const settings = useAppState((s) => s.settings);
  const idp = useId().replace(/[^a-zA-Z0-9]/g, '') + '-';
  const existing = mode === 'existing';
  const [plan, setPlanState] = useState<Plan>(project.plan);
  const draft = useRef(plan); // 画面に出ている最新（ドラッグ中の仮の状態を含む）
  const committed = useRef(plan); // 最後に確定した状態
  const past = useRef<Plan[]>([]);
  const future = useRef<Plan[]>([]);
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [siteSheet, setSiteSheet] = useState(false);
  const [menu, setMenu] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<Drag | null>(null);

  const preview = (next: Plan) => {
    draft.current = next;
    setPlanState(next);
  };

  /** 確定して保存。key が同じ連続した変更（数値の打ち込みなど）は 1 回の「元に戻す」にまとめる */
  const commit = useCallback(
    (next: Plan, key?: string) => {
      const now = Date.now();
      const merge = key !== undefined && lastKey.current?.key === key && now - lastKey.current.at < 1500;
      if (!merge) {
        past.current.push(committed.current);
        if (past.current.length > 100) past.current.shift();
      }
      lastKey.current = key !== undefined ? { key, at: now } : null;
      future.current = [];
      committed.current = next;
      draft.current = next;
      setPlanState(next);
      updateProject(project.id, (p) => ({
        ...p,
        plan: next,
        survey: existing && p.survey.answers.siteChecked !== 'yes' ? { ...p.survey, answers: { ...p.survey.answers, siteChecked: 'yes' } } : p.survey,
      }));
    },
    [project.id, existing],
  );

  const restore = (next: Plan) => {
    lastKey.current = null;
    committed.current = next;
    draft.current = next;
    setPlanState(next);
    updateProject(project.id, (p) => ({ ...p, plan: next }));
    rerender();
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(committed.current);
    restore(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(committed.current);
    restore(next);
  };

  // 表示領域の大きさを追う。
  // 部材を選ぶと下のパネルが伸びて図の領域が縮むので、左上を固定して図が画面上で動かないようにする
  // （中心基準のままだと、ドラッグの途中で図がずれてしまう）。
  const sizeRef = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const prev = sizeRef.current;
      if (prev.w === w && prev.h === h) return;
      const v = viewRef.current;
      if (v && prev.w > 0 && prev.h > 0) {
        setView({ ...v, cx: v.cx + ((w - prev.w) / 2) * v.mpp, cy: v.cy - ((h - prev.h) / 2) * v.mpp });
      }
      sizeRef.current = { w, h };
      setSize({ w, h });
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  }, []);

  // 選んだ部材がパネルの下などに隠れていたら、見える位置まで図を動かす
  const selectedRef = useRef<string | null>(null);
  const ensureVisible = useCallback(() => {
    const v = viewRef.current;
    const { w, h } = sizeRef.current;
    const it = draft.current.items.find((x) => x.id === selectedRef.current);
    if (!v || !it || drag.current || w === 0 || h === 0 || !hasKind(it.kind)) return;
    const shape = catalogOf(it.kind).shape;
    const ix = shape === 'rect' ? it.x + it.w / 2 : shape === 'line' ? (it.x + it.x2) / 2 : it.x;
    const iy = shape === 'rect' ? it.y + it.h / 2 : shape === 'line' ? (it.y + it.y2) / 2 : it.y;
    const px = (ix - v.cx) / v.mpp + w / 2;
    const py = (v.cy - iy) / v.mpp + h / 2;
    const m = Math.min(48, w / 4, h / 4);
    if (px < m || px > w - m || py < m || py > h - m) setView({ ...v, cx: ix, cy: iy });
  }, []);

  // 最初の 1 回、全体が入るように合わせる
  useEffect(() => {
    if (!view && size.w > 0 && size.h > 0) setView(fitView(draft.current, size.w, size.h));
  }, [size, view]);

  const fit = () => setView(fitView(draft.current, size.w, size.h));

  const toWorld = (clientX: number, clientY: number, v: View = viewRef.current!): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [v.cx + (clientX - rect.left - rect.width / 2) * v.mpp, v.cy - (clientY - rect.top - rect.height / 2) * v.mpp];
  };

  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const v = viewRef.current;
    if (!v || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = clientX ?? rect.left + rect.width / 2;
    const py = clientY ?? rect.top + rect.height / 2;
    const [wx, wy] = toWorld(px, py, v);
    const mpp = clamp(v.mpp * factor, MIN_MPP, MAX_MPP);
    // カーソルの下の点が動かないように中心をずらす
    setView({
      mpp,
      cx: wx - (px - rect.left - rect.width / 2) * mpp,
      cy: wy + (py - rect.top - rect.height / 2) * mpp,
    });
  };

  // ホイールでズーム（passive では preventDefault できないので直接登録）
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    // スマホ：図の上のドラッグやピンチが、ページ自体のスクロール・拡大にならないようにする。
    // （CSS の touch-action が効かない古い端末・アプリ内ブラウザ向けの保険）
    const block = (e: Event) => e.preventDefault();
    el.addEventListener('touchmove', block, { passive: false });
    el.addEventListener('gesturestart', block);
    el.addEventListener('gesturechange', block);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', block);
      el.removeEventListener('gesturestart', block);
      el.removeEventListener('gesturechange', block);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 既存図では、これから作る部材は出さない（敷地・建物・いまあるものだけ）
  const shown = useMemo(() => (existing ? { ...plan, items: plan.items.filter(isBaseItem) } : plan), [plan, existing]);
  const visible = (p: Plan): Plan => (existing ? { ...p, items: p.items.filter(isBaseItem) } : p);
  const selected = selectedId ? (shown.items.find((it) => it.id === selectedId && hasKind(it.kind)) ?? null) : null;
  selectedRef.current = selectedId;
  useEffect(() => {
    ensureVisible();
  }, [selectedId, size.w, size.h, ensureVisible]);

  const patchItem = (id: string, fn: (it: PlanItem) => PlanItem, key?: string) => {
    commit({ ...draft.current, items: draft.current.items.map((it) => (it.id === id ? fn(it) : it)) }, key ? `${id}:${key}` : undefined);
  };

  const removeItem = (id: string) => {
    commit({ ...draft.current, items: draft.current.items.filter((it) => it.id !== id) });
    setSelectedId(null);
  };

  const duplicateItem = (it: PlanItem) => {
    const copy: PlanItem = { ...it, id: uid(), props: { ...it.props }, x: r2(it.x + 0.5), y: r2(it.y - 0.5), x2: r2(it.x2 + 0.5), y2: r2(it.y2 - 0.5) };
    const items = [...draft.current.items];
    items.splice(items.findIndex((x) => x.id === it.id) + 1, 0, copy);
    commit({ ...draft.current, items });
    setSelectedId(copy.id);
  };

  /** 同じ重なり階層の中で、1 つ上／下へ */
  const reorder = (it: PlanItem, dir: 1 | -1) => {
    const items = [...draft.current.items];
    const i = items.findIndex((x) => x.id === it.id);
    const z = catalogOf(it.kind).z;
    let j = i + dir;
    while (j >= 0 && j < items.length && (!hasKind(items[j].kind) || catalogOf(items[j].kind).z !== z)) j += dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    commit({ ...draft.current, items });
  };

  const addItem = (kind: string) => {
    const v = viewRef.current;
    const p = draft.current;
    const cx = clamp(v ? v.cx : p.site.width / 2, 0.5, p.site.width - 0.5);
    const cy = clamp(v ? v.cy : p.site.depth / 2, 0.5, p.site.depth - 0.5);
    let it = createItem(kind, cx, cy);
    const c = catalogOf(kind);
    if (c.shape === 'rect') {
      // 敷地からはみ出さない位置に置く
      it = { ...it, x: r2(clamp(it.x, 0, Math.max(0, p.site.width - it.w))), y: r2(clamp(it.y, 0, Math.max(0, p.site.depth - it.h))) };
    }
    commit({ ...p, items: [...p.items, it] });
    setSelectedId(it.id);
    setPalette(false);
  };

  // ---- ポインタ操作 ----

  const tol = () => Math.min(0.3, 10 * (viewRef.current?.mpp ?? 0.02));

  const startPinchIfNeeded = () => {
    if (pointers.current.size !== 2 || !viewRef.current) return false;
    const [p1, p2] = [...pointers.current.values()];
    // 途中だった移動やサイズ変更は取り消す
    if (drag.current && drag.current.mode !== 'pan' && drag.current.mode !== 'pinch') preview(committed.current);
    const [wx, wy] = toWorld((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
    drag.current = { mode: 'pinch', d0: Math.max(10, Math.hypot(p1.x - p2.x, p1.y - p2.y)), view: viewRef.current, wx, wy };
    return true;
  };

  const capture = (e: ReactPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* 取れなくても動く */
    }
  };

  const onBgDown = (e: ReactPointerEvent) => {
    if (!viewRef.current) return;
    capture(e);
    if (startPinchIfNeeded()) return;
    drag.current = { mode: 'pan', pid: e.pointerId, sx: e.clientX, sy: e.clientY, view: viewRef.current, moved: false };
  };

  const onItemDown = (e: ReactPointerEvent, it: PlanItem) => {
    if (!viewRef.current) return;
    e.stopPropagation();
    capture(e);
    if (startPinchIfNeeded()) return;
    // 指での操作は、選んでいない部材をいきなり動かさない。
    // 図を動かそうとして部材がずれるのを防ぐため、タップで選んでからドラッグで動かす。
    if (e.pointerType === 'touch' && selectedRef.current !== it.id) {
      drag.current = { mode: 'pan', pid: e.pointerId, sx: e.clientX, sy: e.clientY, view: viewRef.current, moved: false, tapId: it.id };
      return;
    }
    setSelectedId(it.id);
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    drag.current = { mode: 'move', pid: e.pointerId, sx: e.clientX, sy: e.clientY, wx, wy, orig: it, cands: snapCandidates(visible(draft.current), it.id), moved: false };
  };

  const onHandleDown = (e: ReactPointerEvent, it: PlanItem, handle: string, hx: number, hy: number) => {
    if (!viewRef.current) return;
    e.stopPropagation();
    capture(e);
    if (startPinchIfNeeded()) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const base = { pid: e.pointerId, ox: hx - wx, oy: hy - wy, orig: it, cands: snapCandidates(visible(draft.current), it.id), moved: false };
    drag.current = handle === 'p1' || handle === 'p2' ? { mode: 'end', which: handle === 'p1' ? 1 : 2, ...base } : { mode: 'resize', handle, ...base };
  };

  const onSiteHandleDown = (e: ReactPointerEvent, handle: string, hx: number, hy: number) => {
    if (!viewRef.current) return;
    e.stopPropagation();
    capture(e);
    if (startPinchIfNeeded()) return;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    drag.current = { mode: 'site', pid: e.pointerId, handle, ox: hx - wx, oy: hy - wy, orig: draft.current, moved: false };
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!d) return;
    if (d.mode === 'pinch') {
      if (pointers.current.size < 2 || !svgRef.current) return;
      const [p1, p2] = [...pointers.current.values()];
      const rect = svgRef.current.getBoundingClientRect();
      const mpp = clamp((d.view.mpp * d.d0) / Math.max(10, Math.hypot(p1.x - p2.x, p1.y - p2.y)), MIN_MPP, MAX_MPP);
      const mx = (p1.x + p2.x) / 2 - rect.left - rect.width / 2;
      const my = (p1.y + p2.y) / 2 - rect.top - rect.height / 2;
      setView({ mpp, cx: d.wx - mx * mpp, cy: d.wy + my * mpp });
      return;
    }
    if (d.pid !== e.pointerId) return;
    if (d.mode === 'pan') {
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      setView({ ...d.view, cx: d.view.cx - dx * d.view.mpp, cy: d.view.cy + dy * d.view.mpp });
      return;
    }
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    if (d.mode === 'site') {
      const snap = (v: number) => Math.round(v / GRID) * GRID;
      const W = d.handle.includes('e') ? snap(wx + d.ox) : d.orig.site.width;
      const D = d.handle.includes('n') ? snap(wy + d.oy) : d.orig.site.depth;
      d.moved = true;
      preview(resizeSite(d.orig, W, D));
      return;
    }
    let next: PlanItem;
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
      next = moveItem(d.orig, wx - d.wx, wy - d.wy, d.cands, tol());
    } else if (d.mode === 'resize') {
      next = resizeRect(d.orig, d.handle, wx + d.ox, wy + d.oy, d.cands, tol());
    } else {
      next = moveEndpoint(d.orig, d.which, wx + d.ox, wy + d.oy, d.cands, tol());
    }
    d.moved = true;
    preview({ ...draft.current, items: draft.current.items.map((it) => (it.id === next.id ? next : it)) });
  };

  const onUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pinch') {
      if (pointers.current.size < 2) drag.current = null;
      return;
    }
    if (d.pid !== e.pointerId) return;
    drag.current = null;
    if (d.mode === 'pan') {
      // 動かさずに離した＝タップ。部材の上ならその部材を選び、何もないところなら選択を解除
      if (!d.moved) setSelectedId(d.tapId ?? null);
      return;
    }
    if (d.moved && draft.current !== committed.current) commit(draft.current);
    // 指を離したあと、パネルが開いて隠れていないか確かめる
    setTimeout(ensureVisible, 80);
  };

  // キーボード操作（PC 用）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeItem(selectedId);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
        patchItem(selectedId, (it) => ({ ...it, x: r2(it.x + dx), y: r2(it.y + dy), x2: r2(it.x2 + dx), y2: r2(it.y2 + dy) }), 'nudge');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const estimate = useMemo(() => buildEstimate(plan, project.survey.answers, project.estimate, settings), [plan, project.survey.answers, project.estimate, settings]);

  /** ご要望から、これから作る部材を自動で置く。既存図（建物・いまあるもの）はそのまま */
  const regenerate = async () => {
    setMenu(false);
    if (hasProposal(draft.current)) {
      const ok = await confirmDialog({
        title: 'ご要望から作り直しますか？',
        body: '追加した部材を消して、現調のご要望から置き直します。建物と既存のものはそのまま残ります。「元に戻す」で取り消せます。',
        okLabel: '作り直す',
      });
      if (!ok) return;
    }
    const next = generatePlan(draft.current, project.survey.answers);
    commit(next);
    setSelectedId(null);
    setView(fitView(next, size.w, size.h));
    toast(hasProposal(next) ? 'ご要望から自動で配置しました' : '現調の「ご要望」でやりたい工事を選ぶと、自動で配置できます');
  };

  const clearAll = async () => {
    setMenu(false);
    const ok = await confirmDialog({ title: '追加した部材をすべて消しますか？', body: '建物と既存のものは残して、追加した部材をすべて消します。「元に戻す」で取り消せます。', okLabel: 'すべて消す', danger: true });
    if (!ok) return;
    commit({ ...draft.current, items: draft.current.items.filter(isBaseItem) });
    setSelectedId(null);
  };

  const mpp = view?.mpp ?? 0.02;
  const viewBox = view ? `${view.cx - (size.w * mpp) / 2} ${-view.cy - (size.h * mpp) / 2} ${size.w * mpp} ${size.h * mpp}` : '0 0 1 1';

  const house = existing ? houseOf(shown) : undefined;
  const proposalCount = plan.items.filter((it) => hasKind(it.kind) && !isBaseItem(it)).length;

  return (
    <div className={'plan' + (existing ? ' plan-existing' : '') + (selected ? ' has-selection' : '')}>
      <div className="plan-canvas" ref={wrapRef}>
        <svg
          ref={svgRef}
          className="plan-svg"
          viewBox={viewBox}
          onPointerDown={onBgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="application"
          aria-label={existing ? '既存図。建物や敷地の端をドラッグして大きさを合わせます' : '平面図。部材をタップして選び、ドラッグで動かします'}
        >
          {view && (
            <>
              <PlanDrawing plan={shown} mpp={mpp} idp={idp} onItemDown={onItemDown} />
              {house && <HouseDims house={house} mpp={mpp} showSize={selected?.id !== house.id} />}
              {selected && <Selection it={selected} mpp={mpp} onHandleDown={onHandleDown} />}
              {existing && !selected && <SiteHandles plan={shown} mpp={mpp} onDown={onSiteHandleDown} />}
            </>
          )}
        </svg>

        <div className="plan-tools">
          <button type="button" className="tool" onClick={undo} disabled={past.current.length === 0} aria-label="元に戻す" title="元に戻す">
            <Icon name="undo" />
          </button>
          <button type="button" className="tool" onClick={redo} disabled={future.current.length === 0} aria-label="やり直す" title="やり直す">
            <Icon name="redo" />
          </button>
          <span className="tool-sep" />
          <button type="button" className="tool" onClick={() => zoomAt(1 / 1.3)} aria-label="拡大" title="拡大">
            <Icon name="plus" />
          </button>
          <button type="button" className="tool" onClick={() => zoomAt(1.3)} aria-label="縮小" title="縮小">
            <Icon name="minus" />
          </button>
          <button type="button" className="tool" onClick={fit} aria-label="全体を表示" title="全体を表示">
            <Icon name="fit" />
          </button>
          {!existing && (
            <>
              <span className="tool-sep" />
              <div className="tool-menu">
                <button type="button" className="tool" onClick={() => setMenu((m) => !m)} aria-label="そのほかの操作" aria-expanded={menu} title="そのほかの操作">
                  <Icon name="list" />
                </button>
                {menu && (
                  <div className="menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => void regenerate()}>
                      <Icon name="magic" size={18} />
                      ご要望から作り直す
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        setSiteSheet(true);
                      }}
                    >
                      <Icon name="plan" size={18} />
                      敷地のサイズを変える
                    </button>
                    <button type="button" role="menuitem" className="danger" onClick={() => void clearAll()}>
                      <Icon name="trash" size={18} />
                      追加した部材をすべて消す
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {!existing && (
          <>
            <button type="button" className="plan-total" onClick={() => onGo('estimate')} title="見積もりを開く">
              <span className="plan-total-label">概算（税込）</span>
              <span className="plan-total-value">{yen(estimate.total)}</span>
            </button>
            <button type="button" className="fab" onClick={() => setPalette(true)}>
              <Icon name="plus" size={22} />
              部材を追加
            </button>
          </>
        )}
      </div>

      <div className="plan-panel">
        {selected ? (
          <ItemPanel
            key={selected.id}
            it={selected}
            prices={settings.prices}
            onPatch={(fn, key) => patchItem(selected.id, fn, key)}
            onDelete={() => removeItem(selected.id)}
            onDuplicate={() => duplicateItem(selected)}
            onReorder={(dir) => reorder(selected, dir)}
            onClose={() => setSelectedId(null)}
          />
        ) : existing ? (
          <ExistingPanel
            project={project}
            plan={plan}
            stepLabel={stepLabel}
            commit={commit}
            onSelect={setSelectedId}
            onFit={(next) => setView(fitView(next, size.w, size.h))}
          />
        ) : (
          <div className="panel-idle">
            {proposalCount === 0 ? (
              <>
                <p className="panel-hint">既存図ができています。現調のご要望から自動で配置するか、「部材を追加」で1つずつ置いていきます。</p>
                <div className="panel-idle-actions">
                  <button type="button" className="btn btn-primary" onClick={() => void regenerate()}>
                    <Icon name="magic" size={18} />
                    ご要望から自動で配置
                  </button>
                  <button type="button" className="btn" onClick={() => onGo('survey')}>
                    現調を見る
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="panel-hint">部材をタップして選ぶ。選んだ部材はドラッグで移動、角の丸で大きさを変えられます。図そのものは、1本指のドラッグで移動、2本指で拡大できます。</p>
                <div className="panel-idle-actions">
                  <button type="button" className="btn" onClick={() => setSiteSheet(true)}>
                    敷地 {num(plan.site.width)}×{meters(plan.site.depth)}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => onGo('view3d')}>
                    3Dで見る
                    <Icon name="next" size={18} />
                  </button>
                </div>
              </>
            )}
            {plan.items.length > 0 && (
              <div className="item-list">
                <h3 className="palette-group">置いてあるもの（{plan.items.length}点）</h3>
                <ul>
                  {plan.items
                    .filter((it) => hasKind(it.kind))
                    .map((it) => {
                      const c = catalogOf(it.kind);
                      const cost = itemCost(it, settings.prices);
                      return (
                        <li key={it.id}>
                          <button type="button" className="item-row" onClick={() => setSelectedId(it.id)}>
                            <span className="swatch" style={{ background: c.fill.startsWith('rgba') ? '#9cc3de' : c.fill, borderColor: c.stroke }} aria-hidden="true" />
                            <span className="item-row-name">
                              {c.name}
                              <span className="item-row-sub">{cost ? `${num(cost.qty)}${cost.unit}` : it.kind === 'house' ? '既存の建物' : c.group === 'existing' ? (c.qty !== 'none' ? '残す' : '位置の記録') : '目安'}</span>
                            </span>
                            <span className="item-row-cost">{cost ? yen(cost.amount + (cost.base?.amount ?? 0)) : '—'}</span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {palette && <Palette prices={settings.prices} onPick={addItem} onClose={() => setPalette(false)} />}

      {siteSheet && (
        <Sheet title="敷地のサイズ" onClose={() => setSiteSheet(false)}>
          <div className="stack">
            <div className="row-2">
              <NumField id="site-w" label="幅（間口）" unit="m" step={0.1} min={2} max={80} allowEmpty={false} stepper value={plan.site.width} onChange={(v) => v !== undefined && commit(resizeSite(draft.current, v, draft.current.site.depth), 'site-w')} />
              <NumField id="site-d" label="奥行" unit="m" step={0.1} min={2} max={80} allowEmpty={false} stepper value={plan.site.depth} onChange={(v) => v !== undefined && commit(resizeSite(draft.current, draft.current.site.width, v), 'site-d')} />
            </div>
            <NumField id="site-road" label="前の道路の幅" unit="m" step={0.5} min={2} max={20} allowEmpty={false} stepper value={plan.roadWidth} onChange={(v) => v !== undefined && commit({ ...draft.current, roadWidth: v }, 'site-road')} />
            <p className="field-hint">道路は図の下側です。境界に沿った塀・フェンスは、敷地といっしょに伸び縮みします。</p>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => {
                setSiteSheet(false);
                setView(fitView(draft.current, size.w, size.h));
              }}
            >
              閉じる
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 既存図：敷地の端をつかむハンドルと、建物までの距離

function SiteHandles({ plan, mpp, onDown }: { plan: Plan; mpp: number; onDown: (e: ReactPointerEvent, handle: string, hx: number, hy: number) => void }) {
  const W = plan.site.width;
  const D = plan.site.depth;
  const r = 8 * mpp;
  const hit = 19 * mpp;
  const hs: [string, number, number][] = [
    ['e', W, D / 2],
    ['n', W / 2, D],
    ['ne', W, D],
  ];
  return (
    <g className="site-handles">
      {hs.map(([k, x, y]) => (
        <g key={k} className="handle" onPointerDown={(e) => onDown(e, k, x, y)}>
          <circle cx={x} cy={-y} r={hit} fill="transparent" />
          <rect className="site-handle" x={x - r} y={-y - r} width={r * 2} height={r * 2} rx={r * 0.35} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// 選択中の部材の枠とハンドル

function Selection({ it, mpp, onHandleDown }: { it: PlanItem; mpp: number; onHandleDown: (e: ReactPointerEvent, it: PlanItem, handle: string, hx: number, hy: number) => void }) {
  const shape = catalogOf(it.kind).shape;
  const r = 7 * mpp;
  const hit = 17 * mpp;
  const fs = 11 * mpp;
  const handle = (key: string, hx: number, hy: number) => (
    <g key={key} className="handle" onPointerDown={(e) => onHandleDown(e, it, key, hx, hy)}>
      <circle cx={hx} cy={-hy} r={hit} fill="transparent" />
      <circle className="handle-dot" cx={hx} cy={-hy} r={r} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </g>
  );

  if (shape === 'rect') {
    const { x, y, w, h } = it;
    const hs: [string, number, number][] = [
      ['sw', x, y],
      ['se', x + w, y],
      ['nw', x, y + h],
      ['ne', x + w, y + h],
    ];
    // 辺のハンドルは、角と重ならない大きさのときだけ出す
    if (w / mpp > 70) hs.push(['s', x + w / 2, y], ['n', x + w / 2, y + h]);
    if (h / mpp > 70) hs.push(['w', x, y + h / 2], ['e', x + w, y + h / 2]);
    return (
      <g className="selection">
        <rect className="sel-box" x={x} y={-(y + h)} width={w} height={h} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <SizeTag x={x + w / 2} y={-(y + h) - 12 * mpp} text={meters(w)} fs={fs} />
        <SizeTag x={x + w + 12 * mpp} y={-(y + h / 2)} text={meters(h)} fs={fs} vertical />
        {hs.map(([k, hx, hy]) => handle(k, hx, hy))}
      </g>
    );
  }
  if (shape === 'line') {
    return (
      <g className="selection">
        <line className="sel-line" x1={it.x} y1={-it.y} x2={it.x2} y2={-it.y2} strokeWidth={6} vectorEffect="non-scaling-stroke" />
        <SizeTag x={(it.x + it.x2) / 2} y={-(it.y + it.y2) / 2 - 16 * mpp} text={meters(lineLength(it))} fs={fs} />
        {handle('p1', it.x, it.y)}
        {handle('p2', it.x2, it.y2)}
      </g>
    );
  }
  const [w, d] = pointSize(it);
  const pad = 5 * mpp;
  return (
    <g className="selection">
      <rect className="sel-box" x={it.x - w / 2 - pad} y={-it.y - d / 2 - pad} width={w + pad * 2} height={d + pad * 2} rx={pad} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// 選択中の部材のプロパティ

interface PanelProps {
  it: PlanItem;
  prices: Record<string, number>;
  onPatch: (fn: (it: PlanItem) => PlanItem, key?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReorder: (dir: 1 | -1) => void;
  onClose: () => void;
}

const HOUSE_WALLS = [
  { v: 'white', label: '白' },
  { v: 'beige', label: 'ベージュ' },
  { v: 'gray', label: 'グレー' },
  { v: 'dark', label: 'ダーク' },
  { v: 'navy', label: 'ネイビー' },
  { v: 'brown', label: 'ブラウン' },
];
const HOUSE_ROOFS = [
  { v: 'gable', label: '三角屋根（切妻）' },
  { v: 'hip', label: '四方に傾く屋根（寄棟）' },
  { v: 'shed', label: '片流れ' },
  { v: 'flat', label: '平らな屋根' },
];

function ItemPanel({ it, prices, onPatch, onDelete, onDuplicate, onReorder, onClose }: PanelProps) {
  const c = catalogOf(it.kind);
  const cost = itemCost(it, prices);
  const setProp = (k: string, v: string | number) => onPatch((x) => ({ ...x, props: { ...x.props, [k]: v } }));

  const changeVariant = (key: string) => {
    const v = variantOf(it.kind, key);
    onPatch((x) => {
      const next = { ...x, variant: v.key };
      if (v.size) {
        // 置き方（縦横）は保ったまま、規格のサイズにする
        const [a, b] = v.size;
        const keepLandscape = x.w > x.h && a < b;
        next.w = keepLandscape ? b : a;
        next.h = keepLandscape ? a : b;
      }
      return next;
    });
  };

  return (
    <div className="item-panel">
      <div className="panel-head">
        <span className="swatch" style={{ background: c.fill.startsWith('rgba') ? '#9cc3de' : c.fill, borderColor: c.stroke }} aria-hidden="true" />
        <h3 className="panel-title">{c.name}</h3>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="選択を解除">
          <Icon name="close" />
        </button>
      </div>

      {c.variants.length > 1 && (
        <div className="field field-compact">
          <label className="field-label" htmlFor="it-variant">
            {c.group === 'existing' && c.qty !== 'none' ? '工事での扱い' : '種類'}
          </label>
          <select id="it-variant" className="input" value={it.variant} onChange={(e) => changeVariant(e.target.value)}>
            {c.variants.map((v) => (
              <option key={v.key} value={v.key}>
                {v.name}
                {c.qty !== 'none' && !v.skip ? `　${yen(unitPrice(prices, c.key, v.key))}/${c.unit}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {c.shape === 'rect' && (
        <div className="row-2">
          <NumField id="it-w" compact label="幅（横）" unit="m" step={0.1} min={0.2} max={80} allowEmpty={false} stepper value={it.w} onChange={(v) => v !== undefined && onPatch((x) => ({ ...x, w: v }), 'w')} />
          <NumField id="it-h" compact label="奥行（縦）" unit="m" step={0.1} min={0.2} max={80} allowEmpty={false} stepper value={it.h} onChange={(v) => v !== undefined && onPatch((x) => ({ ...x, h: v }), 'h')} />
        </div>
      )}

      {c.shape === 'line' && (
        <div className="row-2">
          <NumField id="it-len" compact label="長さ" unit="m" step={0.1} min={0.2} max={120} allowEmpty={false} stepper value={r2(lineLength(it))} onChange={(v) => v !== undefined && onPatch((x) => setLineLength(x, v), 'len')} />
          {(it.kind === 'block' || it.kind === 'exBlock') && (
            <div className="field field-compact">
              <label className="field-label" htmlFor="it-rows">
                高さ
              </label>
              <select id="it-rows" className="input" value={Number(it.props.rows ?? (it.kind === 'exBlock' ? 5 : 3))} onChange={(e) => setProp('rows', Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}段（{(n * 0.2).toFixed(1)}m）
                  </option>
                ))}
              </select>
            </div>
          )}
          {(it.kind === 'fence' || it.kind === 'exFence') && (
            <div className="field field-compact">
              <label className="field-label" htmlFor="it-base">
                下のブロック
              </label>
              <select id="it-base" className="input" value={Number(it.props.baseRows ?? 0)} onChange={(e) => setProp('baseRows', Number(e.target.value))}>
                <option value={0}>{it.kind === 'exFence' ? 'なし' : 'なし（既存の上など）'}</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}段（{(n * 0.2).toFixed(1)}m）
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {c.countLabel && (
        <NumField id="it-count" compact label={c.countLabel} unit={c.unit} step={1} min={1} max={30} allowEmpty={false} stepper value={it.count} onChange={(v) => v !== undefined && onPatch((x) => ({ ...x, count: Math.round(v) }), 'count')} />
      )}

      {it.kind === 'house' && (
        <div className="row-2">
          <div className="field field-compact">
            <label className="field-label" htmlFor="it-floors">
              階数
            </label>
            <select id="it-floors" className="input" value={Number(it.props.floors ?? 2)} onChange={(e) => setProp('floors', Number(e.target.value))}>
              <option value={1}>平屋</option>
              <option value={2}>2階建て</option>
              <option value={3}>3階建て</option>
            </select>
          </div>
          <div className="field field-compact">
            <label className="field-label" htmlFor="it-door">
              玄関の位置
            </label>
            <select id="it-door" className="input" value={String(it.props.door ?? 'center')} onChange={(e) => setProp('door', e.target.value)}>
              <option value="left">左寄り</option>
              <option value="center">まん中</option>
              <option value="right">右寄り</option>
            </select>
          </div>
          <div className="field field-compact">
            <label className="field-label" htmlFor="it-roof">
              屋根（3D用）
            </label>
            <select id="it-roof" className="input" value={String(it.props.roof ?? 'gable')} onChange={(e) => setProp('roof', e.target.value)}>
              {HOUSE_ROOFS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field field-compact">
            <label className="field-label" htmlFor="it-wall">
              外壁の色（3D用）
            </label>
            <select id="it-wall" className="input" value={String(it.props.wall ?? 'white')} onChange={(e) => setProp('wall', e.target.value)}>
              {HOUSE_WALLS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {cost ? (
        <div className="cost">
          <div className="cost-main">
            <span className="cost-label">この部材の概算（税抜）</span>
            <span className="cost-value">{yen(cost.amount + (cost.base?.amount ?? 0))}</span>
          </div>
          <p className="cost-detail">
            {num(cost.qty)}
            {cost.unit} × {yen(cost.unitPrice)}
            {cost.base && `　＋ 下のブロック ${num(cost.base.qty)}m² × ${yen(cost.base.unitPrice)}`}
          </p>
          {c.includes && <p className="cost-includes">含まれるもの：{c.includes}</p>}
        </div>
      ) : (
        <p className="cost-includes">
          {it.kind === 'house'
            ? '建物は見積もりに入りません。位置と大きさを合わせてください。'
            : c.group === 'existing' && c.qty !== 'none'
              ? 'そのまま残すので、費用はかかりません。撤去するときは「工事での扱い」を変えてください。'
              : c.group === 'existing'
                ? '位置の記録です。見積もりには入りません。'
                : '大きさの目安です。見積もりには入りません。'}
        </p>
      )}

      <div className="panel-actions">
        {c.shape === 'rect' && (
          <button type="button" className="btn btn-sm" onClick={() => onPatch((x) => ({ ...x, w: x.h, h: x.w }))}>
            <Icon name="rotate" size={16} />
            縦横を入れ替え
          </button>
        )}
        {c.rotatable && (
          <button type="button" className="btn btn-sm" onClick={() => onPatch((x) => ({ ...x, rot: x.rot === 90 ? 0 : 90 }))}>
            <Icon name="rotate" size={16} />
            向きを変える
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={onDuplicate}>
          <Icon name="copy" size={16} />
          複製
        </button>
        {c.shape === 'rect' && (
          <>
            <button type="button" className="btn btn-sm" onClick={() => onReorder(1)} title="重なりを上へ">
              <Icon name="up" size={16} />
              上へ
            </button>
            <button type="button" className="btn btn-sm" onClick={() => onReorder(-1)} title="重なりを下へ">
              <Icon name="down" size={16} />
              下へ
            </button>
          </>
        )}
        <button type="button" className="btn btn-sm btn-danger-outline" onClick={onDelete}>
          <Icon name="trash" size={16} />
          削除
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 部材を選んで追加するシート

function Palette({ prices, onPick, onClose }: { prices: Record<string, number>; onPick: (kind: string) => void; onClose: () => void }) {
  return (
    <Sheet title="部材を追加" onClose={onClose} wide>
      <div className="palette">
        {PALETTE_GROUPS.map((g) => (
          <section key={g.key}>
            <h3 className="palette-group">{g.name}</h3>
            <div className="palette-grid">
              {CATALOG.filter((c) => c.group === g.key).map((c) => {
                const low = Math.min(...c.variants.map((v) => unitPrice(prices, c.key, v.key)));
                return (
                  <button key={c.key} type="button" className="palette-item" onClick={() => onPick(c.key)}>
                    <span className="swatch swatch-lg" style={{ background: c.fill.startsWith('rgba') ? '#9cc3de' : c.fill, borderColor: c.stroke }} aria-hidden="true" />
                    <span className="palette-name">{c.name}</span>
                    <span className="palette-price">{c.qty === 'none' ? '見積もりに入りません' : `${yen(low)}/${c.unit}${c.variants.length > 1 ? '〜' : ''}`}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
