import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Course, Problem } from "../../src/lib/types.ts";

export const course: Course = JSON.parse(readFileSync(new URL("../../src/data/course.json", import.meta.url), "utf8"));
const all = new Map<string, Problem>();
for (const c of course.chapters) {
  for (const l of c.lessons) l.problems.forEach((p) => all.set(p.id, p));
  c.check.forEach((p) => all.set(p.id, p));
  if (c.diag) all.set(c.diag.id, c.diag);
}
export const problem = (id: string) => all.get(id)!;
export const KEY = "yomitoku-python:v1";

export function baseState(extra: Record<string, unknown> = {}) {
  return {
    v: 1, onboarded: true, chapters: {}, lessons: {}, xp: 0, streak: { count: 0, last: null }, review: {}, badges: {},
    zukanSeen: [], session: null, lastSummary: null, settings: { theme: "light", sound: false, rate: 1 }, stats: {},
    graduatedAt: null, ...extra,
  };
}

export function session(kind: string, ref: string, queue: string[], idx = 0, extra: Record<string, unknown> = {}) {
  return { kind, ref, queue, idx, results: {}, combo: 0, maxCombo: 0, xpGained: 0, ms: 0, draft: "", finished: false, ...extra };
}

/** 最初の1回だけ、保存データを入れた状態でページを開く */
export async function seed(page: Page, state: unknown, path = "/") {
  await page.goto("about:blank");
  await page.addInitScript(([k, v]) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem(k, v);
      sessionStorage.setItem("seeded", "1");
    }
  }, [KEY, JSON.stringify(state)] as const);
  await page.goto(`/#${path}`);
}

export const input = (page: Page) => page.getByLabel("答えの入力欄（Enterで判定）");

export async function currentPid(page: Page) {
  return (await page.locator(".play").getAttribute("data-pid"))!;
}

/** 入力して Enter。改行は Shift+Enter で入れる */
export async function type(page: Page, text: string) {
  const box = input(page);
  await box.click();
  await box.fill("");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    await box.pressSequentially(lines[i]);
    if (i < lines.length - 1) await box.press("Shift+Enter");
  }
  await box.press("Enter");
}

export async function answerCorrect(page: Page) {
  const pid = await currentPid(page);
  await type(page, problem(pid).answers[0]);
  await expect(page.locator(".play")).toHaveAttribute("data-solved", "1");
}

export async function next(page: Page) {
  await page.locator(".after-actions .btn.primary").click();
}

export async function stored(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), KEY);
}
