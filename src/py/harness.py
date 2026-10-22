"""ブラウザ（Pyodide）と問題チェック（Node + Pyodide）の両方で使う実行用の土台。

run_user(src, inputs) はコードを新しい名前空間で実行し、
(表示された文字, エラー情報, 名前空間) を返す。
input() は inputs のリストから順に値を返す。
"""
import builtins as _builtins
import contextlib as _contextlib
import io as _io
import json as _json
import traceback as _traceback

_LIMIT = 20000


class _Out(_io.StringIO):
    def write(self, s):
        if self.tell() + len(s) > _LIMIT:
            raise RuntimeError("表示が多すぎるので止めました")
        return super().write(s)


def _err_line(e):
    line = None
    for frame in _traceback.extract_tb(e.__traceback__):
        if frame.filename == "<code>":
            line = frame.lineno
    return line


def run_user(src, inputs=()):
    out = _Out()
    it = iter([str(x) for x in inputs])

    def _input(prompt=""):
        out.write(str(prompt))
        try:
            return next(it)
        except StopIteration:
            raise EOFError("EOF when reading a line") from None

    g = {"__name__": "__main__", "__builtins__": _builtins, "input": _input}
    err = None
    try:
        code = compile(src, "<code>", "exec")
        with _contextlib.redirect_stdout(out):
            exec(code, g)
    except SyntaxError as e:
        err = {"type": type(e).__name__, "msg": str(e.msg), "line": e.lineno}
    except BaseException as e:  # noqa: BLE001
        err = {"type": type(e).__name__, "msg": str(e), "line": _err_line(e)}
    return out.getvalue(), err, g


def run_json(src, inputs_json="[]"):
    out, err, _ = run_user(src, _json.loads(inputs_json))
    return _json.dumps({"out": out, "err": err}, ensure_ascii=False)


def value_json(src, var, inputs_json="[]"):
    out, err, g = run_user(src, _json.loads(inputs_json))
    val = repr(g[var]) if var in g else None
    return _json.dumps({"out": out, "err": err, "value": val}, ensure_ascii=False)
