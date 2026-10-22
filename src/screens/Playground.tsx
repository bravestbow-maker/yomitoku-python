import { useEffect, useState } from "preact/hooks";
import { onPyStatus, pyStatus, runPython, type PyStatus } from "../lib/python.ts";
import type { RunResult } from "../lib/types.ts";
import { Icon } from "../ui/parts.tsx";

/** 「動かしてみる」：コードを書きかえて実行できる。問題の正解には影響しない。 */
export function Playground({ initial, stdin = [] }: { initial: string; stdin?: string[] }) {
  const [src, setSrc] = useState(initial);
  const [res, setRes] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputs, setInputs] = useState(stdin.join("\n"));
  const [py, setPy] = useState<PyStatus>(pyStatus());
  useEffect(() => onPyStatus(setPy), []);
  const needsInput = /input\(/.test(src);

  async function run() {
    setBusy(true);
    try {
      setRes(await runPython(src, inputs ? inputs.split("\n") : []));
    } catch {
      setRes({ out: "", err: { type: "読みこみ失敗", msg: "Python を読みこめませんでした。通信を確かめてください。", line: null } });
    }
    setBusy(false);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget as HTMLTextAreaElement;
      const a = ta.selectionStart;
      const v = ta.value.slice(0, a) + "    " + ta.value.slice(ta.selectionEnd);
      setSrc(v);
      requestAnimationFrame(() => (ta.selectionStart = ta.selectionEnd = a + 4));
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
    }
  }
  return (
    <div class="pg">
      <div class="pg-head">
        <h3>動かしてみる</h3>
        <span class="note">書きかえても、問題の正解には影響しません</span>
      </div>
      <textarea class="pg-src" value={src} spellcheck={false} autocapitalize="off" rows={Math.min(14, src.split("\n").length + 1)}
        aria-label="実行するコード" onInput={(e) => setSrc((e.currentTarget as HTMLTextAreaElement).value)} onKeyDown={onKey} />
      {needsInput && (
        <label class="pg-in">
          <span>input() に入れる値（1行に1つ）</span>
          <textarea rows={2} value={inputs} onInput={(e) => setInputs((e.currentTarget as HTMLTextAreaElement).value)} />
        </label>
      )}
      <div class="pg-actions">
        <button class="btn ghost" onClick={() => { setSrc(initial); setRes(null); }}><Icon name="undo" size={16} />もとに戻す</button>
        <button class="btn primary" onClick={run} disabled={busy}>
          <Icon name="play" size={16} />{busy ? (py === "ready" ? "実行中…" : "Python 準備中…") : "実行"}
        </button>
      </div>
      {res && (
        <pre class={`pg-out ${res.err || res.timeout ? "err" : ""}`} aria-live="polite">
          {res.out}
          {res.timeout ? "\n時間がかかりすぎたので止めました（ずっと繰り返していませんか？）" : ""}
          {res.err ? `\n${res.err.type}: ${res.err.msg}${res.err.line ? `（${res.err.line}行目）` : ""}` : ""}
          {!res.out && !res.err && !res.timeout ? "（何も表示されませんでした）" : ""}
        </pre>
      )}
    </div>
  );
}
