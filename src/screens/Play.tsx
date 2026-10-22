import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { judgeRun, judgeText, type Verdict } from "../lib/judge.ts";
import { onPyStatus, pyStatus, runPython, type PyStatus } from "../lib/python.ts";
import { composeParts, lineText } from "../lib/reading.ts";
import { sfx } from "../lib/sound.ts";
import { canSpeak, RATE_LABEL, speak, stopSpeaking } from "../lib/speech.ts";
import type { Problem } from "../lib/types.ts";
import { chapters, course, detectChapters, getLesson, getProblem, readingAllowed, TYPE_LABEL } from "../state/course.ts";
import {
  advance, awardBadges, isSkipped, lessonsLeft, levelOf, recordAnswer, reveal, singleAttempt, xpToNext,
} from "../state/logic.ts";
import { getState, update, useAppState } from "../state/store.ts";
import { CodeView } from "../ui/code.tsx";
import {
  Accordion, BottomSheet, confetti, confirmDialog, CountUp, Icon, Kinetic, Mascot, type Mood, ProgressBar, toast,
} from "../ui/parts.tsx";
import { go } from "../router.ts";
import { Playground } from "./Playground.tsx";

type LogLine = { kind: "in" | "ok" | "ng" | "info"; text: string };

const KEYS = ["(", ")", ":", '"', "'", "[", "]", "=", "_"];

export function Play() {
  const s = useAppState();
  const ss = s.session;
  useEffect(() => {
    if (!ss) go("/");
  }, [!!ss]);
  if (!ss) return null;
  const pid = ss.queue[ss.idx];
  const ref = getProblem(pid);
  if (!ref) return null;
  return <ProblemView key={pid} pid={pid} />;
}

function useTicker(active: boolean) {
  const acc = useRef(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && active) acc.current += 1000;
    }, 1000);
    const flush = () => {
      if (!acc.current || !getState().session) return;
      const add = acc.current;
      acc.current = 0;
      update((st) => {
        if (st.session) st.session.ms += add;
      });
    };
    const flushId = window.setInterval(flush, 10000);
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearInterval(id);
      clearInterval(flushId);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [active]);
  return () => {
    const add = acc.current;
    acc.current = 0;
    return add;
  };
}

