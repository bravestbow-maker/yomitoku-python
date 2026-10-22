// 記録の保存（localStorage）と、画面への変更の通知
import { useEffect, useState } from "preact/hooks";
import { type AppState, initialState, migrate } from "./logic.ts";

export const STORAGE_KEY = "yomitoku-python:v1";

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : initialState();
  } catch {
    return initialState();
  }
}

let state: AppState = load();
const subs = new Set<() => void>();
let saveFailed = false;

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveFailed = false;
  } catch {
    saveFailed = true;
  }
}

export const getState = () => state;
export const lastSaveFailed = () => saveFailed;

/** 記録を書きかえる。fn の中では s を直接変えてよい。 */
export function update<T>(fn: (s: AppState) => T): T {
  const next = structuredClone(state);
  const ret = fn(next);
  state = next;
  save();
  subs.forEach((f) => f());
  return ret;
}

export function resetAll() {
  state = initialState();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 保存できない環境 */
  }
  subs.forEach((f) => f());
}

export function useAppState(): AppState {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return state;
}

// 別のタブで変わったときも合わせる
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      state = load();
      subs.forEach((f) => f());
    }
  });
}
