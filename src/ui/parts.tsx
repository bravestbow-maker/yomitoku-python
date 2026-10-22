import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

// ---------- アイコン ----------
const PATHS: Record<string, string> = {
  flame: "M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5zM12 22a7 7 0 0 1-7-7h2a5 5 0 0 0 10 0h2a7 7 0 0 1-7 7z",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
  book: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A1.5 1.5 0 0 0 5 19.5 1.5 1.5 0 0 0 6.5 21H20v1H6.5A2.5 2.5 0 0 1 4 19.5v-15zM8 6v2h8V6H8z",
  medal: "M7 2h4l1 4 1-4h4l-3 7a6 6 0 1 1-4 0L7 2zm5 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 1.5 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3 1-2z",
  gear: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.9 5.3-2.1-.3a7 7 0 0 1-.6 1.5l1.3 1.7-1.8 1.8-1.7-1.3a7 7 0 0 1-1.5.6l-.3 2.1h-2.4l-.3-2.1a7 7 0 0 1-1.5-.6L6.3 18 4.5 16.2l1.3-1.7a7 7 0 0 1-.6-1.5l-2.1-.3v-2.4l2.1-.3a7 7 0 0 1 .6-1.5L4.5 6.8 6.3 5l1.7 1.3a7 7 0 0 1 1.5-.6l.3-2.1h2.4l.3 2.1a7 7 0 0 1 1.5.6L15.7 5l1.8 1.8-1.3 1.7a7 7 0 0 1 .6 1.5l2.1.3v2.4z",
  repeat: "M17 1l4 4-4 4V6H7a3 3 0 0 0-3 3v2H2V9a5 5 0 0 1 5-5h10V1zM7 23l-4-4 4-4v3h10a3 3 0 0 0 3-3v-2h2v2a5 5 0 0 1-5 5H7v3z",
  trophy: "M6 2h12v2h3v3a4 4 0 0 1-4 4h-.3A6 6 0 0 1 13 14.9V18h4v4H7v-4h4v-3.1A6 6 0 0 1 7.3 11H7a4 4 0 0 1-4-4V4h3V2zm0 4H5v1a2 2 0 0 0 1 1.7V6zm12 0v2.7A2 2 0 0 0 19 7V6h-1z",
  lock: "M7 10V7a5 5 0 0 1 10 0v3h2v12H5V10h2zm2 0h6V7a3 3 0 0 0-6 0v3z",
  check: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z",
  play: "M8 5v14l11-7L8 5z",
  stop: "M6 6h12v12H6z",
  close: "M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3 1.4 1.4z",
  speaker: "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z",
  mute: "M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4L15.2 10.6 12.5 7.9l-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4L16.6 12z",
  eye: "M12 5c5 0 9 4 10 7-1 3-5 7-10 7S3 15 2 12c1-3 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  mic: "M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1a7 7 0 0 0 6-6.9h-2z",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5 1 3h-2l1-3zm0 20-1-3h2l-1 3zM2 12l3-1v2l-3-1zm20 0-3 1v-2l3 1zM4.9 4.9l2.8 1.4-1.4 1.4-1.4-2.8zm14.2 14.2-2.8-1.4 1.4-1.4 1.4 2.8zM4.9 19.1l1.4-2.8 1.4 1.4-2.8 1.4zM19.1 4.9l-1.4 2.8-1.4-1.4 2.8-1.4z",
  moon: "M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5z",
  chevron: "M8.6 16.6 13.2 12 8.6 7.4 10 6l6 6-6 6-1.4-1.4z",
  back: "M15.4 7.4 10.8 12l4.6 4.6L14 18l-6-6 6-6 1.4 1.4z",
  flag: "M5 3h2v18H5V3zm3 1h11l-2 4 2 4H8V4z",
  run: "M8 5v14l11-7L8 5zM3 5h2v14H3z",
  undo: "M12.5 8c-2.6 0-5 1-6.9 2.6L2 7v9h9l-3.6-3.6A8 8 0 0 1 20.1 16l2.4-.8A10.5 10.5 0 0 0 12.5 8z",
  skip: "M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z",
  level: "M12 2 15 8.5l7 .9-5.1 4.9 1.3 7L12 18l-6.2 3.3 1.3-7L2 9.4l7-.9L12 2z",
  chapter: "M5 3h14v18l-7-4-7 4V3z",
  sparkle: "M12 2l2 7 7 3-7 3-2 7-2-7-7-3 7-3 2-7z",
};

