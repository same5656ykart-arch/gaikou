import * as THREE from 'three';
import type { Plan, PlanItem } from '../types';
import { BLOCK_ROW_HEIGHT, catalogOf, hasKind, lineLength, variantOf } from '../lib/catalog';
import { clamp } from '../lib/format';

// 平面図から 3D のシーンを組み立てる。
// 平面図の x → 3D の X、平面図の y（奥）→ 3D の -Z、高さ → Y。道路は +Z 側。

export type TimeOfDay = 'day' | 'evening' | 'night';

export interface SceneOptions {
  time: TimeOfDay;
  showCars: boolean;
}

export interface BuiltScene {
  scene: THREE.Scene;
  dispose: () => void;
}

/** 毎回同じ見た目になるよう、種つきの乱数を使う */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Draw = (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void;

function speckle(ctx: CanvasRenderingContext2D, size: number, rnd: () => number, count: number, colors: string[], rMin: number, rMax: number) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const r = rMin + rnd() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 素材ごとのテクスチャの描き方と、1 枚が何 m 分かの大きさ */
const TEXTURES: Record<string, { tile: number; draw: Draw }> = {
  concrete: {
    tile: 3,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#c8c9c5';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 1400, ['rgba(255,255,255,0.10)', 'rgba(90,90,90,0.07)'], 0.6, 2.2);
      // 伸縮目地
      ctx.strokeStyle = 'rgba(110,112,110,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, s - 2, s - 2);
    },
  },
  wash: {
    tile: 1.2,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#cfc5b2';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 2600, ['#b3a58c', '#e3dccd', '#9c917e', '#d8cdb8', '#8a8172'], 1, 2.6);
    },
  },
  stamp: {
    tile: 1.6,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#7f7a74';
      ctx.fillRect(0, 0, s, s);
      const n = 4;
      const c = s / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const g = 150 + Math.floor(rnd() * 40);
          ctx.fillStyle = `rgb(${g + 8},${g},${g - 10})`;
          const off = j % 2 ? c / 2 : 0;
          ctx.fillRect(((i * c + off) % s) + 2, j * c + 2, c - 4, c - 4);
          if (i * c + off + c > s) ctx.fillRect(-2, j * c + 2, i * c + off + c - s - 2, c - 4);
        }
      }
    },
  },
  asphalt: {
    tile: 2,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#55575a';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 3000, ['rgba(255,255,255,0.07)', 'rgba(0,0,0,0.12)'], 0.5, 1.6);
    },
  },
  gravel: {
    tile: 1,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#a39c8f';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 1500, ['#c9c3b7', '#8e877b', '#b5ae9f', '#d9d4c8', '#7c766c'], 2.5, 6);
    },
  },
  gravelDeco: {
    tile: 1,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#d9cfb9';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 1500, ['#f1eadb', '#cdbf9f', '#e6dcc4', '#b9a987', '#f7f2e6'], 2.5, 6);
    },
  },
  sheet: {
    tile: 1,
    draw: (ctx, s) => {
      ctx.fillStyle = '#5a6158';
      ctx.fillRect(0, 0, s, s);
    },
  },
  soil: {
    tile: 2,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#ad9a7c';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 1800, ['rgba(80,60,40,0.10)', 'rgba(255,240,210,0.10)'], 1, 4);
    },
  },
  bedSoil: {
    tile: 1,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#5c4433';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 900, ['rgba(30,20,10,0.25)', 'rgba(140,110,80,0.25)'], 1, 3);
    },
  },
  grass: {
    tile: 1.5,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#6f9e4b';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 5000; i++) {
        ctx.strokeStyle = ['#5d8c3d', '#86b35c', '#79a852', '#527f36', '#93bd68'][Math.floor(rnd() * 5)];
        ctx.lineWidth = 1;
        const x = rnd() * s;
        const y = rnd() * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4);
        ctx.stroke();
      }
    },
  },
  grassArt: {
    tile: 1.5,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#5fa046';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 3500, ['#69ad4e', '#57963f', '#72b557'], 0.6, 1.6);
    },
  },
  tile30: {
    tile: 0.6,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#9d9482';
      ctx.fillRect(0, 0, s, s);
      const c = s / 2;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const g = 206 + Math.floor(rnd() * 16);
          ctx.fillStyle = `rgb(${g + 10},${g + 2},${g - 14})`;
          ctx.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
        }
      }
    },
  },
  tile60: {
    tile: 1.2,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#8f8b84';
      ctx.fillRect(0, 0, s, s);
      const c = s / 2;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const g = 176 + Math.floor(rnd() * 14);
          ctx.fillStyle = `rgb(${g + 4},${g + 2},${g - 2})`;
          ctx.fillRect(i * c + 1.5, j * c + 1.5, c - 3, c - 3);
        }
      }
      speckle(ctx, s, rnd, 500, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.05)'], 1, 5);
    },
  },
  brick: {
    tile: 0.8,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#b9aa99';
      ctx.fillRect(0, 0, s, s);
      const bw = s / 4;
      const bh = s / 8;
      for (let j = 0; j < 8; j++) {
        for (let i = -1; i < 4; i++) {
          const x = i * bw + (j % 2 ? bw / 2 : 0);
          const r = 150 + Math.floor(rnd() * 40);
          ctx.fillStyle = `rgb(${r},${Math.floor(r * 0.52)},${Math.floor(r * 0.38)})`;
          ctx.fillRect(x + 1.5, j * bh + 1.5, bw - 3, bh - 3);
        }
      }
    },
  },
  inter: {
    tile: 0.8,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#7d7872';
      ctx.fillRect(0, 0, s, s);
      const bw = s / 4;
      const bh = s / 8;
      const cols = ['#b3a69a', '#c2b3a2', '#a89384', '#b99f8d', '#9f9a92'];
      for (let j = 0; j < 8; j++) {
        for (let i = -1; i < 4; i++) {
          const x = i * bw + (j % 2 ? bw / 2 : 0);
          ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
          ctx.fillRect(x + 1, j * bh + 1, bw - 2, bh - 2);
        }
      }
    },
  },
  stone: {
    tile: 1.6,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#8c8272';
      ctx.fillRect(0, 0, s, s);
      // ゆがめた格子で乱形石ふうに
      const n = 5;
      const c = s / n;
      const jit = (i: number, j: number): [number, number] => {
        const r = mulberry32(((i + n) % n) * 31 + ((j + n) % n) * 17 + 7);
        return [i * c + (r() - 0.5) * c * 0.5, j * c + (r() - 0.5) * c * 0.5];
      };
      for (let i = -1; i < n; i++) {
        for (let j = -1; j < n; j++) {
          const pts = [jit(i, j), jit(i + 1, j), jit(i + 1, j + 1), jit(i, j + 1)];
          const cx = pts.reduce((a, p) => a + p[0], 0) / 4;
          const cy = pts.reduce((a, p) => a + p[1], 0) / 4;
          const g = 196 + Math.floor(rnd() * 34);
          ctx.fillStyle = `rgb(${g + 12},${g},${g - 26})`;
          ctx.beginPath();
          pts.forEach((p, k) => {
            const x = cx + (p[0] - cx) * 0.9;
            const y = cy + (p[1] - cy) * 0.9;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
          ctx.fill();
        }
      }
    },
  },
  deck: {
    tile: 1.12,
    draw: (ctx, s, rnd) => {
      const n = 8;
      const p = s / n;
      for (let j = 0; j < n; j++) {
        const g = 150 + Math.floor(rnd() * 30);
        ctx.fillStyle = `rgb(${g + 22},${Math.floor(g * 0.78)},${Math.floor(g * 0.5)})`;
        ctx.fillRect(0, j * p, s, p);
        ctx.fillStyle = 'rgba(60,35,15,0.55)';
        ctx.fillRect(0, j * p, s, 1.5);
        for (let k = 0; k < 10; k++) {
          ctx.fillStyle = 'rgba(70,40,20,0.10)';
          ctx.fillRect(rnd() * s, j * p + rnd() * p, 30 + rnd() * 60, 1);
        }
      }
    },
  },
  block: {
    tile: 0.8,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#8f9092';
      ctx.fillRect(0, 0, s, s);
      const bw = s / 2;
      const bh = s / 4;
      for (let j = 0; j < 4; j++) {
        for (let i = -1; i < 2; i++) {
          const x = i * bw + (j % 2 ? bw / 2 : 0);
          const g = 168 + Math.floor(rnd() * 16);
          ctx.fillStyle = `rgb(${g},${g},${g - 2})`;
          ctx.fillRect(x + 1.5, j * bh + 1.5, bw - 3, bh - 3);
        }
      }
      speckle(ctx, s, rnd, 700, ['rgba(255,255,255,0.07)', 'rgba(0,0,0,0.07)'], 0.6, 1.8);
    },
  },
  blockDeco: {
    tile: 0.8,
    draw: (ctx, s, rnd) => {
      ctx.fillStyle = '#9a8f80';
      ctx.fillRect(0, 0, s, s);
      const bw = s / 2;
      const bh = s / 4;
      for (let j = 0; j < 4; j++) {
        for (let i = -1; i < 2; i++) {
          const x = i * bw + (j % 2 ? bw / 2 : 0);
          const g = 196 + Math.floor(rnd() * 20);
          ctx.fillStyle = `rgb(${g + 8},${g},${g - 16})`;
          ctx.fillRect(x + 1.5, j * bh + 1.5, bw - 3, bh - 3);
        }
      }
      for (let y = 0; y < s; y += 3) {
        ctx.fillStyle = 'rgba(90,70,50,0.07)';
        ctx.fillRect(0, y, s, 1);
      }
    },
  },
  siding: {
    tile: 1.8,
    draw: (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      for (let j = 0; j < 4; j++) ctx.fillRect(0, (j * s) / 4, s, 2);
    },
  },
  roof: {
    tile: 1,
    draw: (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let j = 0; j < 4; j++) ctx.fillRect(0, (j * s) / 4, s, 3);
    },
  },
};

