# よみとくPython

Python のコードを日本語で音読しながら読み解けるようになる、段階式の学習 Web アプリです。
1問30秒〜2分の小さな問題を積み重ねて、最後は20〜40行のプログラムを通して読み解きます。

- 全16章・60レッスン・377問＋理解度チェック56問＋レベル診断14問
- ログイン不要。記録はブラウザ（localStorage）にだけ保存
- Python の実行はブラウザの中（Pyodide）。サーバーは使いません

## 開発

```bash
npm install
npm run dev        # 開発用サーバー
npm test           # 単体テスト（判定・XP・連続日数・診断など）
npm run verify     # すべての問題の正解を、Python（Pyodide）で実際に実行して照合
npm run build      # dist/ に出力
npm run e2e        # ブラウザでの操作テスト（先に build）
```

## 問題を追加・修正する

問題はすべて `src/data/course.json` にあります（章 → レッスン → 問題）。

| type | 内容 | 主な項目 |
|---|---|---|
| `output` | 出力を当てる | `code`, `answers`（`err: true` ならエラーの種類名） |
| `value` | 値を追う | `code`, `var` か `expr`, `after`（何行目まで実行するか） |
| `blank` | 読み下しの穴埋め | `code`, `line`, `template`（［　］が空欄）, `answers` |
| `write` | 読み下しからコードを書く | `code`（前提のコード）, `solved`, `target`, `checks`（確かめる初期値と期待する出力） |
| `fill` | 虫食いコード | `code`（`___` が空欄）, `expected`, `answers` |
| `bug` | まちがい探し | `code`, `solved`（直したコード）, `expected`, `answers`（行番号） |

どの問題も `reading` に1行ずつの読み下しを入れます。「ここから」「ここまで」はインデントから自動でつくので書きません。
読み下しの下書きは `python tools/yomi.py 'for i in range(3):\n    print(i)'` で作れます。

追加・修正したら `npm run verify` を実行してください。登録した正解と実行結果がちがう問題があると失敗します（GitHub Actions でも毎回確かめます）。
