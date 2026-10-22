// 効果音（音声ファイルを使わず、その場で音を作る）
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.12) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  correct() {
    tone(784, 0, 0.12, "triangle");
    tone(1175, 0.09, 0.22, "triangle");
  },
  wrong() {
    tone(196, 0, 0.16, "square", 0.05);
    tone(165, 0.1, 0.2, "square", 0.05);
  },
  combo(n: number) {
    const base = 660 + Math.min(n, 8) * 40;
    [0, 0.07, 0.14].forEach((t, i) => tone(base * [1, 1.25, 1.5][i], t, 0.14, "triangle", 0.1));
  },
  clear() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.25, "triangle", 0.11));
  },
  level() {
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.3, "sawtooth", 0.05));
  },
  tap() {
    tone(1200, 0, 0.04, "sine", 0.05);
  },
};
