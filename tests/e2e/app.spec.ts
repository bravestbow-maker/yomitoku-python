import { expect, test } from "@playwright/test";
import { answerCorrect, baseState, currentPid, input, next, problem, seed, session, stored, type } from "./helpers.ts";

test.describe("はじめて開いたとき", () => {
  test("「はじめて」を選ぶと、すぐ第0章の1問目が開く", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Python を読んだことはありますか？")).toBeVisible();
    await page.getByRole("button", { name: /はじめて/ }).click();
    await expect(page.locator(".play")).toHaveAttribute("data-pid", "c0-l1-p1");
    await expect(page.getByText("1/6問")).toBeVisible();
  });

  test("間違えると揺れて、2回でヒント、3回で「答えを見る」。答えを見た問題は要復習に入る", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c0-l1", problemIds("c0-l1")) }), "/play");
    await type(page, "イコール");
    await expect(page.locator(".term.shake")).toBeVisible();
    await expect(page.getByText("ヒント")).toHaveCount(0);
    await type(page, "足す");
    await expect(page.getByText("ヒント", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "答えを見る" })).toHaveCount(0);
    await type(page, "等しい");
    await page.getByRole("button", { name: "答えを見る" }).click();
    await expect(page.getByText("答えを確認しました")).toBeVisible();
    const s = await stored(page);
    expect(Object.keys(s.review)).toEqual(["c0-l1-p1"]);
    expect(s.xp).toBe(0);
  });

  test("ひらがなでも正解。正解すると全行の読み下しが出て、Enter で次へ", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c0-l1", ["c0-l1-p1", "c0-l1-p2"]) }), "/play");
    await type(page, "いれる");
    await expect(page.getByText("一発正解！")).toBeVisible();
    await expect(page.locator(".rd").first()).toHaveText("xに5を入れる");
    await page.keyboard.press("Enter");
    await expect(page.locator(".play")).toHaveAttribute("data-pid", "c0-l1-p2");
  });

  test("空のまま Enter しても、間違いに数えない", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c0-l1", ["c0-l1-p1"]) }), "/play");
    await input(page).press("Enter");
    await expect(page.getByText("答えを入力してから Enter を押してね")).toBeVisible();
    const s = await stored(page);
    expect(s.session.results).toEqual({});
  });
});

test.describe("レッスンを通して解く", () => {
  test("第0章レッスン1をノーミスで解くと、結果と紙吹雪、記録が残る", async ({ page }) => {
    await seed(page, baseState(), "/");
    await page.getByRole("button", { name: /はじめる/ }).click();
    for (let i = 0; i < 6; i++) {
      await answerCorrect(page);
      await next(page);
    }
    await expect(page.getByRole("heading", { name: "ノーミス！" })).toBeVisible();
    await expect(page.getByText("一発正解の割合")).toBeVisible();
    await expect(page.getByRole("button", { name: /通して音読/ })).toBeVisible();
    const s = await stored(page);
    expect(s.lessons["c0-l1"].done).toBe(true);
    expect(s.xp).toBe(90);
    expect(s.streak.count).toBe(1);
    await page.getByRole("button", { name: /次のレッスンへ/ }).click();
    await expect(page.locator(".play")).toHaveAttribute("data-pid", "c0-l2-p1");
  });

  test("途中で閉じて開き直すと、同じ問題・同じ入力の続きから", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c1-l1", problemIds("c1-l1")) }), "/play");
    await answerCorrect(page);
    await next(page);
    await input(page).fill('print("Hel');
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.locator(".play")).toHaveAttribute("data-pid", "c1-l1-p2");
    await expect(input(page)).toHaveValue('print("Hel');
    await page.getByRole("button", { name: /中断してマップへ/ }).click();
    await expect(page.getByText(/2問目から/)).toBeVisible();
    await page.getByRole("button", { name: /続きから/ }).click();
    await expect(page.locator(".play")).toHaveAttribute("data-pid", "c1-l1-p2");
  });

  test("出力を当てる問題で、何行目がちがうかを示す", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c0-l3", ["c0-l3-p2"]) }), "/play");
    await type(page, "0\n1\n3");
    await expect(page.getByText("3行目がちがいます")).toBeVisible();
    await type(page, "0\n1\n2");
    await expect(page.getByText(/正解！/).first()).toBeVisible();
  });

  test("前半の問題は行をタップで読み下しが出る", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c1-l2", problemIds("c1-l2"), 1) }), "/play");
    await page.locator(".cl.tap").first().click();
    await expect(page.locator(".rd").first()).toBeVisible();
  });

  test("後半の問題では読み下しも音読も出ない", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c1-l2", problemIds("c1-l2"), 5) }), "/play");
    await expect(page.locator(".cl.tap")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /音読/ })).toHaveCount(0);
  });

  test("自分で読むモード：答え合わせで1行ずつ読み下しが出る", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c0-l3", ["c0-l3-p2"]) }), "/play");
    await page.getByRole("button", { name: /自分で読む/ }).click();
    await expect(page.locator(".cl.active")).toHaveCount(1);
    await expect(page.locator(".rd")).toHaveCount(0);
    await page.getByRole("button", { name: "答え合わせ" }).click();
    await expect(page.locator(".rd")).toHaveCount(1);
    await page.getByRole("button", { name: "次の行へ" }).click();
    await page.getByRole("button", { name: "答え合わせ" }).click();
    await expect(page.locator(".rd").nth(1)).toContainText("ここから");
  });
});

