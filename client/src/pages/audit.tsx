import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Copy, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, SecretText, StrengthBadge, StrengthMeter } from "@/components/brand";
import { useApp, useVault } from "@/state/app";
import type { DecryptedItem } from "@/state/app";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { STALE_DAYS, auditVault, relativeTime } from "@/lib/analytics";
import { ATTACKERS, analyzePassword, generate, humanTime, verdictFor } from "@/lib/generator";

function Gauge({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const tone = score >= 80 ? "text-chart-2" : score >= 55 ? "text-chart-4" : "text-destructive";
  return (
    <div className="relative h-[132px] w-[132px] shrink-0" data-testid="gauge-health">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className={`${tone} transition-all duration-700`}
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c - (c * score) / 100}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-xl font-semibold tnum ${tone}`} data-testid="text-health-score">
          {score}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">of 100</span>
      </div>
    </div>
  );
}

function IssueList({
  title,
  icon,
  empty,
  items,
  render,
  testId,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  items: unknown[];
  render: () => React.ReactNode;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </CardTitle>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] tnum text-muted-foreground">
          {items.length}
        </span>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="space-y-2">{render()}</ul>
        ) : (
          <p className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-chart-2" />
            {empty}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AuditPage() {
  const { genConfig, encryptSecret, copySecret, logEvent } = useApp();
  const { items, isLoading } = useVault();
  const { toast } = useToast();
  const [sample, setSample] = useState("");

  const audit = useMemo(() => auditVault(items), [items]);
  const analysis = useMemo(() => analyzePassword(sample), [sample]);

  const replaceMutation = useMutation({
    mutationFn: async (item: DecryptedItem) => {
      const fresh = generate({ ...genConfig, mode: "random" });
      const { iv, ct } = await encryptSecret({ password: fresh.value, notes: item.notes });
      await apiRequest("PATCH", `/api/items/${item.id}`, {
        length: fresh.value.length,
        strengthBits: Math.round(fresh.bits),
        iv,
        ct,
      });
      return { label: item.label, bits: Math.round(fresh.bits) };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      logEvent("audit", { action: "regenerated", label: r?.label });
      toast({ title: `Replaced ${r?.label}`, description: `New secret is ${r?.bits} bits.` });
    },
    onError: (e: Error) => toast({ title: "Could not replace", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div data-testid="view-audit">
        <PageHeader title="Audit" description="Scoring your vault for weak, reused and stale secrets." />
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const verdict = verdictFor(analysis.bits);

  return (
    <div data-testid="view-audit">
      <PageHeader
        title="Audit"
        description="Every check below runs on decrypted data inside this tab. Nothing about your plaintext leaves the browser."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Vault health</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-5">
            <Gauge score={audit.score} />
            <div className="min-w-0 space-y-2 text-xs">
              <p className="text-muted-foreground">
                Weighted by weak share, reuse, staleness and average entropy.
              </p>
              <dl className="space-y-1.5">
                {[
                  ["Entries", items.length],
                  ["Average entropy", `${audit.averageBits.toFixed(1)} bits`],
                  ["Weak (under 60 bits)", audit.weak.length],
                  ["Reused passwords", audit.reused.length],
                  [`Stale (over ${STALE_DAYS} days)`, audit.stale.length],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex items-baseline justify-between gap-3 border-b border-border pb-1 last:border-0">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium tnum">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Analyze any password</CardTitle>
            <p className="text-xs text-muted-foreground">
              Paste a password you already use. It is never stored, logged or transmitted.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="analyze-input" className="text-xs">
                Password to analyze
              </Label>
              <Input
                id="analyze-input"
                value={sample}
                onChange={(e) => setSample(e.target.value)}
                placeholder="Type or paste here"
                spellCheck={false}
                autoComplete="off"
                className="mt-1.5 font-mono text-xs"
                data-testid="input-analyze"
              />
            </div>

            {sample ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <StrengthBadge bits={analysis.bits} testId="badge-analysis" />
                  <StrengthMeter bits={analysis.bits} className="min-w-[100px] flex-1" />
                  <span className="text-xs text-muted-foreground tnum">
                    pool {analysis.poolSize}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {ATTACKERS.map((a) => (
                    <div
                      key={a.name}
                      className="rounded-md border border-border px-3 py-2"
                      data-testid={`box-attacker-${a.name.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                    >
                      <div className="text-[11px] font-medium">{a.name}</div>
                      <div className="text-[10px] text-muted-foreground">{a.detail}</div>
                      <div className="mt-1 text-xs font-medium tnum">
                        {humanTime(Math.pow(2, analysis.bits) / 2 / a.rate)}
                      </div>
                    </div>
                  ))}
                </div>

                <ul className="space-y-1.5" data-testid="list-findings">
                  {analysis.findings.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                          f.level === "bad"
                            ? "bg-destructive"
                            : f.level === "warn"
                              ? "bg-chart-4"
                              : "bg-chart-2"
                        }`}
                      />
                      <span className={f.level === "ok" ? "text-muted-foreground" : undefined}>{f.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  Verdict: <span className="font-medium">{verdict.label}</span> at{" "}
                  <span className="tnum">{analysis.bits.toFixed(1)}</span> bits after penalties.
                </p>
              </>
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                Results appear as you type — length, character classes, runs, repeats, years,
                dictionary words and four attacker budgets.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <IssueList
          testId="card-weak"
          title="Weak entries"
          icon={<ShieldAlert className="h-4 w-4 text-destructive" />}
          empty="No entry is below 60 bits."
          items={audit.weak}
          render={() =>
            audit.weak.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2"
                data-testid={`row-weak-${item.id}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{item.label}</div>
                  <div className="text-[11px] text-muted-foreground tnum">
                    {Math.round(item.strengthBits)} bits · {item.length} chars
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  disabled={replaceMutation.isPending}
                  onClick={() => replaceMutation.mutate(item)}
                  data-testid={`button-replace-${item.id}`}
                >
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  Replace
                </Button>
              </li>
            ))
          }
        />

        <IssueList
          testId="card-reused"
          title="Reused passwords"
          icon={<AlertTriangle className="h-4 w-4 text-chart-4" />}
          empty="Every entry uses a unique password."
          items={audit.reused}
          render={() =>
            audit.reused.map((group, gi) => (
              <li key={gi} className="rounded-md border border-border px-2.5 py-2" data-testid={`row-reused-${gi}`}>
                <div className="flex items-center justify-between gap-2">
                  <SecretText value={group.password} masked className="text-[11px]" />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => void copySecret(group.password)}
                    aria-label="Copy reused password"
                    data-testid={`button-copy-reused-${gi}`}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Shared by {group.items.map((i) => i.label).join(", ")}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.items.map((i) => (
                    <Button
                      key={i.id}
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      disabled={replaceMutation.isPending}
                      onClick={() => replaceMutation.mutate(i)}
                      data-testid={`button-replace-reused-${i.id}`}
                    >
                      Replace {i.label}
                    </Button>
                  ))}
                </div>
              </li>
            ))
          }
        />

        <IssueList
          testId="card-stale"
          title={`Stale over ${STALE_DAYS} days`}
          icon={<Clock className="h-4 w-4 text-chart-4" />}
          empty="Nothing has been sitting untouched."
          items={audit.stale}
          render={() =>
            audit.stale.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2"
                data-testid={`row-stale-${item.id}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{item.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Updated {relativeTime(item.updatedAt)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  disabled={replaceMutation.isPending}
                  onClick={() => replaceMutation.mutate(item)}
                  data-testid={`button-refresh-${item.id}`}
                >
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  Rotate
                </Button>
              </li>
            ))
          }
        />
      </div>
    </div>
  );
}
