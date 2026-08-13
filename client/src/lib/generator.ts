/* ============================================================
   PassForge generator core — ported verbatim from PassForge v1
   (app.js). Randomness: crypto.getRandomValues with rejection
   sampling (no modulo bias). Never Math.random().
   ============================================================ */
import { WORDLIST } from "./wordlist";

export const WORDS: string[] = WORDLIST.filter(Boolean);

/* ---------- CSPRNG helpers ---------- */
export function randInt(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error("empty range");
  if (maxExclusive === 1) return 0;
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  let v: number;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return v % maxExclusive;
}
export const pick = <T,>(arr: T[]): T => arr[randInt(arr.length)];
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- character sets ---------- */
export const LOWER = "abcdefghijklmnopqrstuvwxyz";
export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DIGITS = "0123456789";
export const SIMILAR = "il1LoO0|";
export const SHELL_UNSAFE = "{}[]()/\\'\"`~,;:<>";
export const DEFAULT_SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?/";
const VOWELS = ["a", "e", "i", "o", "u", "ai", "ea", "ou", "ie", "oo"];
const ONSETS = ["b","c","d","f","g","h","j","k","l","m","n","p","r","s","t","v","w","z","br","cr","dr","fl","gr","pl","pr","sk","sl","sn","st","tr","ch","sh","th"];
const CODAS = ["", "n", "r", "s", "l", "m", "k", "d", "t", "ng", "st", "nd"];

const uniq = (s: string) => Array.from(new Set(s.split(""))).join("");

export type GenMode = "random" | "passphrase" | "pronounce" | "pattern" | "pin";

export type GenResult = { value: string; bits: number; pool: number; notes: string[] };

export type RandomOpts = {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  symbolSet: string;
  extraChars: string;
  excludeChars: string;
  eachSet: boolean;
  avoidSimilar: boolean;
  avoidShellUnsafe: boolean;
  noRepeat: boolean;
  noSequence: boolean;
  startLetter: boolean;
};

export type PassphraseOpts = {
  words: number;
  separator: string;
  wordCase: "lower" | "title" | "upper" | "random";
  appendDigit: boolean;
  appendSymbol: boolean;
  symbolSet: string;
};

export type PronounceOpts = { syllables: number; digits: boolean; capitals: boolean };
export type PatternOpts = { pattern: string; symbolSet: string };
export type PinOpts = { length: number; noRepeat: boolean; noSequence: boolean };

export type GenConfig = {
  mode: GenMode;
  random: RandomOpts;
  passphrase: PassphraseOpts;
  pronounce: PronounceOpts;
  pattern: PatternOpts;
  pin: PinOpts;
};

export const defaultConfig = (): GenConfig => ({
  mode: "random",
  random: {
    length: 20,
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
    symbolSet: DEFAULT_SYMBOLS,
    extraChars: "",
    excludeChars: "",
    eachSet: true,
    avoidSimilar: false,
    avoidShellUnsafe: false,
    noRepeat: false,
    noSequence: false,
    startLetter: false,
  },
  passphrase: {
    words: 5,
    separator: "-",
    wordCase: "title",
    appendDigit: true,
    appendSymbol: false,
    symbolSet: DEFAULT_SYMBOLS,
  },
  pronounce: { syllables: 5, digits: true, capitals: true },
  pattern: { pattern: "Cvcvc-####-AAaa!", symbolSet: DEFAULT_SYMBOLS },
  pin: { length: 6, noRepeat: false, noSequence: true },
});

/* ---------- random-character mode ---------- */
function buildSets(o: RandomOpts): string[] {
  const excluded = new Set((o.excludeChars || "").split(""));
  if (o.avoidSimilar) SIMILAR.split("").forEach((c) => excluded.add(c));
  if (o.avoidShellUnsafe) SHELL_UNSAFE.split("").forEach((c) => excluded.add(c));

  const clean = (s: string) =>
    uniq(s)
      .split("")
      .filter((c) => !excluded.has(c))
      .join("");

  const sets: string[] = [];
  if (o.lower) sets.push(clean(LOWER));
  if (o.upper) sets.push(clean(UPPER));
  if (o.digits) sets.push(clean(DIGITS));
  if (o.symbols) sets.push(clean(o.symbolSet || ""));
  const extra = clean(o.extraChars || "");
  if (extra) sets.push(extra);
  return sets.filter((s) => s.length > 0);
}

export function hasRun(str: string, n: number): boolean {
  for (let i = 0; i + n <= str.length; i++) {
    let up = true,
      down = true;
    for (let k = 1; k < n; k++) {
      const d = str.charCodeAt(i + k) - str.charCodeAt(i + k - 1);
      if (d !== 1) up = false;
      if (d !== -1) down = false;
    }
    if (up || down) return true;
  }
  return false;
}

