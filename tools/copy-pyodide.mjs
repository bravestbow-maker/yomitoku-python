// Pyodide（ブラウザで動く Python）を public/pyodide にコピーする。CDN に頼らず同じサイトから配信するため。
import { cpSync, mkdirSync } from "node:fs";
const files = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
mkdirSync("public/pyodide", { recursive: true });
for (const f of files) cpSync(`node_modules/pyodide/${f}`, `public/pyodide/${f}`);
console.log("pyodide copied");
