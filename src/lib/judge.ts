import { blankEq, firstDiffLine, normCode, normText, textEq } from "./normalize.ts";
import type { Problem, Runner } from "./types.ts";

export interface Verdict {
  ok: boolean;
  /** 出力を当てる問題で、何行目がちがうか */
  wrongLine?: number | null;
  /** 文字の比較だけでは決められず、Python で実行して確かめる必要がある */
  needsRun?: boolean;
  /** 実行したときのようす（エラーなど）。正解のときは、正しい書き方のひとこと */
  note?: string;
  /** 惜しい：意味は合っているが表記がちがう。間違いの回数には数えない */
  near?: boolean;
}

const ERROR_NAMES = [
  "ZeroDivisionError", "NameError", "TypeError", "IndexError", "ValueError", "KeyError", "AttributeError",
  "SyntaxError", "IndentationError", "EOFError", "ImportError", "ModuleNotFoundError", "RecursionError",
];

/** 2つの文字列の「ちがう文字の数」（レーベンシュタイン距離） */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** エラー名：大文字・小文字や1〜2文字のつづりちがいは正解。ただし別のエラー名にもっと近いときは不正解 */
function errorNameVerdict(input: string, answer: string): Verdict | null {
  const t = input.normalize("NFKC").trim().replace(/[:：。].*$/, "").trim();
  if (t === answer) return { ok: true };
  const lower = t.toLowerCase();
  const d = editDistance(lower, answer.toLowerCase());
  if (d > 2) return null;
  const others = ERROR_NAMES.filter((n) => n !== answer).map((n) => editDistance(lower, n.toLowerCase()));
  if (others.some((o) => o <= d)) return null;
  return { ok: true, note: `正しいつづりは ${answer} です` };
}

/** True / False / None の大文字・小文字ちがい */
function caseVerdict(input: string, answer: string): Verdict | null {
  const fix = (s: string) => s.replace(/\b(true|false|none)\b/gi, (m) => m[0].toUpperCase() + m.slice(1).toLowerCase());
  if (fix(input) === input) return null;
  if (!textEq(fix(input), answer)) return null;
  const words = [...new Set((answer.match(/\b(True|False|None)\b/g) ?? []))].join("・");
  return { ok: true, note: `Python では ${words} のように、最初だけ大文字で書きます` };
}

/** <class 'int'> を int と答えた */
function typeVerdict(input: string, answer: string): Verdict | null {
  const m = answer.match(/^<class '(\w+)'>$/);
  if (!m) return null;
  const t = input.normalize("NFKC").trim().replace(/^class\s+/i, "").replace(/['"<>]/g, "").trim();
  if (t.toLowerCase() !== m[1].toLowerCase()) return null;
  return { ok: true, note: `実際に表示されるのは ${answer} です` };
}

/** 3.0 を 3 と答えたような、小数の .0 だけのちがい */
function floatNear(input: string, answer: string): Verdict | null {
  if (!/\d\.0\b/.test(answer)) return null;
  if (!textEq(input, answer.replace(/(\d)\.0\b/g, "$1"))) return null;
  return { ok: false, near: true, note: "惜しい！ 数は合っています。小数として表示されるので、3.0 のように .0 がつきます" };
}

/** Python を使わずにできる判定。すぐに結果が出る。 */
export function judgeText(p: Problem, input: string): Verdict {
  const raw = input;
  if (!raw.trim()) return { ok: false };
  switch (p.type) {
    case "output":
    case "value": {
      if (p.answers.some((a) => textEq(raw, a))) return { ok: true };
      if (p.type === "output" && p.err) return errorNameVerdict(raw, p.answers[0]) ?? { ok: false };
      for (const a of p.answers) {
        const v = caseVerdict(raw, a) ?? typeVerdict(raw, a) ?? floatNear(raw, a);
        if (v) return v;
      }
      if (p.type === "output") {
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