export function genRandom(o: RandomOpts): GenResult {
  const len = o.length;
  const sets = buildSets(o);
  const notes: string[] = [];
  if (!sets.length) return { value: "", bits: 0, pool: 0, notes: ["Select at least one character set."] };

  const pool = uniq(sets.join(""));
  const needEach = o.eachSet;
  const noRepeat = o.noRepeat;

  if (noRepeat && len > pool.length) {
    notes.push('Pool has only ' + pool.length + ' unique characters — "no repeats" caps the length there.');
  }
  if (needEach && len < sets.length) {
    notes.push("Length is shorter than the number of selected sets, so not every set can appear.");
  }

  const target = noRepeat ? Math.min(len, pool.length) : len;
  let out = "";
  for (let attempt = 0; attempt < 400; attempt++) {
    const chars: string[] = [];
    const used = new Set<string>();
    const take = (from: string): string | null => {
      for (let t = 0; t < 200; t++) {
        const c = from[randInt(from.length)];
        if (noRepeat && used.has(c)) continue;
        used.add(c);
        return c;
      }
      return null;
    };
    if (needEach) {
      for (const s of sets) {
        if (chars.length >= target) break;
        const c = take(s);
        if (c) chars.push(c);
      }
    }
    while (chars.length < target) {
      const c = take(pool);
      if (!c) break;
      chars.push(c);
    }
    shuffle(chars);
    let candidate = chars.join("");

    if (o.startLetter) {
      const letters = candidate.split("").filter((c) => /[a-z]/i.test(c));
      if (letters.length) {
        const first = letters[randInt(letters.length)];
        const i = candidate.indexOf(first);
        candidate = first + candidate.slice(0, i) + candidate.slice(i + 1);
      }
    }
    if (o.noSequence && hasRun(candidate, 3)) continue;
    out = candidate;
    break;
  }
  if (!out)
    return { value: "", bits: 0, pool: pool.length, notes: ["Rules are too strict to satisfy — relax one of them."] };

  let bits: number;
  if (noRepeat) {
    bits = 0;
    for (let i = 0; i < out.length; i++) bits += Math.log2(pool.length - i);
  } else {
    bits = out.length * Math.log2(pool.length);
  }
  return { value: out, bits, pool: pool.length, notes };
}

/* ---------- passphrase ---------- */
export function genPassphrase(o: PassphraseOpts): GenResult {
  const n = o.words;
  const sep = o.separator;
  const style = o.wordCase;
  const symbols = uniq(o.symbolSet || "!@#$%");
  const chosen: string[] = [];
  for (let i = 0; i < n; i++) {
    let w = pick(WORDS);
    if (style === "title") w = w[0].toUpperCase() + w.slice(1);
    else if (style === "upper") w = w.toUpperCase();
    else if (style === "random")
      w = w
        .split("")
        .map((c) => (randInt(2) ? c.toUpperCase() : c))
        .join("");
    chosen.push(w);
  }
  let value = chosen.join(sep);
  let bits = n * Math.log2(WORDS.length);
  if (o.appendDigit) {
    value += sep + DIGITS[randInt(10)];
    bits += Math.log2(10);
  }
  if (o.appendSymbol) {
    value += symbols[randInt(symbols.length)];
    bits += Math.log2(symbols.length);
  }
  const notes = [
    "Drawn from " + WORDS.length + " words = " + Math.log2(WORDS.length).toFixed(2) + " bits per word.",
  ];
  return { value, bits, pool: WORDS.length, notes };
}

/* ---------- pronounceable ---------- */
export function genPronounceable(o: PronounceOpts): GenResult {
  const syl = o.syllables;
  let out = "";
  let bits = 0;
  for (let i = 0; i < syl; i++) {
    out += pick(ONSETS) + pick(VOWELS) + pick(CODAS);
    bits += Math.log2(ONSETS.length * VOWELS.length * CODAS.length);
  }
  const chars = out.split("");
  if (o.capitals) {
    const n = Math.max(1, Math.round(chars.length / 5));
    for (let i = 0; i < n; i++) {
      const p = randInt(chars.length);
      chars[p] = chars[p].toUpperCase();
    }
    bits += n * Math.log2(chars.length);
  }
  if (o.digits) {
    for (let i = 0; i < 2; i++) chars.splice(randInt(chars.length + 1), 0, DIGITS[randInt(10)]);
    bits += 2 * Math.log2(10);
  }
  return {
    value: chars.join(""),
    bits,
    pool: ONSETS.length * VOWELS.length * CODAS.length,
    notes: ["Entropy is estimated from syllable combinations, not character count."],
  };
}

