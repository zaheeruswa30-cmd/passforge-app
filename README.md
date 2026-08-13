# PassForge Vault

A zero-knowledge password generator and vault dashboard. Passwords are generated, encrypted and decrypted **entirely in the browser**; the server only ever sees ciphertext, a random IV and non-secret metadata.

Stack: Express + Vite + React + TypeScript + Tailwind CSS + shadcn/ui + Drizzle ORM over SQLite (better-sqlite3), charts by Recharts.

---

## Run it in VS Code

Requirements: Node.js 20+ (Node 18 works) and npm.

```bash
cd passforge-app
npm install
npm run dev
```

Open <http://localhost:5000>. One Express process serves both the API and the Vite dev frontend on port 5000, with hot module reload — no second terminal, no proxy config.

Recommended VS Code extensions: ESLint, Tailwind CSS IntelliSense, Prettier.

| Script          | What it does                                                       |
| --------------- | ------------------------------------------------------------------ |
| `npm run dev`   | Dev server (Express API + Vite HMR) on port 5000                    |
| `npm run check` | TypeScript type-check (`tsc`, no emit)                              |
| `npm run build` | Production build → `dist/public` (client) and `dist/index.cjs` (server) |
| `npm start`     | Run the production build (`NODE_ENV=production node dist/index.cjs`) |

### Demo account

A demo vault is seeded automatically on first boot. Click **Use demo account** on the sign-in screen, or type the credentials:

```
email:    demo@passforge.app
password: demo-master-key
```

It contains 28 encrypted entries (deliberately including weak, reused and stale ones so the audit view has something to say) and 90 days of activity events so every chart is populated.

The SQLite file is `data.db` in the project root and is git-ignored. Delete it to reset everything; it re-seeds on the next boot.

---

## Architecture

```
shared/schema.ts        Drizzle tables (users, sessions, items, events) + zod schemas + shared types
server/
  index.ts              Express bootstrap (template-provided)
  routes.ts             All /api routes: auth, items CRUD, events, account (profile/settings/rekey/export/delete)
  storage.ts            IStorage + DatabaseStorage — every DB query lives here; scrypt auth-hash helpers
  seed.ts               Demo account, 28 items, 90 days of events
client/src/
  lib/crypto.ts         PBKDF2-SHA256 (210,000 iterations) → AES-256-GCM encrypt/decrypt, auth-hash derivation
  lib/generator.ts      Five generation modes + entropy math (ported verbatim from the v1 app)
  lib/wordlist.ts       945-word passphrase list
  lib/analytics.ts      Vault audit, KPI builders, chart series, CSV export, relative time
  lib/queryClient.ts    TanStack Query client, apiRequest, in-memory bearer token
  state/app.tsx         AppProvider — session, vault key, decrypted items, settings, theme
  components/shell.tsx  Sidebar/drawer, header, command palette, lock overlay
  components/brand.tsx  Logo mark, wordmark, strength badge/meter, masked secret, page header
  pages/                auth, overview, generator, vault, audit, activity, account, settings, help
```

### Views

- **Overview** — six KPI cards and five charts: generation activity (30-day area), strength mix (donut), entropy distribution (bar), items by tag (horizontal bar), average vault entropy over time (line), plus a health gauge and recently-added list. CSV export.
- **Generator** — random, passphrase, pronounceable, pattern and PIN modes with live entropy, crack-time estimates, presets, and save-to-vault.
- **Vault** — searchable, filterable, sortable table (cards on mobile) with reveal, copy, edit and delete.
- **Audit** — health score, weak/reused/stale lists with one-click rotation, and a paste-any-password analyzer with four attacker budgets.
- **Activity** — grouped audit trail with search, type filter and CSV export.
- **Account** — profile, key material summary, master-password change with full client-side re-encryption, encrypted JSON export, account deletion.
- **Settings** — theme, row density, masking, clipboard auto-clear, auto-lock, default generator profile.
- **Help** — searchable FAQ, keyboard shortcuts, pattern token reference, entropy scale, attacker classes.

---

## Crypto design

1. Your master password never leaves the browser.
2. Two independent values are derived from it with PBKDF2-SHA256 at 210,000 iterations:
   - an **auth hash** (salted with your email) sent to the server, which stores only its scrypt hash;
   - a **vault key** (salted with a random per-user `vaultSalt`), imported as a non-extractable `CryptoKey` and held in JavaScript memory only.
3. Every item's password and notes are encrypted with AES-256-GCM using a fresh 96-bit random IV. The server stores base64 ciphertext + IV.
4. Changing the master password decrypts every item with the old key and re-encrypts with the new one in the browser, then uploads the new ciphertext, new vault salt and new auth hash in a single transaction.
5. Randomness comes from `crypto.getRandomValues` with rejection sampling — never `Math.random`.
6. No browser-persisted storage is used anywhere: the session token and theme live in React state, so closing the tab ends the session.

## Known limitations (this is a demo build)

- No rate limiting, CAPTCHA or lockout on the sign-in endpoint.
- No 2FA, no password-reset flow — a forgotten master password means unrecoverable data, by design.
- Sessions live in memory/SQLite and are invalidated when the server restarts; there is no refresh-token rotation.
- Runs over plain HTTP locally; a real deployment needs TLS and secure cookie/CSRF hardening.
- Auto-lock is timer-based inside the tab; it does not detect OS-level lock or tab discard.
- The seeded demo data is synthetic and regenerates whenever `data.db` is deleted.
