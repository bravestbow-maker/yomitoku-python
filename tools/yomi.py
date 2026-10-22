"""Pythonのコードから、行ごとの「読み下し」の下書きを作る補助ツール。

使い方:  python tools/yomi.py 'for i in range(3):\n    print(i)'
新しい問題を course.json に追加するとき、reading 欄の下書きに使う。
生成された文がぎこちない行は、手で書きかえてかまわない。
"""
from __future__ import annotations

import ast
import sys

OPS_P = {
    ast.Eq: "{l}が{r}と等しい",
    ast.NotEq: "{l}が{r}と等しくない",
    ast.Gt: "{l}が{r}より大きい",
    ast.Lt: "{l}が{r}より小さい",
    ast.GtE: "{l}が{r}以上",
    ast.LtE: "{l}が{r}以下",
    ast.In: "{l}が{r}に含まれる",
    ast.NotIn: "{l}が{r}に含まれない",
    ast.Is: "{l}が{r}である",
    ast.IsNot: "{l}が{r}ではない",
}
NEG = {ast.Eq: ast.NotEq, ast.NotEq: ast.Eq, ast.Gt: ast.LtE, ast.Lt: ast.GtE,
       ast.GtE: ast.Lt, ast.LtE: ast.Gt, ast.In: ast.NotIn, ast.NotIn: ast.In,
       ast.Is: ast.IsNot, ast.IsNot: ast.Is}


def cond_form(p: str) -> str:
    """述語（〜が大きい）を条件の形（〜が大きければ）にする。"""
    for a, b in [("等しくない", "等しくなければ"), ("ではない", "でなければ"),
                 ("でない", "でなければ"),
                 ("含まれない", "含まれていなければ"), ("含まれる", "含まれていれば"),
                 ("で始まる", "で始まれば"), ("で終わる", "で終われば"),
                 ("ない", "なければ"), ("い", "ければ"), ("である", "であれば")]:
        if p.endswith(a):
            return p[: -len(a)] + b
    return p + "ならば"


def noun_join(p: str, noun: str) -> str:
    """述語のあとに「もの」「あいだ」をつなぐ。"""
    if p.endswith(("い", "る", "う", "つ", "む", "ぬ", "く", "ぐ", "す", "ぶ")):
        return p + noun
    return p + "の" + noun


