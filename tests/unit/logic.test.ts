import { describe, expect, it } from "vitest";
import { addDays } from "../../src/lib/date.ts";
import { chapters, getLesson } from "../../src/state/course.ts";
import {
  advance, awardBadges, chapterStatus, currentChapter, currentStreak, initialState, isCleared, levelOf, migrate,
  nextLessonId, recordAnswer, reveal, reviewIds, skipChapter, startCheck, startDiag, startLesson, startReview,
  unskipChapter, xpToNext, type AppState,
} from "../../src/state/logic.ts";

const D = "2026-10-22";
const fresh = () => {
  const s = initialState();
  s.onboarded = true;
  return s;
};
function solveLesson(s: AppState, lid: string, day = D) {
  startLesson(s, lid);
  for (;;) {
    recordAnswer(s, true, day);
    if (advance(s)) break;
  }
}

describe("XP とレベル", () => {
  it("一発正解は 15XP、2回目以降の正解は 10XP、答えを見たら 0", () => {
    const s = fresh();
    startLesson(s, "c0-l1");
    recordAnswer(s, true, D);
    expect(s.xp).toBe(15);
    advance(s);
    recordAnswer(s, false, D);
    recordAnswer(s, true, D);
    expect(s.xp).toBe(25);
    advance(s);
    reveal(s);
    expect(s.xp).toBe(25);
  });
  it("100XP ごとにレベルが上がる", () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(99)).toBe(1);
    expect(levelOf(100)).toBe(2);
    expect(xpToNext(85)).toBe(15);
    expect(xpToNext(100)).toBe(100);
  });
  it("同じ問題で何度 Enter しても XP は1回分だけ", () => {
    const s = fresh();
    startLesson(s, "c0-l1");
    recordAnswer(s, true, D);
    recordAnswer(s, true, D);
    expect(s.xp).toBe(15);
  });
});