const WALL_COLORS: Record<string, number> = {
  white: 0xf2efe8,
  beige: 0xe2d3b8,
  gray: 0xb9bcbe,
  dark: 0x4a4d52,
  navy: 0x3b4a63,
  brown: 0x8a6a4f,
};

interface Ctx {
  root: THREE.Group;
  time: TimeOfDay;
  mat: (key: string, make: () => THREE.Material) => THREE.Material;
  textured: (name: string, opts?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial;
  flat: (color: number, opts?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial;
  lamps: THREE.Vector3[];
}

/** テクスチャが実寸で貼られるよう、箱の UV を m 単位に置き換える */
function worldUV(geo: THREE.BufferGeometry, tile: number) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    if (ny > 0.5) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
    else if (nx > 0.5) uv.setXY(i, pos.getZ(i) / tile, pos.getY(i) / tile);
    else uv.setXY(i, pos.getX(i) / tile, pos.getY(i) / tile);
  }
  uv.needsUpdate = true;
}

interface BoxOpts {
  cast?: boolean;
  receive?: boolean;
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, opts: BoxOpts = {}): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const tile = material.userData.tile as number | undefined;
  if (tile) worldUV(geo, tile);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  parent.add(m);
  return m;
}

/** 三角形の集まりから形を作る（屋根や妻壁用） */
function triMesh(parent: THREE.Object3D, verts: number[][], tris: number[][], material: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  for (const [a, b, c] of tris) pos.push(...verts[a], ...verts[b], ...verts[c]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// 建物

function buildRoof(ctx: Ctx, type: string, L: number, S: number, baseY: number, wallMat: THREE.Material, roofColor: number): THREE.Group {
  const g = new THREE.Group();
  const roofMat = ctx.mat('roof' + roofColor, () => {
    const m = ctx.textured('roof', { color: roofColor, roughness: 0.7, metalness: 0.15 });
    return m;
  });
  const plainRoof = ctx.mat('roofPlain' + roofColor, () => new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide }));
  const wallDouble = ctx.mat('wallDouble' + (wallMat as THREE.MeshStandardMaterial).color.getHex(), () => {
    const m = (wallMat as THREE.MeshStandardMaterial).clone();
    m.map = null;
    m.side = THREE.DoubleSide;
    return m;
  });
  const t = 0.14;
  const o = 0.5;

  if (type === 'flat') {
    box(g, L + 0.06, 0.45, S + 0.06, wallMat, 0, baseY + 0.225, 0);
    box(g, L + 0.2, 0.06, S + 0.2, plainRoof, 0, baseY + 0.48, 0);
    return g;
  }
  if (type === 'shed') {
    const pitch = 0.2;
    const rise = S * pitch;
    const run = S + o * 2;
    const slab = box(g, L + o * 2, t, run * Math.sqrt(1 + pitch * pitch), roofMat, 0, baseY + rise / 2 + t / 2 + 0.02, 0);
    slab.rotation.x = Math.atan(pitch);
    const x = L / 2;
    const z = S / 2;
    triMesh(
      g,
      [
        [-x, baseY, z],
        [-x, baseY, -z],
        [-x, baseY + rise, -z],
        [x, baseY, z],
        [x, baseY, -z],
        [x, baseY + rise, -z],
      ],
      [
        [0, 1, 2],
        [3, 5, 4],
        [1, 4, 5],
        [1, 5, 2],
      ],
      wallDouble,
    );
    return g;
  }
  if (type === 'hip') {
    const pitch = 0.45;
    const lx = L / 2 + o;
    const sz = S / 2 + o;
    const rise = sz * pitch;
    const r = Math.max(0, (L - S) / 2);
    const y0 = baseY + 0.02;
    const y1 = y0 + rise;
    triMesh(
      g,
      [
        [-lx, y0, sz],
        [lx, y0, sz],
        [lx, y0, -sz],
        [-lx, y0, -sz],
        [-r, y1, 0],
        [r, y1, 0],
      ],
      [
        [0, 1, 5],
        [0, 5, 4],
        [2, 3, 4],
        [2, 4, 5],
        [3, 0, 4],
        [1, 2, 5],
      ],
      plainRoof,
    );
    // 軒裏
    box(g, lx * 2 - 0.04, 0.1, sz * 2 - 0.04, ctx.flat(0xe9e6df), 0, y0 - 0.05, 0, { cast: false });
    return g;
  }
  // 切妻（三角屋根）
  const pitch = 0.45;
  const rise = (S / 2) * pitch;
  const run = S / 2 + o;
  const len = run * Math.sqrt(1 + pitch * pitch);
  for (const side of [1, -1]) {
    const slab = box(g, L + o * 2, t, len, roofMat, 0, baseY + rise - (run / 2) * pitch + t / 2 + 0.02, (side * run) / 2);
    slab.rotation.x = side * Math.atan(pitch);
  }
  box(g, L + o * 2 + 0.04, 0.1, 0.34, plainRoof, 0, baseY + rise + t + 0.02, 0);
  const x = L / 2;
  const z = S / 2;
  triMesh(
    g,
    [
      [-x, baseY, z],
      [-x, baseY, -z],
      [-x, baseY + rise, 0],
      [x, baseY, z],
      [x, baseY, -z],
      [x, baseY + rise, 0],
    ],
    [
      [0, 1, 2],
      [3, 5, 4],
    ],
    wallDouble,
  );
  return g;
}

