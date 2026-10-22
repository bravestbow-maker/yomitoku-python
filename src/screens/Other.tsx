import { useEffect, useMemo, useState } from "preact/hooks";
import { mmss } from "../lib/date.ts";
import { composeParts, lineText } from "../lib/reading.ts";
import { sfx } from "../lib/sound.ts";
import { canSpeak, RATE_LABEL, speak, stopSpeaking } from "../lib/speech.ts";
import { chapters, course, getChapter, getLesson } from "../state/course.ts";
import {
  BADGES, currentStreak, type Experience, isCleared, isSkipped, lessonsDone, levelOf, nextLessonId, startCheck,
  startDiag, startLesson,
} from "../state/logic.ts";
import { getState, resetAll, update, useAppState } from "../state/store.ts";
import { go } from "../router.ts";
import { CodeView } from "../ui/code.tsx";
import { Accordion, confetti, confirmDialog, CountUp, Icon, Kinetic, Mascot, ProgressBar, Ring, toast } from "../ui/parts.tsx";
import { confirmLeaveSession } from "./Play.tsx";

function Back({ title }: { title: string }) {
  return (
    <header class="subhead">
      <button class="icon-btn" onClick={() => go("/")} aria-label="マップへもどる"><Icon name="back" /></button>
      <Kinetic text={title} as="h1" />
    </header>
  );
}

// ---------- 最初のレベル診断 ----------
export function Welcome() {
  const s = useAppState();
  const again = s.onboarded;
  async function pick(exp: Experience) {
    if (again && !(await confirmLeaveSession())) return;
    update((st) => startDiag(st, exp));
    if (exp === "beginner") {
      if (!again) {
        const lid = nextLessonId(getState());
        if (lid) update((st) => startLesson(st, lid));
        go("/play");
      } else go("/");
    } else go("/play");
  }
  return (
    <div class="welcome">
      {again && <Back title="レベル診断" />}
      <div class="welcome-in">
        <Mascot mood="happy" size={96} />
        {!again && <Kinetic text="よみとくPython" as="h1" class="w-title" />}
        <p class="w-q">Python を読んだことはありますか？</p>
        <div class="w-opts">
          <button class="opt" onClick={() => pick("beginner")}><b>はじめて</b><span>第0章から順に進みます</span></button>
          <button class="opt" onClick={() => pick("some")}><b>少し書いたことがある</b><span>14問の診断で、知っている章を飛ばします</span></button>
          <button class="opt" onClick={() => pick("other")}><b>ほかの言語なら読める</b><span>14問の診断で、知っている章を飛ばします</span></button>
        </div>
        <p class="note">診断は2問続けて間違えたところで終わります。あとから設定で何度でもやり直せます。</p>
      </div>
    </div>
  );
}

