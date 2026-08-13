import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PageHeader } from "@/components/brand";
import { ATTACKERS, ENTROPY_BUCKETS, PATTERN_TOKENS, humanTime } from "@/lib/generator";
import { PBKDF2_ITERATIONS } from "@/lib/crypto";

const FAQ: { q: string; a: string }[] = [
  {
    q: "What does zero-knowledge mean here?",
    a: `Your master password is used twice, locally. First it is stretched with PBKDF2-SHA256 (${PBKDF2_ITERATIONS.toLocaleString()} iterations) over the salt "auth|your-email" to produce an authentication hash — that hash is the only credential the server ever receives, and the server stores it scrypt-hashed again. Second, the same master password is stretched over a separate per-user vault salt to derive an AES-256-GCM key that never leaves the tab. Because the two derivations use different salts, the value the server holds cannot be used to decrypt anything.`,
  },
  {
    q: "What exactly does the server store?",
    a: "Your email, display name, the scrypt hash of your auth hash, the public vault salt, your settings JSON, and for each item: label, username, URL, tag, generator mode, length, entropy in bits, a random 96-bit IV, and the base64 AES-GCM ciphertext of the password and notes. It never stores plaintext secrets.",
  },
  {
    q: "How is randomness generated?",
    a: "Every mode draws from crypto.getRandomValues. Values are selected with rejection sampling — a candidate outside the largest whole multiple of the range is discarded and redrawn — so there is no modulo bias. Math.random is never used anywhere in the generator.",
  },
  {
    q: "How is entropy calculated?",
    a: "Entropy is computed from the generation process, not from the resulting string. Random mode uses length × log2(pool size). Passphrase mode uses words × log2(945) plus any appended digit or symbol. Pronounceable mode counts bits per syllable. Pattern mode sums log2(pool) for each token. PIN mode uses digits × log2(10). Constraints that shrink the space, such as no-repeat, are reflected in the reported figure.",
  },
  {
    q: "Why do some rules lower the reported strength?",
    a: "Rules like no repeated characters or no sequential runs remove candidates from the keyspace. Ruling out patterns an attacker would try first is usually worth a fraction of a bit, but the number shown is honest about the cost.",
  },
  {
    q: "What happens when I change my master password?",
    a: "The browser derives the old vault key, decrypts every item, derives a brand-new vault key from the new password and a fresh vault salt, re-encrypts every item, and uploads all the new ciphertext in one request together with the new auth hash. If any single item fails to decrypt, the whole change is aborted so the vault cannot end up half-rekeyed.",
  },
  {
    q: "Can I recover a forgotten master password?",
    a: "No. There is no recovery key, no email reset and no server-side copy of your key material. That is the trade-off zero-knowledge design makes, and it is why the demo account exists for exploring the app.",
  },
  {
    q: "Where does the session token live?",
    a: "In JavaScript memory only, inside a React ref that is attached to the Authorization header by the API client. No browser-persisted storage mechanism of any kind is written to, so reloading the tab signs you out by design.",
  },
  {
    q: "What does auto-lock do?",
    a: "After the inactivity window you set, the decrypted vault is dropped and a lock overlay covers the app. Re-entering your master password re-derives the vault key and restores the decrypted view without a round trip to re-authenticate.",
  },
  {
    q: "Is the CSV export safe to share?",
    a: "The vault CSV contains metadata only — labels, usernames, URLs, tags, entropy and timestamps — never the passwords. The JSON export on the Account page contains ciphertext, which is useless without your master password.",
  },
  {
    q: "How should I choose between the five modes?",
    a: "Random for anything a manager will type for you. Passphrase for things you must read aloud or type on a TV remote or console. Pronounceable when a human has to memorize it. Pattern when a system enforces a rigid format. PIN only where the interface accepts nothing else — a six-digit PIN is under 20 bits.",
  },
  {
    q: "Does anything here go over the network to a third party?",
    a: "No. The app talks only to its own Express API on the same origin. There are no analytics scripts, no error reporters and no external font or icon requests beyond the two self-declared font families.",
  },
];

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Cmd / Ctrl + K", action: "Open the command palette" },
  { keys: "Cmd / Ctrl + L", action: "Lock the vault immediately" },
  { keys: "Enter", action: "Run the highlighted palette command" },
  { keys: "Esc", action: "Close the palette, a dialog or a confirm" },
  { keys: "Tab / Shift + Tab", action: "Move between controls" },
  { keys: "Space", action: "Toggle the focused checkbox or switch" },
  { keys: "Arrow keys", action: "Adjust a focused slider by one step" },
];