function buildHouse(ctx: Ctx, it: PlanItem) {
  const w = it.w;
  const d = it.h;
  const floors = clamp(Number(it.props.floors ?? 2), 1, 3);
  const FH = 2.8;
  const base = 0.45;
  const wallH = floors * FH + 0.25;
  const g = new THREE.Group();
  g.position.set(it.x + w / 2, 0, -(it.y + d / 2));
  ctx.root.add(g);
  const rnd = mulberry32(hashString(it.id));

  const wallKey = String(it.props.wall ?? 'white');
  const wallColor = WALL_COLORS[wallKey] ?? WALL_COLORS.white;
  const wallMat = ctx.mat('wall' + wallKey, () => ctx.textured('siding', { color: wallColor, roughness: 0.92 }));
  const roofColor = wallKey === 'brown' || wallKey === 'beige' ? 0x4a3a30 : wallKey === 'dark' ? 0x2a2c30 : 0x3b4046;
  const trim = ctx.flat(0xf4f2ee, { roughness: 0.6 });
  const dark = ctx.flat(0x2f3338, { roughness: 0.5, metalness: 0.3 });

  box(g, w + 0.06, base, d + 0.06, ctx.flat(0x9c9d9b, { roughness: 0.95 }), 0, base / 2, 0);
  box(g, w, wallH, d, wallMat, 0, base + wallH / 2, 0);

  const roofType = String(it.props.roof ?? 'gable');
  const alongZ = d > w;
  const roof = buildRoof(ctx, roofType, alongZ ? d : w, alongZ ? w : d, base + wallH, wallMat, roofColor);
  if (alongZ) roof.rotation.y = Math.PI / 2;
  g.add(roof);

  // 窓。夜は一部の部屋に明かりをつける
  const litMat = ctx.mat('glassLit', () => new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc070, emissiveIntensity: ctx.time === 'night' ? 1.5 : 0.9, roughness: 0.4 }));
  const glassMat = ctx.mat('glass', () => new THREE.MeshStandardMaterial({ color: ctx.time === 'night' ? 0x1a2230 : 0x6e8ea8, roughness: 0.12, metalness: 0.55 }));
  const windowAt = (face: 'front' | 'back' | 'left' | 'right', u: number, y: number, ww: number, wh: number) => {
    const lit = ctx.time !== 'day' && rnd() < (ctx.time === 'night' ? 0.6 : 0.4);
    const m = lit ? litMat : glassMat;
    const e = 0.03;
    if (face === 'front' || face === 'back') {
      const z = (face === 'front' ? 1 : -1) * (d / 2 + e);
      box(g, ww + 0.12, wh + 0.12, 0.05, trim, u, y, z, { cast: false });
      box(g, ww, wh, 0.07, m, u, y, z, { cast: false });
    } else {
      const x = (face === 'right' ? 1 : -1) * (w / 2 + e);
      box(g, 0.05, wh + 0.12, ww + 0.12, trim, x, y, u, { cast: false });
      box(g, 0.07, wh, ww, m, x, y, u, { cast: false });
    }
  };

  // 玄関（道路側の壁）
  const doorU = w * (it.props.door === 'left' ? -0.25 : it.props.door === 'right' ? 0.25 : 0);
  const doorMat = ctx.flat(wallKey === 'dark' || wallKey === 'navy' ? 0x9a6b3d : 0x5a3b26, { roughness: 0.55 });
  box(g, 1.05, 2.25, 0.06, dark, doorU, base + 1.125, d / 2 + 0.03, { cast: false });
  box(g, 0.9, 2.15, 0.09, doorMat, doorU, base + 1.075, d / 2 + 0.03, { cast: false });
  box(g, 0.04, 0.5, 0.14, ctx.flat(0xc9ccd0, { metalness: 0.8, roughness: 0.3 }), doorU + 0.3, base + 1.05, d / 2 + 0.05, { cast: false });
  // ポーチと庇
  const porch = ctx.mat('porch', () => ctx.textured('tile30', { roughness: 0.8 }));
  box(g, 2.0, base - 0.02, 1.2, porch, doorU, (base - 0.02) / 2, d / 2 + 0.6);
  box(g, 2.3, base / 2 - 0.02, 1.5, porch, doorU, (base / 2 - 0.02) / 2, d / 2 + 0.75);
  box(g, 2.2, 0.1, 1.2, dark, doorU, base + 2.5, d / 2 + 0.6);
  if (ctx.time !== 'day') ctx.lamps.push(new THREE.Vector3(g.position.x + doorU, base + 2.2, g.position.z + d / 2 + 0.7));

  for (let f = 0; f < floors; f++) {
    const y = base + f * FH + 1.45;
    // 正面：等間隔に窓を並べ、玄関と重なるところは空ける
    const nFront = Math.max(1, Math.min(4, Math.round(w / 2.8)));
    for (let i = 0; i < nFront; i++) {
      const u = -w / 2 + (w * (i + 0.5)) / nFront;
      if (f === 0 && Math.abs(u - doorU) < 1.6) continue;
      const tall = f === 0;
      const ww = Math.min(1.7, w / nFront - 0.9);
      if (ww < 0.5) continue;
      windowAt('front', u, tall ? base + 1.15 : y, ww, tall ? 1.9 : 1.1);
    }
    const nSide = Math.max(1, Math.min(3, Math.round(d / 3.5)));
    for (let i = 0; i < nSide; i++) {
      const u = -d / 2 + (d * (i + 0.5)) / nSide;
      windowAt('left', u, y + 0.1, 0.75, 0.9);
      windowAt('right', u, y + 0.1, 0.75, 0.9);
    }
    const nBack = Math.max(1, Math.min(3, Math.round(w / 3.5)));
    for (let i = 0; i < nBack; i++) {
      windowAt('back', -w / 2 + (w * (i + 0.5)) / nBack, f === 0 ? base + 1.15 : y, 1.5, f === 0 ? 1.9 : 1.1);
    }
  }
}