describe("連続学習日数", () => {
  it("今日まだ解いていなくても、昨日まで続いていれば切れていない", () => {
    const s = fresh();
    s.streak = { count: 4, last: addDays(D, -1) };
    expect(currentStreak(s, D)).toBe(4);
    s.streak = { count: 4, last: addDays(D, -2) };
    expect(currentStreak(s, D)).toBe(0);
  });
  it("1問以上正解した日が続くと増え、途切れると1にもどる", () => {
    const s = fresh();
    startLesson(s, "c0-l1");
    recordAnswer(s, true, addDays(D, -2));
    advance(s);
    recordAnswer(s, true, addDays(D, -1));
    advance(s);
    recordAnswer(s, true, addDays(D, -1));
    expect(s.streak.count).toBe(2);
    advance(s);
    recordAnswer(s, true, addDays(D, 1));
    expect(s.streak.count).toBe(1);
  });
  it("不正解だけの日は数えない", () => {
    const s = fresh();
    startLesson(s, "c0-l1");
    recordAnswer(s, false, D);
    expect(s.streak.count).toBe(0);
  });
  it("月またぎ・年またぎでも続く", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("章の解放とスキップ", () => {
  it("はじめは第0章だけが開いている", () => {
    const s = fresh();
    expect(chapterStatus(s, chapters[0])).toBe("current");
    expect(chapterStatus(s, chapters[1])).toBe("locked");
  });
  it("スキップした章は飛ばして先へ進める。取り消すと元にもどる", () => {
    const s = fresh();
    skipChapter(s, "c0");
    expect(chapterStatus(s, chapters[0])).toBe("skipped");
    expect(currentChapter(s)?.num).toBe(1);
    skipChapter(s, "c1");
    expect(currentChapter(s)?.num).toBe(2);
    unskipChapter(s, "c1");
    unskipChapter(s, "c0");
    expect(currentChapter(s)?.num).toBe(0);
    expect(chapterStatus(s, chapters[1])).toBe("locked");
  });
  it("全レッスンを終えると章クリア", () => {
    const s = fresh();
    for (const l of chapters[0].lessons) solveLesson(s, l.id);
    expect(isCleared(s, chapters[0])).toBe(true);
    expect(nextLessonId(s)).toBe("c1-l1");
  });
});

describe("理解度チェック", () => {
  it("4問中3問以上正解で章をクリアにする", () => {
    const s = fresh();
    skipChapter(s, "c0");
    startCheck(s, "c1");
    [true, false, true, true].forEach((ok) => {
      recordAnswer(s, ok, D);
      advance(s);
    });
    expect(s.lastSummary?.passed).toBe(true);
    expect(isCleared(s, chapters[1])).toBe(true);
  });
  it("2問だと不合格で、章はクリアにならない", () => {
    const s = fresh();
    startCheck(s, "c1");
    [true, false, false, true].forEach((ok) => {
      recordAnswer(s, ok, D);
      advance(s);
    });
    expect(s.lastSummary?.passed).toBe(false);
    expect(isCleared(s, chapters[1])).toBe(false);
  });
  it("チェックは1回勝負：不正解で次へ進める", () => {
    const s = fresh();
    startCheck(s, "c1");
    recordAnswer(s, false, D);
    expect(advance(s)).toBeNull();
    expect(s.session?.idx).toBe(1);
  });
});

describe("レベル診断", () => {
  it("2問続けて間違えたら終わり、正解した章はスキップ済み、第0章もスキップ", () => {
    const s = initialState();
    startDiag(s, "some");
    [true, true, false, true, false, false].forEach((ok) => {
      recordAnswer(s, ok, D);
      advance(s);
    });
    expect(s.session).toBeNull();
    expect(s.lastSummary?.diagSkipped).toEqual([1, 2, 4]);
    expect(s.lastSummary?.total).toBe(6);
    expect(chapterStatus(s, chapters[0])).toBe("skipped");
    expect(chapterStatus(s, chapters[3])).toBe("current");
  });
  it("「はじめて」なら診断なしで第0章から", () => {
    const s = initialState();
    startDiag(s, "beginner");
    expect(s.onboarded).toBe(true);
    expect(s.session).toBeNull();
    expect(currentChapter(s)?.num).toBe(0);
  });
  it("全問正解なら14章ぶんスキップ、次は卒業試験", () => {
    const s = initialState();
    startDiag(s, "other");
    for (;;) {
      recordAnswer(s, true, D);
      if (advance(s)) break;
    }
    expect(s.lastSummary?.diagSkipped?.length).toBe(14);
    expect(currentChapter(s)?.num).toBe(15);
  });
});

describe("要復習", () => {
  it("間違えた問題と、答えを見た問題が入る", () => {
    const s = fresh();
    startLesson(s, "c0-l1");
    recordAnswer(s, false, D);
    recordAnswer(s, true, D);
    advance(s);
    reveal(s);
    expect(reviewIds(s)).toEqual(["c0-l1-p1", "c0-l1-p2"]);
  });
  it("0件なら復習は始まらない", () => {
    const s = fresh();
    expect(startReview(s)).toBe(false);
  });
  it("2回続けて正解したら外れる。途中で間違えたらやり直し", () => {
    const s = fresh();
    s.review["c0-l1-p1"] = { streak: 0, at: 1 };
    const round = (ok: boolean) => {
      startReview(s);
      recordAnswer(s, ok, D);
      advance(s);
    };
    round(true);
    expect(s.review["c0-l1-p1"].streak).toBe(1);
    round(false);
    expect(s.review["c0-l1-p1"].streak).toBe(0);
    round(true);
    round(true);
    expect(s.review["c0-l1-p1"]).toBeUndefined();
  });
});

describe("途中で閉じて開き直す", () => {
  it("保存したデータから、同じ問題・同じ下書きで再開できる", () => {
    const s = fresh();
    startLesson(s, "c1-l2");
    recordAnswer(s, true, D);
    advance(s);
    s.session!.draft = "print(";
    const back = migrate(JSON.parse(JSON.stringify(s)));
    expect(back.session?.idx).toBe(1);
    expect(back.session?.draft).toBe("print(");
    expect(back.xp).toBe(15);
  });
  it("問題データから消えた問題のセッションは捨てる", () => {
    const s = fresh();
    startLesson(s, "c1-l2");
    s.session!.queue[0] = "nothing";
    expect(migrate(JSON.parse(JSON.stringify(s))).session).toBeNull();
  });
  it("こわれたデータは初期値にもどす", () => {
    expect(migrate("abc").onboarded).toBe(false);
    expect(migrate({ v: 99 }).xp).toBe(0);
    expect(migrate(null).settings.sound).toBe(true);
  });
  it("同じレッスンを開き直すと、途中から続く", () => {
    const s = fresh();
    startLesson(s, "c0-l1");
    recordAnswer(s, true, D);
    advance(s);
    startLesson(s, "c0-l1");
    expect(s.session?.idx).toBe(1);
  });
});

describe("バッジ", () => {
  it("レベルアップ・章クリア・連続日数でもらえ、同じバッジは1回だけ", () => {
    const s = fresh();
    s.xp = 120;
    s.streak = { count: 3, last: D };
    for (const l of chapters[0].lessons) solveLesson(s, l.id);
    const got = awardBadges(s).map((b) => b.id);
    expect(got).toEqual(expect.arrayContaining(["lv-2", "streak-3", "ch-0"]));
    expect(awardBadges(s)).toEqual([]);
  });
});

describe("卒業", () => {
  it("卒業試験の全レッスンを終えると修了", () => {
    const s = fresh();
    for (const c of chapters.slice(0, 15)) skipChapter(s, c.id);
    for (const l of chapters[15].lessons) solveLesson(s, l.id);
    expect(s.graduatedAt).not.toBeNull();
    expect(isCleared(s, chapters[15])).toBe(true);
    expect(getLesson("c15-l1")?.lesson.problems.length).toBeGreaterThanOrEqual(5);
  });
});