/* ---------- pattern ---------- */
export const PATTERN_TOKENS: { token: string; meaning: string }[] = [
  { token: "a", meaning: "lowercase letter a-z" },
  { token: "A", meaning: "uppercase letter A-Z" },
  { token: "L", meaning: "any letter, either case" },
  { token: "d / #", meaning: "digit 0-9" },
  { token: "!", meaning: "symbol from the symbol set" },
  { token: "*", meaning: "any letter, digit or symbol" },
  { token: "c / C", meaning: "consonant, lower / upper" },
  { token: "v / V", meaning: "vowel, lower / upper" },
  { token: "h / H", meaning: "hex digit, lower / upper" },
  { token: "\\x", meaning: "escape — emit x literally" },
];

export function genPattern(o: PatternOpts): GenResult {
  const tpl = o.pattern || "";
  const symbols = uniq(o.symbolSet || "!@#$%");
  const cons = "bcdfghjklmnpqrstvwxyz";
  const vows = "aeiou";
  const map: Record<string, string> = {
    a: LOWER,
    A: UPPER,
    L: LOWER + UPPER,
    d: DIGITS,
    "#": DIGITS,
    "!": symbols,
    "*": LOWER + UPPER + DIGITS + symbols,
    c: cons,
    C: cons.toUpperCase(),
    v: vows,
    V: vows.toUpperCase(),
    h: "0123456789abcdef",
    H: "0123456789ABCDEF",
  };
  let out = "",
    bits = 0;
  for (let i = 0; i < tpl.length; i++) {
    const ch = tpl[i];
    if (ch === "\\" && i + 1 < tpl.length) {
      out += tpl[++i];
      continue;
    }
    const set = map[ch];
    if (set) {
      out += set[randInt(set.length)];
      bits += Math.log2(set.length);
    } else out += ch;
  }
  return { value: out, bits, pool: 0, notes: ["Literal characters in the template add no entropy."] };
}

/* ---------- PIN ---------- */
export function genPin(o: PinOpts): GenResult {
  const n = o.length;
  const noRepeat = o.noRepeat;
  const noSeq = o.noSequence;
  let out = "";
  for (let attempt = 0; attempt < 500; attempt++) {
    const digits: string[] = [];
    const used = new Set<string>();
    while (digits.length < n) {
      const d = DIGITS[randInt(10)];
      if (noRepeat && used.has(d)) {
        if (used.size >= 10) break;
        continue;
      }
      used.add(d);
      digits.push(d);
    }
    const cand = digits.join("");
    if (cand.length < n) break;
    if (noSeq && (hasRun(cand, 3) || /^(19|20)\d\d$/.test(cand) || /^(\d)\1+$/.test(cand))) continue;
    out = cand;
    break;
  }
  if (!out)
    return {
      value: "",
      bits: 0,
      pool: 10,
      notes: ["Cannot satisfy those PIN rules — reduce the length or relax a rule."],
    };
  const bits = noRepeat
    ? Array.from({ length: out.length }, (_, i) => Math.log2(10 - i)).reduce((a, b) => a + b, 0)
    : out.length * Math.log2(10);
  return { value: out, bits, pool: 10, notes: ["PINs are low-entropy by nature — use only where a keypad forces it."] };
}

export function generate(config: GenConfig): GenResult {
  switch (config.mode) {
    case "passphrase":
      return genPassphrase(config.passphrase);
    case "pronounce":
      return genPronounceable(config.pronounce);
    case "pattern":
      return genPattern(config.pattern);
    case "pin":
      return genPin(config.pin);
    default:
      return genRandom(config.random);
  }
}

/* ---------- entropy presentation (verbatim from v1) ---------- */
export function humanTime(s: number): string {
  if (!isFinite(s)) return "beyond measure";
  if (s < 1) return "instant";
  /* Past a trillion years the unit ladder stops being readable, so switch to
     an order-of-magnitude figure in years. The underlying math is unchanged. */
  const years = s / 31_557_600;
  if (years >= 1e12) {
    const sup = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    const exp = String(Math.floor(Math.log10(years)))
      .split("")
      .map((d) => sup[Number(d)])
      .join("");
    return `10${exp} years`;
  }
  /* [singular, plural, divisor to reach the next unit] */
  const u: [string, string, number][] = [
    ["second", "seconds", 60],
    ["minute", "minutes", 60],
    ["hour", "hours", 24],
    ["day", "days", 365.25],
    ["year", "years", 1000],
    ["millennium", "millennia", 1e6],
    ["million millennia", "million millennia", Infinity],
  ];
  let v = s,
    i = 0;
  while (i < u.length - 1 && v >= u[i][2]) {
    v /= u[i][2];
    i++;
  }
  const label = Math.abs(v - 1) < 0.05 ? u[i][0] : u[i][1];
  if (v >= 1e6) return v.toExponential(2) + " " + label;
  const n = v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();
  return n + " " + label;
}