// ---------------------------------------------------------------------------
// 車

const CAR_COLORS = [0xe9ecef, 0x2f4a6b, 0xb4bac0, 0x7a1f24, 0x2c3540, 0xf4f1e6];

function buildCar(ctx: Ctx, it: PlanItem, index: number) {
  const along = it.h >= it.w;
  const L = Math.max(it.w, it.h);
  const wid = Math.min(it.w, it.h);
  const g = new THREE.Group();
  g.position.set(it.x + it.w / 2, 0, -(it.y + it.h / 2));
  if (!along) g.rotation.y = Math.PI / 2;
  ctx.root.add(g);
  // 並んだ車が同じ色にならないよう、置いた順に色を変える
  const color = CAR_COLORS[index % CAR_COLORS.length];
  const paint = ctx.mat('car' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25 }));
  const glass = ctx.mat('carGlass', () => new THREE.MeshStandardMaterial({ color: 0x18222c, roughness: 0.08, metalness: 0.7 }));
  const tall = it.variant === 'minivan' ? 1.74 : it.variant === 'kei' ? 1.62 : 1.44;
  const boxy = it.variant !== 'normal';
  const hoodEnd = boxy ? 0.27 : 0.18;
  const roofFront = boxy ? 0.17 : 0.05;
  const roofRear = boxy ? -0.44 : -0.33;

  // 横から見た形を押し出して作る（x: 前後, y: 高さ）
  const extrude = (pts: [number, number][], width: number, material: THREE.Material) => {
    const shape = new THREE.Shape();
    pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x * L, y) : shape.lineTo(x * L, y)));
    shape.closePath();
    const bevel = 0.035;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
    geo.translate(0, 0, -(width - bevel * 2) / 2);
    const m = new THREE.Mesh(geo, material);
    m.rotation.y = -Math.PI / 2; // 形の x → 3D の +Z（前）
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  extrude(
    [
      [-0.49, 0.32],
      [0.49, 0.32],
      [0.49, 0.72],
      [0.46, 0.86],
      [hoodEnd, 0.96],
      [-0.47, 0.99],
      [-0.49, 0.9],
    ],
    wid,
    paint,
  );
  extrude(
    [
      [hoodEnd + 0.01, 0.94],
      [roofFront, tall - 0.04],
      [roofRear, tall - 0.02],
      [-0.47, 0.97],
    ],
    wid * 0.9,
    glass,
  );
  box(g, wid * 0.86, 0.05, (roofFront - roofRear) * L + 0.1, paint, 0, tall, ((roofFront + roofRear) / 2) * L);

  const tire = ctx.flat(0x17181a, { roughness: 0.9 });
  const hub = ctx.flat(0xb9bec4, { roughness: 0.4, metalness: 0.7 });
  for (const sx of [-1, 1]) {
    for (const sz of [-0.31, 0.31]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 20), tire);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * (wid / 2 - 0.08), 0.32, sz * L);
      wheel.castShadow = true;
      g.add(wheel);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.21, 16), hub);
      cap.rotation.z = Math.PI / 2;
      cap.position.copy(wheel.position);
      g.add(cap);
    }
  }
  const on = ctx.time !== 'day';
  const head = ctx.mat('carHead', () => new THREE.MeshStandardMaterial({ color: 0xf5f7fa, emissive: 0xfff2d0, emissiveIntensity: on ? 0.25 : 0, roughness: 0.2 }));
  const tail = ctx.mat('carTail', () => new THREE.MeshStandardMaterial({ color: 0xa3161c, emissive: 0xff2020, emissiveIntensity: on ? 0.2 : 0, roughness: 0.3 }));
  for (const sx of [-1, 1]) {
    box(g, wid * 0.22, 0.1, 0.04, head, sx * wid * 0.33, 0.72, 0.49 * L + 0.01, { cast: false });
    box(g, wid * 0.2, 0.1, 0.04, tail, sx * wid * 0.33, 0.84, -0.49 * L - 0.01, { cast: false });
  }
}

// ---------------------------------------------------------------------------
// 植栽

function blob(parent: THREE.Object3D, r: number, material: THREE.Material, x: number, y: number, z: number, squash = 0.85) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), material);
  m.position.set(x, y, z);
  m.scale.y = squash;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const LEAVES = [0x4f8a3c, 0x5f9c46, 0x6fae52, 0x457a35, 0x7ab85c];

function leafMat(ctx: Ctx, i: number): THREE.Material {
  const c = LEAVES[i % LEAVES.length];
  return ctx.mat('leaf' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
}

function buildTree(ctx: Ctx, it: PlanItem) {
  const H = variantOf('tree', it.variant).height ?? 3;
  const rnd = mulberry32(hashString(it.id));
  const g = new THREE.Group();
  g.position.set(it.x, 0, -it.y);
  ctx.root.add(g);
  const trunkMat = ctx.flat(0x6b5038, { roughness: 0.95 });
  // 株立ちふうに、細い幹を 3 本
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rnd();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, H * 0.62, 6), trunkMat);
    trunk.position.set(Math.cos(a) * 0.1, H * 0.31, Math.sin(a) * 0.1);
    trunk.rotation.z = Math.cos(a) * -0.12;
    trunk.rotation.x = Math.sin(a) * 0.12;
    trunk.castShadow = true;
    g.add(trunk);
  }
  const cr = H * 0.3;
  for (let i = 0; i < 8; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = rnd() * cr * 0.7;
    blob(g, cr * (0.42 + rnd() * 0.3), leafMat(ctx, Math.floor(rnd() * 5)), Math.cos(a) * rr, H * (0.58 + rnd() * 0.36), Math.sin(a) * rr);
  }
}

