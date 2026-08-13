import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Download, Eye, EyeOff, Layers, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, SecretText, StrengthBadge, StrengthMeter } from "@/components/brand";
import { useApp } from "@/state/app";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { downloadCsv } from "@/lib/analytics";
import {
  ATTACKERS,
  DEFAULT_SYMBOLS,
  PATTERN_TOKENS,
  WORDS,
  crackTime,
  generate,
  humanTime,
} from "@/lib/generator";
import type { GenConfig, GenMode, GenResult } from "@/lib/generator";

const MODES: { id: GenMode; label: string }[] = [
  { id: "random", label: "Random" },
  { id: "passphrase", label: "Passphrase" },
  { id: "pronounce", label: "Pronounceable" },
  { id: "pattern", label: "Pattern" },
  { id: "pin", label: "PIN" },
];

const PRESETS: { name: string; hint: string; apply: (c: GenConfig) => GenConfig }[] = [
  {
    name: "Wi-Fi",
    hint: "Passphrase, easy to type on a TV remote",
    apply: (c) => ({
      ...c,
      mode: "passphrase",
      passphrase: { ...c.passphrase, words: 5, separator: "-", wordCase: "lower", appendDigit: true, appendSymbol: false },
    }),
  },
  {
    name: "Banking",
    hint: "20 chars, no look-alikes",
    apply: (c) => ({
      ...c,
      mode: "random",
      random: { ...c.random, length: 20, lower: true, upper: true, digits: true, symbols: true, avoidSimilar: true, eachSet: true },
    }),
  },
  {
    name: "API key",
    hint: "40 chars, shell-safe, no symbols",
    apply: (c) => ({
      ...c,
      mode: "random",
      random: { ...c.random, length: 40, symbols: false, avoidShellUnsafe: true, avoidSimilar: false, eachSet: true },
    }),
  },
  {
    name: "Memorable",
    hint: "Pronounceable, 6 syllables",
    apply: (c) => ({ ...c, mode: "pronounce", pronounce: { syllables: 6, digits: true, capitals: true } }),
  },
];

const TAGS = ["general", "work", "personal", "finance", "home", "media", "travel"];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium">{label}</Label>
        {hint && <span className="text-[11px] text-muted-foreground tnum">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Check({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2 text-xs hover-elevate"
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(!!v)} data-testid={`checkbox-${id}`} />
      <span className="leading-snug">{label}</span>
    </label>
  );
}