test.describe("Python で実行して判定", () => {
  test("コードを書く問題は、書き方がちがっても出力が同じなら正解", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c2-l3", ["c2-l3-p7"]) }), "/play");
    await type(page, "count = 1 + count");
    await expect(page.getByText(/正解！/).first()).toBeVisible({ timeout: 40_000 });
  });

  test("値を固定して書きかえても、ちがう出力なら不正解", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c2-l1", ["c2-l1-p5"]) }), "/play");
    await type(page, "print(120)");
    await expect(page.getByText(/ちがいます/)).toBeVisible({ timeout: 40_000 });
  });

  test("ずっと終わらないコードは止めて知らせ、そのあとも使える", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c6-l4", ["c6-l4-p6"]) }), "/play");
    await type(page, "while True: pass");
    await expect(page.getByText(/時間がかかりすぎた/)).toBeVisible({ timeout: 40_000 });
    await type(page, "continue");
    await expect(page.getByText(/正解！/).first()).toBeVisible({ timeout: 40_000 });
  });

  test("動かしてみる：書きかえて実行でき、正解には影響しない", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c0-l1", ["c0-l1-p3"]) }), "/play");
    await answerCorrect(page);
    await page.getByRole("button", { name: /動かしてみる/ }).click();
    const src = page.getByLabel("実行するコード");
    await src.fill("x = 5\nprint(x * 3)");
    await page.getByRole("button", { name: "実行", exact: true }).click();
    await expect(page.locator(".pg-out")).toHaveText("15\n", { timeout: 40_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("実行するコード")).toHaveCount(0);
    expect((await stored(page)).session.results["c0-l1-p3"].correct).toBe(true);
  });
});

test.describe("診断・スキップ・理解度チェック", () => {
  test("診断：2問続けて間違えたら終わり、正解した章はスキップ済み", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /少し書いたことがある/ }).click();
    await answerCorrect(page); // 第1章
    await next(page);
    await answerCorrect(page); // 第2章
    await next(page);
    await type(page, "わからない");
    await expect(page.getByText(/正解は/).first()).toBeVisible();
    await next(page);
    await type(page, "わからない");
    await next(page);
    await expect(page.getByText(/知っていた章：第1章、第2章/)).toBeVisible();
    await page.getByRole("button", { name: "マップへ" }).click();
    await expect(page.getByRole("button", { name: "第0章 はじめに（スキップ中）" })).toBeVisible();
    await expect(page.getByRole("button", { name: "第3章 型と変換（いまの章）" })).toBeVisible();
  });

  test("スキップ → 元に戻す を続けても正しくもどる", async ({ page }) => {
    await seed(page, baseState(), "/");
    await page.getByRole("button", { name: /第0章 はじめに/ }).click();
    await page.getByRole("button", { name: /とりあえず飛ばす/ }).click();
    await page.getByRole("button", { name: /第1章 表示と計算/ }).click();
    await page.getByRole("button", { name: /とりあえず飛ばす/ }).click();
    await expect(page.getByRole("button", { name: "第2章 変数（いまの章）" })).toBeVisible();
    await page.getByRole("button", { name: "元に戻す" }).last().click();
    await page.getByRole("button", { name: "元に戻す" }).last().click();
    await expect(page.getByRole("button", { name: "第0章 はじめに（いまの章）" })).toBeVisible();
    expect((await stored(page)).chapters).toEqual({});
  });

  test("まだ開いていない章をタップすると案内が出る", async ({ page }) => {
    await seed(page, baseState(), "/");
    await page.getByRole("button", { name: /第5章 リスト/ }).click();
    await expect(page.getByText("前の章をクリアするか、スキップすると開きます")).toBeVisible();
  });

  test("「この章は知っている」→ 4問中3問正解で章クリア", async ({ page }) => {
    await seed(page, baseState({ chapters: { c0: { skip: "user" } } }), "/");
    await page.getByRole("button", { name: /第1章 表示と計算/ }).click();
    await page.getByRole("button", { name: /この章は知っている/ }).click();
    await answerCorrect(page);
    await next(page);
    await type(page, "0");
    await next(page);
    await answerCorrect(page);
    await next(page);
    await answerCorrect(page);
    await next(page);
    await expect(page.getByRole("heading", { name: "合格！" })).toBeVisible();
    await page.getByRole("button", { name: "マップへ" }).click();
    await expect(page.getByRole("button", { name: "第1章 表示と計算（クリア）" })).toBeVisible();
  });

  test("スキップした章の書き方が出てくると「この書き方は第◯章」と案内する", async ({ page }) => {
    const skipped = { c0: { skip: "user" }, c1: { skip: "user" }, c2: { skip: "user" }, c3: { skip: "user" } };
    await seed(page, baseState({ chapters: skipped, session: session("lesson", "c4-l2", ["c4-l2-p4"]) }), "/play");
    await expect(page.getByText("この書き方は第1章")).toBeVisible();
  });
});

