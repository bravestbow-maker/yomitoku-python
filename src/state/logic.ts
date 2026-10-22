// アプリの記録と、問題を解く流れのルール。画面から切り離して、テストしやすくしている。
import { addDays, today } from "../lib/date.ts";
import type { Chapter } from "../lib/types.ts";
import { chapters, getLesson, getProblem } from "./course.ts";

export type Theme = "auto" | "light" | "dark";
export type SessionKind = "lesson" | "check" | "review" | "diag";

export interface Result {
  miss: number;
  revealed: boolean;
  correct: boolean; // 正解した（答えを見た場合は false）
  done: boolean;
  firstTry: boolean;
  xp: number;
}

export interface Session {
  kind: SessionKind;
  ref: string;
  queue: string[];
  idx: number;
  results: Record<string, Result>;
  combo: number;
  maxCombo: number;
  xpGained: number;
  ms: number;
  draft: string;
  finished: boolean;
  diagWrongRun?: number;
  removedFromReview?: number;
}

export interface AppState {
  v: 1;
  onboarded: boolean;
  chapters: Record<string, { skip?: "user" | "diag"; checkPassed?: boolean }>;
  lessons: Record<string, { done: boolean; plays: number; bestAcc: number; bestMs: number }>;
  xp: number;
  streak: { count: number; last: string | null };
  review: Record<string, { streak: number; at: number }>;
  badges: Record<string, { at: number; seen: boolean }>;
  zukanSeen: number[];
  session: Session | null;
  lastSummary: Summary | null;
  settings: { theme: Theme; sound: boolean; rate: 0 | 1 | 2 };
  stats: Record<string, { correct: number; wrong: number; ms: number }>;
  graduatedAt: number | null;
}

export interface Summary {
  kind: SessionKind;
  ref: string;
  total: number;
  firstTry: number;
  correct: number;
  ms: number;
  xp: number;
  maxCombo: number;
  noMiss: boolean;
  passed?: boolean;
  diagSkipped?: number[];
  removedFromReview?: number;
  levelBefore: number;
}

export const XP_CORRECT = 10;
export const XP_FIRST_TRY = 5;
export const XP_PER_LEVEL = 100;
export const REVIEW_BATCH = 8;

export function initialState(): AppState {
  return {
    v: 1,
    onboarded: false,
    chapters: {},
    lessons: {},
    xp: 0,
    streak: { count: 0, last: null },
    review: {},
    badges: {},
    zukanSeen: [],
    session: null,
    lastSummary: null,
    settings: { theme: "auto", sound: true, rate: 1 },
    stats: {},
    graduatedAt: null,
  };
}

// ---------- レベル・XP ----------
export const levelOf = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1;
export const xpToNext = (xp: number) => XP_PER_LEVEL - (xp % XP_PER_LEVEL);
export const levelProgress = (xp: number) => (xp % XP_PER_LEVEL) / XP_PER_LEVEL;

// ---------- 連続学習日数 ----------
/** 今日まだ解いていなくても、昨日まで続いていれば切れていない */
export function currentStreak(s: AppState, now = today()): number {
  if (!s.streak.last) return 0;
  if (s.streak.last === now || s.streak.last === addDays(now, -1)) return s.streak.count;
  return 0;
}

function bumpStreak(s: AppState, now = today()) {
  if (s.streak.last === now) return;
  s.streak.count = s.streak.last === addDays(now, -1) ? s.streak.count + 1 : 1;
  s.streak.last = now;
}

// ---------- 章の状態 ----------
export function lessonsDone(s: AppState, c: Chapter) {
  return c.lessons.filter((l) => s.lessons[l.id]?.done).length;
}

export function isCleared(s: AppState, c: Chapter): boolean {
  if (c.num === 15) return s.graduatedAt !== null;
  return lessonsDone(s, c) === c.lessons.length || !!s.chapters[c.id]?.checkPassed;
}