// ---------- 結果 ----------
export function Result() {
  const s = useAppState();
  const sum = s.lastSummary;
  useEffect(() => {
    if (!sum) {
      go("/");
      return;
    }
    if (sum.noMiss || sum.passed || (sum.kind === "lesson" && getLesson(sum.ref)?.chapter.num === 15 && s.graduatedAt)) {
      confetti();
      sfx.clear();
    }
  }, []);
  if (!sum) return null;
  const acc = sum.total ? sum.firstTry / sum.total : 0;
  const lv = levelOf(s.xp);
  const lessonRef = sum.kind === "lesson" ? getLesson(sum.ref) : null;
  const chapter = lessonRef?.chapter ?? (sum.kind === "check" ? getChapter(sum.ref) : null);
  const nextL = lessonRef ? lessonRef.chapter.lessons[lessonRef.index + 1] : null;
  const chapterDone = chapter ? isCleared(s, chapter) : false;
  const nextId = nextLessonId(s);
  const graduated = chapter?.num === 15 && !!s.graduatedAt;

  const title =
    sum.kind === "diag" ? "診断おわり"
      : sum.kind === "review" ? "復習おわり"
        : sum.kind === "check" ? (sum.passed ? "合格！" : "あと少し")
          : graduated ? "卒業！" : sum.noMiss ? "ノーミス！" : "レッスンクリア";

  async function startNext(lid: string) {
    update((st) => startLesson(st, lid));
    go("/play");
  }
  async function toCheck() {
    update((st) => startCheck(st, chapter!.id));
    go("/play");
  }

  return (
    <div class="result">
      <Kinetic text={title} as="h1" class="r-title" />
      {lv > sum.levelBefore && <div class="r-lvup">レベル{lv}になりました</div>}
      {sum.kind !== "diag" && (
        <div class="r-grid">
          <div class="r-card">
            <Ring value={sum.kind === "check" ? sum.correct / sum.total : acc} size={120} stroke={11} tone={sum.noMiss || sum.passed ? "green" : "primary"} label="正解率">
              <span class="r-big"><CountUp value={Math.round((sum.kind === "check" ? sum.correct / sum.total : acc) * 100)} /><small>%</small></span>
            </Ring>
            <div class="r-label">{sum.kind === "check" ? `${sum.correct}/${sum.total}問 正解` : "一発正解の割合"}</div>
          </div>
          <div class="r-card">
            <div class="r-num">{mmss(sum.ms)}</div>
            <div class="r-label">かかった時間</div>
            <div class="r-num xp">+<CountUp value={sum.xp} />XP</div>
            <div class="r-label">もらったXP</div>
            {sum.maxCombo >= 2 && (<><div class="r-num">{sum.maxCombo}</div><div class="r-label">最大コンボ</div></>)}
          </div>
        </div>
      )}
      {sum.kind === "diag" && (
        <div class="r-diag">
          {sum.diagSkipped!.length ? (
            <p>知っていた章：{sum.diagSkipped!.map((n) => `第${n}章`).join("、")}。これらはスキップ済みにしました（マップでは点線）。</p>
          ) : (
            <p>まずは第1章から始めましょう。</p>
          )}
        </div>
      )}
      {sum.kind === "review" && <p class="r-note">{sum.removedFromReview ? `${sum.removedFromReview}問が要復習から外れました` : "2回続けて正解すると、要復習から外れます"}</p>}
      {sum.kind === "check" && !sum.passed && <p class="r-note">3問以上で合格です。レッスンで学んでから、もう一度挑戦できます。</p>}
      {chapterDone && sum.kind !== "review" && sum.kind !== "diag" && <p class="r-note">第{chapter!.num}章「{chapter!.title}」をクリアしました。よみかた図鑑に書き方が追加されました。</p>}

      <div class="r-actions">
        {lessonRef && <button class="btn" onClick={() => go(`/readthrough/${sum.ref}`)}><Icon name="mic" size={16} />通して音読</button>}
        {graduated ? (
          <button class="btn primary big" onClick={() => go("/cert")}><Icon name="trophy" size={18} />修了証を見る</button>
        ) : nextL ? (
          <button class="btn primary big" onClick={() => startNext(nextL.id)}>次のレッスンへ<Icon name="chevron" size={18} /></button>
        ) : lessonRef && chapter?.check.length && !s.chapters[chapter.id]?.checkPassed ? (
          <button class="btn primary big" onClick={toCheck}>理解度チェックへ<Icon name="chevron" size={18} /></button>
        ) : sum.kind !== "lesson" && nextId ? (
          <button class="btn primary big" onClick={() => startNext(nextId)}>{sum.kind === "diag" ? "はじめる" : "続きから"}<Icon name="chevron" size={18} /></button>
        ) : null}
        <button class="btn ghost" onClick={() => go("/")}>マップへ</button>
      </div>
    </div>
  );
}