export function Icon({ name, size = 20, class: cls = "" }: { name: string; size?: number; class?: string }) {
  return (
    <svg class={`icon ${cls}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name] ?? ""} fill="currentColor" />
    </svg>
  );
}

// ---------- プログレスバー ----------
export function ProgressBar({ value, label, tone = "primary" }: { value: number; label?: string; tone?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div class={`pbar tone-${tone}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div class="pbar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------- 円形メーター ----------
export function Ring({ value, size = 64, stroke = 7, children, tone = "primary", label }: {
  value: number; size?: number; stroke?: number; children?: ComponentChildren; tone?: string; label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(t);
  }, [value]);
  return (
    <div class={`ring tone-${tone}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle class="ring-track" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke} fill="none" />
        <circle class="ring-fill" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke} fill="none"
          stroke-dasharray={c} stroke-dashoffset={c * (1 - shown)} stroke-linecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div class="ring-center">{children}</div>
    </div>
  );
}

// ---------- 数字のカウントアップ ----------
export function CountUp({ value, duration = 700, format = (n: number) => String(n) }: {
  value: number; duration?: number; format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (b - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = b;
    };
  }, [value]);
  return <span class="countup">{format(shown)}</span>;
}

// ---------- キネティック・タイポグラフィ ----------
export function Kinetic({ text, as = "h2", class: cls = "", delay = 0 }: { text: string; as?: string; class?: string; delay?: number }) {
  const Tag = as as unknown as (p: Record<string, unknown>) => JSX.Element;
  return (
    <Tag class={`kinetic ${cls}`} aria-label={text}>
      {[...text].map((ch, i) => (
        <span aria-hidden="true" style={{ animationDelay: `${delay + i * 35}ms` }}>{ch === " " ? " " : ch}</span>
      ))}
    </Tag>
  );
}

// ---------- バッジ（アイコン右上の数・NEW） ----------
export function Dot({ count, isNew }: { count?: number; isNew?: boolean }) {
  if (isNew) return <span class="dot dot-new">NEW</span>;
  if (!count) return null;
  return <span class="dot">{count > 99 ? "99+" : count}</span>;
}

// ---------- アコーディオン ----------
export function Accordion({ title, children, open: initial = false }: { title: string; children: ComponentChildren; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div class={`acc ${open ? "open" : ""}`}>
      <button class="acc-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <Icon name="chevron" size={18} class="acc-chev" />
      </button>
      <div class="acc-body" hidden={!open}>
        <div class="acc-inner">{children}</div>
      </div>
    </div>
  );
}

// ---------- ボトムシート ----------
export function BottomSheet({ open, onClose, children, label }: {
  open: boolean; onClose: () => void; children: ComponentChildren; label: string;
}) {
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setDrag(0);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  const down = (e: PointerEvent) => {
    startY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (startY.current !== null) setDrag(Math.max(0, e.clientY - startY.current));
  };
  const up = () => {
    if (startY.current === null) return;
    startY.current = null;
    if (drag > 90) onClose();
    else setDrag(0);
  };
  return (
    <div class="sheet-wrap" onClick={onClose}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={panel}
        style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? "none" : undefined }}
        onClick={(e) => e.stopPropagation()}>
        <div class="sheet-grip" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          aria-label="下にスワイプして閉じる">
          <span />
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- トースト通知 ----------
interface ToastItem { id: number; text: string; tone: string; action?: { label: string; run: () => void } }
let toasts: ToastItem[] = [];
let toastSeq = 0;
const toastSubs = new Set<() => void>();
export function toast(text: string, opts: { tone?: string; action?: { label: string; run: () => void }; ms?: number } = {}) {
  const id = ++toastSeq;
  toasts = [...toasts.slice(-2), { id, text, tone: opts.tone ?? "info", action: opts.action }];
  toastSubs.forEach((f) => f());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    toastSubs.forEach((f) => f());
  }, opts.ms ?? (opts.action ? 5000 : 2600));
}
export function Toaster() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    toastSubs.add(f);
    return () => {
      toastSubs.delete(f);
    };
  }, []);
  return (
    <div class="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div class={`toast tone-${t.tone}`} key={t.id}>
          <span>{t.text}</span>
          {t.action && (
            <button class="toast-act" onClick={() => {
              t.action!.run();
              toasts = toasts.filter((x) => x.id !== t.id);
              toastSubs.forEach((f) => f());
            }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- 確認ダイアログ ----------
interface ConfirmReq { title: string; body: string; ok: string; danger?: boolean; resolve: (v: boolean) => void }
let confirmReq: ConfirmReq | null = null;
const confirmSubs = new Set<() => void>();
export function confirmDialog(title: string, body: string, ok = "OK", danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq = { title, body, ok, danger, resolve };
    confirmSubs.forEach((f) => f());
  });
}
export function ConfirmHost() {
  const [, set] = useState(0);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    confirmSubs.add(f);
    return () => {
      confirmSubs.delete(f);
    };
  }, []);
  useEffect(() => {
    if (confirmReq) okRef.current?.focus();
  });
  if (!confirmReq) return null;
  const done = (v: boolean) => {
    const r = confirmReq!;
    confirmReq = null;
    confirmSubs.forEach((f) => f());
    r.resolve(v);
  };
  return (
    <div class="modal-wrap" onClick={() => done(false)} onKeyDown={(e) => e.key === "Escape" && done(false)}>
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="cf-title">{confirmReq.title}</h3>
        <p>{confirmReq.body}</p>
        <div class="modal-actions">
          <button class="btn ghost" onClick={() => done(false)}>やめる</button>
          <button ref={okRef} class={`btn ${confirmReq.danger ? "danger" : "primary"}`} onClick={() => done(true)}>{confirmReq.ok}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 紙吹雪 ----------
let confettiFire: ((n?: number) => void) | null = null;
export function confetti(n = 140) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  confettiFire?.(n);
}
export function ConfettiHost() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    type P = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; life: number };
    let parts: P[] = [];
    let raf = 0;
    const colors = ["#4F6BFF", "#18B47B", "#FFB020", "#FF6B6B", "#9B6BFF", "#20C4E8"];
    const resize = () => {
      cv.width = innerWidth * devicePixelRatio;
      cv.height = innerHeight * devicePixelRatio;
    };
    resize();
    addEventListener("resize", resize);
    const tick = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const d = devicePixelRatio;
      parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
      for (const p of parts) {
        p.vy += 0.18;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        p.life--;
        ctx.save();
        ctx.translate(p.x * d, p.y * d);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect((-p.w / 2) * d, (-p.h / 2) * d, p.w * d, p.h * d * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (parts.length) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    };
    confettiFire = (n = 140) => {
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        parts.push({
          x: innerWidth / 2 + side * innerWidth * 0.3 * Math.random(),
          y: innerHeight * 0.35,
          vx: (Math.random() - 0.5) * 14,
          vy: -6 - Math.random() * 9,
          r: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.3,
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          c: colors[i % colors.length],
          life: 200,
        });
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    return () => {
      removeEventListener("resize", resize);
      confettiFire = null;
    };
  }, []);
  return <canvas ref={ref} class="confetti" aria-hidden="true" />;
}

// ---------- キャラクター（オリジナル） ----------
export type Mood = "idle" | "happy" | "sad" | "combo" | "think";
export function Mascot({ mood = "idle", size = 72 }: { mood?: Mood; size?: number }) {
  const eyes: Record<Mood, JSX.Element> = {
    idle: (<g class="m-blink"><ellipse cx="38" cy="44" rx="4" ry="5.5" /><ellipse cx="62" cy="44" rx="4" ry="5.5" /></g>),
    think: (<g><ellipse cx="38" cy="42" rx="4" ry="5.5" /><ellipse cx="62" cy="42" rx="4" ry="5.5" /></g>),
    happy: (<g fill="none" stroke-width="4.5" stroke-linecap="round"><path d="M32 46q6-8 12 0" /><path d="M56 46q6-8 12 0" /></g>),
    sad: (<g fill="none" stroke-width="4" stroke-linecap="round"><path d="M33 42l9 4" /><path d="M67 42l-9 4" /></g>),
    combo: (<g><path d="M38 36l2.5 5.5 6 .8-4.4 4 1.1 6-5.2-3-5.2 3 1.1-6-4.4-4 6-.8z" /><path d="M62 36l2.5 5.5 6 .8-4.4 4 1.1 6-5.2-3-5.2 3 1.1-6-4.4-4 6-.8z" /></g>),
  };
  const mouth: Record<Mood, JSX.Element> = {
    idle: <path d="M44 58q6 5 12 0" fill="none" stroke-width="4" stroke-linecap="round" />,
    think: <path d="M45 60h10" fill="none" stroke-width="4" stroke-linecap="round" />,
    happy: <path d="M40 56q10 14 20 0z" stroke-width="2" stroke-linejoin="round" />,
    sad: <path d="M43 63q7-6 14 0" fill="none" stroke-width="4" stroke-linecap="round" />,
    combo: <path d="M38 55q12 18 24 0z" stroke-width="2" stroke-linejoin="round" />,
  };
  return (
    <svg class={`mascot mood-${mood}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path class="m-body" d="M50 10c22 0 38 14 38 34 0 19-15 33-36 33h-6l-14 13 2-15C20 69 12 58 12 44 12 24 28 10 50 10z" />
      <path class="m-cheek" d="M26 55a5 3.5 0 1 0 10 0a5 3.5 0 1 0-10 0M64 55a5 3.5 0 1 0 10 0a5 3.5 0 1 0-10 0" />
      <g class="m-face">{eyes[mood]}{mouth[mood]}</g>
      {mood === "combo" && <path class="m-spark" d="M86 14l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />}
    </svg>
  );
}
