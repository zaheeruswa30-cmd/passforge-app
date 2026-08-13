import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/brand";
import { useApp } from "@/state/app";
import { useToast } from "@/hooks/use-toast";
import type { AppSettings } from "@shared/schema";
import type { Theme } from "@/state/app";

const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

const GEN_FLAGS: { key: keyof AppSettings["generator"]; label: string }[] = [
  { key: "lower", label: "Lowercase letters" },
  { key: "upper", label: "Uppercase letters" },
  { key: "digits", label: "Digits" },
  { key: "symbols", label: "Symbols" },
  { key: "eachSet", label: "At least one from each set" },
  { key: "avoidSimilar", label: "Avoid look-alike characters" },
  { key: "avoidShellUnsafe", label: "Avoid shell-unsafe characters" },
  { key: "noRepeat", label: "No repeated characters" },
  { key: "noSequence", label: "No sequential runs" },
  { key: "startLetter", label: "Must start with a letter" },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
        </Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} data-testid={`switch-${id}`} />
    </div>
  );
}

export default function SettingsPage() {
  const { settings, saveSettings, theme, setTheme } = useApp();
  const { toast } = useToast();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  async function onSave() {
    setSaving(true);
    try {
      await saveSettings({ ...draft, theme });
      toast({ title: "Settings saved" });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="view-settings">
      <PageHeader
        title="Settings"
        description="Preferences are stored on your user row — never in browser-persisted storage."
        actions={
          <Button size="sm" onClick={onSave} disabled={!dirty || saving} data-testid="button-save-settings">
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            {!dirty && !saving && <Check className="ml-2 h-3.5 w-3.5" />}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Appearance" description="Theme follows your OS unless you pin it.">
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => {
              const Icon = t.icon;
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-xs transition-colors hover-elevate ${
                    active ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                  data-testid={`button-theme-${t.id}`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div>
            <Label className="text-xs font-medium">Row density</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(["comfortable", "compact"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDraft({ ...draft, density: d })}
                  className={`rounded-md border px-3 py-2 text-xs capitalize transition-colors hover-elevate ${
                    draft.density === d ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                  data-testid={`button-density-${d}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Privacy and locking" description="Reduce shoulder-surfing and clipboard leaks.">
          <Toggle
            id="mask-default"
            label="Mask secrets by default"
            hint="Passwords render as dots until you reveal them."
            checked={draft.maskByDefault}
            onChange={(v) => setDraft({ ...draft, maskByDefault: v })}
          />
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-xs font-medium">Clipboard auto-clear</Label>
              <span className="text-[11px] text-muted-foreground tnum">
                {draft.clipboardClearSeconds === 0 ? "off" : `${draft.clipboardClearSeconds}s`}
              </span>
            </div>
            <Slider
              className="mt-2"
              min={0}
              max={180}
              step={5}
              value={[draft.clipboardClearSeconds]}
              onValueChange={([v]) => setDraft({ ...draft, clipboardClearSeconds: v })}
              data-testid="slider-clipboard-clear"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              A countdown badge appears in the header while a secret is on the clipboard.
            </p>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-xs font-medium">Auto-lock after inactivity</Label>
              <span className="text-[11px] text-muted-foreground tnum">
                {draft.autoLockMinutes === 0 ? "off" : `${draft.autoLockMinutes} min`}
              </span>
            </div>
            <Slider
              className="mt-2"
              min={0}
              max={60}
              step={1}
              value={[draft.autoLockMinutes]}
              onValueChange={([v]) => setDraft({ ...draft, autoLockMinutes: v })}
              data-testid="slider-auto-lock"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Locking discards the decrypted vault from memory; your master password re-derives it.
            </p>
          </div>
        </Section>

        <Section
          title="Default generator profile"
          description="Applied to the random mode whenever the generator opens."
        >
          <div>
            <div className="flex items-baseline justify-between">
              <Label className="text-xs font-medium">Default length</Label>
              <span className="text-[11px] text-muted-foreground tnum">
                {draft.generator.length} characters
              </span>
            </div>
            <Slider
              className="mt-2"
              min={8}
              max={64}
              step={1}
              value={[draft.generator.length]}
              onValueChange={([v]) => setDraft({ ...draft, generator: { ...draft.generator, length: v } })}
              data-testid="slider-default-length"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {GEN_FLAGS.map((f) => (
              <label
                key={f.key}
                htmlFor={`gen-${f.key}`}
                className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2 text-xs hover-elevate"
              >
                <Checkbox
                  id={`gen-${f.key}`}
                  checked={Boolean(draft.generator[f.key])}
                  onCheckedChange={(v) =>
                    setDraft({ ...draft, generator: { ...draft.generator, [f.key]: !!v } })
                  }
                  data-testid={`checkbox-gen-${f.key}`}
                />
                {f.label}
              </label>
            ))}
          </div>
        </Section>

        <Section
          title="What is not stored"
          description="A deliberate list, because a password manager should be explicit about it."
        >
          <ul className="space-y-2 text-xs text-muted-foreground">
            {[
              "Your master password — it never leaves the browser in any form.",
              "Your vault key — derived per session and held only in JavaScript memory as a non-extractable CryptoKey.",
              "Plaintext passwords or notes — the server sees base64 ciphertext and a random IV.",
              "Any browser-persisted storage mechanism — the session token lives in a React ref instead.",
              "Analytics, telemetry or third-party requests of any kind.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                {t}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