function ProblemView({ pid }: { pid: string }) {
  const s = useAppState();
  const ss = s.session!;
  const ref = getProblem(pid)!;
  const p: Problem = ref.problem;
  const kind = ss.kind;
  const single = singleAttempt(kind);
  const r = ss.results[pid];
  const solved = !!r?.done;
  const miss = r?.miss ?? 0;
  const allowed = readingAllowed(ref, kind);
  const takeMs = useTicker(!solved);

  const [input, setInput] = useState(ss.draft ?? "");
  const [log, setLog] = useState<LogLine[]>([]);
  const [judging, setJudging] = useState(false);
  const [shake, setShake] = useState(0);
  const [mood, setMood] = useState<Mood>("idle");
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<null | "speak" | "self">(null);
  const [active, setActive] = useState<number | null>(null);
  const [selfRevealed, setSelfRevealed] = useState(false);
  const [floatXp, setFloatXp] = useState<number | null>(null);
  const [combo, setCombo] = useState(0);
  const [play, setPlay] = useState(false);
  const [py, setPy] = useState<PyStatus>(pyStatus());
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const speakToken = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => onPyStatus(setPy), []);
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    if (!solved) inputRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!solved) return;
    nextRef.current?.focus({ preventScroll: true });
    const t = window.setTimeout(() => nextRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 250);
    return () => clearTimeout(t);
  }, [solved]);

  // 下書きを保存（閉じても続きから）
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (getState().session?.draft !== input) update((st) => st.session && (st.session.draft = input));
    }, 400);
    return () => clearTimeout(t);
  }, [input]);

  // 表示するコードと読み下し
  const code = solved ? p.solved ?? p.code : p.code;
  const codeLines = code === "" ? [] : code.split("\n");
  const readingSrc = solved ? p.solvedReading ?? p.reading : p.reading;
  const parts = useMemo(() => composeParts(codeLines, readingSrc.slice(0, codeLines.length)), [code]);
  const hidden = useMemo(() => {
    const h = new Set<number>();
    if (!solved) {
      if (p.type === "blank" && p.line) h.add(p.line - 1);
      if (p.type === "fill" && p.blankLine) h.add(p.blankLine - 1);
    }
    return h;
  }, [solved]);
  const visibleShown = solved && !mode ? new Set(codeLines.map((_, i) => i)) : shown;

  const skipped = chapters.filter((c) => isSkipped(s, c)).map((c) => c.num);
  const tags = useMemo(() => {
    // 同じ章の案内は、最初に出てくる行に1回だけ
    const m = new Map<number, number[]>();
    const seen = new Set<number>();
    codeLines.forEach((l, i) => {
      const hits = detectChapters(l, skipped, ref.chapter.num).filter((n) => !seen.has(n));
      hits.forEach((n) => seen.add(n));
      if (hits.length) m.set(i, hits);
    });
    return m;
  }, [code, skipped.join()]);

  const canRead = (allowed || solved) && codeLines.length > 0;

  // ---------- 音読 ----------
  async function startSpeak() {
    stopSpeaking();
    const token = ++speakToken.current;
    setMode("speak");
    setShown(new Set());
    const acc = new Set<number>();
    for (let i = 0; i < codeLines.length; i++) {
      if (!parts[i]?.body || hidden.has(i)) continue;
      if (speakToken.current !== token) return;
      setActive(i);
      acc.add(i);
      setShown(new Set(acc));
      await speak(lineText(parts[i]), getState().settings.rate);
    }
    if (speakToken.current === token) {
      setActive(null);
      setMode(null);
      setShown(new Set(acc));
    }
  }
  function stopMode() {
    speakToken.current++;
    stopSpeaking();
    setMode(null);
    setActive(null);
  }
  const readable = codeLines.map((_, i) => i).filter((i) => parts[i]?.body && !hidden.has(i));
  function startSelf() {
    stopMode();
    setMode("self");
    setShown(new Set());
    setActive(readable[0] ?? null);
    setSelfRevealed(false);
  }
  function selfStep() {
    if (active === null) return;
    if (!selfRevealed) {
      setShown((prev) => new Set(prev).add(active));
      setSelfRevealed(true);
      sfx.tap();
      return;
    }
    const k = readable.indexOf(active);
    if (k + 1 < readable.length) {
      setActive(readable[k + 1]);
      setSelfRevealed(false);
    } else {
      setMode(null);
      setActive(null);
      toast("最後まで読めました");
    }
  }
  function tapLine(i: number) {
    if (mode === "self") {
      if (i === active) selfStep();
      return;
    }
    if (!canRead) return;
    setShown((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  // ---------- 判定 ----------
  async function submit() {
    if (solved || judging) return;
    const text = input;
    if (!text.trim()) {
      toast("答えを入力してから Enter を押してね");
      return;
    }
    setLog((l) => [...l, { kind: "in", text }]);
    let v: Verdict = judgeText(p, text);
    if (v.needsRun) {
      setJudging(true);
      if (pyStatus() !== "ready") setLog((l) => [...l, { kind: "info", text: "Python を準備しています。準備ができたら判定します…" }]);
      try {
        v = await judgeRun(p, text, runPython);
      } catch {
        setJudging(false);
        setLog((l) => [...l, { kind: "info", text: "Python を読みこめませんでした。通信を確かめて、もう一度 Enter を押してください" }]);
        return;
      }
      setJudging(false);
    }
    apply(v, text);
  }

  function apply(v: Verdict, text: string) {
    if (v.near) {
      // 惜しい：間違いの回数には数えず、そのまま入力し直せる
      setLog((l) => [...l, { kind: "info", text: v.note ?? "惜しい！" }]);
      setMood("think");
      setInput(text);
      return;
    }
    const before = getState();
    const lvBefore = levelOf(before.xp);
    const badges: string[] = [];
    update((st) => {
      recordAnswer(st, v.ok);
      awardBadges(st).forEach((b) => badges.push(b.label));
    });
    const after = getState();
    const res = after.session?.results[pid];
    if (v.ok) {
      const gained = res?.xp ?? 0;
      const c = after.session?.combo ?? 0;
      setFloatXp(gained);
      setCombo(c);
      setMood(c >= 2 ? "combo" : "happy");
      if (c >= 2) sfx.combo(c);
      else sfx.correct();
      setLog((l) => [...l, { kind: "ok", text: `正解！ +${gained}XP` }, ...(v.note ? [{ kind: "info" as const, text: v.note }] : [])]);
      if (navigator.vibrate) navigator.vibrate(15);
      stopMode();
      setInput("");
    } else {
      setMood("sad");
      setShake((n) => n + 1);
      sfx.wrong();
      setCombo(0);
      const lines: LogLine[] = [];
      if (v.wrongLine) {
        lines.push({ kind: "ng", text: `ちがいます。${v.wrongLine}行目がちがいます` });
      } else lines.push({ kind: "ng", text: v.note ? `ちがいます（${v.note}）` : "ちがいます" });
      if (single) lines.push({ kind: "info", text: `正解は ${p.answers[0]}` });
      setLog((l) => [...l, ...lines]);
      if (single) setInput("");
      else setInput(text);
      window.setTimeout(() => setMood("think"), 900);
    }
    const lvAfter = levelOf(after.xp);
    if (lvAfter > lvBefore) {
      setLevelUp(lvAfter);
      sfx.level();
      confetti(80);
      window.setTimeout(() => setLevelUp(null), 2200);
    }
    badges.forEach((b) => toast(`バッジ獲得：${b}`, { tone: "gold" }));
  }

  function doReveal() {
    update((st) => reveal(st));
    setLog((l) => [...l, { kind: "info", text: `答え：${p.answers[0]}（「要復習」に入れました）` }]);
    setMood("think");
    setCombo(0);
    setInput("");
  }

  function next() {
    stopMode();
    const add = takeMs();
    let done = false;
    update((st) => {
      if (st.session) st.session.ms += add;
      const sum = advance(st);
      if (sum) {
        done = true;
        awardBadges(st);
      }
    });
    if (done) go("/result");
  }

  async function quit() {
    stopMode();
    go("/");
  }

  // ---------- 入力欄 ----------
  function onKey(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (solved) return next();
      const ta = e.currentTarget as HTMLTextAreaElement;
      const before = ta.value.slice(0, ta.selectionStart);
      const curLine = before.split("\n").pop() ?? "";
      if ((p.type === "write" || p.type === "fill") && /:\s*$/.test(curLine)) {
        const indent = (curLine.match(/^\s*/)?.[0] ?? "") + "    ";
        insert("\n" + indent);
        return;
      }
      submit();
    }
    if (e.key === "Tab" && (p.type === "write" || p.type === "fill")) {
      e.preventDefault();
      insert("    ");
    }
  }
  function insert(t: string) {
    const ta = inputRef.current;
    if (!ta) return;
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    const v = ta.value.slice(0, a) + t + ta.value.slice(b);
    setInput(v);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = a + t.length;
    });
  }

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [input]);

  // 解き終わったあと、どこで Enter を押しても次へ
  useEffect(() => {
    if (!solved) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !play && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [solved, play]);

  // ---------- 見出しの情報 ----------
  const total = ss.queue.length;
  const pos = ss.idx + 1;
  const lessonInfo = ss.kind === "lesson" ? getLesson(ss.ref) : null;
  const chapter = ref.chapter;
  const left = lessonsLeft(s, chapter);
  const headTitle =
    kind === "lesson" ? `${chapter.num === 15 ? "卒業試験" : `第${chapter.num}章`} ${lessonInfo?.lesson.title}`
      : kind === "check" ? `第${chapter.num}章 理解度チェック`
        : kind === "review" ? "復習"
          : "レベル診断";
  const multiLine = (p.type === "output" && p.answers[0].includes("\n")) || p.type === "write" || p.type === "fill";
  const showHint = !single && !solved && miss >= 2;
  const showReveal = !single && !solved && miss >= 3;

  return (
    <div class="play" data-pid={pid} data-solved={solved ? "1" : "0"}>
      <header class="play-head">
        <button class="icon-btn" onClick={quit} aria-label="中断してマップへ（続きは保存されます）"><Icon name="close" /></button>
        <div class="play-prog">
          <div class="play-prog-top">
            <span class="play-title">{headTitle}</span>
            <span class="play-count">{pos}/{total}問</span>
          </div>
          <ProgressBar value={(ss.idx + (solved ? 1 : 0)) / total} label="レッスンの進み具合" />
        </div>
        <div class="play-xp" title="XP">
          <Icon name="bolt" size={18} />
          <CountUp value={s.xp} />
          {floatXp !== null && <span class="xp-float" key={pos + "-" + log.length} onAnimationEnd={() => setFloatXp(null)}>+{floatXp}</span>}
        </div>
      </header>
      <div class="play-sub">
        <span>次のレベルまであと<b>{xpToNext(s.xp)}</b>XP</span>
        {kind !== "diag" && kind !== "review" && <span>この章のクリアまであと<b>{left}</b>レッスン</span>}
      </div>

      <main class="play-main">
        <section class="pane left">
          <div class="qhead">
            <span class="chip">{TYPE_LABEL[p.type]}</span>
            {kind === "check" && <span class="chip ghost">1回勝負</span>}
            {kind === "diag" && <span class="chip ghost">第{chapter.num}章から</span>}
            {allowed && !solved && <span class="chip ghost"><Icon name="eye" size={14} />行をタップで読み下し</span>}
          </div>
          <p class="prompt">{p.prompt}</p>
          {p.type === "output" && p.err && <p class="note">例：NameError のように、エラーの種類の名前だけを入力します</p>}
          {p.terms && p.terms.length > 0 && (
            <div class="terms">
              {p.terms.map((t) => (<div><b>{t}</b>：{course.glossary[t]}</div>))}
            </div>
          )}
          {p.type === "blank" && (
            <div class="template">
              {p.template!.split("［　］").map((seg, i, arr) => (
                <>{seg}{i < arr.length - 1 && <span class={`blank-box ${solved ? "filled" : ""}`}>{solved ? p.answers[0] : "　　"}</span>}</>
              ))}
            </div>
          )}
          {p.type === "write" && (
            <div class="target">
              <div class="target-label">読み下し</div>
              {(p.target ?? []).map((t) => <div class="target-line">{t}</div>)}
            </div>
          )}
          <div class="code-card">
            {codeLines.length > 0 || p.type === "write" ? (
              <CodeView lines={codeLines} parts={parts} shown={visibleShown} tappable={canRead || mode === "self"} onTap={tapLine}
                active={active} flash={solved && !mode} hidden={hidden} focus={p.focus} tags={tags}
                ghost={p.type === "write" && !solved ? input.split("\n")[0] : undefined} />
            ) : null}
          </div>
          {canRead && (
            <div class="read-bar">
              {mode === "speak" ? (
                <button class="btn small" onClick={stopMode}><Icon name="stop" size={16} />止める</button>
              ) : (
                <button class="btn small" onClick={startSpeak} disabled={!canSpeak()} title={canSpeak() ? "" : "このブラウザは読み上げに対応していません"}>
                  <Icon name="speaker" size={16} />音読
                </button>
              )}
              {mode === "self" ? (
                <button class="btn small primary" onClick={selfStep}>{selfRevealed ? "次の行へ" : "答え合わせ"}</button>
              ) : (
                <button class="btn small" onClick={startSelf}><Icon name="mic" size={16} />自分で読む</button>
              )}
              <button class="btn small ghost" onClick={() => update((st) => (st.settings.rate = ((st.settings.rate + 1) % 3) as 0 | 1 | 2))}
                aria-label="読み上げの速さを変える">速さ：{RATE_LABEL[s.settings.rate]}</button>
            </div>
          )}
          {mode === "self" && <p class="note">ハイライトされた行を声に出して読んでから「答え合わせ」。声を出せない場所では頭の中で読んでもOK。</p>}
          {(p.type === "fill" || p.type === "bug") && (
            <div class="expected">
              <div class="expected-label">{p.type === "bug" ? "意図した出力" : "期待する出力"}</div>
              <pre>{p.expected}</pre>
            </div>
          )}
        </section>

        <section class="pane right">
          <div class={`term ${shake ? "shake" : ""}`} key={shake} >
            <div class="term-bar">
              <span class="tdot r" /><span class="tdot y" /><span class="tdot g" />
              <span class={`py-chip py-${py}`}>{py === "ready" ? "Python OK" : py === "loading" ? "Python 準備中…" : py === "error" ? "Python 読みこみ失敗" : "Python"}</span>
            </div>
            <div class="term-log" aria-live="polite">
              {log.map((l) => (
                <div class={`tl tl-${l.kind}`}>
                  {l.kind === "in" ? (<><span class="tp">&gt;&gt;&gt;</span><pre>{l.text}</pre></>) : l.kind === "ok" ? `✓ ${l.text}` : l.kind === "ng" ? `✗ ${l.text}` : l.text}
                </div>
              ))}
            </div>
            {!solved && (
                <div class="keybar" aria-label="記号の入力">
                  {KEYS.map((k) => (<button onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k)}>{k}</button>))}
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => insert("    ")} aria-label="インデント">⇥</button>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => insert("\n")} aria-label="改行">↵</button>
                  <button class="kb-go" onMouseDown={(e) => e.preventDefault()} onClick={submit} aria-label="判定する">判定</button>
                </div>
              )}
            {!solved && (
              <div class="term-input">
                <span class="tp">&gt;&gt;&gt;</span>
                <textarea ref={inputRef} rows={1} value={input} spellcheck={false} autocapitalize="off" autocomplete="off"
                  aria-label="答えの入力欄（Enterで判定）" disabled={judging}
                  onInput={(e) => setInput((e.currentTarget as HTMLTextAreaElement).value)} onKeyDown={onKey} />
              </div>
            )}
            {!solved && (
              <div class="term-help">
                {judging ? "判定中…" : multiLine ? "Enter で判定 ・ Shift+Enter で改行" : "Enter で判定"}
              </div>
            )}
            <div class="mascot-spot"><Mascot mood={mood} size={64} /></div>
          </div>

          {showHint && (
            <div class="hint" role="note"><b>ヒント</b>　{p.hint}</div>
          )}
          {showReveal && (
            <button class="btn ghost reveal" onClick={doReveal}><Icon name="eye" size={16} />答えを見る</button>
          )}

          {combo >= 2 && solved && (
            <div class="combo" key={combo}><Kinetic text={`COMBO ×${combo}`} as="div" /></div>
          )}

          {solved && (
            <div class="after">
              <div class={`verdict ${r?.correct ? "ok" : "ng"}`}>
                {r?.correct ? (r.firstTry ? "一発正解！" : "正解！") : r?.revealed ? "答えを確認しました" : `正解は「${p.answers[0]}」`}
              </div>
              {p.type === "bug" && <div class="fix">直した行：<code>{p.fixedLine!.trim()}</code></div>}
              {p.explain && (
                <Accordion title="つまずきポイント" open>
                  <p>{p.explain}</p>
                </Accordion>
              )}
              <div class="after-actions">
                <button class="btn" onClick={() => setPlay(true)}><Icon name="run" size={16} />動かしてみる</button>
                <button class="btn primary big" ref={nextRef} onClick={next}>
                  {ss.idx + 1 < ss.queue.length && !(kind === "diag" && (ss.diagWrongRun ?? 0) >= 2) ? "次へ" : "結果を見る"}
                  <Icon name="chevron" size={18} />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <BottomSheet open={play} onClose={() => setPlay(false)} label="動かしてみる">
        <Playground initial={p.solved ?? p.code.replace("___", p.answers[0])} stdin={p.stdin} />
      </BottomSheet>

      {levelUp && (
        <div class="levelup" role="status">
          <Kinetic text="LEVEL UP" as="div" class="lu-title" />
          <div class="lu-num">Lv.{levelUp}</div>
        </div>
      )}
    </div>
  );
}

export async function confirmLeaveSession(): Promise<boolean> {
  const ss = getState().session;
  if (!ss || ss.finished) return true;
  const started = ss.idx > 0 || Object.keys(ss.results).length > 0;
  if (!started) return true;
  return confirmDialog("今のレッスンをやめますか？", "途中まで解いた記録は消えます。", "やめて始める", true);
}
