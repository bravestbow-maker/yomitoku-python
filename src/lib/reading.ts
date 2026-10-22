// インデントに合わせて「ここから」「ここまで」をつける。tools/yomi.py の compose と同じ規則。

export interface ComposedLine {
  pre: number; // 「ここから」の数
  body: string;
  post: number; // 「ここまで」の数
}

const lvl = (s: string) => Math.floor((s.length - s.trimStart().length) / 4);

export function composeParts(codeLines: string[], readings: string[]): ComposedLine[] {
  const idx = codeLines.map((s, i) => (s.trim() ? i : -1)).filter((i) => i >= 0);
  const out: ComposedLine[] = codeLines.map((_, i) => ({ pre: 0, body: readings[i] ?? "", post: 0 }));
  idx.forEach((i, k) => {
    const cur = lvl(codeLines[i]);
    const prev = k > 0 ? lvl(codeLines[idx[k - 1]]) : 0;
    const next = k + 1 < idx.length ? lvl(codeLines[idx[k + 1]]) : 0;
    out[i].pre = Math.max(0, cur - prev);
    out[i].post = Math.max(0, cur - next);
  });
  return out;
}

export function lineText(p: ComposedLine): string {
  if (!p.body) return "";
  return "ここから、".repeat(p.pre) + p.body + "、ここまで".repeat(p.post);
}

export function compose(codeLines: string[], readings: string[]): string[] {
  return composeParts(codeLines, readings).map(lineText);
}