export function crackTime(bits: number, guessesPerSecond = 1e11): string {
  const guesses = Math.pow(2, bits) / 2;
  return humanTime(guesses / guessesPerSecond);
}

export const ATTACKERS: { name: string; rate: number; detail: string }[] = [
  { name: "Online, throttled", rate: 100, detail: "100 guesses/s — a login form with rate limiting" },
  { name: "Online, unthrottled", rate: 1e4, detail: "10⁴ guesses/s — an unprotected API endpoint" },
  { name: "Offline, GPU rig", rate: 1e11, detail: "10¹¹ guesses/s — leaked hash, fast consumer hardware" },
  { name: "Nation-state cluster", rate: 1e14, detail: "10¹⁴ guesses/s — industrial-scale cracking" },
];

export type Verdict = "Very weak" | "Weak" | "Reasonable" | "Strong" | "Very strong" | "Overkill (great)";

export function verdictFor(bits: number): { label: Verdict; tone: "danger" | "warn" | "good" | "accent" } {
  if (bits < 28) return { label: "Very weak", tone: "danger" };
  if (bits < 40) return { label: "Weak", tone: "danger" };
  if (bits < 60) return { label: "Reasonable", tone: "warn" };
  if (bits < 80) return { label: "Strong", tone: "good" };
  if (bits < 112) return { label: "Very strong", tone: "good" };
  return { label: "Overkill (great)", tone: "accent" };
}

/** Coarse bucket used by the analytics charts. */
export function strengthClass(bits: number): "weak" | "reasonable" | "strong" | "overkill" {
  if (bits < 40) return "weak";
  if (bits < 60) return "reasonable";
  if (bits < 100) return "strong";
  return "overkill";
}

export const ENTROPY_BUCKETS = [
  { name: "<40", min: 0, max: 40 },
  { name: "40-59", min: 40, max: 60 },
  { name: "60-79", min: 60, max: 80 },
  { name: "80-99", min: 80, max: 100 },
  { name: "100+", min: 100, max: Infinity },
];

/* ---------- analyzer for the Audit view ---------- */
export type Finding = { level: "bad" | "warn" | "ok"; text: string };

export function analyzePassword(value: string): { bits: number; findings: Finding[]; poolSize: number } {
  const findings: Finding[] = [];
  if (!value) return { bits: 0, findings: [], poolSize: 0 };

  let pool = 0;
  if (/[a-z]/.test(value)) pool += 26;
  if (/[A-Z]/.test(value)) pool += 26;
  if (/[0-9]/.test(value)) pool += 10;
  const symbolCount = new Set(value.replace(/[a-zA-Z0-9]/g, "").split("")).size;
  if (symbolCount) pool += Math.max(symbolCount, 10);
  let bits = value.length * Math.log2(Math.max(pool, 2));

  if (value.length < 12) {
    findings.push({ level: "bad", text: `Only ${value.length} characters — 16 or more is the modern baseline.` });
  } else {
    findings.push({ level: "ok", text: `${value.length} characters long.` });
  }
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value))
    findings.push({ level: "warn", text: "Mixed letter case would widen the search space." });
  if (!/[0-9]/.test(value)) findings.push({ level: "warn", text: "No digits." });
  if (!symbolCount) findings.push({ level: "warn", text: "No symbols." });
  if (hasRun(value, 3)) {
    findings.push({ level: "bad", text: "Contains a run like abc or 123 — crackers try these first." });
    bits -= 8;
  }
  if (/(.)\1{2,}/.test(value)) {
    findings.push({ level: "bad", text: "Contains a character repeated three or more times." });
    bits -= 6;
  }
  if (/(19|20)\d\d/.test(value)) {
    findings.push({ level: "bad", text: "Contains a four-digit year — a classic dictionary rule." });
    bits -= 10;
  }
  const lowered = value.toLowerCase();
  const common = ["password", "qwerty", "admin", "letmein", "welcome", "iloveyou", "dragon", "monkey"];
  const hit = common.find((c) => lowered.includes(c));
  if (hit) {
    findings.push({ level: "bad", text: `Contains the common token "${hit}".` });
    bits -= 20;
  }
  const wordHit = WORDS.filter((w) => w.length >= 5 && lowered.includes(w));
  if (wordHit.length >= 3)
    findings.push({ level: "ok", text: `Reads as a ${wordHit.length}-word passphrase — length carries the strength.` });

  return { bits: Math.max(0, bits), findings, poolSize: pool };
}
