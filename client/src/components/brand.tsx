import { cn } from "@/lib/utils";
import { verdictFor } from "@/lib/generator";

/** Geometric shield-and-key mark. Monochrome, uses currentColor. */
export function PassForgeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-6 w-6 shrink-0", className)}
      fill="none"
      aria-label="PassForge Vault"
      role="img"
      data-testid="img-logo"
    >
      <path
        d="M16 3.2 26.4 6.9v8.4c0 6.4-4.3 11-10.4 13.1C9.9 26.3 5.6 21.7 5.6 15.3V6.9L16 3.2Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="13.6" r="3.1" stroke="currentColor" strokeWidth="1.9" />
      <path d="M16 16.7v6.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M16 19.6h3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0" data-testid="link-brand">
      <PassForgeMark className="text-primary" />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="text-sm font-semibold tracking-tight truncate">PassForge</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Vault</div>
        </div>
      )}
    </div>
  );
}

const TONE_CLASS: Record<string, string> = {
  danger: "bg-destructive/12 text-destructive border-destructive/30",
  warn: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  good: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  accent: "bg-primary/15 text-primary border-primary/30",
};

export function StrengthBadge({
  bits,
  showBits = true,
  className,
  testId,
}: {
  bits: number;
  showBits?: boolean;
  className?: string;
  testId?: string;
}) {
  const { label, tone } = verdictFor(bits);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className
      )}
      data-testid={testId}
    >
      {label}
      {showBits && <span className="tnum opacity-80">{Math.round(bits)}b</span>}
    </span>
  );
}

export function StrengthMeter({ bits, className }: { bits: number; className?: string }) {
  const { tone } = verdictFor(bits);
  const colors: Record<string, string> = {
    danger: "bg-destructive",
    warn: "bg-chart-4",
    good: "bg-chart-2",
    accent: "bg-primary",
  };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-300", colors[tone])}
        style={{ width: `${Math.min(100, (bits / 128) * 100)}%` }}
        data-testid="meter-strength"
      />
    </div>
  );
}

/** Monospace secret with digits/symbols tinted, like PassForge v1. */
export function SecretText({
  value,
  masked,
  className,
  testId,
}: {
  value: string;
  masked?: boolean;
  className?: string;
  testId?: string;
}) {
  if (!value) return <span className={cn("secret-type text-muted-foreground", className)}>—</span>;
  if (masked)
    return (
      <span className={cn("secret-type text-muted-foreground", className)} data-testid={testId}>
        {"•".repeat(Math.min(value.length, 64))}
      </span>
    );
  return (
    <span className={cn("secret-type", className)} data-testid={testId}>
      {value.split("").map((c, i) => (
        <span
          key={i}
          className={/[0-9]/.test(c) ? "ch-digit" : /[a-z]/i.test(c) ? undefined : "ch-symbol"}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