export function isSkipped(s: AppState, c: Chapter): boolean {
  return !isCleared(s, c) && !!s.chapters[c.id]?.skip;
}

export function isUnlocked(s: AppState, c: Chapter): boolean {
  return chapters.filter((x) => x.num < c.num).every((x) => isCleared(s, x) || isSkipped(s, x));
}

export type ChapterStatus = "cleared" | "skipped" | "current" | "open" | "locked";

export function chapterStatus(s: AppState, c: Chapter): ChapterStatus {
  if (isCleared(s, c)) return "cleared";
  if (isSkipped(s, c)) return "skipped";
  if (!isUnlocked(s, c)) return "locked";
  return currentChapter(s)?.id === c.id ? "current" : "open";
}

export function currentChapter(s: AppState): Chapter | null {
  return chapters.find((c) => !isCleared(s, c) && !isSkipped(s, c)) ?? null;
}

export function lessonsLeft(s: AppState, c: Chapter) {
  if (isCleared(s, c)) return 0;
  return c.lessons.length - lessonsDone(s, c);
}

export function overallProgress(s: AppState): number {
  const total = chapters.reduce((n, c) => n + c.lessons.length, 0);
  const done = chapters.reduce((n, c) => n + (isCleared(s, c) ? c.lessons.length : lessonsDone(s, c)), 0);
  return total ? done / total : 0;
}

/** 「続きから」で開くレッスン */
export function nextLessonId(s: AppState): string | null {
  const c = currentChapter(s);
  if (!c) return null;
  return c.lessons.find((l) => !s.lessons[l.id]?.done)?.id ?? null;
}

// ---------- スキップ ----------
export function skipChapter(s: AppState, cid: string, by: "user" | "diag" = "user") {
  s.chapters[cid] = { ...s.chapters[cid], skip: by };
}

export function unskipChapter(s: AppState, cid: string) {
  const c = s.chapters[cid];
  if (c) delete c.skip;
}

// ---------- セッション ----------
function newSession(kind: SessionKind, ref: string, queue: string[]): Session {
  return { kind, ref, queue, idx: 0, results: {}, combo: 0, maxCombo: 0, xpGained: 0, ms: 0, draft: "", finished: false };
}

export function startLesson(s: AppState, lid: string) {
  if (s.session && s.session.kind === "lesson" && s.session.ref === lid && !s.session.finished) return;
  const l = getLesson(lid)!.lesson;
  s.session = newSession("lesson", lid, l.problems.map((p) => p.id));
}

export function startCheck(s: AppState, cid: string) {
  const c = chapters.find((x) => x.id === cid)!;
  s.session = newSession("check", cid, c.check.map((p) => p.id));
}

export function reviewIds(s: AppState): string[] {
  return Object.entries(s.review)
    .filter(([id]) => getProblem(id))
    .sort((a, b) => a[1].at - b[1].at)
    .map(([id]) => id);
}

export function startReview(s: AppState): boolean {
  const ids = reviewIds(s).slice(0, REVIEW_BATCH);
  if (!ids.length) return false;
  s.session = newSession("review", "review", ids);
  return true;
}

export type Experience = "beginner" | "some" | "other";

export function startDiag(s: AppState, exp: Experience) {
  s.onboarded = true;
  if (exp === "beginner") {
    s.session = null;
    return;
  }
  if (!isCleared(s, chapters[0])) skipChapter(s, chapters[0].id, "diag");
  const ids = chapters.filter((c) => c.num >= 1 && c.num <= 14 && c.diag).map((c) => c.diag!.id);
  s.session = { ...newSession("diag", "diag", ids), diagWrongRun: 0 };
}

export const singleAttempt = (k: SessionKind) => k === "check" || k === "diag";

export function currentProblemId(s: AppState) {
  const ss = s.session;
  return ss ? ss.queue[ss.idx] : undefined;
}

