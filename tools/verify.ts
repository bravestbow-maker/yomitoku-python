// すべての問題について、登録した正解と、コードを Python（Pyodide）で実際に実行した結果が一致するかを確かめる。
// 使い方: npm run verify
import { readFileSync } from "node:fs";
import { loadPyodide } from "pyodide";
import { judgeRun, judgeText } from "../src/lib/judge.ts";
import { normText, textEq } from "../src/lib/normalize.ts";
import { compose } from "../src/lib/reading.ts";
import type { Course, Problem, RunResult } from "../src/lib/types.ts";

const course: Course = JSON.parse(readFileSync(new URL("../src/data/course.json", import.meta.url), "utf8"));
const harness = readFileSync(new URL("../src/py/harness.py", import.meta.url), "utf8");

const py = await loadPyodide();
py.runPython(harness);
const runJson = py.globals.get("run_json");
const valueJson = py.globals.get("value_json");

async function run(src: string, stdin: string[] = []): Promise<RunResult> {
  return JSON.parse(runJson(src, JSON.stringify(stdin)));
}
function value(src: string, varName: string, stdin: string[] = []) {
  return JSON.parse(valueJson(src, varName, JSON.stringify(stdin)));
}

const problems: Problem[] = [];
for (const c of course.chapters) {
  for (const l of c.lessons) problems.push(...l.problems);
  problems.push(...c.check);
  if (c.diag) problems.push(c.diag);
}

const fails: string[] = [];
const fail = (p: Problem, msg: string) => fails.push(`${p.id} [${p.type}] ${msg}`);
const head = (code: string, n?: number) => (n ? code.split("\n").slice(0, n).join("\n") : code);

const ids = new Set<string>();
for (const p of problems) {
  if (ids.has(p.id)) fail(p, "id が重複");
  ids.add(p.id);
  const shown = (p.solved ?? p.code).split("\n");
  const rd = p.solvedReading ?? p.reading;
  if (rd.length !== shown.length) fail(p, "読み下しの行数がコードと合わない");
  shown.forEach((line, i) => {
    if (line.trim() && !rd[i]) fail(p, `${i + 1}行目に読み下しがない`);
  });
  if (!p.answers.length) fail(p, "正解が登録されていない");
  // 登録した正解は、アプリの判定でも正解になること
  for (const a of p.answers) {
    const v = judgeText(p, a);
    if (!v.ok) fail(p, `登録した正解 ${JSON.stringify(a)} が判定で正解にならない`);
  }

  switch (p.type) {
    case "output": {
      const r = await run(head(p.code, p.until), p.stdin);
      let out = r.out;
      if (p.outFrom) {
        const before = await run(head(p.code, p.outFrom - 1), p.stdin);
        if (!out.startsWith(before.out)) fail(p, "outFrom の前の表示がそろわない");
        out = out.slice(before.out.length);
      }
      if (p.err) {
        if (!r.err) fail(p, "エラーが出るはずが出ない");
        else if (r.err.type !== p.answers[0]) fail(p, `エラーの種類 ${r.err.type} ≠ 正解 ${p.answers[0]}`);
      } else {
        if (r.err && !p.allowError) fail(p, `実行するとエラー: ${r.err.type} ${r.err.msg}`);
        if (!p.answers.some((a) => textEq(out, a))) fail(p, `実行結果 ${JSON.stringify(out)} ≠ 正解 ${JSON.stringify(p.answers[0])}`);
        if (normText(out) !== normText(p.answers[0])) fail(p, `実行結果と正解の表記がちがう ${JSON.stringify(out)}`);
      }
      break;
    }
    case "value": {
      const target = p.expr ?? p.var!;
      const src = head(p.code, p.after ?? p.until) + `\n__value__ = (${target})`;
      const r = value(src, "__value__", p.stdin);
      if (r.err) fail(p, `実行するとエラー: ${r.err.type} ${r.err.msg}`);
      else if (normText(r.value) !== normText(p.answers[0])) fail(p, `実際の値 ${r.value} ≠ 正解 ${p.answers[0]}`);
      break;
    }
    case "blank": {
      const lines = p.code.split("\n");
      const full = compose(lines, p.reading)[p.line! - 1];
      if (p.template!.replace("［　］", p.answers[0]) !== full) fail(p, `穴埋めを戻しても読み下しにならない: ${full}`);
      const r = await run(p.code, p.stdin);
      if (r.err) fail(p, `コードがエラー: ${r.err.type}`);
      break;
    }
    case "write": {
      for (const c of p.checks ?? []) {
        const r = await run([c.setup, p.answers[0], c.probe].filter((x) => x).join("\n"));
        if (r.err) fail(p, `答えのコードがエラー: ${r.err.type}`);
        if (r.out !== c.expect) fail(p, `答えの実行結果 ${JSON.stringify(r.out)} ≠ 登録 ${JSON.stringify(c.expect)}`);
        if (!c.expect.trim()) fail(p, "何も表示されないので、書き方のちがいを確かめられない");
      }
      for (const a of p.answers) {
        const v = await judgeRun(p, a, run);
        if (!v.ok) fail(p, `別解 ${a} が実行判定で正解にならない`);
      }
      const v = await judgeRun(p, "pass", run);
      if (v.ok) fail(p, "pass でも正解になってしまう");
      break;
    }
    case "fill": {
      for (const a of p.answers) {
        const r = await run(p.code.replace("___", a), p.stdin);
        if (r.err) fail(p, `${a} を入れるとエラー: ${r.err.type}`);
        else if (!textEq(r.out, p.expected!)) fail(p, `${a} を入れた結果 ${JSON.stringify(r.out)} ≠ 期待 ${JSON.stringify(p.expected)}`);
        if (normText(r.out) !== normText(p.expected!)) fail(p, `期待する出力の表記がちがう ${JSON.stringify(r.out)}`);
      }
      break;
    }
    case "bug": {
      const bad = await run(p.code, p.stdin);
      if (!bad.err && textEq(bad.out, p.expected!)) fail(p, "まちがいのはずのコードで、期待どおりに動いてしまう");
      const r = await run(p.solved!, p.stdin);
      if (r.err) fail(p, `直したコードがエラー: ${r.err.type}`);
      else if (normText(r.out) !== normText(p.expected!)) fail(p, `直したコードの結果 ${JSON.stringify(r.out)} ≠ 期待 ${JSON.stringify(p.expected)}`);
      const diff = p.code.split("\n").filter((l, i) => l !== p.solved!.split("\n")[i]);
      if (diff.length !== 1) fail(p, "直す行が1行ではない");
      break;
    }
  }
}

for (const c of course.chapters) {
  for (const pt of c.patterns) {
    const r = await run(`def _check():\n    pass\ncompile(${JSON.stringify(pt.code)}, "<p>", "exec")`);
    if (r.err) fails.push(`${c.id} 図鑑 ${pt.code}: 書き方がまちがっている`);
  }
}

if (fails.length) {
  console.error(fails.join("\n"));
  console.error(`\n✗ ${fails.length} 件の問題があります`);
  process.exit(1);
}
console.log(`✓ ${problems.length} 問すべて、正解と実行結果が一致しました`);
