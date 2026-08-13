import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  KeyRound,
  Vault,
  ShieldCheck,
  Activity,
  UserCog,
  Settings2,
  LifeBuoy,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Sun,
  Moon,
  Lock,
  LogOut,
  Command as CommandIcon,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/app";
import { Wordmark, PassForgeMark } from "@/components/brand";
import { useToast } from "@/hooks/use-toast";
import { generate } from "@/lib/generator";
import type { GenMode } from "@/lib/generator";

export const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, testId: "link-nav-overview" },
  { href: "/generator", label: "Generator", icon: KeyRound, testId: "link-nav-generator" },
  { href: "/vault", label: "Vault", icon: Vault, testId: "link-nav-vault" },
  { href: "/audit", label: "Audit", icon: ShieldCheck, testId: "link-nav-audit" },
  { href: "/activity", label: "Activity", icon: Activity, testId: "link-nav-activity" },
  { href: "/account", label: "Account", icon: UserCog, testId: "link-nav-account" },
  { href: "/settings", label: "Settings", icon: Settings2, testId: "link-nav-settings" },
  { href: "/help", label: "Help", icon: LifeBuoy, testId: "link-nav-help" },
];

function NavList({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const [location] = useLocation();
  return (
    <nav className="flex flex-col gap-0.5 px-2" aria-label="Primary">
      {NAV.map((item) => {
        const active = location === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            data-testid={item.testId}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover-elevate",
              collapsed && "justify-center px-2",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-muted-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {!collapsed && active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}

function LockOverlay() {
  const { unlock, user, logout } = useApp();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await unlock(password);
    setBusy(false);
    if (!ok) setError("That master password does not match this session.");
    else {
      setPassword("");
      setError("");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-6"
      data-testid="overlay-lock"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-card-border bg-card p-6 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <PassForgeMark className="text-primary h-7 w-7" />
          <div>
            <h2 className="text-base font-semibold">Vault locked</h2>
            <p className="text-xs text-muted-foreground">
              Auto-lock protected {user?.email ?? "your vault"}
            </p>
          </div>
        </div>
        <label className="mt-5 block text-sm font-medium" htmlFor="unlock-password">
          Master password
        </label>
        <Input
          id="unlock-password"
          type="password"
          autoFocus
          className="mt-1.5 font-mono"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          data-testid="input-unlock-password"
        />
        {error && (
          <p className="mt-2 text-xs text-destructive" data-testid="text-unlock-error">
            {error}
          </p>
        )}
        <Button type="submit" className="mt-4 w-full" disabled={busy} data-testid="button-unlock">
          {busy ? "Verifying…" : "Unlock"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="mt-2 w-full"
          onClick={() => void logout()}
          data-testid="button-lock-signout"
        >
          Sign out instead
        </Button>
      </form>
    </div>
  );
}

function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [, navigate] = useLocation();
  const { genConfig, setGenConfig, copySecret } = useApp();
  const { toast } = useToast();

  const go = (href: string) => {
    navigate(href);
    onOpenChange(false);
  };

  const quickGenerate = async (mode: GenMode) => {
    const result = generate({ ...genConfig, mode });
    setGenConfig({ ...genConfig, mode });
    if (result.value) {
      await copySecret(result.value);
      toast({
        title: `Copied a ${mode} password`,
        description: `${Math.round(result.bits)} bits of entropy — clipboard clears automatically.`,
      });
    }
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a view or forge a password…" data-testid="input-command" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV.map((item) => (
            <CommandItem
              key={item.href}
              value={`go ${item.label}`}
              onSelect={() => go(item.href)}
              data-testid={`command-go-${item.label.toLowerCase()}`}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Quick generate (copies to clipboard)">
          {(
            [
              ["random", "Random characters"],
              ["passphrase", "Passphrase"],
              ["pronounce", "Pronounceable"],
              ["pattern", "Pattern"],
              ["pin", "PIN"],
            ] as [GenMode, string][]
          ).map(([mode, label]) => (
            <CommandItem
              key={mode}
              value={`generate ${label}`}
              onSelect={() => void quickGenerate(mode)}
              data-testid={`command-generate-${mode}`}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, theme, setTheme, resolvedTheme, lock, logout, locked, clipboardCountdown, markActive } =
    useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [shellLocation] = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);

  /* Each view starts at the top of its own scroll region. */
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setDrawer(false);
  }, [shellLocation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lock]);

  useEffect(() => {
    const handler = () => markActive();
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [markActive]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      {/* desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
          collapsed ? "w-[68px]" : "w-60"
        )}
        data-testid="nav-sidebar"
      >
        <div className={cn("flex h-14 items-center border-b border-sidebar-border px-4", collapsed && "justify-center px-2")}>
          <Wordmark collapsed={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto py-3 scroll-thin">
          <NavList collapsed={collapsed} />
        </div>
        <div className="border-t border-sidebar-border p-2">
          {!collapsed && user && (
            <div className="px-2 pb-2">
              <div className="truncate text-xs font-medium" data-testid="text-sidebar-name">
                {user.name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground" data-testid="text-sidebar-email">
                {user.email}
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-2", collapsed && "justify-center px-0")}
            onClick={() => setCollapsed((v) => !v)}
            data-testid="button-collapse-sidebar"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </Button>
        </div>
      </aside>

      {/* mobile drawer */}
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b border-sidebar-border px-4">
            <Wordmark />
          </div>
          <div className="py-3">
            <NavList onNavigate={() => setDrawer(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur md:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
            data-testid="button-open-nav"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="flex h-9 flex-1 max-w-xs items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-xs text-muted-foreground hover-elevate"
            data-testid="button-open-palette"
          >
            <CommandIcon className="h-3.5 w-3.5" />
            <span className="truncate">Search or forge…</span>
            <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[10px] tnum sm:inline">
              ⌘K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {clipboardCountdown !== null && (
              <span
                className="hidden items-center gap-1.5 rounded-full border border-chart-4/40 bg-chart-4/10 px-2.5 py-1 text-[11px] text-chart-4 sm:inline-flex"
                data-testid="badge-clipboard-countdown"
              >
                <ClipboardCheck className="h-3 w-3" />
                <span className="tnum">clipboard clears in {clipboardCountdown}s</span>
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
              title={`Theme: ${theme}`}
              data-testid="button-toggle-theme"
            >
              {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={lock} aria-label="Lock vault" data-testid="button-lock">
              <Lock className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void logout()}
              aria-label="Sign out"
              data-testid="button-signout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto scroll-thin" data-testid="main-content">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>

      <Palette open={palette} onOpenChange={setPalette} />
      {locked && <LockOverlay />}
    </div>
  );
}
