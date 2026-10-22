export type ProblemType = "output" | "value" | "blank" | "write" | "fill" | "bug";

export interface WriteCheck {
  setup: string;
  probe: string;
  expect: string;
}

export interface Problem {
  id: string;
  type: ProblemType;
  prompt: string;
  hint: string;
  explain: string;
  code: string;
  reading: string[];
  answers: string[];
  solved?: string;
  solvedReading?: string[];
  terms?: string[];
  stdin?: string[];
  // output
  err?: boolean;
  allowError?: boolean;
  // value
  var?: string;
  expr?: string;
  after?: number;
  // blank
  line?: number;
  template?: string;
  // write
  target?: string[];
  checks?: WriteCheck[];
  // fill
  blankLine?: number;
  expected?: string;
  // bug
  fixedLine?: string;
  intent?: string;
  // 卒業試験
  focus?: [number, number];
  until?: number;
  outFrom?: number;
}

export interface Lesson {
  id: string;
  title: string;
  problems: Problem[];
}

export interface Pattern {
  code: string;
  note: string;
  reading: string[];
}

export interface Chapter {
  num: number;
  id: string;
  title: string;
  desc: string;
  detect: string | null;
  lessons: Lesson[];
  check: Problem[];
  diag: Problem | null;
  patterns: Pattern[];
}

export interface Course {
  version: number;
  glossary: Record<string, string>;
  chapters: Chapter[];
}

export interface RunResult {
  out: string;
  err: { type: string; msg: string; line: number | null } | null;
  timeout?: boolean;
}

export type Runner = (src: string, stdin?: string[]) => Promise<RunResult>;