function buildShrub(ctx: Ctx, it: PlanItem) {
  const rnd = mulberry32(hashString(it.id));
  const ground = it.variant === 'ground';
  const r = ground ? 0.2 : 0.3;
  const n = ground ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    blob(ctx.root, r * (0.75 + rnd() * 0.4), leafMat(ctx, Math.floor(rnd() * 5)), it.x + Math.cos(a) * r * 0.45, ground ? 0.1 : 0.22 + rnd() * 0.08, -it.y + Math.sin(a) * r * 0.45, ground ? 0.5 : 0.8);
  }
}

function buildFlowerbed(ctx: Ctx, it: PlanItem) {
  const { w, h: d } = it;
  const g = new THREE.Group();
  g.position.set(it.x + w / 2, 0, -(it.y + d / 2));
  ctx.root.add(g);
  const edge = ctx.mat(it.variant === 'block' ? 'tex:blockDeco' : 'tex:brick', () => ctx.textured(it.variant === 'block' ? 'blockDeco' : 'brick', { roughness: 0.9 }));
  const H = 0.3;
  const t = 0.1;
  box(g, w, H, t, edge, 0, H / 2, d / 2 - t / 2);
  box(g, w, H, t, edge, 0, H / 2, -d / 2 + t / 2);
  box(g, t, H, d - t * 2, edge, -w / 2 + t / 2, H / 2, 0);
  box(g, t, H, d - t * 2, edge, w / 2 - t / 2, H / 2, 0);
  box(g, w - t * 2, H - 0.05, d - t * 2, ctx.mat('tex:bedSoil', () => ctx.textured('bedSoil', { roughness: 1 })), 0, (H - 0.05) / 2, 0, { cast: false });
  const rnd = mulberry32(hashString(it.id));
  const flowers = [0xe58aa0, 0xf0c95a, 0xffffff, 0xb48ad6];
  const n = Math.min(24, Math.max(3, Math.round((w - 0.2) * (d - 0.2) * 7)));
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * (w - t * 2 - 0.2);
    const z = (rnd() - 0.5) * (d - t * 2 - 0.15);
    if (rnd() < 0.4) {
      const c = flowers[Math.floor(rnd() * flowers.length)];
      blob(g, 0.07 + rnd() * 0.04, ctx.mat('flower' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true })), x, H + 0.08, z, 0.7);
    } else {
      blob(g, 0.11 + rnd() * 0.08, leafMat(ctx, Math.floor(rnd() * 5)), x, H + 0.05, z, 0.75);
    }
  }
}

// ---------------------------------------------------------------------------
// 塀・フェンス

function lineGroup(ctx: Ctx, it: PlanItem): { g: THREE.Group; len: number } {
  const g = new THREE.Group();
  g.position.set(it.x, 0, -it.y);
  // ローカルの +X が線の向きになるように回す
  g.rotation.y = Math.atan2(it.y2 - it.y, it.x2 - it.x);
  ctx.root.add(g);
  return { g, len: lineLength(it) };
}

function blockWall(ctx: Ctx, g: THREE.Object3D, len: number, H: number, variant: string) {
  const name = variant === 'deco' ? 'blockDeco' : 'block';
  const m =
    variant === 'form'
      ? ctx.mat('formBlock', () => ctx.textured('block', { color: 0xb5b6b4, roughness: 0.95 }))
      : ctx.mat('tex:' + name, () => ctx.textured(name, { roughness: 0.95 }));
  const t = variant === 'form' ? 0.15 : 0.12;
  box(g, len + t, H, t, m, len / 2, H / 2, 0);
}

function buildFence(ctx: Ctx, it: PlanItem) {
  const { g, len } = lineGroup(ctx, it);
  if (len < 0.05) return;
  const rows = Math.max(0, Number(it.props.baseRows ?? 0));
  const baseH = rows * BLOCK_ROW_HEIGHT;
  if (rows > 0) blockWall(ctx, g, len, baseH, 'cb');
  const H = variantOf('fence', it.variant).height ?? 1;
  const kind = it.variant;
  const wood = kind.startsWith('wood');
  const privacy = kind.startsWith('privacy') || wood;
  const frame = ctx.flat(kind === 'mesh' ? 0x5b5f64 : wood ? 0x4a3524 : 0x3b3d40, { roughness: 0.5, metalness: 0.5 });
  const n = Math.max(1, Math.round(len / 2));
  const ps = privacy ? 0.07 : 0.045;
  for (let i = 0; i <= n; i++) box(g, ps, H + 0.04, ps, frame, (len * i) / n, baseH + (H + 0.04) / 2, privacy ? -0.045 : 0);

  if (kind === 'mesh') {
    const tex = ctx.mat('meshPanel', () => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const cx = c.getContext('2d')!;
      cx.clearRect(0, 0, 64, 64);
      cx.strokeStyle = 'rgba(70,74,78,1)';
      cx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        cx.beginPath();
        cx.moveTo(i * 16 + 8, 0);
        cx.lineTo(i * 16 + 8, 64);
        cx.stroke();
      }
      cx.lineWidth = 4;
      cx.beginPath();
      cx.moveTo(0, 32);
      cx.lineTo(64, 32);
      cx.stroke();
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4, depthWrite: false });
      m.userData.ownTexture = t;
      return m;
    }) as THREE.MeshStandardMaterial;
    const geo = new THREE.PlaneGeometry(len, H - 0.06);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 0.2, (uv.getY(i) * (H - 0.06)) / 0.2);
    const panel = new THREE.Mesh(geo, tex);
    panel.position.set(len / 2, baseH + H / 2 + 0.01, 0);
    g.add(panel);
    box(g, len, 0.03, 0.03, frame, len / 2, baseH + H - 0.02, 0, { cast: false });
    box(g, len, 0.03, 0.03, frame, len / 2, baseH + 0.06, 0, { cast: false });
    return;
  }
  // 横板を並べる（アルミは細い格子、目隠しは幅広の板）
  const slatH = privacy ? 0.14 : 0.05;
  const gap = privacy ? 0.014 : 0.065;
  const count = Math.max(1, Math.floor((H - 0.03) / (slatH + gap)));
  const rnd = mulberry32(hashString(it.id));
  for (let i = 0; i < count; i++) {
    const shade = wood ? 0.9 + rnd() * 0.2 : 1;
    const color = wood ? new THREE.Color(0xa87343).multiplyScalar(shade).getHex() : privacy ? 0x57524c : 0x55595e;
    const m = ctx.mat('slat' + color, () => new THREE.MeshStandardMaterial({ color, roughness: wood ? 0.8 : 0.45, metalness: wood ? 0 : 0.5 }));
    box(g, len, slatH, 0.02, m, len / 2, baseH + 0.04 + slatH / 2 + i * (slatH + gap), 0);
  }
}