function result(ss: Session, pid: string): Result {
  return (ss.results[pid] ??= { miss: 0, revealed: false, correct: false, done: false, firstTry: false, xp: 0 });
}

function stat(s: AppState, pid: string) {
  const cid = getProblem(pid)?.chapter.id ?? "c0";
  return (s.stats[cid] ??= { correct: 0, wrong: 0, ms: 0 });
}

function addReview(s: AppState, pid: string) {
  if (!s.review[pid]) s.review[pid] = { streak: 0, at: Date.now() };
  else s.review[pid].streak = 0;
}

/** 答えを判定したあとの記録。ok は判定の結果。 */
export function recordAnswer(s: AppState, ok: boolean, now = today()) {
  const ss = s.session;
  if (!ss || ss.finished) return;
  const pid = ss.queue[ss.idx];
  const r = result(ss, pid);
  if (r.done) return;
  ss.draft = "";
  if (ok) {
    r.correct = true;
    r.done = true;
    r.firstTry = r.miss === 0;
    r.xp = XP_CORRECT + (r.firstTry ? XP_FIRST_TRY : 0);
    ss.xpGained += r.xp;
    s.xp += r.xp;
    ss.combo = r.firstTry ? ss.combo + 1 : 0;
    ss.maxCombo = Math.max(ss.maxCombo, ss.combo);
    stat(s, pid).correct++;
    bumpStreak(s, now);
    if (ss.kind === "review" && s.review[pid]) {
      if (r.firstTry) s.review[pid].streak++;
      else s.review[pid].streak = 0;
      if (s.review[pid].streak >= 2) {
        delete s.review[pid];
        ss.removedFromReview = (ss.removedFromReview ?? 0) + 1;
      }
    }
    if (ss.kind === "diag") {
      ss.diagWrongRun = 0;
      const c = getProblem(pid)!.chapter;
      if (!isCleared(s, c)) skipChapter(s, c.id, "diag");
    }
  } else {
    r.miss++;
    ss.combo = 0;
    stat(s, pid).wrong++;
    if (ss.kind === "lesson") addReview(s, pid);
    if (ss.kind === "review" && s.review[pid]) s.review[pid].streak = 0;
    if (singleAttempt(ss.kind)) {
      r.done = true;
      if (ss.kind === "diag") ss.diagWrongRun = (ss.diagWrongRun ?? 0) + 1;
    }
  }
}

export function reveal(s: AppState) {
  const ss = s.session;
  if (!ss) return;
  const pid = ss.queue[ss.idx];
  const r = result(ss, pid);
  if (r.done) return;
  r.revealed = true;
  r.done = true;
  r.correct = false;
  r.xp = 0;
  ss.combo = 0;
  ss.draft = "";
  addReview(s, pid);
}

/** 次の問題へ。終わったら記録をまとめて Summary を返す。 */
export function advance(s: AppState): Summary | null {
  const ss = s.session;
  if (!ss) return null;
  const r = ss.results[ss.queue[ss.idx]];
  if (!r?.done) return null;
  const diagStop = ss.kind === "diag" && (ss.diagWrongRun ?? 0) >= 2;
  if (ss.idx + 1 < ss.queue.length && !diagStop) {
    ss.idx++;
    ss.draft = "";
    return null;
  }
  return finish(s);
}

