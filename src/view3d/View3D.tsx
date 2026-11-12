import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Plan, Project, Tab } from '../types';
import { downloadBlob, savePhoto } from '../lib/photos';
import { toast, updateProject } from '../store';
import { Icon } from '../ui/Icon';
import { buildScene } from './scene';
import type { BuiltScene, TimeOfDay } from './scene';

interface Props {
  project: Project;
  onGo: (t: Tab) => void;
}

type Preset = 'diagonal' | 'front' | 'top' | 'eye';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'diagonal', label: 'ななめ' },
  { key: 'front', label: '正面' },
  { key: 'eye', label: '目線' },
  { key: 'top', label: '真上' },
];

const TIMES: { key: TimeOfDay; label: string; icon: string }[] = [
  { key: 'day', label: '昼', icon: 'sun' },
  { key: 'evening', label: '夕方', icon: 'sun' },
  { key: 'night', label: '夜', icon: 'moon' },
];

interface Stage {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  built: BuiltScene | null;
  render: () => void;
}

const FOV = 42;

/** 敷地全体が画面に入る距離を求めて、視点ごとの方向から見る */
function presetView(plan: Plan, preset: Preset, aspect: number): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const W = plan.site.width;
  const D = plan.site.depth;
  const cx = W / 2;
  if (preset === 'eye') {
    // 道路の向かい側に立って見た高さ
    const back = aspect < 1 ? 6 : 0;
    return { pos: new THREE.Vector3(cx - W * 0.3, 1.6, Math.min(plan.roadWidth, 9) + 3 + back), target: new THREE.Vector3(cx + W * 0.05, 2.4, -D * 0.4) };
  }
  const target = new THREE.Vector3(cx, 1.2, -D * 0.42);
  const radius = 0.5 * Math.hypot(W, D) + 1.5;
  const vHalf = THREE.MathUtils.degToRad(FOV / 2);
  const half = Math.min(vHalf, Math.atan(Math.tan(vHalf) * aspect));
  // 縦長の画面では全部を入れると小さくなりすぎるので、少し寄る
  const dist = (radius / Math.sin(half)) * (aspect < 1 ? 0.78 : 0.9);
  const dir = preset === 'front' ? new THREE.Vector3(0, 0.38, 0.92) : preset === 'top' ? new THREE.Vector3(0, 1, 0.015) : new THREE.Vector3(0.56, 0.48, 0.68);
  return { pos: target.clone().addScaledVector(dir.normalize(), dist), target };
}

export default function View3D({ project, onGo }: Props) {
  const plan = project.plan;
  const mountRef = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const [time, setTime] = useState<TimeOfDay>('day');
  const [showCars, setShowCars] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const planRef = useRef(plan);
  planRef.current = plan;

  // レンダラーとカメラは 1 回だけ作る
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !planRef.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // 色がくすまないトーンマッピング（白い外壁が白く見える）
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.domElement.className = 'view3d-canvas';
    mount.appendChild(renderer.domElement);

    const w = Math.max(1, mount.clientWidth);
    const h = Math.max(1, mount.clientHeight);
    const camera = new THREE.PerspectiveCamera(FOV, w / h, 0.2, 600);
    renderer.setSize(w, h, false);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 2;
    controls.maxDistance = 160;
    controls.zoomSpeed = 0.9;
    const v = presetView(planRef.current, 'diagonal', w / h);
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
    controls.update();

    const st: Stage = {
      renderer,
      camera,
      controls,
      built: null,
      render: () => {
        if (st.built) renderer.render(st.built.scene, camera);
      },
    };
    stage.current = st;
    controls.addEventListener('change', st.render);

    const ro = new ResizeObserver(() => {
      const cw = Math.max(1, mount.clientWidth);
      const ch = Math.max(1, mount.clientHeight);
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      st.render();
    });
    ro.observe(mount);

    return () => {
      ro.disconnect();
      controls.removeEventListener('change', st.render);
      controls.dispose();
      st.built?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
    };
  }, []);

  // 平面図や表示の設定が変わったら、シーンを作り直す（カメラはそのまま）
  useEffect(() => {
    const st = stage.current;
    if (!st || !plan) return;
    st.built?.dispose();
    st.built = buildScene(plan, { time, showCars });
    st.renderer.toneMappingExposure = time === 'night' ? 1.35 : 1.0;
    st.render();
  }, [plan, time, showCars]);

  const setPreset = (p: Preset) => {
    const st = stage.current;
    if (!st || !plan) return;
    const v = presetView(plan, p, st.camera.aspect);
    st.camera.position.copy(v.pos);
    st.controls.target.copy(v.target);
    st.controls.update();
    st.render();
  };

  const capture = (type: string, quality?: number): Promise<Blob | null> => {
    const st = stage.current;
    if (!st) return Promise.resolve(null);
    st.render();
    return new Promise((resolve) => st.renderer.domElement.toBlob(resolve, type, quality));
  };

  const saveImage = async () => {
    const blob = await capture('image/png');
    if (!blob) return toast('画像を作れませんでした');
    downloadBlob(blob, `${project.name}_3Dパース.png`);
  };

  const useInProposal = async () => {
    setSaving(true);
    const blob = await capture('image/jpeg', 0.9);
    if (blob) {
      const id = project.perspectiveId ?? `persp-${project.id}`;
      await savePhoto(id, blob);
      updateProject(project.id, (p) => ({ ...p, perspectiveId: id }));
      toast('この視点を見積書に添付します');
    } else {
      toast('画像を作れませんでした');
    }
    setSaving(false);
  };

  if (!plan) {
    return (
      <div className="plan-empty">
        <div className="empty">
          <h2 className="h1">先に平面図を作りましょう</h2>
          <p>3Dパースは平面図から自動で作られます。</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => onGo('plan')}>
            平面図へ
            <Icon name="next" size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="view3d">
      <div className="view3d-stage" ref={mountRef}>
        {failed && (
          <div className="empty view3d-failed">
            <p>この端末・ブラウザでは3D表示（WebGL）を使えませんでした。別のブラウザでお試しください。</p>
          </div>
        )}
        <div className="view3d-top">
          <div className="seg" role="group" aria-label="視点">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" className="seg-btn" onClick={() => setPreset(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="時間帯">
            {TIMES.map((t) => (
              <button key={t.key} type="button" className={'seg-btn' + (time === t.key ? ' is-on' : '')} aria-pressed={time === t.key} onClick={() => setTime(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className={'seg seg-btn seg-single' + (showCars ? ' is-on' : '')} aria-pressed={showCars} onClick={() => setShowCars((v) => !v)}>
            <Icon name="car" size={18} />
            車
          </button>
        </div>
        <p className="view3d-help">1本指でまわす・2本指で拡大と移動（PCはドラッグとホイール）</p>
      </div>
      <div className="view3d-bar">
        <button type="button" className="btn" onClick={() => void saveImage()}>
          <Icon name="download" size={18} />
          画像を保存
        </button>
        <button type="button" className="btn" onClick={() => void useInProposal()} disabled={saving}>
          <Icon name="image" size={18} />
          {project.perspectiveId ? '見積書の画像を更新' : '見積書に添付'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onGo('estimate')}>
          見積もりへ
          <Icon name="next" size={18} />
        </button>
      </div>
    </div>
  );
}