test.describe("復習・図鑑・バッジ・設定", () => {
  test("復習が0件なら知らせる", async ({ page }) => {
    await seed(page, baseState(), "/");
    await page.getByRole("button", { name: /^復習/ }).click();
    await expect(page.getByText(/復習する問題はありません/)).toBeVisible();
  });

  test("復習で2回続けて正解すると要復習から外れる", async ({ page }) => {
    await seed(page, baseState({ review: { "c1-l1-p1": { streak: 1, at: 1 } } }), "/");
    await expect(page.locator(".qbtn .dot")).toHaveText("1");
    await page.getByRole("button", { name: /^復習/ }).click();
    await answerCorrect(page);
    await next(page);
    await expect(page.getByText("1問が要復習から外れました")).toBeVisible();
    expect((await stored(page)).review).toEqual({});
  });

  test("図鑑：クリアした章だけ開き、まだの章は鍵つき", async ({ page }) => {
    await seed(page, baseState({ lessons: { "c0-l1": { done: true }, "c0-l2": { done: true }, "c0-l3": { done: true } } }), "/");
    await expect(page.getByRole("button", { name: /よみかた図鑑/ }).locator(".dot-new")).toBeVisible();
    await page.getByRole("button", { name: /よみかた図鑑/ }).click();
    await expect(page.getByText("＝は「入れる」")).toBeVisible();
    await expect(page.getByText(/第1章をクリアすると見られます/)).toBeVisible();
    await page.getByRole("tab", { name: "ことば" }).click();
    await expect(page.getByText("値に名前をつけて入れておく箱")).toBeVisible();
  });

  test("レベルアップするとバッジがもらえ、NEW が出る", async ({ page }) => {
    await seed(page, baseState({ xp: 95, session: session("lesson", "c0-l1", ["c0-l1-p1", "c0-l1-p2"]) }), "/play");
    await answerCorrect(page);
    await expect(page.getByText("LEVEL UP")).toBeVisible();
    await expect(page.getByText("バッジ獲得：レベル2")).toBeVisible();
    await page.getByRole("button", { name: /中断してマップへ/ }).click();
    await page.getByRole("button", { name: /バッジ/ }).click();
    await expect(page.locator(".badge.has")).toHaveCount(1);
  });

  test("設定：テーマと効果音を変えると保存される", async ({ page }) => {
    await seed(page, baseState(), "/settings");
    await page.getByRole("radio", { name: "ダーク" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("radio", { name: "端末に合わせる" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    await page.locator(".switch").click();
    await page.reload();
    const s = await stored(page);
    expect(s.settings.theme).toBe("auto");
    expect(s.settings.sound).toBe(true);
  });

  test("記録をすべて消す：やめると残り、確認すると消える", async ({ page }) => {
    await seed(page, baseState({ xp: 230 }), "/settings");
    await page.getByRole("button", { name: "記録をすべて消す" }).click();
    await page.getByRole("button", { name: "やめる" }).click();
    expect((await stored(page)).xp).toBe(230);
    await page.getByRole("button", { name: "記録をすべて消す" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "すべて消す" }).click();
    await expect(page.getByText("Python を読んだことはありますか？")).toBeVisible();
    expect((await stored(page))?.xp ?? 0).toBe(0);
  });

  test("別のレッスンを始めるときは、解きかけの記録が消えることを確認する", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c0-l1", problemIds("c0-l1"), 2) }), "/");
    await page.getByRole("button", { name: /第0章 はじめに/ }).click();
    await page.getByRole("button", { name: /繰り返しと関数の読み方/ }).click();
    await expect(page.getByText("今のレッスンをやめますか？")).toBeVisible();
    await page.getByRole("button", { name: "やめる", exact: true }).click();
    expect((await stored(page)).session.ref).toBe("c0-l1");
  });
});

test.describe("卒業", () => {
  test("修了証に全章の学習記録が出る", async ({ page }) => {
    const lessons: Record<string, unknown> = {};
    for (const id of ["c15-l1", "c15-l2", "c15-l3"]) lessons[id] = { done: true, plays: 1, bestAcc: 1, bestMs: 1000 };
    const chapters: Record<string, unknown> = {};
    for (let i = 0; i < 15; i++) chapters[`c${i}`] = { skip: "diag" };
    await seed(page, baseState({ lessons, chapters, graduatedAt: Date.now(), xp: 410, stats: { c15: { correct: 23, wrong: 2, ms: 600000 } } }), "/cert");
    await expect(page.getByRole("heading", { name: "よみとくPython 修了" })).toBeVisible();
    await expect(page.locator(".rec tbody tr")).toHaveCount(16);
  });

  test("卒業試験は、注目する行以外がうすく表示される", async ({ page }) => {
    await seed(page, baseState({ session: session("lesson", "c15-l1", problemIds("c15-l1"), 4) }), "/play");
    await expect(page.locator(".cl.dim").first()).toBeVisible();
    await answerCorrect(page);
  });
});

test("スマホでは記号の補助バーで入力できる", async ({ page, isMobile }) => {
  test.skip(!isMobile, "スマホだけ");
  await seed(page, baseState({ session: session("lesson", "c1-l1", ["c1-l1-p4"]) }), "/play");
  await input(page).fill("print");
  await page.locator(".keybar").getByRole("button", { name: "(", exact: true }).click();
  await expect(input(page)).toHaveValue("print(");
  await expect(page.locator(".keybar").getByRole("button", { name: "インデント" })).toBeVisible();
});

function problemIds(lid: string) {
  const ids: string[] = [];
  for (let i = 1; i <= 8; i++) if (problem(`${lid}-p${i}`)) ids.push(`${lid}-p${i}`);
  return ids;
}

test("全ページにエラーが出ない", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, baseState({ xp: 50 }), "/");
  for (const path of ["/", "/zukan", "/badges", "/settings", "/cert", "/welcome", "/readthrough/c1-l1"]) {
    await page.goto(`/#${path}`);
    await page.waitForTimeout(250);
  }
  expect(errors).toEqual([]);
  expect(await currentPidSafe(page)).toBeNull();
});

async function currentPidSafe(page: import("@playwright/test").Page) {
  return (await page.locator(".play").count()) ? currentPid(page) : null;
}

test("ボトムシートは下にスワイプすると閉じる", async ({ page }) => {
  await seed(page, baseState(), "/");
  await page.getByRole("button", { name: /第0章 はじめに/ }).click();
  const grip = page.getByLabel("下にスワイプして閉じる");
  await expect(grip).toBeVisible();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 250, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("通して音読：1行ずつ答え合わせして最後まで読める", async ({ page }) => {
  await seed(page, baseState(), "/readthrough/c0-l1");
  const step = page.locator(".rt-bar .btn.primary");
  for (let i = 0; i < 40 && (await step.textContent()) !== "マップへ"; i++) await step.click();
  await expect(page.getByText("最後まで読めました")).toBeVisible();
});

test("つづりちがいのエラー名は正解にして正しいつづりを示し、.0 抜けは「惜しい」で間違いに数えない", async ({ page }) => {
  await seed(page, baseState({ session: session("lesson", "c12-l1", ["c12-l1-p1", "c1-l3-p2"]) }), "/play");
  await type(page, "ZeroDevisionError");
  await expect(page.getByText("正しいつづりは ZeroDivisionError です")).toBeVisible();
  await next(page);
  await type(page, "3");
  await expect(page.getByText(/惜しい！/)).toBeVisible();
  expect((await stored(page)).session.results["c1-l3-p2"]?.miss ?? 0).toBe(0);
  await type(page, "3.0");
  await expect(page.getByText("一発正解！")).toBeVisible();
});