export default function HelpPage() {
  const [query, setQuery] = useState("");

  const faq = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ;
    return FAQ.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [query]);

  return (
    <div data-testid="view-help">
      <PageHeader
        title="Help"
        description="How the crypto works, what the numbers mean, and every keyboard shortcut."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Frequently asked</CardTitle>
              <div className="relative pt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 translate-y-0 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search the FAQ…"
                  className="pl-9"
                  data-testid="input-help-search"
                />
              </div>
            </CardHeader>
            <CardContent>
              {faq.length ? (
                <Accordion type="single" collapsible className="w-full" data-testid="accordion-faq">
                  {faq.map((f, i) => (
                    <AccordionItem key={f.q} value={`faq-${i}`}>
                      <AccordionTrigger className="text-left text-xs font-medium" data-testid={`trigger-faq-${i}`}>
                        {f.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-xs leading-relaxed text-muted-foreground">
                        {f.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <p className="py-8 text-center text-xs text-muted-foreground" data-testid="state-faq-empty">
                  No answer matches “{query}”.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Reading the entropy scale</CardTitle>
              <p className="text-xs text-muted-foreground">
                Bits are a log scale — each extra bit doubles the work an attacker must do.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="table-entropy">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Bits</th>
                      <th className="py-2 pr-3 font-medium">Offline GPU (10¹¹/s)</th>
                      <th className="py-2 font-medium">Practical read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ENTROPY_BUCKETS.map((b, i) => {
                      const mid = b.max === Infinity ? b.min + 20 : (b.min + b.max) / 2;
                      const reads = [
                        "Falls to a laptop in seconds.",
                        "Survives casual attacks only.",
                        "Adequate behind rate limiting.",
                        "Comfortable for most accounts.",
                        "Strong against offline cracking.",
                        "Beyond any realistic budget.",
                      ];
                      return (
                        <tr key={b.name} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-medium tnum">{b.name}</td>
                          <td className="py-2 pr-3 tnum text-muted-foreground">
                            {humanTime(Math.pow(2, mid) / 2 / 1e11)}
                          </td>
                          <td className="py-2 text-muted-foreground">{reads[i] ?? ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Keyboard shortcuts</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-xs" data-testid="table-shortcuts">
                <tbody>
                  {SHORTCUTS.map((s) => (
                    <tr key={s.keys} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 align-top">
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {s.keys}
                        </kbd>
                      </td>
                      <td className="py-2 text-muted-foreground">{s.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Pattern tokens</CardTitle>
              <p className="text-xs text-muted-foreground">
                Anything not listed is emitted literally. Prefix with a backslash to escape a token.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-xs" data-testid="list-pattern-tokens">
                {PATTERN_TOKENS.map((t) => (
                  <li key={t.token} className="flex items-baseline gap-3">
                    <code className="w-16 shrink-0 font-mono text-primary">{t.token}</code>
                    <span className="text-muted-foreground">{t.meaning}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Attacker classes</CardTitle>
              <p className="text-xs text-muted-foreground">
                Used across the generator and audit views. Times assume half the keyspace.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs" data-testid="list-attackers">
                {ATTACKERS.map((a) => (
                  <li key={a.name} className="border-b border-border pb-2 last:border-0 last:pb-0">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground">{a.detail}</div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
