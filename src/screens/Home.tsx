import { useEffect, useState } from "preact/hooks";
import type { Chapter } from "../lib/types.ts";
import { chapters } from "../state/course.ts";
import {
  chapterStatus, currentChapter, currentStreak, isCleared, isSkipped, lessonsDone, lessonsLeft, levelOf, levelProgress,
  nextLessonId, overallProgress, reviewIds, skipChapter, startCheck, startLesson, startReview, unseenBadges, unseenZukan,
  unskipChapter, xpToNext,
} from "../state/logic.ts";
import { getState, update, useAppState } from "../state/store.ts";
import { getLesson, getProblem } from "../state/course.ts";
import { go } from "../router.ts";
import { BottomSheet, CountUp, Dot, Icon, Kinetic, Mascot, ProgressBar, Ring, toast } from "../ui/parts.tsx";
import { confirmLeaveSession } from "./Play.tsx";

export function Home() {
  const s = useAppState();
  const [sheet, setSheet] = useState<string | null>(null);
  const cur = currentChapter(s);
  const streak = currentStreak(s);
  const lv = levelOf(s.xp);
  const prog = overallProgress(s);
  const reviewN = reviewIds(s).length;

  useEffect(() => {
    if (!s.onboarded) go("/welcome");
  }, [s.onboarded]);

  const ss = s.session;
  let contLabel = "続きから";
  let contSub = "";
  if (ss) {
    const ref = getProblem(ss.queue[ss.idx]);
    contSub =
      ss.kind === "lesson" ? `第${ref?.chapter.num}章「${getLesson(ss.ref)?.lesson.title}」 ${ss.idx + 1}問目から`
        : ss.kind === "check" ? `第${ref?.chapter.num}章 理解度チェック ${ss.idx + 1}問目から`
          : ss.kind === "review" ? `復習 ${ss.idx + 1}問目から` : `レベル診断 ${ss.idx + 1}問目から`;
  } else {
    const lid = nextLessonId(s);
    if (lid) {
      const l = getLesson(lid)!;
      contLabel = Object.keys(s.lessons).length ? "続きから" : "はじめる";
      contSub = `第${l.chapter.num}章「${l.lesson.title}」`;
    } else if (s.graduatedAt) {
      contLabel = "修了証を見る";
      contSub = "全章クリア";
    }
  }

  async function onContinue() {
    if (getState().session) return go("/play");
    const lid = nextLessonId(getState());
    if (lid) {
      update((st) => startLesson(st, lid));
      go("/play");
    } else if (getState().graduatedAt) go("/cert");
  }

  async function onReview() {
    if (!reviewIds(getState()).length) {
      toast("復習する問題はありません。間違えた問題がここにたまります");
      return;
    }
    if (!(await confirmLeaveSession())) return;
    update((st) => startReview(st));
    go("/play");
  }

  return (
    <div class="home">
      <header class="topbar">
        <Kinetic text="よみとくPython" as="h1" class="brand" />
        <div class="top-actions">
          <ThemeButton />
          <button class="icon-btn" onClick={() => go("/settings")} aria-label="設定"><Icon name="gear" /></button>
        </div>
      </header>

      <section class="stats">
        <div class={`stat streak ${streak ? "on" : ""}`}>
          <Icon name="flame" size={26} />
          <div>
            <div class="stat-num"><CountUp value={streak} /><small>日</small></div>
            <div class="stat-label">連続学習</div>
          </div>
        </div>
        <div class="stat level">
          <Ring value={levelProgress(s.xp)} size={54} stroke={6} label={`レベル${lv}`}>
            <span class="lv">Lv<b><CountUp value={lv} /></b></span>
          </Ring>
          <div>
            <div class="stat-num"><CountUp value={s.xp} /><small>XP</small></div>
            <div class="stat-label">次まであと{xpToNext(s.xp)}XP</div>
          </div>
        </div>
        <div class="stat overall">
          <div class="stat-num"><CountUp value={Math.round(prog * 100)} /><small>%</small></div>
          <ProgressBar value={prog} label="全体の進み具合" tone="green" />
          <div class="stat-label">全体の進み具合</div>
        </div>
      </section>

      <button class="continue" onClick={onContinue} disabled={!contSub}>
        <span class="cont-main"><Icon name="play" size={22} />{contLabel}</span>
        {contSub && <span class="cont-sub">{contSub}</span>}
      </button>

      <nav class="quick">
        <button class="qbtn" onClick={onReview}><Icon name="repeat" /><span>復習</span><Dot count={reviewN} /></button>
        <button class="qbtn" onClick={() => go("/zukan")}><Icon name="book" /><span>よみかた図鑑</span><Dot isNew={unseenZukan(s) > 0} /></button>
        <button class="qbtn" onClick={() => go("/badges")}><Icon name="medal" /><span>バッジ</span><Dot isNew={unseenBadges(s) > 0} /></button>
        {s.graduatedAt && <button class="qbtn" onClick={() => go("/cert")}><Icon name="trophy" /><span>修了証</span></button>}
      </nav>

      <CourseMap onOpen={setSheet} currentId={cur?.id ?? null} />

      <ChapterSheet cid={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

export function ThemeButton() {
  const s = useAppState();
  const dark = s.settings.theme === "dark" || (s.settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button class="icon-btn" aria-label={dark ? "ライトにする" : "ダークにする"}
      onClick={() => update((st) => (st.settings.theme = dark ? "light" : "dark"))}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

const ROW = 138;

function CourseMap({ onOpen, currentId }: { onOpen: (id: string) => void; currentId: string | null }) {
  const s = useAppState();
  const xs = chapters.map((_, i) => 50 + Math.sin(i * 1.05) * 26);
  const h = chapters.length * ROW;
  return (
    <section class="map" style={{ height: `${h}px` }} aria-label="コースマップ">
      <svg class="map-path" viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden="true">
        {chapters.slice(1).map((c, i) => {
          const a = chapters[i];
          const sa = chapterStatus(s, a);
          const sb = chapterStatus(s, c);
          const dashed = sa === "skipped" || sb === "skipped";
          const lit = (sa === "cleared" || sa === "skipped") && sb !== "locked";
          return (
            <line x1={xs[i]} y1={i * ROW + 40} x2={xs[i + 1]} y2={(i + 1) * ROW + 40}
              class={`seg ${lit ? "lit" : ""} ${dashed ? "dashed" : ""}`} vector-effect="non-scaling-stroke" />
          );
        })}
      </svg>
      {chapters.map((c, i) => {
        const st = chapterStatus(s, c);
        const done = lessonsDone(s, c);
        return (
          <div class={`node st-${st}`} style={{ top: `${i * ROW}px`, left: `${xs[i]}%` }} key={c.id}>
            <button class="node-btn" onClick={() => (st === "locked" ? toast("前の章をクリアするか、スキップすると開きます") : onOpen(c.id))}
              aria-label={`第${c.num}章 ${c.title}（${STATUS_LABEL[st]}）`}>
              {st === "current" && <Ring value={done / c.lessons.length} size={84} stroke={5} tone="primary" />}
              <span class="node-face">
                {st === "cleared" ? <Icon name="check" size={30} /> : st === "locked" ? <Icon name="lock" size={22} /> : c.num === 15 ? <Icon name="trophy" size={26} /> : c.num}
              </span>
            </button>
            <div class="node-label">
              <span class="node-num">{c.num === 15 ? "最終章" : `第${c.num}章`}</span>
              <span class="node-title">{c.title}</span>
              {st === "skipped" && <span class="node-tag">スキップ中</span>}
            </div>
            {c.id === currentId && <div class="node-mascot"><Mascot size={44} /></div>}
          </div>
        );
      })}
    </section>
  );
}

const STATUS_LABEL = { cleared: "クリア", skipped: "スキップ中", current: "いまの章", open: "挑戦できる", locked: "まだ開いていない" };

function ChapterSheet({ cid, onClose }: { cid: string | null; onClose: () => void }) {
  const s = useAppState();
  const c: Chapter | undefined = chapters.find((x) => x.id === cid);
  if (!c) return <BottomSheet open={false} onClose={onClose} label="" children={null} />;
  const st = chapterStatus(s, c);
  const done = lessonsDone(s, c);
  const left = lessonsLeft(s, c);
  const hasCheck = c.check.length > 0;
  const nextL = c.lessons.find((l) => !s.lessons[l.id]?.done);

  async function begin(lid: string) {
    const ss = getState().session;
    if (!(ss && ss.kind === "lesson" && ss.ref === lid) && !(await confirmLeaveSession())) return;
    update((st2) => startLesson(st2, lid));
    onClose();
    go("/play");
  }
  async function check() {
    if (!(await confirmLeaveSession())) return;
    update((st2) => startCheck(st2, c!.id));
    onClose();
    go("/play");
  }
  function skip() {
    const prev = getState().chapters[c!.id];
    update((st2) => skipChapter(st2, c!.id));
    onClose();
    toast(`第${c!.num}章を飛ばしました`, {
      action: {
        label: "元に戻す",
        run: () => update((st2) => {
          if (prev) st2.chapters[c!.id] = prev;
          else delete st2.chapters[c!.id];
        }),
      },
    });
  }
  function unskip() {
    update((st2) => unskipChapter(st2, c!.id));
    toast(`第${c!.num}章のスキップを取り消しました`, {
      action: { label: "元に戻す", run: () => update((st2) => skipChapter(st2, c!.id)) },
    });
  }

  return (
    <BottomSheet open={!!cid} onClose={onClose} label={`第${c.num}章 ${c.title}`}>
      <div class="ch">
        <div class="ch-head">
          <div>
            <div class="ch-num">{c.num === 15 ? "最終章" : `第${c.num}章`} ・ {STATUS_LABEL[st]}</div>
            <Kinetic text={c.title} as="h2" class="ch-title" key={c.id} />
            <p class="ch-desc">{c.desc}</p>
          </div>
          <Ring value={isCleared(s, c) ? 1 : done / c.lessons.length} size={76} stroke={7} tone={isCleared(s, c) ? "green" : "primary"}
            label={`${c.lessons.length}レッスン中${done}レッスン完了`}>
            <span class="ring-txt"><b>{done}</b>/{c.lessons.length}</span>
          </Ring>
        </div>
        {!isCleared(s, c) && <p class="ch-left">この章のクリアまであと<b>{left}</b>レッスン</p>}
        <ol class="lessons">
          {c.lessons.map((l, i) => {
            const rec = s.lessons[l.id];
            const isNext = l.id === nextL?.id;
            return (
              <li>
                <button class={`lesson ${rec?.done ? "done" : ""} ${isNext ? "next" : ""}`} onClick={() => begin(l.id)}>
                  <span class="l-idx">{rec?.done ? <Icon name="check" size={16} /> : i + 1}</span>
                  <span class="l-title">{l.title}</span>
                  <span class="l-meta">{rec?.done ? `正解率 ${Math.round(rec.bestAcc * 100)}%` : `${l.problems.length}問`}</span>
                  <Icon name="chevron" size={18} />
                </button>
              </li>
            );
          })}
        </ol>
        <div class="ch-actions">
          {hasCheck && (
            <button class="btn" onClick={check}>
              <Icon name="flag" size={16} />{isCleared(s, c) ? "理解度チェック（4問）" : "この章は知っている"}
            </button>
          )}
          {!isCleared(s, c) && !isSkipped(s, c) && c.num !== 15 && (
            <button class="btn ghost" onClick={skip}><Icon name="skip" size={16} />とりあえず飛ばす</button>
          )}
          {isSkipped(s, c) && (
            <button class="btn ghost" onClick={unskip}><Icon name="undo" size={16} />スキップを取り消す</button>
          )}
        </div>
        {hasCheck && !isCleared(s, c) && <p class="note">理解度チェックは4問。3問以上正解でこの章をクリアにできます。</p>}
      </div>
    </BottomSheet>
  );
}
