import { blankEq, firstDiffLine, normCode, normText, textEq } from "./normalize.ts";
import type { Problem, Runner } from "./types.ts";

export interface Verdict {
  ok: boolean;
  /** 出力を当てる問題で、何行目がちがうか */
  wrongLine?: number | null;
  /** 文字の比較だけでは決められず、Python で実行して確かめる必要がある */
  needsRun?: boolean;
  /** 実行したときのようす（エラーなど） */
  note?: string;
}

/** Python を使わずにできる判定。すぐに結果が出る。 */
export function judgeText(p: Problem, input: string): Verdict {
  const raw = input;
  if (!raw.trim()) return { ok: false };
  switch (p.type) {
    case "output":
    case "value": {
      if (p.answers.some((a) => textEq(raw, a))) return { ok: true };
      if (p.type === "output" && !p.err) {
        return { ok: false, wrongLine: firstDiffLine(raw, p.answers[0]) };
      }
      return { ok: false };
    }
    case "blank":
      return { ok: p.answers.some((a) => blankEq(raw, a)) };
    case "bug": {
      const digits = raw.normalize("NFKC").replace(/[^0-9]/g, "");
      return { ok: digits !== "" && p.answers.includes(String(Number(digits))) };
    }
    case "write":
    case "fill": {
      const n = normCode(raw);
      if (p.answers.some((a) => normCode(a) === n)) return { ok: true };
      return { ok: false, needsRun: true };
    }
  }
}

function errNote(e: { type: string } | null, timeout?: boolean): string | undefined {
  if (timeout) return "時間がかかりすぎたので止めました（ずっと繰り返していませんか？）";
  if (e) return `${e.type} が出ました`;
  return undefined;
}

/** コードを書く問題・虫食いコードを、実際に実行して判定する。 */
export async function judgeRun(p: Problem, input: string, run: Runner): Promise<Verdict> {
  if (p.type === "write") {
    for (const c of p.checks ?? []) {
      const src = [c.setup, input, c.probe].filter((x) => x).join("\n");
      const r = await run(src, p.stdin);
      if (r.err || r.timeout) return { ok: false, note: errNote(r.err, r.timeout) };
      if (normText(r.out) !== normText(c.expect)) return { ok: false, note: "表示されるものがちがいます" };
    }
    return { ok: true };
  }
  if (p.type === "fill") {
    const src = p.code.replace("___", input.replace(/\n+$/, ""));
    const r = await run(src, p.stdin);
    if (r.err || r.timeout) return { ok: false, note: errNote(r.err, r.timeout) };
    if (!textEq(r.out, p.expected ?? "")) return { ok: false, note: "表示されるものがちがいます" };
    return { ok: true };
  }
  return judgeText(p, input);
}
