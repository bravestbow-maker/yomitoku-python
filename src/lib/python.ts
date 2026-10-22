import type { RunResult } from "./types.ts";

export type PyStatus = "idle" | "loading" | "ready" | "error";

const TIMEOUT_MS = 4000;
let worker: Worker | null = null;
let status: PyStatus = "idle";
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
const listeners = new Set<(s: PyStatus) => void>();
let readyPromise: Promise<void> | null = null;

const base = () => new URL("./pyodide/", document.baseURI).href;

function setStatus(s: PyStatus) {
  status = s;
  listeners.forEach((f) => f(s));
}

export function pyStatus() {
  return status;
}

export function onPyStatus(f: (s: PyStatus) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

function spawn() {
  worker = new Worker(new URL("../py/worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const { id, ok, res, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(res) : p.reject(error);
  };
  worker.onerror = () => setStatus("error");
}

function call(msg: Record<string, unknown>) {
  if (!worker) spawn();
  const id = ++seq;
  return {
    id,
    promise: new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker!.postMessage({ ...msg, id, base: base() });
    }),
  };
}

/** Python の読み込みを始める（待たなくてよい） */
export function preloadPython(): Promise<void> {
  if (!readyPromise) {
    setStatus("loading");
    readyPromise = call({ kind: "load" })
      .promise.then(() => setStatus("ready"))
      .catch(() => {
        setStatus("error");
        readyPromise = null;
      }) as Promise<void>;
  }
  return readyPromise;
}

/** コードを実行する。ずっと終わらないときは止めて、ワーカーを作りなおす。 */
export async function runPython(src: string, stdin: string[] = []): Promise<RunResult> {
  await preloadPython();
  if (status !== "ready") throw new Error("python-unavailable");
  const { id, promise } = call({ kind: "run", src, stdin });
  let timer = 0;
  const timeout = new Promise<RunResult>((resolve) => {
    timer = window.setTimeout(() => {
      pending.delete(id);
      worker?.terminate();
      worker = null;
      readyPromise = null;
      setStatus("idle");
      preloadPython();
      resolve({ out: "", err: null, timeout: true });
    }, TIMEOUT_MS);
  });
  const res = (await Promise.race([promise, timeout])) as RunResult;
  clearTimeout(timer);
  return res;
}