export function finish(s: AppState): Summary {
  const ss = s.session!;
  const rs = ss.queue.map((id) => ss.results[id]).filter(Boolean);
  const firstTry = rs.filter((r) => r.firstTry).length;
  const correct = rs.filter((r) => r.correct).length;
  const sum: Summary = {
    kind: ss.kind,
    ref: ss.ref,
    total: ss.queue.length,
    firstTry,
    correct,
    ms: ss.ms,
    xp: ss.xpGained,
    maxCombo: ss.maxCombo,
    noMiss: rs.length === ss.queue.length && rs.every((r) => r.firstTry),
    levelBefore: levelOf(s.xp - ss.xpGained),
  };
  if (ss.kind === "lesson") {
    const prev = s.lessons[ss.ref];
    const acc = ss.queue.length ? firstTry / ss.queue.length : 0;
    s.lessons[ss.ref] = {
      done: true,
      plays: (prev?.plays ?? 0) + 1,
      bestAcc: Math.max(prev?.bestAcc ?? 0, acc),
      bestMs: prev?.bestMs ? Math.min(prev.bestMs, ss.ms) : ss.ms,
    };
    const ch = getLesson(ss.ref)!.chapter;
    const st = (s.stats[ch.id] ??= { correct: 0, wrong: 0, ms: 0 });
    st.ms += ss.ms;
    if (ch.num === 15 && ch.lessons.every((l) => s.lessons[l.id]?.done) && !s.graduatedAt) s.graduatedAt = Date.now();
  }
  if (ss.kind === "check") {
    sum.passed = correct >= 3;
    if (sum.passed) s.chapters[ss.ref] = { ...s.chapters[ss.ref], checkPassed: true };
  }
  if (ss.kind === "diag") {
    sum.diagSkipped = rs
      .map((r, i) => (r.correct ? getProblem(ss.queue[i])!.chapter.num : -1))
      .filter((n) => n >= 0);
    sum.total = rs.length;
  }
  if (ss.kind === "review") sum.removedFromReview = ss.removedFromReview ?? 0;
  s.session = null;
  s.lastSummary = sum;
  return sum;
}

export function quitSession(s: AppState) {
  s.session = null;
}

// ---------- バッジ ----------
export interface BadgeDef {
  id: string;
  label: string;
  icon: string;
  test: (s: AppState) => boolean;
}

export const BADGES: BadgeDef[] = [
  ...[2, 3, 5, 10, 15, 20].map((lv) => ({
    id: `lv-${lv}`,
    label: `レベル${lv}`,
    icon: "level",
    test: (s: AppState) => levelOf(s.xp) >= lv,
  })),
  ...[3, 7, 30].map((d) => ({
    id: `streak-${d}`,
    label: `${d}日連続`,
    icon: "flame",
    test: (s: AppState) => s.streak.count >= d,
  })),
  ...chapters.map((c) => ({
    id: `ch-${c.num}`,
    label: c.num === 15 ? "卒業" : `第${c.num}章クリア`,
    icon: c.num === 15 ? "trophy" : "chapter",
    test: (s: AppState) => isCleared(s, c),
  })),
];

/** 新しくもらえるバッジを記録して返す */
export function awardBadges(s: AppState, now = Date.now()): BadgeDef[] {
  const got: BadgeDef[] = [];
  for (const b of BADGES) {
    if (!s.badges[b.id] && b.test(s)) {
      s.badges[b.id] = { at: now, seen: false };
      got.push(b);
    }
  }
  return got;
}

export const unseenBadges = (s: AppState) => Object.values(s.badges).filter((b) => !b.seen).length;

export function unseenZukan(s: AppState) {
  return chapters.filter((c) => isCleared(s, c) && c.patterns.length && !s.zukanSeen.includes(c.num)).length;
}

// ---------- 保存データの読みこみ ----------
export function migrate(raw: unknown): AppState {
  const base = initialState();
  if (!raw || typeof raw !== "object" || (raw as AppState).v !== 1) return base;
  const r = raw as Partial<AppState>;
  const s: AppState = { ...base, ...r, settings: { ...base.settings, ...(r.settings ?? {}) }, streak: { ...base.streak, ...(r.streak ?? {}) } };
  // 問題データが変わって、セッションの問題がなくなっていたら破棄する
  if (s.session && !s.session.queue.every((id) => getProblem(id))) s.session = null;
  if (s.session && s.session.idx >= s.session.queue.length) s.session = null;
  return s;
}