// ---------- 通して音読 ----------
export function ReadThrough({ lid }: { lid: string }) {
  const s = useAppState();
  const ref = getLesson(lid);
  const blocks = useMemo(() => {
    if (!ref) return [];
    const seen = new Set<string>();
    return ref.lesson.problems
      .map((p) => {
        const code = p.solved ?? p.code;
        const lines = code ? code.split("\n") : [];
        const rd = p.solvedReading ?? p.reading;
        return { code, lines, parts: composeParts(lines, rd.slice(0, lines.length)) };
      })
      .filter((b) => b.lines.length && !seen.has(b.code) && (seen.add(b.code), true));
  }, [lid]);
  const flat = blocks.flatMap((b, bi) => b.lines.map((_, li) => [bi, li] as const).filter(([, li]) => b.parts[li].body));
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => stopSpeaking(), []);
  if (!ref) return null;
  const cur = flat[pos];
  const done = pos >= flat.length;

  function step() {
    if (done) return;
    if (!revealed) {
      setShown((p) => new Set(p).add(`${cur[0]}-${cur[1]}`));
      setRevealed(true);
      sfx.tap();
    } else {
      setPos(pos + 1);
      setRevealed(false);
      if (pos + 1 >= flat.length) {
        confetti(60);
        sfx.clear();
      }
    }
  }
  async function listen() {
    if (!cur) return;
    setSpeaking(true);
    await speak(lineText(blocks[cur[0]].parts[cur[1]]), getState().settings.rate);
    setSpeaking(false);
  }
  return (
    <div class="readthrough">
      <Back title="通して音読" />
      <p class="note">ハイライトの行を声に出して読み、「答え合わせ」で読み下しを確かめます。声を出せない場所では頭の中で読んでもOK。</p>
      <ProgressBar value={flat.length ? Math.min(pos, flat.length) / flat.length : 1} label="音読の進み具合" />
      <div class="rt-blocks">
        {blocks.map((b, bi) => (
          <div class="code-card">
            <CodeView lines={b.lines} parts={b.parts} tappable={false}
              shown={new Set(b.lines.map((_, li) => li).filter((li) => shown.has(`${bi}-${li}`)))}
              active={cur && cur[0] === bi ? cur[1] : null} />
          </div>
        ))}
      </div>
      <div class="rt-bar">
        {done ? (
          <>
            <span class="rt-done">最後まで読めました</span>
            <button class="btn" onClick={() => { setPos(0); setShown(new Set()); setRevealed(false); }}><Icon name="repeat" size={16} />もう一度</button>
            <button class="btn primary" onClick={() => go("/")}>マップへ</button>
          </>
        ) : (
          <>
            <span class="rt-pos">{pos + 1}/{flat.length}行</span>
            <button class="btn" onClick={listen} disabled={!canSpeak() || speaking}><Icon name="speaker" size={16} />お手本（{RATE_LABEL[s.settings.rate]}）</button>
            <button class="btn primary" onClick={step}>{revealed ? "次の行へ" : "答え合わせ"}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- よみかた図鑑 ----------
export function Zukan() {
  const s = useAppState();
  useEffect(() => {
    const seen = chapters.filter((c) => isCleared(s, c) && c.patterns.length).map((c) => c.num);
    if (seen.some((n) => !s.zukanSeen.includes(n))) update((st) => (st.zukanSeen = seen));
  }, []);
  const [tab, setTab] = useState<"yomi" | "words">("yomi");
  const opened = chapters.filter((c) => c.patterns.length && isCleared(s, c)).length;
  const total = chapters.filter((c) => c.patterns.length).length;
  return (
    <div class="zukan">
      <Back title="よみかた図鑑" />
      <div class="z-head">
        <Ring value={opened / total} size={64} stroke={6} tone="green" label="図鑑の達成率">
          <span class="ring-txt"><b>{opened}</b>/{total}</span>
        </Ring>
        <div class="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "yomi"} class={tab === "yomi" ? "on" : ""} onClick={() => setTab("yomi")}>書き方</button>
          <button role="tab" aria-selected={tab === "words"} class={tab === "words" ? "on" : ""} onClick={() => setTab("words")}>ことば</button>
        </div>
      </div>
      {tab === "yomi" ? (
        chapters.filter((c) => c.patterns.length).map((c) => {
          const open = isCleared(s, c);
          return (
            <section class={`z-ch ${open ? "" : "locked"}`}>
              <h3>第{c.num}章 {c.title}{!open && <Icon name="lock" size={16} />}{open && !s.zukanSeen.includes(c.num) && <span class="dot dot-new">NEW</span>}</h3>
              {open ? (
                c.patterns.map((pt) => {
                  const lines = pt.code.split("\n");
                  const parts = composeParts(lines, pt.reading);
                  return (
                    <div class="z-item">
                      <div class="z-note">{pt.note}</div>
                      <div class="code-card small"><CodeView lines={lines} parts={parts} tappable={false} shown={new Set(lines.map((_, i) => i))} /></div>
                      {canSpeak() && (
                        <button class="btn small ghost" onClick={async () => {
                          for (const p of parts) if (p.body) await speak(lineText(p), getState().settings.rate);
                        }}><Icon name="speaker" size={14} />聞く</button>
                      )}
                    </div>
                  );
                })
              ) : (
                <p class="note">第{c.num}章をクリアすると見られます（{c.patterns.length}こ）</p>
              )}
            </section>
          );
        })
      ) : (
        <dl class="words">
          {Object.entries(course.glossary).map(([k, v]) => (<><dt>{k}</dt><dd>{v}</dd></>))}
        </dl>
      )}
    </div>
  );
}

// ---------- バッジ ----------
export function Badges() {
  const s = useAppState();
  const [newOnes] = useState(() => new Set(Object.entries(getState().badges).filter(([, b]) => !b.seen).map(([k]) => k)));
  useEffect(() => {
    if (newOnes.size) update((st) => Object.values(st.badges).forEach((b) => (b.seen = true)));
  }, []);
  const got = BADGES.filter((b) => s.badges[b.id]).length;
  return (
    <div class="badges">
      <Back title="バッジ" />
      <div class="b-head">
        <Ring value={got / BADGES.length} size={64} stroke={6} tone="gold" label="バッジの数">
          <span class="ring-txt"><b>{got}</b>/{BADGES.length}</span>
        </Ring>
        <p>レベルアップ、章クリア、連続学習日数（3・7・30日）でもらえます。</p>
      </div>
      <div class="b-grid">
        {BADGES.map((b) => {
          const has = !!s.badges[b.id];
          return (
            <div class={`badge ${has ? "has" : ""} ${newOnes.has(b.id) ? "fresh" : ""}`}>
              <div class="b-icon"><Icon name={has ? b.icon : "lock"} size={28} />{newOnes.has(b.id) && <span class="dot dot-new">NEW</span>}</div>
              <div class="b-label">{b.label}</div>
              {has && <div class="b-date">{new Date(s.badges[b.id].at).toLocaleDateString("ja-JP")}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 設定 ----------
export function Settings() {
  const s = useAppState();
  async function redo() {
    go("/welcome");
  }
  async function reset() {
    const ok = await confirmDialog("記録をすべて消しますか？", "XP・レベル・連続日数・進み具合・バッジがすべて消えます。この操作は元に戻せません。", "すべて消す", true);
    if (!ok) return;
    resetAll();
    toast("記録をすべて消しました");
    go("/welcome");
  }
  return (
    <div class="settings">
      <Back title="設定" />
      <section class="set-group">
        <h3>見た目</h3>
        <div class="seg" role="radiogroup" aria-label="テーマ">
          {(["auto", "light", "dark"] as const).map((t) => (
            <button role="radio" aria-checked={s.settings.theme === t} class={s.settings.theme === t ? "on" : ""}
              onClick={() => update((st) => (st.settings.theme = t))}>{{ auto: "端末に合わせる", light: "ライト", dark: "ダーク" }[t]}</button>
          ))}
        </div>
      </section>
      <section class="set-group">
        <h3>音</h3>
        <label class="switch">
          <span>効果音</span>
          <input type="checkbox" role="switch" checked={s.settings.sound} onChange={(e) => update((st) => (st.settings.sound = (e.currentTarget as HTMLInputElement).checked))} />
          <span class="sw" aria-hidden="true" />
        </label>
        <div class="seg" role="radiogroup" aria-label="読み上げの速さ">
          {RATE_LABEL.map((l, i) => (
            <button role="radio" aria-checked={s.settings.rate === i} class={s.settings.rate === i ? "on" : ""}
              onClick={() => update((st) => (st.settings.rate = i as 0 | 1 | 2))}>{l}</button>
          ))}
        </div>
        {!canSpeak() && <p class="note">このブラウザは読み上げに対応していません。</p>}
      </section>
      <section class="set-group">
        <h3>学習</h3>
        <button class="btn" onClick={redo}><Icon name="repeat" size={16} />レベル診断をやり直す</button>
        <p class="note">診断で正解した章はスキップ済みになります。いまの記録は消えません。</p>
      </section>
      <section class="set-group danger-zone">
        <h3>記録</h3>
        <button class="btn danger" onClick={reset}>記録をすべて消す</button>
      </section>
      <Accordion title="このアプリについて">
        <p>記録はこのブラウザの中だけに保存されます。ログインはありません。Python の実行もブラウザの中（Pyodide）で行います。</p>
      </Accordion>
    </div>
  );
}

// ---------- 修了証 ----------
export function Certificate() {
  const s = useAppState();
  useEffect(() => {
    if (s.graduatedAt) confetti(100);
  }, []);
  if (!s.graduatedAt) {
    return (
      <div class="cert">
        <Back title="修了証" />
        <p class="note">卒業試験（最終章）をすべてクリアすると表示されます。</p>
      </div>
    );
  }
  const totalCorrect = Object.values(s.stats).reduce((n, x) => n + x.correct, 0);
  const totalWrong = Object.values(s.stats).reduce((n, x) => n + x.wrong, 0);
  const totalMs = Object.values(s.stats).reduce((n, x) => n + x.ms, 0);
  return (
    <div class="cert">
      <Back title="修了証" />
      <div class="cert-card">
        <Mascot mood="combo" size={80} />
        <Kinetic text="よみとくPython 修了" as="h2" class="cert-title" />
        <p class="cert-date">{new Date(s.graduatedAt).toLocaleDateString("ja-JP")}</p>
        <div class="cert-stats">
          <div><b><CountUp value={s.xp} /></b><span>XP</span></div>
          <div><b>Lv.{levelOf(s.xp)}</b><span>レベル</span></div>
          <div><b>{totalCorrect}</b><span>正解した数</span></div>
          <div><b>{mmss(totalMs)}</b><span>レッスンの時間</span></div>
          <div><b>{currentStreak(s)}日</b><span>連続学習</span></div>
        </div>
      </div>
      <h3 class="cert-h">全章の学習記録</h3>
      <table class="rec">
        <thead><tr><th>章</th><th>状態</th><th>レッスン</th><th>正解率</th></tr></thead>
        <tbody>
          {chapters.map((c) => {
            const st = s.stats[c.id];
            const n = st ? st.correct + st.wrong : 0;
            return (
              <tr>
                <td>第{c.num}章 {c.title}</td>
                <td>{isCleared(s, c) ? (s.chapters[c.id]?.checkPassed && lessonsDone(s, c) < c.lessons.length ? "チェック合格" : "クリア") : isSkipped(s, c) ? "スキップ" : "—"}</td>
                <td>{lessonsDone(s, c)}/{c.lessons.length}</td>
                <td>
                  <div class="rec-bar"><ProgressBar value={n ? st!.correct / n : 0} tone="green" label="正解率" /><span>{n ? Math.round((st!.correct / n) * 100) : 0}%</span></div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="note">間違えた回数もふくめた正解率です（全体 {totalCorrect + totalWrong ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0}%）。</p>
    </div>
  );
}

