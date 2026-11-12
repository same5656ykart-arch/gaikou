import type { ReactNode } from 'react';

// 線画アイコン（24x24）。外部のアイコンフォントに頼らず SVG を直書きする。

const PATHS: Record<string, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />,
  copy: (
    <>
      <rect x="8" y="8" width="11.5" height="11.5" rx="2" />
      <path d="M16 8V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8.5A1.5 1.5 0 0 0 6 16h2" />
    </>
  ),
  undo: <path d="M8 6L4 10l4 4M4 10h10a5.5 5.5 0 0 1 0 11h-3" />,
  redo: <path d="M16 6l4 4-4 4M20 10H10a5.5 5.5 0 0 0 0 11h3" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  survey: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.5h6v1M8.5 10l1.5 1.5 2.5-3M8.5 15.5l1.5 1.5 2.5-3M14.5 10.5h2M14.5 16h2" />
    </>
  ),
  plan: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 12h8M11.5 4.5v9.5M11.5 17v2.5M15 12h5.5" />
    </>
  ),
  cube: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  yen: <path d="M6.5 4l5.5 8 5.5-8M12 12v8.5M7 12.5h10M7 16h10" />,
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V4h10v5M7 17H5.5A1.5 1.5 0 0 1 4 15.5v-5A1.5 1.5 0 0 1 5.5 9h13a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" />
      <rect x="7" y="14" width="10" height="6" />
    </>
  ),
  download: <path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14" />,
  upload: <path d="M12 16V5M7.5 9L12 4.5 16.5 9M5 20h14" />,
  rotate: <path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7M19.5 4v4.5H15" />,
  up: <path d="M12 19V6M6.5 11L12 5.5 17.5 11" />,
  down: <path d="M12 5v13M6.5 13l5.5 5.5 5.5-5.5" />,
  alert: (
    <>
      <path d="M12 4l9 15.5H3L12 4z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.6v.3" />
    </>
  ),
  home: <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5.5h4V20" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" />
    </>
  ),
  magic: <path d="M5 19L16 8M14 6l4 4M18.5 3v3M17 4.5h3M7 4v2.5M5.75 5.25h2.5M19 13v2.5M17.75 14.25h2.5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  car: (
    <>
      <path d="M4 16.5v-4l2-5h12l2 5v4M4 12.5h16M4 16.5h16" />
      <circle cx="7.5" cy="16.5" r="1.6" />
      <circle cx="16.5" cy="16.5" r="1.6" />
    </>
  ),
  list: <path d="M8.5 7h11M8.5 12h11M8.5 17h11M4.5 7h.5M4.5 12h.5M4.5 17h.5" />,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  );
}