export default function GeneratorPage() {
  const { genConfig, setGenConfig, settings, copySecret, encryptSecret, logEvent } = useApp();
  const { toast } = useToast();
  const [result, setResult] = useState<GenResult>({ value: "", bits: 0, pool: 0, notes: [] });
  const [masked, setMasked] = useState(settings.maskByDefault);
  const [batch, setBatch] = useState<{ value: string; bits: number }[]>([]);
  const [batchCount, setBatchCount] = useState(10);
  const [saveOpen, setSaveOpen] = useState(false);
  const [form, setForm] = useState({ label: "", username: "", url: "", tag: "general", notes: "" });

  const patch = useCallback(
    (next: Partial<GenConfig>) => setGenConfig({ ...genConfig, ...next }),
    [genConfig, setGenConfig]
  );

  const regenerate = useCallback(
    (record: boolean) => {
      const r = generate(genConfig);
      setResult(r);
      if (record && r.value) logEvent("generated", { mode: genConfig.mode, bits: Math.round(r.bits) });
    },
    [genConfig, logEvent]
  );

  /* live preview whenever a rule changes — not recorded as an event */
  useEffect(() => {
    setResult(generate(genConfig));
  }, [genConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { iv, ct } = await encryptSecret({ password: result.value, notes: form.notes });
      await apiRequest("POST", "/api/items", {
        label: form.label.trim() || "Untitled entry",
        username: form.username.trim(),
        url: form.url.trim(),
        tag: form.tag,
        mode: genConfig.mode,
        length: result.value.length,
        strengthBits: Math.round(result.bits),
        iv,
        ct,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setSaveOpen(false);
      setForm({ label: "", username: "", url: "", tag: "general", notes: "" });
      toast({ title: "Saved to vault", description: "Encrypted in the browser before upload." });
    },
    onError: (e: Error) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });

  const crackRows = useMemo(
    () =>
      ATTACKERS.map((a) => ({
        ...a,
        time: result.value ? humanTime(Math.pow(2, result.bits) / 2 / a.rate) : "—",
      })),
    [result]
  );

  const poolLabel = result.pool
    ? `${result.pool} ${genConfig.mode === "passphrase" ? "words" : "symbols"}`
    : "template";

  return (
    <div data-testid="view-generator">
      <PageHeader
        title="Generator"
        description="Five generation strategies, all backed by crypto.getRandomValues with rejection sampling — never Math.random."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setMasked((m) => !m)} data-testid="button-toggle-mask">
              {masked ? <Eye className="mr-2 h-3.5 w-3.5" /> : <EyeOff className="mr-2 h-3.5 w-3.5" />}
              {masked ? "Reveal" : "Mask"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => regenerate(true)} data-testid="button-regenerate">
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Regenerate
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void copySecret(result.value);
                logEvent("copied", { mode: genConfig.mode });
                toast({ title: "Copied", description: "Clipboard clears on the timer you set." });
              }}
              disabled={!result.value}
              data-testid="button-copy-secret"
            >
              <Copy className="mr-2 h-3.5 w-3.5" />
              Copy
            </Button>
          </>
        }
      />

      {/* output */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div
            className="min-h-[64px] rounded-md border border-border bg-muted/40 p-4 text-base leading-relaxed sm:text-lg"
            data-testid="text-secret-output"
          >
            <SecretText value={result.value} masked={masked} testId="text-secret-value" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StrengthBadge bits={result.bits} testId="badge-secret-strength" />
            <StrengthMeter bits={result.bits} className="min-w-[120px] flex-1" />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Entropy", result.value ? `${result.bits.toFixed(1)} bits` : "—"],
              ["Length", result.value ? `${result.value.length} chars` : "—"],
              ["Pool", poolLabel],
              ["Offline crack (10¹¹/s)", result.value ? crackTime(result.bits) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-card px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 truncate text-sm font-medium tnum" title={String(v)} data-testid={`text-stat-${k.split(" ")[0].toLowerCase()}`}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          {result.notes.length > 0 && (
            <p className="mt-3 rounded-md border border-chart-4/30 bg-chart-4/10 px-3 py-2 text-xs text-chart-4" data-testid="text-generator-note">
              {result.notes.join(" ")}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!result.value}
              onClick={() => setSaveOpen(true)}
              data-testid="button-open-save"
            >
              <Save className="mr-2 h-3.5 w-3.5" />
              Save to vault
            </Button>
            {PRESETS.map((p) => (
              <Button
                key={p.name}
                size="sm"
                variant="outline"
                title={p.hint}
                onClick={() => setGenConfig(p.apply(genConfig))}
                data-testid={`button-preset-${p.name.toLowerCase().replace(/\s/g, "-")}`}
              >
                {p.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* mode panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={genConfig.mode} onValueChange={(v) => patch({ mode: v as GenMode })}>
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-5">
                {MODES.map((m) => (
                  <TabsTrigger key={m.id} value={m.id} data-testid={`tab-mode-${m.id}`} className="text-xs py-1.5">
                    {m.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {genConfig.mode === "random" && (
              <div className="space-y-4" data-testid="panel-mode-random">
                <Row label="Length" hint={`${genConfig.random.length} characters`}>
                  <Slider
                    min={4}
                    max={128}
                    step={1}
                    value={[genConfig.random.length]}
                    onValueChange={([v]) => patch({ random: { ...genConfig.random, length: v } })}
                    data-testid="slider-length"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[12, 16, 20, 32, 64].map((n) => (
                      <Button
                        key={n}
                        size="sm"
                        variant={genConfig.random.length === n ? "secondary" : "ghost"}
                        className="h-7 px-2.5 text-[11px] tnum"
                        onClick={() => patch({ random: { ...genConfig.random, length: n } })}
                        data-testid={`button-length-${n}`}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </Row>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Check id="c-lower" label={<>Lowercase <code className="text-muted-foreground">a-z</code></>} checked={genConfig.random.lower} onChange={(v) => patch({ random: { ...genConfig.random, lower: v } })} />
                  <Check id="c-upper" label={<>Uppercase <code className="text-muted-foreground">A-Z</code></>} checked={genConfig.random.upper} onChange={(v) => patch({ random: { ...genConfig.random, upper: v } })} />
                  <Check id="c-digit" label={<>Digits <code className="text-muted-foreground">0-9</code></>} checked={genConfig.random.digits} onChange={(v) => patch({ random: { ...genConfig.random, digits: v } })} />
                  <Check id="c-symbol" label={<>Symbols <code className="text-muted-foreground">!@#$…</code></>} checked={genConfig.random.symbols} onChange={(v) => patch({ random: { ...genConfig.random, symbols: v } })} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Row label="Symbol set">
                    <Input
                      value={genConfig.random.symbolSet}
                      spellCheck={false}
                      className="font-mono text-xs"
                      onChange={(e) => patch({ random: { ...genConfig.random, symbolSet: e.target.value } })}
                      data-testid="input-symbol-set"
                    />
                  </Row>
                  <Row label="Extra characters">
                    <Input
                      value={genConfig.random.extraChars}
                      placeholder="e.g. §±¤"
                      spellCheck={false}
                      className="font-mono text-xs"
                      onChange={(e) => patch({ random: { ...genConfig.random, extraChars: e.target.value } })}
                      data-testid="input-extra-chars"
                    />
                  </Row>
                  <Row label="Exclude characters">
                    <Input
                      value={genConfig.random.excludeChars}
                      placeholder="e.g. abc123"
                      spellCheck={false}
                      className="font-mono text-xs"
                      onChange={(e) => patch({ random: { ...genConfig.random, excludeChars: e.target.value } })}
                      data-testid="input-exclude-chars"
                    />
                  </Row>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Check id="r-each" label="At least one from each set" checked={genConfig.random.eachSet} onChange={(v) => patch({ random: { ...genConfig.random, eachSet: v } })} />
                  <Check id="r-similar" label={<>Avoid look-alikes <code className="text-muted-foreground">il1Lo0O</code></>} checked={genConfig.random.avoidSimilar} onChange={(v) => patch({ random: { ...genConfig.random, avoidSimilar: v } })} />
                  <Check id="r-shell" label="Avoid shell-unsafe characters" checked={genConfig.random.avoidShellUnsafe} onChange={(v) => patch({ random: { ...genConfig.random, avoidShellUnsafe: v } })} />
                  <Check id="r-norepeat" label="No repeated characters" checked={genConfig.random.noRepeat} onChange={(v) => patch({ random: { ...genConfig.random, noRepeat: v } })} />
                  <Check id="r-noseq" label={<>No runs like <code className="text-muted-foreground">abc</code> / <code className="text-muted-foreground">123</code></>} checked={genConfig.random.noSequence} onChange={(v) => patch({ random: { ...genConfig.random, noSequence: v } })} />
                  <Check id="r-startletter" label="Must start with a letter" checked={genConfig.random.startLetter} onChange={(v) => patch({ random: { ...genConfig.random, startLetter: v } })} />
                </div>
              </div>
            )}

            {genConfig.mode === "passphrase" && (
              <div className="space-y-4" data-testid="panel-mode-passphrase">
                <Row label="Words" hint={`${genConfig.passphrase.words} words`}>
                  <Slider
                    min={3}
                    max={12}
                    step={1}
                    value={[genConfig.passphrase.words]}
                    onValueChange={([v]) => patch({ passphrase: { ...genConfig.passphrase, words: v } })}
                    data-testid="slider-words"
                  />
                </Row>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Row label="Separator">
                    <Input
                      maxLength={3}
                      value={genConfig.passphrase.separator}
                      className="font-mono text-xs"
                      onChange={(e) => patch({ passphrase: { ...genConfig.passphrase, separator: e.target.value } })}
                      data-testid="input-separator"
                    />
                  </Row>
                  <Row label="Word case">
                    <Select
                      value={genConfig.passphrase.wordCase}
                      onValueChange={(v) =>
                        patch({ passphrase: { ...genConfig.passphrase, wordCase: v as "lower" | "title" | "upper" | "random" } })
                      }
                    >
                      <SelectTrigger data-testid="select-word-case">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lower">lowercase</SelectItem>
                        <SelectItem value="title">Title Case</SelectItem>
                        <SelectItem value="upper">UPPERCASE</SelectItem>
                        <SelectItem value="random">rAnDom</SelectItem>
                      </SelectContent>
                    </Select>
                  </Row>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Check id="p-digit" label="Append a random digit" checked={genConfig.passphrase.appendDigit} onChange={(v) => patch({ passphrase: { ...genConfig.passphrase, appendDigit: v } })} />
                  <Check id="p-symbol" label="Append a random symbol" checked={genConfig.passphrase.appendSymbol} onChange={(v) => patch({ passphrase: { ...genConfig.passphrase, appendSymbol: v } })} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Diceware-style selection from a <span className="tnum">{WORDS.length}</span>-word list using
                  rejection sampling — {Math.log2(WORDS.length).toFixed(2)} bits per word.
                </p>
              </div>
            )}

            {genConfig.mode === "pronounce" && (
              <div className="space-y-4" data-testid="panel-mode-pronounce">
                <Row label="Syllables" hint={`${genConfig.pronounce.syllables} syllables`}>
                  <Slider
                    min={2}
                    max={14}
                    step={1}
                    value={[genConfig.pronounce.syllables]}
                    onValueChange={([v]) => patch({ pronounce: { ...genConfig.pronounce, syllables: v } })}
                    data-testid="slider-syllables"
                  />
                </Row>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Check id="pr-digits" label="Sprinkle 2 digits" checked={genConfig.pronounce.digits} onChange={(v) => patch({ pronounce: { ...genConfig.pronounce, digits: v } })} />
                  <Check id="pr-upper" label="Capitalize some letters" checked={genConfig.pronounce.capitals} onChange={(v) => patch({ pronounce: { ...genConfig.pronounce, capitals: v } })} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Syllables are built from 33 onsets, 10 vowel groups and 12 codas. Entropy is counted per
                  syllable, not per character.
                </p>
              </div>
            )}

            {genConfig.mode === "pattern" && (
              <div className="space-y-4" data-testid="panel-mode-pattern">
                <Row label="Template">
                  <Input
                    value={genConfig.pattern.pattern}
                    spellCheck={false}
                    className="font-mono text-sm"
                    onChange={(e) => patch({ pattern: { ...genConfig.pattern, pattern: e.target.value } })}
                    data-testid="input-pattern"
                  />
                </Row>
                <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2">
                  {PATTERN_TOKENS.map((t) => (
                    <div key={t.token} className="flex items-baseline gap-2">
                      <code className="w-14 shrink-0 font-mono text-primary">{t.token}</code>
                      <span className="text-muted-foreground">{t.meaning}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {genConfig.mode === "pin" && (
              <div className="space-y-4" data-testid="panel-mode-pin">
                <Row label="Digits" hint={`${genConfig.pin.length} digits`}>
                  <Slider
                    min={3}
                    max={16}
                    step={1}
                    value={[genConfig.pin.length]}
                    onValueChange={([v]) => patch({ pin: { ...genConfig.pin, length: v } })}
                    data-testid="slider-pin-length"
                  />
                </Row>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Check id="pin-norepeat" label="No repeated digits" checked={genConfig.pin.noRepeat} onChange={(v) => patch({ pin: { ...genConfig.pin, noRepeat: v } })} />
                  <Check id="pin-noseq" label="Reject sequences and dates" checked={genConfig.pin.noSequence} onChange={(v) => patch({ pin: { ...genConfig.pin, noSequence: v } })} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* right column */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Time to crack</CardTitle>
              <p className="text-xs text-muted-foreground">Assuming half the keyspace is searched</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {crackRows.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                    data-testid={`row-crack-${row.name.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{row.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{row.detail}</div>
                    </div>
                    <span className="shrink-0 text-xs font-medium tnum">{row.time}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold">Batch build</CardTitle>
              <span className="text-[11px] text-muted-foreground tnum">{batch.length} generated</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor="batch-count" className="text-xs">
                    How many
                  </Label>
                  <Input
                    id="batch-count"
                    type="number"
                    min={1}
                    max={500}
                    value={batchCount}
                    className="mt-1.5 tnum"
                    onChange={(e) => setBatchCount(Number(e.target.value))}
                    data-testid="input-batch-count"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const n = Math.max(1, Math.min(500, batchCount || 1));
                    const out: { value: string; bits: number }[] = [];
                    for (let i = 0; i < n; i++) {
                      const r = generate(genConfig);
                      if (r.value) out.push({ value: r.value, bits: r.bits });
                    }
                    setBatch(out.concat(batch).slice(0, 300));
                    logEvent("generated", { mode: genConfig.mode, batch: out.length });
                    toast({ title: `Built ${out.length} passwords` });
                  }}
                  data-testid="button-build-batch"
                >
                  <Layers className="mr-2 h-3.5 w-3.5" />
                  Build
                </Button>
              </div>

              {batch.length ? (
                <>
                  <ul
                    className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2 scroll-thin"
                    data-testid="list-batch"
                  >
                    {batch.map((b, i) => (
                      <li key={i} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover-elevate">
                        <SecretText value={b.value} className="min-w-0 flex-1 text-[11px]" />
                        <span className="shrink-0 tnum text-[11px] text-muted-foreground">
                          {Math.round(b.bits)}b
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => void copySecret(b.value)}
                          data-testid={`button-copy-batch-${i}`}
                        >
                          Copy
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void copySecret(batch.map((b) => b.value).join("\n"))}
                      data-testid="button-copy-batch-all"
                    >
                      Copy list
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        downloadCsv(
                          `passforge-batch-${Date.now()}.csv`,
                          [["index", "password", "entropy_bits"], ...batch.map((b, i) => [i + 1, b.value, b.bits.toFixed(1)])]
                        )
                      }
                      data-testid="button-export-batch"
                    >
                      <Download className="mr-2 h-3.5 w-3.5" />
                      CSV
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setBatch([])} data-testid="button-clear-batch">
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Clear
                    </Button>
                  </div>
                </>
              ) : (
                <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  No batch yet. Build one to generate many passwords with the current rules at once.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save to vault</DialogTitle>
            <DialogDescription>
              The password and notes are encrypted with AES-256-GCM in this browser. The server only
              receives ciphertext plus the metadata below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="save-label">Label</Label>
              <Input
                id="save-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="GitHub"
                className="mt-1.5"
                data-testid="input-save-label"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="save-username">Username</Label>
                <Input
                  id="save-username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="mt-1.5"
                  data-testid="input-save-username"
                />
              </div>
              <div>
                <Label htmlFor="save-url">URL</Label>
                <Input
                  id="save-url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="mt-1.5"
                  data-testid="input-save-url"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="save-tag">Tag</Label>
              <Select value={form.tag} onValueChange={(v) => setForm({ ...form, tag: v })}>
                <SelectTrigger id="save-tag" className="mt-1.5" data-testid="select-save-tag">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAGS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="save-notes">Notes (encrypted)</Label>
              <Input
                id="save-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1.5"
                data-testid="input-save-notes"
              />
            </div>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <SecretText value={result.value} masked className="text-xs" />
              <div className="mt-1 text-[11px] text-muted-foreground tnum">
                {Math.round(result.bits)} bits · {result.value.length} characters · {genConfig.mode}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)} data-testid="button-cancel-save">
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-confirm-save"
            >
              {saveMutation.isPending ? "Encrypting…" : "Save item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { DEFAULT_SYMBOLS };
