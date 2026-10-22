import data from "../data/course.json";
import type { Chapter, Course, Lesson, Problem } from "../lib/types.ts";

export const course = data as unknown as Course;
export const chapters: Chapter[] = course.chapters;

export interface ProblemRef {
  problem: Problem;
  chapter: Chapter;
  lesson: Lesson | null; // 理解度チェック・診断なら null
  index: number; // レッスン内の番号（0始まり）
  total: number;
}

const byId = new Map<string, ProblemRef>();
const lessonById = new Map<string, { lesson: Lesson; chapter: Chapter; index: number }>();
for (const c of chapters) {
  c.lessons.forEach((l, li) => {
    lessonById.set(l.id, { lesson: l, chapter: c, index: li });
    l.problems.forEach((p, i) => byId.set(p.id, { problem: p, chapter: c, lesson: l, index: i, total: l.problems.length }));
  });
  c.check.forEach((p, i) => byId.set(p.id, { problem: p, chapter: c, lesson: null, index: i, total: c.check.length }));
  if (c.diag) byId.set(c.diag.id, { problem: c.diag, chapter: c, lesson: null, index: 0, total: 1 });
}

export const getProblem = (id: string) => byId.get(id);
export const getLesson = (id: string) => lessonById.get(id);
export const getChapter = (id: string) => chapters.find((c) => c.id === id);
export const allLessons = chapters.flatMap((c) => c.lessons);

/** レッスンの前半だけ、行をタップして読み下しを見られる */
export function readingAllowed(ref: ProblemRef, kind: string): boolean {
  if (kind === "check" || kind === "diag") return false;
  if (!ref.lesson) return false;
  return ref.index < Math.ceil(ref.total / 2);
}

export const TYPE_LABEL: Record<string, string> = {
  output: "出力を当てる",
  value: "値を追う",
  blank: "読み下しの穴埋め",
  write: "読み下しからコードを書く",
  fill: "虫食いコード",
  bug: "まちがい探し",
};

/** その問題のコードに、スキップした章の書き方が出てくるか */
export function detectChapters(code: string, skippedNums: number[], selfNum: number): number[] {
  const hits: number[] = [];
  for (const c of chapters) {
    if (c.num >= selfNum || !c.detect || !skippedNums.includes(c.num)) continue;
    const re = new RegExp(c.detect, "m");
    if (re.test(code)) hits.push(c.num);
  }
  return hits;
}
