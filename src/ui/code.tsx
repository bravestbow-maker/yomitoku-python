import type { JSX } from "preact";
import type { ComposedLine } from "../lib/reading.ts";

const KW = new Set("if elif else for while in not and or def return class import from as try except finally raise break continue pass lambda is with None True False global del yield assert".split(" "));
const BI = new Set("print len range int str float input type sum max min sorted enumerate zip list dict tuple set abs round super isinstance reversed".split(" "));

type Tok = { t: string; c: string };

export function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const push = (t: string, c: string) => out.push({ t, c });
  while (i < line.length) {
    const rest = line.slice(i);
    let m: RegExpMatchArray | null;
    if (rest.startsWith("___")) {
      push("___", "blank");
      i += 3;
    } else if ((m = rest.match(/^[fF]?("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)/))) {
      push(m[0], "str");
      i += m[0].length;
    } else if (rest.startsWith("#")) {
      push(rest, "com");
      i = line.length;
    } else if ((m = rest.match(/^\d+(\.\d+)?/))) {
      push(m[0], "num");
      i += m[0].length;
    } else if ((m = rest.match(/^[A-Za-z_]\w*/))) {
      const w = m[0];
      const next = line.slice(i + w.length).trimStart()[0];
      push(w, KW.has(w) ? "kw" : BI.has(w) ? "bi" : next === "(" ? "fn" : w === "self" ? "self" : "id");
      i += w.length;
    } else if ((m = rest.match(/^\s+/))) {
      push(m[0], "ws");
      i += m[0].length;
    } else {
      push(rest[0], /[()[\]{}]/.test(rest[0]) ? "br" : "op");
      i += 1;
    }
  }
  return out;
}

export function Highlight({ line }: { line: string }) {
  return (
    <>
      {tokenize(line).map((k) =>
        k.c === "blank" ? <span class="tk-blank">＿＿＿</span> : k.c === "ws" ? k.t : <span class={`tk-${k.c}`}>{k.t}</span>,
      )}
    </>
  );
}

export function ReadingText({ part }: { part: ComposedLine }) {
  return (
    <>
      {Array.from({ length: part.pre }, () => <span class="kk">ここから</span>)}
      <span>{part.body}</span>
      {Array.from({ length: part.post }, () => <span class="kk">ここまで</span>)}
    </>
  );
}

export interface CodeViewProps {
  lines: string[];
  parts: ComposedLine[];
  shown: Set<number>;
  tappable: boolean;
  onTap?: (i: number) => void;
  active?: number | null;
  flash?: boolean;
  hidden?: Set<number>;
  focus?: [number, number];
  tags?: Map<number, number[]>;
  ghost?: string;
  mark?: number | null;
}

export function CodeView(p: CodeViewProps) {
  const rows: JSX.Element[] = p.lines.map((line, i) => {
    const showReading = p.shown.has(i) && !p.hidden?.has(i) && !!p.parts[i]?.body;
    const dim = p.focus ? i + 1 < p.focus[0] || i + 1 > p.focus[1] : false;
    const tags = p.tags?.get(i);
    const cls = [
      "cl",
      p.tappable && line.trim() ? "tap" : "",
      p.active === i ? "active" : "",
      dim ? "dim" : "",
      p.mark === i + 1 ? "mark" : "",
      p.flash ? "flash" : "",
    ].join(" ");
    return (
      <div class={cls} style={p.flash ? { animationDelay: `${i * 90}ms` } : undefined} key={i}
        onClick={p.tappable && line.trim() ? () => p.onTap?.(i) : undefined}
        role={p.tappable && line.trim() ? "button" : undefined}
        tabIndex={p.tappable && line.trim() ? 0 : undefined}
        onKeyDown={(e) => p.tappable && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), p.onTap?.(i))}
        aria-label={p.tappable ? `${i + 1}行目の読み下しを見る` : undefined}>
        <span class="ln">{i + 1}</span>
        <div class="cbody">
          <code class="ctext"><Highlight line={line} />{tags && tags.map((n) => <span class="chtag">この書き方は第{n}章</span>)}</code>
          {showReading && <div class="rd"><ReadingText part={p.parts[i]} /></div>}
        </div>
      </div>
    );
  });
  if (p.ghost !== undefined) {
    rows.push(
      <div class="cl ghost" key="ghost">
        <span class="ln">{p.lines.length + (p.lines[0] === "" && p.lines.length === 1 ? 0 : 1)}</span>
        <div class="cbody"><code class="ctext">{p.ghost || <span class="ghost-cursor">▍</span>}</code></div>
      </div>,
    );
  }
  return <div class="code">{rows}</div>;
}
