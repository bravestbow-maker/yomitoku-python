// 答え合わせ用の「ゆるい比較」。前後の空白・最後の改行・連続する空白・' と " の違いを無視する。

export function normText(s: string): string {
  const lines = s
    .normalize("NFKC")
    .replace(/\r/g, "")
    .replace(/'/g, '"')
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "));
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/** 文字列リテラルの外にある空白をすべて取りのぞく（コードどうしの比較用） */
export function stripCodeSpaces(s: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      out += c;
      if (c === "\\" && i + 1 < s.length) {
        out += s[++i];
      } else if (c === quote) {
        quote = null;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
      out += c;
    } else if (!/\s/.test(c)) {
      out += c;
    }
  }
  return out;
}

export function normCode(s: string): string {
  return stripCodeSpaces(s.normalize("NFKC").replace(/\r/g, "").replace(/'/g, '"'));
}

/** [ ( { で始まる行（リスト・タプル・辞書の表示）は、空白のちがいも気にしない */
function lineEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^[[({]/.test(b) || /^[[({]/.test(a)) return stripCodeSpaces(a) === stripCodeSpaces(b);
  return false;
}

export function textEq(input: string, answer: string): boolean {
  const a = normText(input).split("\n");
  const b = normText(answer).split("\n");
  if (a.length !== b.length) return false;
  return a.every((l, i) => lineEq(l, b[i]));
}

/** 何行目がちがうか（1始まり）。行の数がちがうときは、最初にずれた行。 */
export function firstDiffLine(input: string, answer: string): number | null {
  const a = normText(input).split("\n");
  const b = normText(answer).split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] === undefined || b[i] === undefined || !lineEq(a[i], b[i])) return i + 1;
  }
  return null;
}

// ---------- 読み下しの穴埋め：ひらがなと漢字、全角と半角の違いを正解として扱う ----------

const KANA: [string, string][] = [
  ["繰り返す", "くりかえす"], ["繰り返し", "くりかえし"], ["くり返す", "くりかえす"],
  ["表示する", "ひょうじする"], ["表示", "ひょうじ"], ["入れる", "いれる"], ["等しい", "ひとしい"],
  ["等しく", "ひとしく"], ["足した", "たした"], ["足す", "たす"], ["引いた", "ひいた"], ["引く", "ひく"],
  ["掛けた", "かけた"], ["掛ける", "かける"], ["割った", "わった"], ["割る", "わる"], ["商", "しょう"],
  ["返す", "かえす"], ["加える", "くわえる"], ["作った", "つくった"], ["作る", "つくる"], ["受け取って", "うけとって"],
  ["受け取る", "うけとる"], ["関数", "かんすう"], ["最後", "さいご"], ["最初", "さいしょ"], ["次", "つぎ"],
  ["実行", "じっこう"], ["以上", "いじょう"], ["以下", "いか"], ["大きい", "おおきい"], ["小さい", "ちいさい"],
  ["整数", "せいすう"], ["小数", "しょうすう"], ["文字列", "もじれつ"], ["空白", "くうはく"],
  ["大文字", "おおもじ"], ["小文字", "こもじ"], ["合計", "ごうけい"], ["番号", "ばんごう"], ["番目", "ばんめ"],
  ["辞書", "じしょ"], ["値", "あたい"], ["組", "くみ"], ["含まれて", "ふくまれて"], ["含まれる", "ふくまれる"],
  ["呼ぶ", "よぶ"], ["抜ける", "ぬける"], ["試す", "ためす"], ["起きたら", "おきたら"], ["自分", "じぶん"],
  ["設計図", "せっけいず"], ["元", "もと"], ["読み込む", "よみこむ"], ["読みこむ", "よみこむ"], ["名前", "なまえ"],
  ["平方根", "へいほうこん"], ["日付", "ひづけ"], ["集めた", "あつめた"], ["区切った", "くぎった"],
  ["一つずつ", "ひとつずつ"], ["1つずつ", "ひとつずつ"], ["1組ずつ", "ひとくみずつ"], ["ひと組ずつ", "ひとくみずつ"],
  ["1くみずつ", "ひとくみずつ"], ["埋め込んだ", "うめこんだ"], ["埋めこんだ", "うめこんだ"], ["うめ込んだ", "うめこんだ"],
  ["繋いだ", "つないだ"], ["余り", "あまり"], ["且つ", "かつ"], ["間", "あいだ"], ["受取って", "うけとって"],
  ["受け取つて", "うけとって"], ["抜け", "ぬけ"], ["一組ずつ", "ひとくみずつ"], ["割", "わ"], ["足", "た"], ["引", "ひ"], ["掛", "か"],
];
const KANA_SORTED = [...KANA].sort((a, b) => b[0].length - a[0].length);

export function kanaNorm(s: string): string {
  let t = s.normalize("NFKC").replace(/\s+/g, "").replace(/['"「」『』]/g, "");
  t = t.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  for (const [k, v] of KANA_SORTED) t = t.split(k).join(v);
  return t.replace(/[。、．，]$/g, "");
}

export function blankEq(input: string, answer: string): boolean {
  return kanaNorm(input) === kanaNorm(answer) && kanaNorm(input) !== "";
}
