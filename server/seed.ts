import crypto from "node:crypto";
import { storage, hashAuth } from "./storage";
import { settingsSchema } from "@shared/schema";

/* ------------------------------------------------------------------ *
 * Demo account seeding.
 *
 * The demo vault is encrypted here with exactly the same parameters the
 * browser uses (PBKDF2-SHA256 / 210_000 iterations / AES-256-GCM), so the
 * client can decrypt every seeded item from the master password alone.
 * ------------------------------------------------------------------ */

export const DEMO_EMAIL = "demo@passforge.app";
export const DEMO_PASSWORD = "demo-master-key";
const ITERATIONS = 210_000;

function pbkdf2(password: string, salt: Buffer, bytes = 32): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, bytes, "sha256");
}

function b64(buf: Buffer): string {
  return buf.toString("base64");
}

function encrypt(key: Buffer, plaintext: string): { iv: string; ct: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  // WebCrypto expects the GCM auth tag appended to the ciphertext.
  return { iv: b64(iv), ct: b64(Buffer.concat([body, cipher.getAuthTag()])) };
}

/* deterministic-ish PRNG so the demo data looks the same shape every boot */
let seedState = 20260812;
function rnd(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?/";
const WORDS = [
  "harbor", "lantern", "granite", "meadow", "compass", "cobalt", "thistle", "quarry",
  "cypress", "beacon", "ember", "falcon", "juniper", "marble", "nimbus", "orchid",
  "pebble", "quartz", "ripple", "saffron", "tundra", "velvet", "willow", "zenith",
];

function randomPassword(length: number, sets: string): string {
  let out = "";
  for (let i = 0; i < length; i++) out += sets[Math.floor(rnd() * sets.length)];
  return out;
}

function passphrase(words: number): string {
  const parts: string[] = [];
  for (let i = 0; i < words; i++) {
    const w = pick(WORDS);
    parts.push(w[0].toUpperCase() + w.slice(1));
  }
  return parts.join("-") + "-" + DIGITS[Math.floor(rnd() * 10)];
}

type SeedSpec = {
  label: string;
  username: string;
  url: string;
  tag: string;
  mode: string;
  daysAgo: number;
  strength: "weak" | "reasonable" | "strong" | "overkill";
  reuseOf?: number;
};

const SPECS: SeedSpec[] = [
  { label: "GitHub", username: "avery@studio.dev", url: "github.com", tag: "work", mode: "random", daysAgo: 88, strength: "overkill" },
  { label: "AWS root account", username: "ops@studio.dev", url: "console.aws.amazon.com", tag: "work", mode: "random", daysAgo: 84, strength: "overkill" },
  { label: "Stripe dashboard", username: "billing@studio.dev", url: "dashboard.stripe.com", tag: "finance", mode: "random", daysAgo: 81, strength: "strong" },
  { label: "Home Wi-Fi", username: "", url: "", tag: "home", mode: "passphrase", daysAgo: 79, strength: "strong" },
  { label: "Chase Bank", username: "avery.quinn", url: "chase.com", tag: "finance", mode: "random", daysAgo: 74, strength: "strong" },
  { label: "Old forum login", username: "avery", url: "retroforum.net", tag: "personal", mode: "random", daysAgo: 71, strength: "weak" },
  { label: "Router admin", username: "admin", url: "192.168.1.1", tag: "home", mode: "pin", daysAgo: 68, strength: "weak" },
  { label: "Figma", username: "avery@studio.dev", url: "figma.com", tag: "work", mode: "random", daysAgo: 64, strength: "strong" },
  { label: "Notion workspace", username: "avery@studio.dev", url: "notion.so", tag: "work", mode: "passphrase", daysAgo: 61, strength: "strong" },
  { label: "Linear", username: "avery@studio.dev", url: "linear.app", tag: "work", mode: "random", daysAgo: 57, strength: "reasonable" },
  { label: "Netflix", username: "quinn.household", url: "netflix.com", tag: "media", mode: "pronounce", daysAgo: 54, strength: "reasonable", reuseOf: 9 },
  { label: "Spotify family", username: "quinn.household", url: "spotify.com", tag: "media", mode: "pronounce", daysAgo: 52, strength: "reasonable", reuseOf: 10 },
  { label: "Cloudflare", username: "ops@studio.dev", url: "dash.cloudflare.com", tag: "work", mode: "random", daysAgo: 47, strength: "overkill" },
  { label: "Postgres prod", username: "app_rw", url: "db.studio.internal", tag: "work", mode: "random", daysAgo: 44, strength: "overkill" },
  { label: "Apple ID", username: "avery@icloud.com", url: "appleid.apple.com", tag: "personal", mode: "passphrase", daysAgo: 40, strength: "strong" },
  { label: "Vanguard", username: "aquinn", url: "investor.vanguard.com", tag: "finance", mode: "random", daysAgo: 36, strength: "strong" },
  { label: "Doctor portal", username: "a.quinn", url: "myhealth.example.org", tag: "personal", mode: "pattern", daysAgo: 31, strength: "reasonable" },
  { label: "Airline miles", username: "AQ4471820", url: "fly.example.com", tag: "travel", mode: "pin", daysAgo: 27, strength: "weak" },
  { label: "Hotel rewards", username: "avery@studio.dev", url: "stay.example.com", tag: "travel", mode: "random", daysAgo: 23, strength: "reasonable" },
  { label: "Coffee subscription", username: "avery@studio.dev", url: "roasters.example.com", tag: "personal", mode: "pronounce", daysAgo: 18, strength: "reasonable" },
  { label: "Sentry", username: "ops@studio.dev", url: "sentry.io", tag: "work", mode: "random", daysAgo: 13, strength: "strong" },
  { label: "npm publish token", username: "studio-bot", url: "npmjs.com", tag: "work", mode: "random", daysAgo: 9, strength: "overkill" },
  { label: "Backup drive", username: "", url: "", tag: "home", mode: "passphrase", daysAgo: 5, strength: "strong" },
  { label: "Tax portal", username: "avery.quinn", url: "tax.example.gov", tag: "finance", mode: "random", daysAgo: 2, strength: "strong" },
  /* Deliberately old entries so the stale (>180 day) audit list has content. */
  { label: "University alumni", username: "a.quinn", url: "alumni.example.edu", tag: "personal", mode: "random", daysAgo: 214, strength: "reasonable" },
  { label: "Storage unit gate", username: "", url: "", tag: "home", mode: "pin", daysAgo: 268, strength: "weak" },
  { label: "Legacy VPN", username: "aquinn", url: "vpn.oldcorp.example", tag: "work", mode: "random", daysAgo: 331, strength: "reasonable" },
  { label: "Frequent ferry pass", username: "AQ8812", url: "ferry.example.com", tag: "travel", mode: "pattern", daysAgo: 402, strength: "reasonable" },
];

function makeSecret(spec: SeedSpec): { value: string; bits: number } {
  if (spec.mode === "passphrase") {
    const words = spec.strength === "overkill" ? 7 : spec.strength === "strong" ? 5 : 4;
    const value = passphrase(words);
    return { value, bits: words * 9.88 + 3.32 };
  }
  if (spec.mode === "pin") {
    const n = spec.strength === "weak" ? 4 : 6;
    let v = "";
    for (let i = 0; i < n; i++) v += DIGITS[Math.floor(rnd() * 10)];
    return { value: v, bits: n * Math.log2(10) };
  }
  if (spec.mode === "pronounce") {
    const value = pick(WORDS) + pick(WORDS) + randInt(10, 99);
    return { value, bits: 48 + rnd() * 8 };
  }
  if (spec.mode === "pattern") {
    const value =
      UPPER[Math.floor(rnd() * 26)] +
      randomPassword(5, LOWER) +
      "-" +
      randomPassword(4, DIGITS) +
      SYMBOLS[Math.floor(rnd() * SYMBOLS.length)];
    return { value, bits: 52 + rnd() * 6 };
  }
  const pool = LOWER + UPPER + DIGITS + SYMBOLS;
  const length =
    spec.strength === "weak" ? randInt(6, 8)
      : spec.strength === "reasonable" ? randInt(10, 11)
        : spec.strength === "strong" ? randInt(14, 17)
          : randInt(22, 30);
  const usedPool = spec.strength === "weak" ? LOWER + DIGITS : pool;
  const value = randomPassword(length, usedPool);
  return { value, bits: length * Math.log2(usedPool.length) };
}

export async function seedDemoAccount(): Promise<void> {
  const existing = await storage.getUserByEmail(DEMO_EMAIL);
  if (existing) return;

  const vaultSaltBytes = crypto.randomBytes(16);
  const vaultSalt = b64(vaultSaltBytes);
  const vaultKey = pbkdf2(DEMO_PASSWORD, vaultSaltBytes);
  const authHash = pbkdf2(DEMO_PASSWORD, Buffer.from(`auth|${DEMO_EMAIL}`, "utf8")).toString("hex");
  const authSalt = crypto.randomBytes(16).toString("hex");

  const settings = settingsSchema.parse({});
  const user = await storage.createUser({
    email: DEMO_EMAIL,
    name: "Avery Quinn",
    authSalt,
    authHash: hashAuth(authHash, authSalt),
    vaultSalt,
    settings: JSON.stringify(settings),
  });

  const day = 86_400_000;
  const now = Date.now();
  const created: { value: string; bits: number }[] = [];

  for (let i = 0; i < SPECS.length; i++) {
    const spec = SPECS[i];
    const secret =
      spec.reuseOf !== undefined && created[spec.reuseOf]
        ? created[spec.reuseOf]
        : makeSecret(spec);
    created[i] = secret;

    const notes =
      spec.tag === "work" ? "Rotate with the quarterly access review."
        : spec.tag === "finance" ? "Recovery codes stored offline."
          : "";
    const { iv, ct } = encrypt(vaultKey, JSON.stringify({ password: secret.value, notes }));
    const createdAt = now - spec.daysAgo * day - randInt(0, 20) * 3_600_000;

    await storage.createItem(
      user.id,
      {
        label: spec.label,
        username: spec.username,
        url: spec.url,
        tag: spec.tag,
        mode: spec.mode,
        length: secret.value.length,
        strengthBits: Math.round(secret.bits),
        iv,
        ct,
      },
      createdAt
    );

    await storage.createEvent(
      user.id,
      { type: "generated", meta: JSON.stringify({ mode: spec.mode, bits: Math.round(secret.bits) }) },
      createdAt - 60_000
    );
    await storage.createEvent(
      user.id,
      { type: "saved", meta: JSON.stringify({ label: spec.label, bits: Math.round(secret.bits) }) },
      createdAt
    );
  }

  /* Extra generation activity so the 30-day area chart has texture. */
  for (let d = 0; d < 90; d++) {
    const perDay = d < 30 ? randInt(0, 6) : randInt(0, 3);
    for (let k = 0; k < perDay; k++) {
      const mode = pick(["random", "passphrase", "pronounce", "pattern", "pin"]);
      const bits = randInt(34, 148);
      await storage.createEvent(
        user.id,
        { type: "generated", meta: JSON.stringify({ mode, bits }) },
        now - d * day - randInt(0, 23) * 3_600_000
      );
      if (rnd() > 0.7) {
        await storage.createEvent(
          user.id,
          { type: "copied", meta: JSON.stringify({ mode }) },
          now - d * day - randInt(0, 23) * 3_600_000
        );
      }
    }
    if (d % 7 === 0) {
      await storage.createEvent(
        user.id,
        { type: "login", meta: JSON.stringify({ agent: "demo" }) },
        now - d * day - 8 * 3_600_000
      );
    }
    if (d % 21 === 0) {
      await storage.createEvent(
        user.id,
        { type: "audit", meta: JSON.stringify({ score: randInt(58, 88) }) },
        now - d * day - 10 * 3_600_000
      );
    }
  }
}