function buildGate(ctx: Ctx, it: PlanItem) {
  const width = variantOf('gate', it.variant).width ?? 0.8;
  const g = new THREE.Group();
  g.position.set(it.x, 0, -it.y);
  if (it.rot === 90) g.rotation.y = Math.PI / 2;
  ctx.root.add(g);
  const m = ctx.flat(0x35383c, { roughness: 0.45, metalness: 0.6 });
  const H = 1.2;
  for (const s of [-1, 1]) box(g, 0.08, H + 0.1, 0.08, m, (s * width) / 2, (H + 0.1) / 2, 0);
  box(g, width - 0.1, 0.05, 0.035, m, 0, H - 0.05, 0);
  box(g, width - 0.1, 0.05, 0.035, m, 0, 0.14, 0);
  const step = it.variant === 'accordion' ? 0.14 : 0.1;
  const n = Math.floor((width - 0.12) / step);
  for (let i = 0; i <= n; i++) box(g, 0.02, H - 0.2, 0.02, m, -(width - 0.12) / 2 + ((width - 0.12) * i) / Math.max(1, n), 0.14 + (H - 0.19) / 2, 0, { cast: false });
  if (it.variant === 'double') box(g, 0.05, H - 0.1, 0.045, m, 0, 0.1 + (H - 0.1) / 2, 0);
}

function buildGatepost(ctx: Ctx, it: PlanItem) {
  const g = new THREE.Group();
  g.position.set(it.x, 0, -it.y);
  if (it.rot === 90) g.rotation.y = Math.PI / 2;
  ctx.root.add(g);
  const lit = ctx.time !== 'day';
  const lamp = ctx.mat('lamp', () => new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc878, emissiveIntensity: lit ? 2.2 : 0.15, roughness: 0.4 }));
  const dark = ctx.flat(0x2f2b28, { roughness: 0.5, metalness: 0.4 });
  if (it.variant === 'func') {
    box(g, 0.14, 1.6, 0.1, dark, 0, 0.8, 0);
    box(g, 0.42, 0.3, 0.18, ctx.flat(0xa87343, { roughness: 0.7 }), 0, 0.95, 0.02);
    box(g, 0.3, 0.035, 0.02, dark, 0, 1.02, 0.115, { cast: false });
    box(g, 0.2, 0.2, 0.02, ctx.flat(0xe8e6e1, { roughness: 0.5 }), 0, 1.28, 0.06, { cast: false });
    box(g, 0.09, 0.12, 0.07, lamp, 0, 1.5, 0.07, { cast: false });
  } else {
    const wall = it.variant === 'tile' ? ctx.mat('postTile', () => ctx.textured('tile60', { color: 0xd9d2c6, roughness: 0.7 })) : ctx.flat(0xf1eee8, { roughness: 0.95 });
    box(g, 1.2, 1.5, 0.18, wall, 0, 0.75, 0);
    box(g, 0.36, 0.07, 0.02, dark, 0.2, 0.98, 0.1, { cast: false });
    box(g, 0.22, 0.22, 0.02, dark, -0.3, 1.18, 0.1, { cast: false });
    box(g, 0.1, 0.14, 0.07, lamp, 0.42, 1.28, 0.12, { cast: false });
  }
  if (lit) ctx.lamps.push(new THREE.Vector3(it.x, 1.45, -it.y + 0.35));
}

// ---------------------------------------------------------------------------
// 設置物

function buildCarport(ctx: Ctx, it: PlanItem, small: boolean) {
  const { w, h: d } = it;
  const g = new THREE.Group();
  g.position.set(it.x + w / 2, 0, -(it.y + d / 2));
  ctx.root.add(g);
  const H = small ? 2.0 : 2.35;
  const frame = ctx.flat(0x3c4146, { roughness: 0.45, metalness: 0.6 });
  const panel = ctx.mat('polyca', () => new THREE.MeshStandardMaterial({ color: 0xa9cfe6, transparent: true, opacity: 0.42, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  const both = w >= 4.5;
  const px = w / 2 - 0.14;
  const xs = both ? [-px, px] : [-px];
  for (const x of xs) {
    for (const z of [-d * 0.28, d * 0.28]) box(g, 0.12, H, 0.16, frame, x, H / 2, z);
    box(g, 0.12, 0.14, d * 0.92, frame, x, H - 0.07, 0);
  }
  const roof = new THREE.Group();
  roof.position.y = H + 0.04;
  // 片側支持は、柱のない側を少し持ち上げる
  if (!both) roof.rotation.z = 0.05;
  g.add(roof);
  for (const z of [-d / 2, d / 2]) box(roof, w, 0.09, 0.07, frame, 0, 0, z);
  for (const x of [-w / 2, w / 2]) box(roof, 0.07, 0.09, d, frame, x, 0, 0);
  const ribs = Math.max(2, Math.round(d / 0.9));
  for (let i = 1; i < ribs; i++) box(roof, w, 0.045, 0.035, frame, 0, 0, -d / 2 + (d * i) / ribs, { cast: false });
  const p = box(roof, w - 0.08, 0.02, d - 0.08, panel, 0, 0.05, 0, { receive: false });
  p.renderOrder = 2;
}

function buildDeck(ctx: Ctx, it: PlanItem) {
  const { w, h: d } = it;
  const cx = it.x + w / 2;
  const cz = -(it.y + d / 2);
  const hard = it.variant === 'hardwood';
  const top = ctx.mat('deck' + it.variant, () => ctx.textured('deck', { color: hard ? 0xb98d68 : 0xffffff, roughness: 0.8 }));
  box(ctx.root, w, 0.06, d, top, cx, 0.43, cz);
  box(ctx.root, w - 0.06, 0.4, d - 0.06, ctx.flat(hard ? 0x6f4f38 : 0x8a6344, { roughness: 0.85 }), cx, 0.2, cz);
}

function buildShed(ctx: Ctx, it: PlanItem) {
  const { w, h: d } = it;
  const g = new THREE.Group();
  g.position.set(it.x + w / 2, 0, -(it.y + d / 2));
  ctx.root.add(g);
  const H = it.variant === 'l' ? 2.1 : it.variant === 's' ? 1.6 : 1.9;
  const body = ctx.flat(0xc9ced3, { roughness: 0.55, metalness: 0.35 });
  const dark = ctx.flat(0x6f777f, { roughness: 0.5, metalness: 0.4 });
  box(g, w, H, d, body, 0, 0.08 + H / 2, 0);
  box(g, w + 0.14, 0.07, d + 0.14, dark, 0, 0.08 + H + 0.035, 0);
  // 正面の引き戸（道路側）
  const front = w >= d ? { x: 0, z: d / 2 + 0.012, sx: w * 0.46, sz: 0.02, ox: w * 0.24, oz: 0 } : null;
  if (front) {
    for (const s of [-1, 1]) box(g, front.sx, H - 0.25, front.sz, ctx.flat(0xb4bac0, { roughness: 0.5, metalness: 0.4 }), s * front.ox, 0.08 + H / 2, front.z, { cast: false });
    box(g, 0.03, 0.4, 0.03, dark, 0.05, 0.08 + H / 2, d / 2 + 0.03, { cast: false });
  }
}

function buildSteps(ctx: Ctx, it: PlanItem) {
  const n = Math.max(1, Math.round(it.count));
  const m = it.variant === 'tile' ? ctx.mat('tex:tile30', () => ctx.textured('tile30', { roughness: 0.8 })) : ctx.mat('tex:wash', () => ctx.textured('wash', { roughness: 0.95 }));
  const run = it.h / n;
  for (let i = 0; i < n; i++) {
    const h = 0.16 * (i + 1);
    box(ctx.root, it.w, h, run, m, it.x + it.w / 2, h / 2, -(it.y + (i + 0.5) * run));
  }
}

function buildFaucet(ctx: Ctx, it: PlanItem) {
  if (it.variant === 'box') {
    box(ctx.root, 0.28, 0.03, 0.22, ctx.flat(0x3d6fa0, { roughness: 0.5, metalness: 0.3 }), it.x, 0.05, -it.y, { cast: false });
    return;
  }
  const stone = ctx.flat(0xcfc8bb, { roughness: 0.85 });
  box(ctx.root, 0.1, 0.9, 0.1, stone, it.x, 0.45, -it.y);
  box(ctx.root, 0.42, 0.1, 0.42, stone, it.x, 0.07, -it.y + 0.26);
  box(ctx.root, 0.03, 0.03, 0.12, ctx.flat(0xc9ccd0, { metalness: 0.9, roughness: 0.25 }), it.x, 0.72, -it.y + 0.1, { cast: false });
}

function buildLight(ctx: Ctx, it: PlanItem) {
  const lit = ctx.time !== 'day';
  const lamp = ctx.mat('lamp', () => new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc878, emissiveIntensity: lit ? 2.2 : 0.15, roughness: 0.4 }));
  const dark = ctx.flat(0x2b2d30, { roughness: 0.5, metalness: 0.5 });
  if (it.variant === 'spot') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.14, 12), dark);
    body.position.set(it.x, 0.14, -it.y);
    body.rotation.x = -0.6;
    ctx.root.add(body);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), lamp);
    lens.position.set(it.x, 0.2, -it.y - 0.04);
    ctx.root.add(lens);
    if (lit) ctx.lamps.push(new THREE.Vector3(it.x, 0.5, -it.y - 0.2));
    return;
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.55, 10), dark);
  pole.position.set(it.x, 0.275, -it.y);
  pole.castShadow = true;
  ctx.root.add(pole);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 14), lamp);
  head.position.set(it.x, 0.63, -it.y);
  ctx.root.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 14), dark);
  cap.position.set(it.x, 0.72, -it.y);
  ctx.root.add(cap);
  if (lit) ctx.lamps.push(new THREE.Vector3(it.x, 0.75, -it.y));
}

