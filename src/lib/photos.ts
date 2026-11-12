import { useEffect, useState } from 'react';

// 写真は容量が大きいので IndexedDB に保存する（案件データ本体は localStorage）。
// IndexedDB が使えない環境ではメモリに持ち、ページを閉じるまで有効。

const DB_NAME = 'gaikou-photos';
const STORE = 'photos';
const memory = new Map<string, Blob>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

const listeners = new Set<(id: string) => void>();

export async function savePhoto(id: string, blob: Blob): Promise<void> {
  memory.set(id, blob);
  await run('readwrite', (s) => s.put(blob, id));
  listeners.forEach((l) => l(id));
}

export async function loadPhoto(id: string): Promise<Blob | undefined> {
  const m = memory.get(id);
  if (m) return m;
  const b = await run<Blob>('readonly', (s) => s.get(id));
  if (b instanceof Blob) {
    memory.set(id, b);
    return b;
  }
  return undefined;
}

export async function deletePhoto(id: string): Promise<void> {
  memory.delete(id);
  await run('readwrite', (s) => s.delete(id));
  listeners.forEach((l) => l(id));
}

/** 写真の表示用 URL。読み込み中・未保存なら undefined */
export function usePhotoUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!id) return;
    const l = (changed: string) => {
      if (changed === id) setVersion((v) => v + 1);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [id]);
  useEffect(() => {
    if (!id) {
      setUrl(undefined);
      return;
    }
    let alive = true;
    let made: string | undefined;
    loadPhoto(id).then((b) => {
      if (!alive) return;
      if (b) {
        made = URL.createObjectURL(b);
        setUrl(made);
      } else {
        setUrl(undefined);
      }
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, version]);
  return url;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });
}

/** スマホの写真は大きいので、長辺 1600px の JPEG に縮めて保存する */
export async function resizeImage(file: Blob, max = 1600, quality = 0.82): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality));
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('invalid data url');
  const mime = m[1] || 'application/octet-stream';
  if (m[2]) {
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(m[3])], { type: mime });
}

/** ブラウザにファイルとして保存させる */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
