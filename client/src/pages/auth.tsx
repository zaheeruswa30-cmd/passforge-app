import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PassForgeMark } from "@/components/brand";
import { useApp } from "@/state/app";
import { useToast } from "@/hooks/use-toast";
import { analyzePassword, verdictFor } from "@/lib/generator";
import { ShieldCheck, KeyRound, LineChart, Loader2 } from "lucide-react";

const DEMO_EMAIL = "demo@passforge.app";
const DEMO_PASSWORD = "demo-master-key";

export default function AuthPage() {
  const { login, signup, sessionEnded } = useApp();
  const { toast } = useToast();
  const [busy, setBusy] = useState<null | "login" | "signup" | "demo">(null);
  const [error, setError] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const strength = analyzePassword(password);

  async function run(kind: "login" | "signup" | "demo", fn: () => Promise<void>) {
    setBusy(kind);
    setError("");
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Something went wrong";
      let clean = msg;
      try {
        clean = (JSON.parse(msg) as { message?: string }).message ?? msg;
      } catch {
        /* plain text error */
      }
      setError(clean);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid h-full w-full grid-cols-1 overflow-y-auto bg-background lg:grid-cols-[1.05fr_1fr] scroll-thin">
      {/* brand pane */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-sidebar p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 20%, hsl(var(--primary) / 0.18), transparent 45%), radial-gradient(circle at 78% 72%, hsl(var(--chart-2) / 0.14), transparent 42%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <PassForgeMark className="h-8 w-8 text-primary" />
          <div>
            <div className="text-base font-semibold tracking-tight">PassForge Vault</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Zero-knowledge console
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-xl font-semibold leading-snug">
            Your master password never leaves this browser.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Keys are derived with PBKDF2-SHA256 at 210,000 iterations. Every vault entry is sealed
            with AES-256-GCM before it is sent. The server stores ciphertext and metadata — nothing
            it could ever decrypt.
          </p>
          <ul className="mt-7 space-y-3 text-sm">
            {[
              { icon: KeyRound, text: "Five generator modes with rejection-sampled CSPRNG output" },
              { icon: LineChart, text: "Entropy analytics across your whole vault, over time" },
              { icon: ShieldCheck, text: "Audit console for weak, reused and stale credentials" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Demo build — sessions live in memory and end on refresh, by design.
        </p>
      </section>

      {/* form pane */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <PassForgeMark className="h-7 w-7 text-primary" />
            <span className="text-base font-semibold tracking-tight">PassForge Vault</span>
          </div>

          {sessionEnded && (
            <div
              className="mb-4 rounded-md border border-chart-4/40 bg-chart-4/10 px-3 py-2.5 text-xs text-chart-4"
              data-testid="text-session-ended"
            >
              Session ended. Tokens and vault keys live only in memory, so a page refresh signs you
              out. Sign in again to continue.
            </div>
          )}

          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" data-testid="tab-signup">
                Create vault
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-5">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("login", () => login(loginEmail, loginPassword));
                }}
              >
                <div>
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="mt-1.5"
                    data-testid="input-login-email"
                  />
                </div>
                <div>
                  <Label htmlFor="login-password">Master password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="mt-1.5 font-mono"
                    data-testid="input-login-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy !== null} data-testid="button-login">
                  {busy === "login" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {busy === "login" ? "Deriving keys…" : "Unlock vault"}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or explore
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy !== null}
                onClick={() =>
                  void run("demo", async () => {
                    await login(DEMO_EMAIL, DEMO_PASSWORD);
                    toast({
                      title: "Signed in to the demo vault",
                      description: "28 seeded items and 90 days of activity are ready.",
                    });
                  })
                }
                data-testid="button-demo-login"
              >
                {busy === "demo" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Use demo account
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                <span className="font-mono">{DEMO_EMAIL}</span> ·{" "}
                <span className="font-mono">{DEMO_PASSWORD}</span>
              </p>
            </TabsContent>

            <TabsContent value="signup" className="mt-5">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (password !== confirm) {
                    setError("The two master passwords do not match.");
                    return;
                  }
                  if (password.length < 8) {
                    setError("Use at least 8 characters for the master password.");
                    return;
                  }
                  void run("signup", () => signup(email, name, password));
                }}
              >
                <div>
                  <Label htmlFor="signup-name">Display name</Label>
                  <Input
                    id="signup-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5"
                    data-testid="input-signup-name"
                  />
                </div>
                <div>
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5"
                    data-testid="input-signup-email"
                  />
                </div>
                <div>
                  <Label htmlFor="signup-password">Master password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 font-mono"
                    data-testid="input-signup-password"
                  />
                  {password && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground tnum" data-testid="text-signup-strength">
                      {verdictFor(strength.bits).label} · {Math.round(strength.bits)} bits — there is
                      no recovery path, so store it somewhere safe.
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="signup-confirm">Confirm master password</Label>
                  <Input
                    id="signup-confirm"
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="mt-1.5 font-mono"
                    data-testid="input-signup-confirm"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy !== null} data-testid="button-signup">
                  {busy === "signup" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {busy === "signup" ? "Deriving keys…" : "Create vault"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {error && (
            <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" data-testid="text-auth-error">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