// ---------------------------------------------------------------------------
// 地面の仕上げ

function floorMaterial(ctx: Ctx, it: PlanItem): { m: THREE.Material; t: number } {
  const tex = (name: string, rough = 0.95) => ctx.mat(`tex:${name}:${rough}`, () => ctx.textured(name, { roughness: rough }));
  switch (it.kind) {
    case 'concrete':
      if (it.variant === 'wash') return { m: tex('wash'), t: 0.05 };
      if (it.variant === 'stamp') return { m: tex('stamp'), t: 0.05 };
      return { m: tex('concrete', it.variant === 'trowel' ? 0.7 : 0.95), t: 0.05 };
    case 'asphalt':
      return { m: tex('asphalt'), t: 0.04 };
    case 'gravel':
      return { m: tex(it.variant === 'deco' ? 'gravelDeco' : it.variant === 'sheet' ? 'sheet' : 'gravel', 1), t: 0.03 };
    case 'paving':
      return { m: tex(it.variant === 'brick' ? 'brick' : 'inter', 0.9), t: 0.05 };
    case 'tile':
      return { m: tex(it.variant === 't600' ? 'tile60' : 'tile30', 0.6), t: 0.12 };
    case 'approach':
      return { m: tex(it.variant === 'tile' ? 'tile30' : it.variant === 'stone' ? 'stone' : it.variant === 'brick' ? 'brick' : 'wash', 0.85), t: 0.06 };
    case 'lawn':
      return { m: tex(it.variant === 'artificial' ? 'grassArt' : 'grass', 1), t: 0.035 };
    default:
      return { m: tex('concrete'), t: 0.05 };
  }
}

const FLOOR_KINDS = new Set(['concrete', 'asphalt', 'gravel', 'paving', 'tile', 'approach', 'lawn']);

// ---------------------------------------------------------------------------

const SKY: Record<TimeOfDay, { stops: [number, string][]; horizon: number; ground: number }> = {
  day: {
    stops: [
      [0, '#6ea9de'],
      [0.55, '#b4d4ee'],
      [1, '#e4eff7'],
    ],
    horizon: 0xdfeaf2,
    ground: 0xc4cdb8,
  },
  evening: {
    stops: [
      [0, '#3d4f80'],
      [0.45, '#b9899a'],
      [0.75, '#f5b582'],
      [1, '#fbd9a8'],
    ],
    horizon: 0xecd3bf,
    ground: 0xb9bda6,
  },
  night: {
    stops: [
      [0, '#070b18'],
      [0.6, '#141d38'],
      [1, '#2a3558'],
    ],
    horizon: 0x222c4a,
    ground: 0x4a5348,
  },
};