def q(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"') + '"'


def join_and(items, loose=True):
    items = list(items)
    if not items:
        return ""
    if len(items) > 2 or (loose and any(len(x) > 10 for x in items)):
        return "、".join(items)
    return "と".join(items)


class Yomi:
    def __init__(self, src: str):
        self.src = src
        self.lines = src.split("\n")
        self.dicts: set[str] = set()
        self.classes: set[str] = set()
        self.funcs: set[str] = set()
        self.out: dict[int, str] = {}
        self.in_class = 0

    # ---------- 式 ----------
    def seg(self, n):
        return ast.get_source_segment(self.src, n) or ast.unparse(n)

    def is_str(self, n):
        return (isinstance(n, ast.Constant) and isinstance(n.value, str)) or isinstance(n, ast.JoinedStr)

    def E(self, n) -> str:
        if isinstance(n, ast.Constant):
            if isinstance(n.value, str):
                return q(n.value)
            return repr(n.value)
        if isinstance(n, ast.Name):
            return n.id
        if isinstance(n, ast.Attribute):
            if isinstance(n.value, ast.Name) and n.value.id == "self":
                return f"自分の{n.attr}"
            if self.seg(n) == "math.pi":
                return "円周率"
            return f"{self.E(n.value)}の{n.attr}"
        if isinstance(n, ast.UnaryOp):
            if isinstance(n.op, ast.USub):
                return "-" + self.E(n.operand)
            if isinstance(n.op, ast.Not):
                return self.P(n) + "か"
        if isinstance(n, ast.BinOp):
            return self.binop(n)
        if isinstance(n, (ast.Compare, ast.BoolOp)):
            return self.P(n) + "か"
        if isinstance(n, ast.Call):
            return self.call(n)[0]
        if isinstance(n, ast.Subscript):
            return self.sub(n)
        if isinstance(n, ast.List):
            if not n.elts:
                return "空のリスト"
            return "、".join(self.E(e) for e in n.elts) + "が入ったリスト"
        if isinstance(n, ast.Tuple):
            return join_and((self.E(e) for e in n.elts), False) + "の組"
        if isinstance(n, ast.Dict):
            if not n.keys:
                return "空の辞書"
            return "、".join(f"{self.E(k)}が{self.E(v)}" for k, v in zip(n.keys, n.values)) + "の辞書"
        if isinstance(n, ast.JoinedStr):
            names = [self.seg(v.value) for v in n.values if isinstance(v, ast.FormattedValue)]
            body = self.seg(n)
            body = body[1:] if body[:1] in "fF" else body
            if body.startswith("'"):
                body = '"' + body[1:-1] + '"'
            return f"{{}}に{join_and(names)}をうめこんだ{body}"
        if isinstance(n, ast.IfExp):
            return f"{cond_form(self.P(n.test))}{self.E(n.body)}、そうでなければ{self.E(n.orelse)}"
        if isinstance(n, (ast.ListComp, ast.GeneratorExp)):
            return self.comp(n, "リスト")
        if isinstance(n, ast.DictComp):
            return self.comp(n, "辞書")
        if isinstance(n, ast.Lambda):
            args = join_and(a.arg for a in n.args.args)
            return f"{args}を受け取って{self.E(n.body)}を返す関数"
        return self.seg(n)

    def binop(self, n):
        l, r = n.left, n.right
        if isinstance(n.op, ast.Add):
            terms = []

            def flat(x):
                if isinstance(x, ast.BinOp) and isinstance(x.op, ast.Add):
                    flat(x.left)
                    flat(x.right)
                else:
                    terms.append(x)
            flat(n)
            if any(self.is_str(t) for t in terms):
                return join_and((self.E(t) for t in terms), False) + "をつなげたもの"
            return join_and((self.E(t) for t in terms), False) + "を足したもの"
        L, R = self.E(l), self.E(r)
        if isinstance(n.op, ast.Sub):
            return f"{L}から{R}を引いたもの"
        if isinstance(n.op, ast.Mult):
            if self.is_str(l):
                return f"{L}を{R}回くり返したもの"
            if self.is_str(r):
                return f"{R}を{L}回くり返したもの"
            return f"{L}と{R}を掛けたもの"
        if isinstance(n.op, ast.Div):
            return f"{L}を{R}で割ったもの"
        if isinstance(n.op, ast.FloorDiv):
            return f"{L}を{R}で割った商"
        if isinstance(n.op, ast.Mod):
            return f"{L}を{R}で割ったあまり"
        if isinstance(n.op, ast.Pow):
            return f"{L}の{R}乗"
        return self.seg(n)

    def sub(self, n, target=False):
        v = self.E(n.value)
        s = n.slice
        if isinstance(s, ast.Slice):
            lo, hi, st = s.lower, s.upper, s.step
            if lo is None and hi is None and st is not None and self.seg(st) == "-1":
                return f"{v}を逆の順にしたもの"
            def num(x):
                return isinstance(x, ast.Constant) and isinstance(x.value, int)
            a = "最初" if lo is None else self.E(lo) + "番目"
            if hi is None:
                b = "最後まで"
            elif num(hi):
                b = f"{hi.value - 1}番目まで"
            else:
                b = f"{self.E(hi)}番目の手前まで"
            return f"{v}の{a}から{b}"
        name = n.value.id if isinstance(n.value, ast.Name) else None
        if isinstance(s, ast.Constant) and isinstance(s.value, str) or (name in self.dicts):
            return f"{v}の{self.E(s)}" + ("" if target else "の値")
        if isinstance(s, ast.UnaryOp) and isinstance(s.op, ast.USub) and isinstance(s.operand, ast.Constant):
            return f"{v}の後ろから{s.operand.value}番目"
        return f"{v}の{self.E(s)}番目"

    def comp(self, n, kind):
        g = n.generators[0]
        t = self.E(g.target)
        it = self.iter_noun(g.iter)
        body = self.E(n.elt) if kind == "リスト" else f"{self.E(n.key)}をキー、{self.E(n.value)}を値にした組"
        if g.ifs:
            p = self.P(g.ifs[0])
            if self.seg(n.elt) == t and kind == "リスト":
                return f"{it}を1つずつ{t}として、{noun_join(p, 'もの')}だけを集めた{kind}"
            return f"{it}を1つずつ{t}として、{noun_join(p, 'もの')}について{body}を集めた{kind}"
        return f"{it}を1つずつ{t}として、{body}を集めた{kind}"

    def iter_noun(self, it):
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "range":
            return self.range_noun(it)
        if isinstance(it, ast.Name) and it.id in self.dicts:
            return f"{it.id}のキー"
        return f"{self.E(it)}の中身"

    def range_parts(self, c):
        a = c.args
        def minus1(x):
            if isinstance(x, ast.Constant) and isinstance(x.value, int):
                return str(x.value - 1)
            return f"{self.E(x)}-1"
        if len(a) == 1:
            return "0", minus1(a[0]), "1"
        if len(a) == 2:
            return self.E(a[0]), minus1(a[1]), "1"
        return self.E(a[0]), None, self.E(a[2])

    def range_noun(self, c):
        s, e, st = self.range_parts(c)
        if e is None:
            return f"{s}から{self.E(c.args[1])}の手前まで{st}ずつ変わる整数"
        return f"{s}から{e}までの整数"

    # ---------- 関数・メソッドの呼び出し: (名詞の形, 動詞の形) ----------
    def call(self, n):
        f = n.func
        A = [self.E(a) for a in n.args]
        kw = {k.arg: k.value for k in n.keywords}
        args = join_and(A)
        if isinstance(f, ast.Name):
            nm = f.id
            if nm == "print":
                if not A:
                    return ("", "空の行を表示する")
                if "sep" in kw:
                    return ("", f"{args}を{self.E(kw['sep'])}で区切って表示する")
                if "end" in kw:
                    e = kw["end"]
                    if isinstance(e, ast.Constant) and e.value == "":
                        return ("", f"{args}を改行せずに表示する")
                    return ("", f"{args}を表示して、最後に改行のかわりに{self.E(e)}を表示する")
                return ("", f"{args}を表示する")
            simple = {
                "len": "{0}の長さ", "int": "{0}を整数にしたもの", "str": "{0}を文字列にしたもの",
                "float": "{0}を小数にしたもの", "list": "{0}をリストにしたもの", "type": "{0}の型",
                "abs": "{0}の絶対値", "sum": "{0}の合計", "reversed": "{0}を逆の順にしたもの",
                "enumerate": "{0}の番号と中身の組", "bool": "{0}を真偽値にしたもの",
                "tuple": "{0}をタプルにしたもの", "set": "{0}を集合にしたもの",
            }
            if nm in simple and len(A) == 1:
                s = simple[nm].format(A[0])
                return (s, s + "を求める")
            if nm == "input":
                s = "入力された文字列" if not A else f"{A[0]}と表示して入力された文字列"
                return (s, "入力を受け取る")
            if nm in ("max", "min"):
                w = "最大値" if nm == "max" else "最小値"
                if len(A) == 1:
                    return (f"{A[0]}の{w}", f"{A[0]}の{w}を求める")
                return (f"{args}のうち{'大きい' if nm == 'max' else '小さい'}ほう", "")
            if nm == "round":
                if len(A) == 1:
                    return (f"{A[0]}を整数に丸めたもの", "")
                return (f"{A[0]}を小数第{A[1]}位までに丸めたもの", "")
            if nm == "sorted":
                order = "大きい順" if "reverse" in kw and self.seg(kw["reverse"]) == "True" else "小さい順"
                if "key" in kw:
                    k = kw["key"]
                    if isinstance(k, ast.Name) and k.id == "len":
                        return (f"{A[0]}を長さの{'長い' if order == '大きい順' else '短い'}順に並べたもの", "")
                    if isinstance(k, ast.Lambda):
                        return (f"{A[0]}を、{self.E(k.body)}の{order}に並べたもの", "")
                return (f"{A[0]}を{order}に並べたもの", "")
            if nm == "zip":
                return (f"{args}を1つずつ組にしたもの", "")
            if nm == "range":
                return (self.range_noun(n), "")
            if nm == "dict" and not A:
                return ("空の辞書", "")
            if nm == "isinstance":
                return (f"{A[0]}が{A[1]}の仲間か", "")
            if nm in self.classes or nm[:1].isupper():
                s = f"{args}を渡して{nm}から作ったもの" if A else f"{nm}から作ったもの"
                return (s, f"{args}を渡して{nm}から作る" if A else f"{nm}から作る")
            if A:
                return (f"{args}を渡して{nm}を呼んだ結果", f"{args}を渡して{nm}を呼ぶ")
            return (f"{nm}を呼んだ結果", f"{nm}を呼ぶ")
        if isinstance(f, ast.Attribute):
            m = f.attr
            on = f.value
            o = self.E(on)
            mod = on.id if isinstance(on, ast.Name) else None
            if mod == "math":
                t = {"sqrt": "{0}の平方根", "floor": "{0}の小数点以下を切り捨てたもの",
                     "ceil": "{0}の小数点以下を切り上げたもの", "fabs": "{0}の絶対値"}
                if m in t:
                    return (t[m].format(*A), "")
                if m == "pow":
                    return (f"{A[0]}の{A[1]}乗", "")
            if mod == "random":
                if m == "randint":
                    return (f"{A[0]}から{A[1]}までの整数からランダムに1つ選んだもの", "")
                if m == "choice":
                    return (f"{A[0]}からランダムに1つ選んだもの", "")
                if m == "shuffle":
                    return ("", f"{A[0]}の順番をランダムに入れかえる")
                if m == "seed":
                    return ("", f"乱数の種を{A[0]}に固定する")
                if m == "random":
                    return ("0以上1未満のランダムな小数", "")
            if self.seg(on) in ("datetime.date", "date") and m != "today" or (mod == "datetime" and m == "date"):
                if len(A) == 3:
                    return (f"{A[0]}年{A[1]}月{A[2]}日の日付", "")
            if mod == "datetime" and m == "timedelta" or (isinstance(f, ast.Attribute) and m == "timedelta"):
                if "days" in kw:
                    return (f"{self.E(kw['days'])}日分の長さ", "")
            if m == "append":
                return ("", f"{o}の最後に{A[0]}を加える")
            if m == "insert":
                return ("", f"{o}の{A[0]}番目に{A[1]}を差しこむ")
            if m == "extend":
                return ("", f"{o}の最後に{A[0]}の中身を加える")
            if m == "remove":
                return ("", f"{o}から{A[0]}を取りのぞく")
            if m == "pop":
                if not A:
                    return (f"{o}の最後から取り出したもの", f"{o}の最後を取り出す")
                if mod in self.dicts:
                    return (f"{o}から{A[0]}を取り出したもの", f"{o}から{A[0]}を取り出す")
                return (f"{o}の{A[0]}番目から取り出したもの", f"{o}の{A[0]}番目を取り出す")
            if m == "sort":
                order = "大きい順" if "reverse" in kw else "小さい順"
                return ("", f"{o}を{order}に並べかえる")
            if m == "reverse":
                return ("", f"{o}を逆の順にする")
            if m == "count":
                return (f"{o}に入っている{A[0]}の数", "")
            if m in ("index", "find"):
                return (f"{o}の中で{A[0]}がある番号", "")
            if m == "copy":
                return (f"{o}のコピー", "")
            if m == "split":
                return (f"{o}を空白で区切ったリスト" if not A else f"{o}を{A[0]}で区切ったリスト", "")
            if m == "join":
                return (f"{A[0]}を{o}でつないだ文字列", "")
            if m == "replace":
                return (f"{o}の{A[0]}を{A[1]}に置きかえたもの", "")
            if m == "strip":
                return (f"{o}の前後の空白を取ったもの", "")
            if m == "upper":
                return (f"{o}を大文字にしたもの", "")
            if m == "lower":
                return (f"{o}を小文字にしたもの", "")
            if m == "startswith":
                return (f"{o}が{A[0]}で始まるか", "")
            if m == "endswith":
                return (f"{o}が{A[0]}で終わるか", "")
            if m == "isdigit":
                return (f"{o}が数字だけでできているか", "")
            if m == "get" and A:
                if len(A) == 1:
                    return (f"{o}の{A[0]}の値（なければNone）", "")
                return (f"{o}の{A[0]}の値（なければ{A[1]}）", "")
            if m == "items":
                return (f"{o}のキーと値の組", "")
            if m == "keys":
                return (f"{o}のキー", "")
            if m == "values":
                return (f"{o}の値", "")
            if m == "strftime":
                return (f"{o}を{A[0]}の形にした文字列", "")
            if m == "weekday":
                return (f"{o}の曜日の番号", "")
            if A:
                return (f"{args}を渡して{o}の{m}を呼んだ結果", f"{args}を渡して{o}の{m}を呼ぶ")
            return (f"{o}の{m}を呼んだ結果", f"{o}の{m}を呼ぶ")
        return (self.seg(n), self.seg(n))

    # ---------- 条件 ----------
    def P(self, n) -> str:
        if isinstance(n, ast.Compare) and len(n.ops) == 1:
            return OPS_P[type(n.ops[0])].format(l=self.E(n.left), r=self.E(n.comparators[0]))
        if isinstance(n, ast.Compare):
            parts = []
            left = n.left
            for op, c in zip(n.ops, n.comparators):
                parts.append(OPS_P[type(op)].format(l=self.E(left), r=self.E(c)))
                left = c
            return "、かつ".join(parts)
        if isinstance(n, ast.BoolOp):
            sep = "、かつ" if isinstance(n.op, ast.And) else "か、または"
            return sep.join(self.P(v) for v in n.values)
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.Not):
            o = n.operand
            if isinstance(o, ast.Compare) and len(o.ops) == 1:
                return OPS_P[NEG[type(o.ops[0])]].format(l=self.E(o.left), r=self.E(o.comparators[0]))
            return f"{self.E(o)}がFalse"
        if isinstance(n, ast.Call):
            s = self.call(n)[0]
            if s.endswith("か"):
                return s[:-1]
            return f"{s}がTrue"
        if isinstance(n, ast.Constant) and n.value is True:
            return "True"
        return f"{self.E(n)}がTrue"

    # ---------- 文 ----------
    def put(self, line, text):
        self.out[line] = text

    def stmts(self, body):
        for s in body:
            self.stmt(s)

    def track(self, s):
        if isinstance(s, ast.Assign):
            v = s.value
            isdict = isinstance(v, (ast.Dict, ast.DictComp)) or (
                isinstance(v, ast.Call) and isinstance(v.func, ast.Name) and v.func.id == "dict")
            for t in s.targets:
                if isinstance(t, ast.Name):
                    if isdict:
                        self.dicts.add(t.id)
                    else:
                        self.dicts.discard(t.id)

    def stmt(self, s):
        L = s.lineno
        self.track(s)
        if isinstance(s, ast.Assign):
            t = s.targets[0]
            v = s.value
            if isinstance(t, ast.Tuple):
                names = join_and(self.E(e) for e in t.elts)
                if isinstance(v, ast.Tuple):
                    vals = join_and(self.E(e) for e in v.elts)
                    self.put(L, f"{names}に、それぞれ{vals}を入れる")
                else:
                    self.put(L, f"{self.E(v)}を分けて、{names}に入れる")
                return
            tgt = self.sub(t, target=True) if isinstance(t, ast.Subscript) else self.E(t)
            val = self.E(v)
            sep = "、" if len(val) > 18 else ""
            self.put(L, f"{tgt}に{sep}{val}を入れる")
        elif isinstance(s, ast.AugAssign):
            t = self.sub(s.target, target=True) if isinstance(s.target, ast.Subscript) else self.E(s.target)
            v = self.E(s.value)
            if isinstance(s.op, ast.Add):
                if self.is_str(s.value):
                    self.put(L, f"{t}の後ろに{v}をつなげる")
                else:
                    self.put(L, f"{t}に{v}を足す")
            elif isinstance(s.op, ast.Sub):
                self.put(L, f"{t}から{v}を引く")
            elif isinstance(s.op, ast.Mult):
                self.put(L, f"{t}に{v}を掛ける")
            elif isinstance(s.op, ast.Div):
                self.put(L, f"{t}を{v}で割る")
            elif isinstance(s.op, ast.FloorDiv):
                self.put(L, f"{t}を{v}で割った商にする")
            elif isinstance(s.op, ast.Mod):
                self.put(L, f"{t}を{v}で割ったあまりにする")
            else:
                self.put(L, self.seg(s))
        elif isinstance(s, ast.Expr):
            if isinstance(s.value, ast.Call):
                noun, verb = self.call(s.value)
                self.put(L, verb or (noun + "を求める"))
            else:
                self.put(L, self.E(s.value))
        elif isinstance(s, ast.If):
            self.if_chain(s, first=True)
        elif isinstance(s, ast.For):
            t = s.target
            it = s.iter
            if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "range":
                a, b, st = self.range_parts(it)
                name = self.E(t)
                if b is None:
                    self.put(L, f"{name}を{a}から{st}ずつ変えながら、{self.E(it.args[1])}の手前まで次を繰り返す")
                else:
                    self.put(L, f"{name}を{a}から{b}まで{st}ずつ変えながら、次を繰り返す")
            elif isinstance(t, ast.Tuple):
                names = join_and(self.E(e) for e in t.elts)
                if isinstance(it, ast.Call) and isinstance(it.func, ast.Attribute) and it.func.attr == "items":
                    self.put(L, f"{self.E(it.func.value)}のキーと値を1組ずつ{names}に入れながら、次を繰り返す")
                elif isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "enumerate":
                    self.put(L, f"{self.E(it.args[0])}の番号と中身を1組ずつ{names}に入れながら、次を繰り返す")
                elif isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "zip":
                    srcs = join_and(self.E(a) for a in it.args)
                    self.put(L, f"{srcs}の中身を1組ずつ{names}に入れながら、次を繰り返す")
                else:
                    self.put(L, f"{self.E(it)}の中身を1組ずつ{names}に入れながら、次を繰り返す")
            else:
                self.put(L, f"{self.iter_noun(it)}を1つずつ{self.E(t)}に入れながら、次を繰り返す")
            self.stmts(s.body)
        elif isinstance(s, ast.While):
            if isinstance(s.test, ast.Constant) and s.test.value is True:
                self.put(L, "ずっと、次を繰り返す")
            else:
                self.put(L, f"{noun_join(self.P(s.test), 'あいだ')}、次を繰り返す")
            self.stmts(s.body)
        elif isinstance(s, ast.Break):
            self.put(L, "繰り返しをぬける")
        elif isinstance(s, ast.Continue):
            self.put(L, "ここで次の回の繰り返しへ進む")
        elif isinstance(s, ast.Pass):
            self.put(L, "何もしない")
        elif isinstance(s, ast.FunctionDef):
            self.funcs.add(s.name)
            ps = []
            for a, d in zip(s.args.args[::-1], (s.args.defaults[::-1] + [None] * 99)):
                ps.append((a.arg, d))
            ps = ps[::-1]
            if self.in_class and ps and ps[0][0] == "self":
                ps = ps[1:]
                kind = "メソッド"
            else:
                kind = "関数"
            def pr(a, d):
                return a if d is None else f"{a}（なければ{self.E(d)}）"
            params = join_and(pr(a, d) for a, d in ps)
            if s.name == "__init__":
                head = f"{params}を受け取る、" if params else ""
                self.put(L, f"{head}作るときに最初に動くメソッド__init__を作る")
            elif params:
                self.put(L, f"{params}を受け取る{kind}{s.name}を作る")
            else:
                self.put(L, f"何も受け取らない{kind}{s.name}を作る" if kind == "関数" else f"メソッド{s.name}を作る")
            self.stmts(s.body)
        elif isinstance(s, ast.Return):
            self.put(L, "ここで関数を終える" if s.value is None else f"{self.E(s.value)}を返す")
        elif isinstance(s, ast.ClassDef):
            self.classes.add(s.name)
            if s.bases:
                self.put(L, f"{self.E(s.bases[0])}を元にした設計図{s.name}を作る")
            else:
                self.put(L, f"設計図{s.name}を作る")
            self.in_class += 1
            self.stmts(s.body)
            self.in_class -= 1
        elif isinstance(s, ast.Import):
            a = s.names[0]
            self.put(L, f"{a.name}を{a.asname}という名前で読みこむ" if a.asname else f"{a.name}を読みこむ")
        elif isinstance(s, ast.ImportFrom):
            self.put(L, f"{s.module}から{join_and(a.name for a in s.names)}を読みこむ")
        elif isinstance(s, ast.Try):
            self.put(L, "次を試す")
            self.stmts(s.body)
            for h in s.handlers:
                if h.type is None:
                    t = "エラー"
                elif isinstance(h.type, ast.Tuple):
                    t = "か".join(self.E(e) for e in h.type.elts)
                else:
                    t = self.E(h.type)
                if h.name:
                    self.put(h.lineno, f"{t}が起きたら、そのエラーを{h.name}として、次を実行する")
                else:
                    self.put(h.lineno, f"{t}が起きたら、次を実行する")
                self.stmts(h.body)
            if s.orelse:
                self.put(self.kw_line(s.orelse[0].lineno, "else"), "エラーが起きなかったら、次を実行する")
                self.stmts(s.orelse)
            if s.finalbody:
                self.put(self.kw_line(s.finalbody[0].lineno, "finally"), "最後にかならず、次を実行する")
                self.stmts(s.finalbody)
        elif isinstance(s, ast.Raise):
            e = s.exc
            if isinstance(e, ast.Call) and isinstance(e.func, ast.Name):
                if e.args:
                    self.put(L, f"{self.E(e.args[0])}というメッセージで{e.func.id}を起こす")
                else:
                    self.put(L, f"{e.func.id}を起こす")
            else:
                self.put(L, f"{self.E(e)}を起こす")
        elif isinstance(s, ast.Delete):
            self.put(L, f"{join_and(self.E(t) for t in s.targets)}を消す")
        else:
            self.put(L, self.seg(s))

    def kw_line(self, body_line, kw):
        for i in range(body_line - 1, 0, -1):
            if self.lines[i - 1].strip().startswith(kw):
                return i
        return body_line - 1

    def if_chain(self, s, first):
        L = s.lineno
        c = cond_form(self.P(s.test))
        if first:
            self.put(L, f"もし{c}、次を実行する")
        else:
            self.put(L, f"そうでなく、もし{c}、次を実行する")
        self.stmts(s.body)
        if s.orelse:
            o = s.orelse[0]
            if len(s.orelse) == 1 and isinstance(o, ast.If) and self.lines[o.lineno - 1].lstrip().startswith("elif"):
                self.if_chain(o, first=False)
            else:
                self.put(self.kw_line(o.lineno, "else"), "そうでなければ、次を実行する")
                self.stmts(s.orelse)

    def run(self):
        tree = ast.parse(self.src)
        self.stmts(tree.body)
        res = []
        for i, line in enumerate(self.lines, 1):
            st = line.strip()
            if not st:
                res.append("")
            elif st.startswith("#"):
                res.append("メモ：" + st.lstrip("#").strip())
            else:
                res.append(self.out.get(i, ""))
        return res


def yomi(src: str) -> list[str]:
    return Yomi(src).run()


def compose(code_lines, readings):
    """インデントに合わせて「ここから」「ここまで」をつける（表示用と同じ規則）。"""
    def lvl(s):
        return (len(s) - len(s.lstrip(" "))) // 4
    idx = [i for i, s in enumerate(code_lines) if s.strip()]
    out = list(readings)
    for k, i in enumerate(idx):
        cur = lvl(code_lines[i])
        prev = lvl(code_lines[idx[k - 1]]) if k > 0 else 0
        nxt = lvl(code_lines[idx[k + 1]]) if k + 1 < len(idx) else 0
        pre = "ここから、" * max(0, cur - prev)
        post = "、ここまで" * max(0, cur - nxt)
        out[i] = pre + out[i] + post
    return out


if __name__ == "__main__":
    src = sys.argv[1].encode().decode("unicode_escape") if len(sys.argv) > 1 else sys.stdin.read()
    lines = src.rstrip("\n").split("\n")
    for c, r in zip(lines, compose(lines, yomi(src.rstrip("\n")))):
        print(f"{c:<40} | {r}")
