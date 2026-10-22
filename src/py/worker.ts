/// <reference lib="webworker" />
// Python（Pyodide）をメインの画面とは別のスレッドで動かす。読み込み中も画面の操作は止まらない。
import harness from "./harness.py?raw";

type Py = { runPython: (s: string) => unknown; globals: { get: (k: string) => (...a: string[]) => string } };
let py: Py | null = null;
let loading: Promise<Py> | null = null;

async function load(base: string): Promise<Py> {
  if (py) return py;
  if (!loading) {
    loading = (async () => {
      const mod = await import(/* @vite-ignore */ `${base}pyodide.mjs`);
      const p = (await mod.loadPyodide({ indexURL: base })) as Py;
      p.runPython(harness);
      py = p;
      return p;
    })();
  }
  return loading;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, kind, base, src, stdin } = e.data as { id: number; kind: string; base: string; src?: string; stdin?: string[] };
  try {
    const p = await load(base);
    if (kind === "load") {
      postMessage({ id, ok: true });
      return;
    }
    const res = p.globals.get("run_json")(src ?? "", JSON.stringify(stdin ?? []));
    postMessage({ id, ok: true, res: JSON.parse(res) });
  } catch (err) {
    postMessage({ id, ok: false, error: String(err) });
  }
};