function skyTexture(time: TimeOfDay): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [o, col] of SKY[time].stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildScene(plan: Plan, opts: SceneOptions): BuiltScene {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const W = plan.site.width;
  const D = plan.site.depth;
  const road = plan.roadWidth;
  const span = Math.max(W, D);

  const materials = new Map<string, THREE.Material>();
  const textures: THREE.Texture[] = [];
  const texCache = new Map<string, THREE.CanvasTexture>();
  const mat: Ctx['mat'] = (key, make) => {
    let m = materials.get(key);
    if (!m) {
      m = make();
      materials.set(key, m);
    }
    return m;
  };
  const getTexture = (name: string): THREE.CanvasTexture => {
    let t = texCache.get(name);
    if (!t) {
      const def = TEXTURES[name];
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const cx = c.getContext('2d')!;
      def.draw(cx, 256, mulberry32(hashString(name)));
      t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      texCache.set(name, t);
      textures.push(t);
    }
    return t;
  };
  const textured: Ctx['textured'] = (name, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ map: getTexture(name), roughness: 0.9, ...o });
    m.userData.tile = TEXTURES[name].tile;
    return m;
  };
  const flat: Ctx['flat'] = (color, o = {}) =>
    mat(`flat:${color}:${o.roughness ?? ''}:${o.metalness ?? ''}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o })) as THREE.MeshStandardMaterial;

  const ctx: Ctx = { root, time: opts.time, mat, textured, flat, lamps: [] };

  // ---- 空と光 ----
  const sky = skyTexture(opts.time);
  textures.push(sky);
  scene.background = sky;
  const cx = W / 2;
  const cz = -D / 2;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8273, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  let sunDir = new THREE.Vector3(-0.55, 1, 0.75);
  // 光の強さは物理的な単位。日なたの白い壁がほぼ白になるのが π（約 3.1）前後
  if (opts.time === 'day') {
    hemi.color.set(0xdcecff);
    hemi.groundColor.set(0xb3a88f);
    hemi.intensity = 1.9;
    sun.color.set(0xfff3dd);
    sun.intensity = 3.5;
  } else if (opts.time === 'evening') {
    hemi.color.set(0xd6cfe6);
    hemi.groundColor.set(0xa08a78);
    hemi.intensity = 2.0;
    sun.color.set(0xffb070);
    sun.intensity = 3.2;
    sunDir = new THREE.Vector3(-1, 0.34, 0.6);
  } else {
    hemi.color.set(0x6f86b8);
    hemi.groundColor.set(0x23252f);
    hemi.intensity = 0.55;
    sun.color.set(0xa9bcff);
    sun.intensity = 0.5;
    sunDir = new THREE.Vector3(0.5, 1, 0.4);
  }
  sunDir.normalize();
  sun.position.set(cx + sunDir.x * span * 3, sunDir.y * span * 3, cz + sunDir.z * span * 3);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sh = span * 0.95 + 8;
  const cam = sun.shadow.camera;
  cam.left = -sh;
  cam.right = sh;
  cam.top = sh;
  cam.bottom = -sh;
  cam.near = 1;
  cam.far = span * 8 + 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  // ---- まわりの地面・道路・敷地 ----
  const far = span * 5 + 60;
  const flatPlane = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const geo = new THREE.PlaneGeometry(w, d);
    const tile = m.userData.tile as number | undefined;
    if (tile) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
    }
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  // まわりの土地は主張しない無地にし、遠くは空の色に溶かす
  flatPlane(far * 2, far * 2, flat(SKY[opts.time].ground, { roughness: 1 }), cx, -0.03, cz);
  scene.fog = new THREE.Fog(SKY[opts.time].horizon, span * 3.5, span * 5 + 60);
  flatPlane(far * 2, road, mat('tex:asphalt', () => textured('asphalt', { roughness: 0.95 })), cx, -0.01, road / 2);
  // 道路ぎわの側溝と、路側の白線
  flatPlane(far * 2, 0.45, mat('gutter', () => textured('concrete', { color: 0xdedede, roughness: 0.9 })), cx, 0.0, 0.225);
  flatPlane(far * 2, 0.12, flat(0xe9e9e4, { roughness: 0.8 }), cx, 0.002, 0.75);
  flatPlane(far * 2, 0.12, flat(0xe9e9e4, { roughness: 0.8 }), cx, 0.002, road - 0.4);
  flatPlane(W, D, mat('tex:soil', () => textured('soil', { roughness: 1 })), cx, 0.0, cz);

  // ---- 部材 ----
  let floorIndex = 0;
  let carIndex = 0;
  for (const it of plan.items) {
    if (!hasKind(it.kind)) continue;
    const c = catalogOf(it.kind);
    if (FLOOR_KINDS.has(it.kind)) {
      const { m, t } = floorMaterial(ctx, it);
      // 重なった面がちらつかないよう、後に置いたものほどわずかに高くする
      const lift = 0.004 + floorIndex * 0.0015;
      floorIndex++;
      box(root, it.w, t, it.h, m, it.x + it.w / 2, lift + t / 2, -(it.y + it.h / 2), { cast: false });
      continue;
    }
    switch (it.kind) {
      case 'house':
        buildHouse(ctx, it);
        break;
      case 'car':
        if (opts.showCars) buildCar(ctx, it, carIndex++);
        break;
      case 'steps':
        buildSteps(ctx, it);
        break;
      case 'flowerbed':
        buildFlowerbed(ctx, it);
        break;
      case 'carport':
        buildCarport(ctx, it, false);
        break;
      case 'cycleport':
        buildCarport(ctx, it, true);
        break;
      case 'deck':
        buildDeck(ctx, it);
        break;
      case 'shed':
        buildShed(ctx, it);
        break;
      case 'block': {
        const { g, len } = lineGroup(ctx, it);
        if (len >= 0.05) blockWall(ctx, g, len, Math.max(1, Number(it.props.rows ?? 3)) * BLOCK_ROW_HEIGHT, it.variant);
        break;
      }
      case 'fence':
        buildFence(ctx, it);
        break;
      case 'curb': {
        const { g, len } = lineGroup(ctx, it);
        if (len >= 0.05) {
          const m = it.variant === 'brick' ? mat('tex:brick', () => textured('brick', { roughness: 0.9 })) : flat(it.variant === 'pincoro' ? 0x8f8a84 : 0xbdbdb8, { roughness: 0.9 });
          box(g, len, 0.1, 0.1, m, len / 2, 0.05, 0);
        }
        break;
      }
      case 'gate':
        buildGate(ctx, it);
        break;
      case 'gatepost':
        buildGatepost(ctx, it);
        break;
      case 'tree':
        buildTree(ctx, it);
        break;
      case 'shrub':
        buildShrub(ctx, it);
        break;
      case 'faucet':
        buildFaucet(ctx, it);
        break;
      case 'light':
        buildLight(ctx, it);
        break;
      default:
        if (c.shape === 'rect') box(root, it.w, 0.05, it.h, flat(0xcccccc), it.x + it.w / 2, 0.03, -(it.y + it.h / 2));
    }
  }

  // 夕方・夜は照明をともす（数が多いと重いので上限を設ける）
  const lampPower = opts.time === 'night' ? 9 : 4;
  for (const p of ctx.lamps.slice(0, 10)) {
    const l = new THREE.PointLight(0xffc98a, lampPower, 7, 1.8);
    l.position.copy(p);
    scene.add(l);
  }

  const dispose = () => {
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of materials.values()) {
      const own = m.userData.ownTexture as THREE.Texture | undefined;
      own?.dispose();
      m.dispose();
    }
    for (const t of textures) t.dispose();
    sun.shadow.map?.dispose();
  };

  return { scene, dispose };
}
