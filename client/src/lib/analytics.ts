import type { Event } from "@shared/schema";
import type { DecryptedItem } from "@/state/app";
import { ENTROPY_BUCKETS, strengthClass } from "./generator";

export const DAY = 86_400_000;
export const STALE_DAYS = 180;

export function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function shortDate(key: string): string {
  const d = new Date(key + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export type Kpi = {
  id: string;
  label: string;
  value: string;
  delta: number | null;
  deltaLabel: string;
  hint: string;
  goodWhenUp: boolean;
};

export function parseMeta(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

/* ---------------- charts ---------------- */

export function generationSeries(events: Event[], days = 30) {
  const now = Date.now();
  const buckets = new Map<string, { generated: number; saved: number }>();
  for (let i = days - 1; i >= 0; i--) {
    buckets.set(dayKey(now - i * DAY), { generated: 0, saved: 0 });
  }
  for (const e of events) {
    const key = dayKey(e.createdAt);
    const slot = buckets.get(key);
    if (!slot) continue;
    if (e.type === "generated") slot.generated += 1;
    if (e.type === "saved") slot.saved += 1;
  }
  return Array.from(buckets.entries()).map(([key, v]) => ({
    date: key,
    label: shortDate(key),
    ...v,
  }));
}

export function entropyDistribution(items: DecryptedItem[]) {
  return ENTROPY_BUCKETS.map((b) => ({
    bucket: b.name,
    count: items.filter((i) => i.strengthBits >= b.min && i.strengthBits < b.max).length,
  }));
}

export const STRENGTH_MIX = [
  { key: "weak", label: "Weak", chart: "hsl(var(--chart-5))" },
  { key: "reasonable", label: "Reasonable", chart: "hsl(var(--chart-4))" },
  { key: "strong", label: "Strong", chart: "hsl(var(--chart-2))" },
  { key: "overkill", label: "Overkill", chart: "hsl(var(--chart-1))" },
] as const;

export function strengthMix(items: DecryptedItem[]) {
  return STRENGTH_MIX.map((s) => ({
    name: s.label,
    key: s.key,
    value: items.filter((i) => strengthClass(i.strengthBits) === s.key).length,
    fill: s.chart,
  }));
}

export function itemsByTag(items: DecryptedItem[]) {
  const map = new Map<string, { count: number; bits: number }>();
  for (const i of items) {
    const slot = map.get(i.tag) ?? { count: 0, bits: 0 };
    slot.count += 1;
    slot.bits += i.strengthBits;
    map.set(i.tag, slot);
  }
  return Array.from(map.entries())
    .map(([tag, v]) => ({ tag, count: v.count, avgBits: Math.round(v.bits / v.count) }))
    .sort((a, b) => b.count - a.count);
}

export function entropyOverTime(items: DecryptedItem[]) {
  const map = new Map<string, { total: number; count: number }>();
  for (const i of items) {
    const d = new Date(i.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const slot = map.get(key) ?? { total: 0, count: 0 };
    slot.total += i.strengthBits;
    slot.count += 1;
    map.set(key, slot);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => ({
      month: key,
      label: new Date(key + "-01T00:00:00Z").toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      avgBits: Math.round(v.total / v.count),
      items: v.count,
    }));
}

/* ---------------- audit ---------------- */

export type AuditResult = {
  weak: DecryptedItem[];
  reused: { password: string; items: DecryptedItem[] }[];
  stale: DecryptedItem[];
  score: number;
  averageBits: number;
};

export function auditVault(items: DecryptedItem[]): AuditResult {
  const usable = items.filter((i) => !i.decryptError);
  const weak = usable.filter((i) => i.strengthBits < 60).sort((a, b) => a.strengthBits - b.strengthBits);

  const byPassword = new Map<string, DecryptedItem[]>();
  for (const i of usable) {
    if (!i.password) continue;
    const list = byPassword.get(i.password) ?? [];
    list.push(i);
    byPassword.set(i.password, list);
  }
  const reused = Array.from(byPassword.entries())
    .filter(([, list]) => list.length > 1)
    .map(([password, list]) => ({ password, items: list }));

  const cutoff = Date.now() - STALE_DAYS * DAY;
  const stale = usable
    .filter((i) => i.updatedAt < cutoff)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  const averageBits = usable.length
    ? usable.reduce((sum, i) => sum + i.strengthBits, 0) / usable.length
    : 0;

  const reusedCount = reused.reduce((n, r) => n + r.items.length, 0);
  let score = 100;
  if (usable.length) {
    score -= (weak.length / usable.length) * 45;
    score -= (reusedCount / usable.length) * 30;
    score -= (stale.length / usable.length) * 15;
    score -= Math.max(0, (72 - averageBits) / 72) * 20;
  } else {
    score = 0;
  }
  return {
    weak,
    reused,
    stale,
    averageBits,
    score: Math.max(0, Math.min(100, Math.round(score))),
  };
}

/* ---------------- KPIs ---------------- */

export function buildKpis(items: DecryptedItem[], events: Event[]): Kpi[] {
  const now = Date.now();
  const audit = auditVault(items);
  const week = items.filter((i) => i.createdAt > now - 7 * DAY);
  const priorWeek = items.filter((i) => i.createdAt <= now - 7 * DAY && i.createdAt > now - 14 * DAY);
  const genWeek = events.filter((e) => e.type === "generated" && e.createdAt > now - 7 * DAY).length;
  const genPrior = events.filter(
    (e) => e.type === "generated" && e.createdAt <= now - 7 * DAY && e.createdAt > now - 14 * DAY
  ).length;

  const olderItems = items.filter((i) => i.createdAt <= now - 30 * DAY);
  const olderAvg = olderItems.length
    ? olderItems.reduce((s, i) => s + i.strengthBits, 0) / olderItems.length
    : audit.averageBits;

  const reusedCount = audit.reused.reduce((n, r) => n + r.items.length, 0);

  const pct = (current: number, previous: number) =>
    previous === 0 ? (current === 0 ? 0 : 100) : Math.round(((current - previous) / previous) * 100);

  return [
    {
      id: "items",
      label: "Items in vault",
      value: String(items.length),
      delta: week.length - priorWeek.length,
      deltaLabel: `${week.length - priorWeek.length >= 0 ? "+" : ""}${week.length - priorWeek.length} vs last week`,
      hint: "Encrypted entries stored server-side",
      goodWhenUp: true,
    },
    {
      id: "entropy",
      label: "Average entropy",
      value: `${audit.averageBits.toFixed(1)} bits`,
      delta: Math.round(audit.averageBits - olderAvg),
      deltaLabel: `${audit.averageBits - olderAvg >= 0 ? "+" : ""}${(audit.averageBits - olderAvg).toFixed(1)} bits vs 30d ago`,
      hint: "Mean across every stored secret",
      goodWhenUp: true,
    },
    {
      id: "weak",
      label: "Weak items",
      value: String(audit.weak.length),
      delta: -audit.weak.length,
      deltaLabel: audit.weak.length ? "below 60 bits" : "none below 60 bits",
      hint: "Anything under 60 bits of entropy",
      goodWhenUp: false,
    },
    {
      id: "reused",
      label: "Reused passwords",
      value: String(reusedCount),
      delta: -reusedCount,
      deltaLabel: `${audit.reused.length} duplicate group${audit.reused.length === 1 ? "" : "s"}`,
      hint: "Identical secrets across entries",
      goodWhenUp: false,
    },
    {
      id: "score",
      label: "Health score",
      value: `${audit.score}/100`,
      delta: audit.score - 70,
      deltaLabel: audit.score >= 80 ? "healthy vault" : audit.score >= 60 ? "needs attention" : "at risk",
      hint: "Weighted weak / reused / stale / entropy",
      goodWhenUp: true,
    },
    {
      id: "generated",
      label: "Generated this week",
      value: String(genWeek),
      delta: pct(genWeek, genPrior),
      deltaLabel: `${pct(genWeek, genPrior) >= 0 ? "+" : ""}${pct(genWeek, genPrior)}% vs prior week`,
      hint: "Passwords forged in the last 7 days",
      goodWhenUp: true,
    },
  ];
}

/* ---------------- CSV ---------------- */

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const body = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const abs = Math.abs(diff);
  const min = 60_000;
  if (abs < min) return "just now";
  if (abs < 60 * min) return `${Math.floor(abs / min)}m ago`;
  if (abs < 24 * 60 * min) return `${Math.floor(abs / (60 * min))}h ago`;
  /* Floor, not round, so a stamp never claims to be older than its calendar day. */
  const days = Math.floor(abs / DAY);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}
