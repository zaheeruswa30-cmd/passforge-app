import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "wouter";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Minus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, StrengthBadge } from "@/components/brand";
import { useApp, useVault } from "@/state/app";
import type { Event } from "@shared/schema";
import {
  auditVault,
  buildKpis,
  downloadCsv,
  entropyDistribution,
  entropyOverTime,
  generationSeries,
  itemsByTag,
  relativeTime,
  strengthMix,
} from "@/lib/analytics";
import type { Kpi } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";

function ChartCard({
  title,
  subtitle,
  children,
  action,
  testId,
  className,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  testId: string;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden ${className ?? ""}`} data-testid={testId}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-2">{children}</CardContent>
    </Card>
  );
}

function ChartTip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-popover-border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined && <div className="mb-1 font-medium text-popover-foreground">{label}</div>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="capitalize">{entry.name}</span>
          <span className="tnum ml-auto font-medium text-popover-foreground">
            {entry.value}
            {unit ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div
      className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-center"
      data-testid="state-chart-empty"
    >
      <Sparkles className="h-5 w-5 text-muted-foreground" />
      <p className="max-w-[240px] text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const positive = kpi.delta !== null && kpi.delta > 0;
  const negative = kpi.delta !== null && kpi.delta < 0;
  const good = kpi.goodWhenUp ? positive : negative;
  const bad = kpi.goodWhenUp ? negative : positive;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;
  return (
    <Card data-testid={`card-kpi-${kpi.id}`}>
      <CardContent className="p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {kpi.label}
        </div>
        <div className="mt-2 text-xl font-semibold tnum" data-testid={`text-kpi-${kpi.id}`}>
          {kpi.value}
        </div>
        <div
          className={`mt-1.5 flex items-center gap-1 text-[11px] ${
            good ? "text-chart-2" : bad ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          <Icon className="h-3 w-3 shrink-0" />
          <span className="truncate tnum">{kpi.deltaLabel}</span>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">{kpi.hint}</div>
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const { user, session } = useApp();
  const { items, isLoading } = useVault();
  const { toast } = useToast();
  const eventsQuery = useQuery<Event[]>({ queryKey: ["/api/events"], enabled: !!session });
  const events = eventsQuery.data ?? [];
  const [stamp, setStamp] = useState(Date.now());
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setStamp(Date.now());
  }, [items.length, events.length]);

  const kpis = useMemo(() => buildKpis(items, events), [items, events]);
  const audit = useMemo(() => auditVault(items), [items]);
  const genSeries = useMemo(() => generationSeries(events, 30), [events]);
  const buckets = useMemo(() => entropyDistribution(items), [items]);
  const mix = useMemo(() => strengthMix(items).filter((m) => m.value > 0), [items]);
  const tags = useMemo(() => itemsByTag(items), [items]);
  const overTime = useMemo(() => entropyOverTime(items), [items]);
  const recent = useMemo(() => items.slice(0, 5), [items]);
  const hasActivity = genSeries.some((d) => d.generated > 0 || d.saved > 0);

  function exportCsv() {
    downloadCsv(`passforge-analytics-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["section", "key", "value"],
      ...kpis.map((k) => ["kpi", k.label, k.value]),
      ...genSeries.map((d) => ["generation_30d", d.date, d.generated]),
      ...buckets.map((b) => ["entropy_bucket", b.bucket, b.count]),
      ...mix.map((m) => ["strength_mix", m.name, m.value]),
      ...tags.map((t) => ["items_by_tag", t.tag, t.count]),
      ...overTime.map((m) => ["avg_entropy_by_month", m.month, m.avgBits]),
    ]);
    toast({ title: "Analytics exported", description: "CSV downloaded to your device." });
  }

  if (isLoading && !items.length) {
    return (
      <div>
        <PageHeader title="Overview" description="Vault health, entropy and generation activity." />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[118px] w-full" />
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[290px] lg:col-span-2" />
          <Skeleton className="h-[290px]" />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="view-overview">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? "operator"}`}
        description="Live analytics across your encrypted vault — entropy, coverage, hygiene and generation cadence."
        actions={
          <>
            <span className="hidden text-xs text-muted-foreground sm:inline" data-testid="text-last-updated">
              Last updated {relativeTime(stamp)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void eventsQuery.refetch();
                setStamp(Date.now());
              }}
              data-testid="button-refresh"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button size="sm" onClick={exportCsv} data-testid="button-export-analytics">
              <Download className="mr-2 h-3.5 w-3.5" />
              Export CSV
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          testId="chart-generation"
          title="Generation activity"
          subtitle="Passwords forged and saved, last 30 days"
        >
          {hasActivity ? (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={genSeries} margin={{ top: 6, right: 10, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="gradGenerated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradSaved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                  minTickGap={12}
                  height={20}
                />
                <YAxis tickLine={false} axisLine={false} width={30} tickMargin={4} allowDecimals={false} />
                <Tooltip content={<ChartTip />} cursor={{ stroke: "hsl(var(--border))" }} />
                <Area
                  type="monotone"
                  dataKey="generated"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  fill="url(#gradGenerated)"
                />
                <Area
                  type="monotone"
                  dataKey="saved"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  fill="url(#gradSaved)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No generation activity yet. Forge a password and it will show up here." />
          )}
        </ChartCard>

        <ChartCard
          testId="chart-strength-mix"
          title="Strength mix"
          subtitle="Share of the vault by strength class"
        >
          {mix.length ? (
            <div className="flex items-center gap-2">
              <ResponsiveContainer width="55%" height={230}>
                <PieChart>
                  <Pie
                    data={mix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  >
                    {mix.map((entry) => (
                      <Cell key={entry.key} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-2 pr-1 text-xs">
                {mix.map((m) => {
                  const total = mix.reduce((a, b) => a + b.value, 0) || 1;
                  return (
                    <li key={m.key} className="flex items-center gap-2" data-testid={`legend-mix-${m.key}`}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: m.fill }} />
                      <span className="truncate text-muted-foreground">{m.name}</span>
                      <span className="ml-auto tnum font-medium">{m.value}</span>
                      <span className="tnum w-10 text-right text-muted-foreground">
                        {Math.round((m.value / total) * 100)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <EmptyChart message="Save your first password to see the strength mix." />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          testId="chart-entropy-distribution"
          title="Entropy distribution"
          subtitle="Items grouped by bits of entropy"
        >
          {items.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={buckets} margin={{ top: 6, right: 10, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} height={20} />
                <YAxis tickLine={false} axisLine={false} width={30} tickMargin={4} allowDecimals={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {buckets.map((b, i) => (
                    <Cell
                      key={b.bucket}
                      fill={
                        i === 0
                          ? "hsl(var(--chart-5))"
                          : i === 1
                            ? "hsl(var(--chart-4))"
                            : i === 2
                              ? "hsl(var(--chart-2))"
                              : "hsl(var(--chart-1))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Entropy buckets appear once the vault has items." />
          )}
        </ChartCard>

        <ChartCard testId="chart-tags" title="Items by tag" subtitle="Where your credentials cluster">
          {tags.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={tags}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 8 }}
                barCategoryGap={8}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} height={20} />
                <YAxis
                  type="category"
                  dataKey="tag"
                  tickLine={false}
                  axisLine={false}
                  width={78}
                  tickFormatter={(v: string) => (v.length > 11 ? `${v.slice(0, 10)}…` : v)}
                />
                <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
                <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Tag your vault items to see this breakdown." />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          testId="chart-entropy-trend"
          title="Average vault entropy over time"
          subtitle="Mean bits per item, by month added"
        >
          {overTime.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={overTime} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} height={20} />
                <YAxis tickLine={false} axisLine={false} width={34} tickMargin={4} allowDecimals={false} domain={["dataMin - 10", "dataMax + 10"]} />
                <Tooltip content={<ChartTip unit=" bits" />} cursor={{ stroke: "hsl(var(--border))" }} />
                <Line
                  type="monotone"
                  dataKey="avgBits"
                  name="avg entropy"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "hsl(var(--chart-1))", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Two or more months of vault history are needed for a trend line." />
          )}
        </ChartCard>

        <Card data-testid="card-health">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Vault health</CardTitle>
            <p className="text-xs text-muted-foreground">Weighted across hygiene signals</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="relative h-[92px] w-[92px] shrink-0">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke={
                      audit.score >= 80
                        ? "hsl(var(--chart-1))"
                        : audit.score >= 60
                          ? "hsl(var(--chart-4))"
                          : "hsl(var(--chart-5))"
                    }
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(audit.score / 100) * 264} 264`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-semibold tnum" data-testid="text-health-score">
                    {audit.score}
                  </span>
                  <span className="text-[10px] text-muted-foreground">/ 100</span>
                </div>
              </div>
              <dl className="min-w-0 flex-1 space-y-1.5 text-xs">
                {[
                  ["Weak items", audit.weak.length],
                  ["Reused", audit.reused.reduce((n, r) => n + r.items.length, 0)],
                  ["Stale (>180d)", audit.stale.length],
                  ["Avg entropy", `${audit.averageBits.toFixed(1)} bits`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between gap-2">
                    <dt className="truncate text-muted-foreground">{label}</dt>
                    <dd className="tnum font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <Button asChild variant="outline" size="sm" className="mt-4 w-full" data-testid="button-goto-audit">
              <Link href="/audit">
                <ShieldAlert className="mr-2 h-3.5 w-3.5" />
                Open audit console
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="card-recent-items">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recently added</CardTitle>
            <p className="text-xs text-muted-foreground">Newest entries in the vault</p>
          </CardHeader>
          <CardContent>
            {recent.length ? (
              <ul className="space-y-2.5">
                {recent.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3"
                    data-testid={`row-recent-${item.id}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{item.label}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {item.username || item.url || item.tag} · {relativeTime(item.createdAt)}
                      </div>
                    </div>
                    <StrengthBadge bits={item.strengthBits} showBits={false} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nothing saved yet.{" "}
                <Link href="/generator" className="text-primary underline underline-offset-2">
                  Forge your first password
                </Link>
                .
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
