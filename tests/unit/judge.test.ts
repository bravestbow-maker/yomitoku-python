import { describe, expect, it } from "vitest";
import { judgeRun, judgeText } from "../../src/lib/judge.ts";
import { blankEq, firstDiffLine, normCode, normText, textEq } from "../../src/lib/normalize.ts";
import { compose } from "../../src/lib/reading.ts";
import type { Problem, RunResult } from "../../src/lib/types.ts";
import { getProblem } from "../../src/state/course.ts";

const P = (id: string) => getProblem(id)!.problem;

describe("ゆるい比較", () => {
  it("前後の空白・最後の改行・連続する空白を無視する", () => {
    expect(normText("  Hello   World \n\n")).toBe("Hello World");
    expect(textEq(" 1\n2 \n3\n", "1\n2\n3")).toBe(true);
  });
  it("' と \" の違いを無視する", () => {
    expect(textEq("['a', 'b']", '["a", "b"]')).toBe(true);
  });
  it("全角の数字や記号も同じに扱う", () => {
    expect(textEq("１２", "12")).toBe(true);
  });
  it("リストの表示は空白のちがいを気にしない", () => {
    expect(textEq("[1,2,3]", "[1, 2, 3]")).toBe(true);
    expect(textEq("Ken 12", "Ken12")).toBe(false);
  });
  it("何行目がちがうかを返す", () => {
    expect(firstDiffLine("0\n1\n3", "0\n1\n2")).toBe(3);
    expect(firstDiffLine("0\n1", "0\n1\n2")).toBe(3);
    expect(firstDiffLine("9", "0\n1")).toBe(1);
  });
  it("コードは文字列の外の空白を無視する", () => {
    expect(normCode("print( x )")).toBe(normCode("print(x)"));
    expect(normCode('print("a b")')).not.toBe(normCode('print("ab")'));
  });
  it("読み下しの穴埋めは、ひらがなと漢字、全角と半角を同じに扱う", () => {
    expect(blankEq("たす", "足す")).toBe(true);
    expect(blankEq("くりかえす", "繰り返す")).toBe(true);
    expect(blankEq("ヒョウジスル", "表示する")).toBe(true);
    expect(blankEq("２", "2")).toBe(true);
    expect(blankEq("Ken", '"Ken"')).toBe(true);
    expect(blankEq("ひく", "足す")).toBe(false);
    expect(blankEq("", "")).toBe(false);
  });
});

describe("判定", () => {
  it("出力を当てる：正解と、何行目がちがうか", () => {
    const p = P("c0-l3-p2"); // for i in range(3): print(i)
    expect(judgeText(p, "0\n1\n2").ok).toBe(true);
    expect(judgeText(p, "0\n1\n3")).toEqual({ ok: false, wrongLine: 3 });
  });
  it("エラーの種類名を当てる", () => {
    const p = P("c12-l1-p1");
    expect(judgeText(p, "ZeroDivisionError").ok).toBe(true);
    expect(judgeText(p, "zerodivisionerror").ok).toBe(false);
  });
  it("値を追う：文字列は引用符があってもなくても正解", () => {
    const p = P("c2-l2-p5"); // name -> "Ami"
    expect(judgeText(p, "Ami").ok).toBe(true);
    expect(judgeText(p, "'Ami'").ok).toBe(true);
    expect(judgeText(p, '"Ami"').ok).toBe(true);
  });
  it("まちがい探し：行番号は「3行目」でも全角でもよい", () => {
    const p = P("c2-l2-p6");
    expect(judgeText(p, "3").ok).toBe(true);
    expect(judgeText(p, "３行目").ok).toBe(true);
    expect(judgeText(p, "2").ok).toBe(false);
  });
  it("空の入力は不正解にも数えない（ok: false だけ）", () => {
    expect(judgeText(P("c1-l1-p1"), "   ")).toEqual({ ok: false });
  });
  it("コードを書く問題：登録した答えと同じなら実行しなくても正解", () => {
    const p = P("c2-l3-p7"); // count += 1
    expect(judgeText(p, "count+=1").ok).toBe(true);
    expect(judgeText(p, "count = 1 + count")).toEqual({ ok: false, needsRun: true });
  });
  it("コードを書く問題：書き方がちがっても、実行結果が同じなら正解", async () => {
    const p = P("c2-l3-p7");
    const fake = async (src: string): Promise<RunResult> => {
      // count = 0 / 41 に対して count = 1 + count を実行した結果をまねる
      const start = src.startsWith("count = 41") ? 41 : 0;
      if (src.includes("count = 1 + count")) return { out: `${start + 1}\n`, err: null };
      return { out: `${start}\n`, err: null };
    };
    expect((await judgeRun(p, "count = 1 + count", fake)).ok).toBe(true);
    expect((await judgeRun(p, "print(1)", fake)).ok).toBe(false);
  });
  it("虫食いコード：無限ループは時間切れとして不正解", async () => {
    const p = P("c1-l2-p6");
    const r = await judgeRun(p, "+", async () => ({ out: "", err: null, timeout: true }));
    expect(r.ok).toBe(false);
    expect(r.note).toContain("時間がかかりすぎた");
  });
});

describe("読み下し", () => {
  it("インデントの始まりは「ここから」、終わりは「ここまで」", () => {
    const lines = ["for i in range(3):", "    print(i)", 'print("end")'];
    const r = compose(lines, ["iを0から2まで1ずつ変えながら、次を繰り返す", "iを表示する", '"end"を表示する']);
    expect(r[1]).toBe("ここから、iを表示する、ここまで");
    expect(r[2]).toBe('"end"を表示する');
  });
  it("2段のインデントが一度に終わると「ここまで」が2回", () => {
    const lines = ["def f():", "    for i in x:", "        print(i)"];
    const r = compose(lines, ["a", "b", "c"]);
    expect(r[2]).toBe("ここから、c、ここまで、ここまで");
  });
  it("登録したすべての読み下しの決まりが守られている（＝を「イコール」と読まない）", () => {
    const p = P("c0-l1-p1") as Problem;
    expect(p.reading[0]).toBe("xに5を入れる");
  });
});
