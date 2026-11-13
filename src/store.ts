import { useSyncExternalStore } from 'react';
import type { Project, Settings, Tab } from './types';
import { newEstimateState } from './lib/estimate';
import { patternOf, planFromPattern } from './lib/existing';
import { todayISO, uid } from './lib/format';
import { migrateProject, migrateSettings } from './lib/migrate';
import { deletePhoto } from './lib/photos';
import { makeSampleProject } from './lib/sample';

// アプリの状態。案件と設定を localStorage に保存する（サーバー不要・端末内に保存）。

const KEY = 'gaikou.v1';

export interface AppState {
  projects: Project[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  company: { name: '', zip: '', address: '', tel: '', registrationNo: '', staff: '' },
  prices: {},
  taxRate: 10,
  overheadRate: 10,
};

/** 保存データ・バックアップを、いまの版の形にそろえる（足りない項目の補完と、以前の版からの移行） */
export function normalizeState(data: Partial<AppState>): AppState {
  const raw: Settings = {
    ...DEFAULT_SETTINGS,
    ...(data.settings ?? {}),
    company: { ...DEFAULT_SETTINGS.company, ...(data.settings?.company ?? {}) },
  };
  // 単価は移行前のキーで引くので、案件を先に移行する
  const projects = (data.projects ?? []).map((p) => migrateProject(p, raw.prices));
  return { projects, settings: migrateSettings(raw) };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<AppState>;
      if (Array.isArray(data.projects)) return normalizeState(data);
    }
  } catch {
    /* 保存データが読めないときは初期状態から始める */
  }
  // 初回はサンプル案件を 1 件入れて、何ができるアプリか分かるようにする
  return { projects: [makeSampleProject(DEFAULT_SETTINGS)], settings: DEFAULT_SETTINGS };
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveFailed = false;

function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch {
    if (!saveFailed) {
      saveFailed = true;
      toast('この端末に保存できませんでした。設定のバックアップから書き出してください。');
    }
  }
}

function setState(next: AppState) {
  state = next;
  listeners.forEach((l) => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

if (typeof window !== 'undefined') {
  // iPhone では、入力欄を閉じたあとにページがずれたまま残ることがある。
  // ページ自体はスクロールさせない作りなので、入力が終わったら元の位置に戻す。
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (!typing && (window.scrollX !== 0 || window.scrollY !== 0)) window.scrollTo(0, 0);
    }, 80);
  });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export function getState(): AppState {
  return state;
}

export function useProject(id: string): Project | undefined {
  return useAppState((s) => s.projects.find((p) => p.id === id));
}

export function createProject(name: string, patternKey?: string): Project {
  const now = Date.now();
  const p: Project = {
    id: uid(),
    name: name.trim() || '新しい案件',
    createdAt: now,
    updatedAt: now,
    survey: { answers: { surveyDate: todayISO() }, photos: [] },
    // 建物入りの既存図を最初から用意しておく
    plan: planFromPattern(patternOf(patternKey)),
    estimate: newEstimateState(state.settings, state.projects.length + 1),
  };
  setState({ ...state, projects: [p, ...state.projects] });
  return p;
}

export function updateProject(id: string, fn: (p: Project) => Project): void {
  setState({
    ...state,
    projects: state.projects.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p)),
  });
}

export function deleteProject(id: string): void {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  for (const ph of p.survey.photos) void deletePhoto(ph.id);
  if (p.perspectiveId) void deletePhoto(p.perspectiveId);
  setState({ ...state, projects: state.projects.filter((x) => x.id !== id) });
}

export function duplicateProject(id: string): Project | undefined {
  const src = state.projects.find((x) => x.id === id);
  if (!src) return undefined;
  const now = Date.now();
  const copy: Project = {
    ...(JSON.parse(JSON.stringify(src)) as Project),
    id: uid(),
    name: src.name + '（コピー）',
    createdAt: now,
    updatedAt: now,
    sample: false,
    // 写真は元の案件のものなので引き継がない
    survey: { answers: { ...src.survey.answers }, photos: [] },
    perspectiveId: undefined,
  };
  copy.estimate.number = newEstimateState(state.settings, state.projects.length + 1).number;
  setState({ ...state, projects: [copy, ...state.projects] });
  return copy;
}

export function addSampleProject(): Project {
  const p = makeSampleProject(state.settings);
  setState({ ...state, projects: [p, ...state.projects] });
  return p;
}

export function updateSettings(fn: (s: Settings) => Settings): void {
  setState({ ...state, settings: fn(state.settings) });
}

export function replaceAll(next: AppState): void {
  setState(next);
  flush();
}

// ---------------------------------------------------------------------------
// 画面遷移。URL は変えず、履歴 state だけを使う（どこに置いても動くように）。

export type Route = { name: 'home' } | { name: 'settings' } | { name: 'project'; id: string; tab: Tab };

let route: Route = { name: 'home' };
const routeListeners = new Set<() => void>();

function setRoute(r: Route) {
  route = r;
  routeListeners.forEach((l) => l());
}

export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  try {
    if (opts.replace) history.replaceState({ gaikou: r }, '');
    else history.pushState({ gaikou: r }, '');
  } catch {
    /* 履歴が使えない環境でも画面は切り替える */
  }
  setRoute(r);
}

export function goBack(): void {
  const st = history.state as { gaikou?: Route } | null;
  // アプリ内で進んだ履歴があれば戻る。なければホームへ。
  if (st?.gaikou && st.gaikou.name !== 'home') {
    history.back();
  } else {
    navigate({ name: 'home' }, { replace: true });
  }
}

if (typeof window !== 'undefined') {
  try {
    history.replaceState({ gaikou: route }, '');
  } catch {
    /* ignore */
  }
  window.addEventListener('popstate', (e) => {
    const st = e.state as { gaikou?: Route } | null;
    setRoute(st?.gaikou ?? { name: 'home' });
  });
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      routeListeners.add(l);
      return () => {
        routeListeners.delete(l);
      };
    },
    () => route,
  );
}

// ---------------------------------------------------------------------------
// 確認ダイアログとトースト（ブラウザ標準の confirm/alert は使わない）

export interface ConfirmRequest {
  title: string;
  body?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface UiState {
  confirm: ConfirmRequest | null;
  toasts: { id: number; text: string }[];
}

let ui: UiState = { confirm: null, toasts: [] };
const uiListeners = new Set<() => void>();
function setUi(next: UiState) {
  ui = next;
  uiListeners.forEach((l) => l());
}

export function useUi(): UiState {
  return useSyncExternalStore(
    (l) => {
      uiListeners.add(l);
      return () => {
        uiListeners.delete(l);
      };
    },
    () => ui,
  );
}

export function confirmDialog(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    setUi({
      ...ui,
      confirm: {
        ...req,
        resolve: (ok) => {
          setUi({ ...ui, confirm: null });
          resolve(ok);
        },
      },
    });
  });
}

let toastSeq = 0;
export function toast(text: string): void {
  const id = ++toastSeq;
  setUi({ ...ui, toasts: [...ui.toasts, { id, text }] });
  setTimeout(() => setUi({ ...ui, toasts: ui.toasts.filter((t) => t.id !== id) }), 3200);
}
