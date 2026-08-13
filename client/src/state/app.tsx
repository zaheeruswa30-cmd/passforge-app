import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, setAuthToken } from "@/lib/queryClient";
import {
  deriveAuthHash,
  deriveVaultKey,
  newVaultSalt,
  decryptJson,
  encryptJson,
} from "@/lib/crypto";
import type { VaultSecret } from "@/lib/crypto";
import type { AppSettings, Item, PublicUser } from "@shared/schema";
import { defaultConfig } from "@/lib/generator";
import type { GenConfig } from "@/lib/generator";

export type Theme = "light" | "dark" | "system";

export type DecryptedItem = Item & { password: string; notes: string; decryptError?: boolean };

type Session = {
  user: PublicUser;
  vaultKey: CryptoKey;
  authHash: string;
};

type AppContextValue = {
  session: Session | null;
  user: PublicUser | null;
  settings: AppSettings;
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
  locked: boolean;
  lock: () => void;
  unlock: (password: string) => Promise<boolean>;
  signup: (email: string, name: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sessionEnded: boolean;
  noteSessionEnded: () => void;
  saveSettings: (next: AppSettings) => Promise<void>;
  updateProfile: (name: string, email: string) => Promise<void>;
  changeMasterPassword: (current: string, next: string) => Promise<number>;
  encryptSecret: (secret: VaultSecret) => Promise<{ iv: string; ct: string }>;
  logEvent: (type: string, meta?: Record<string, unknown>) => void;
  genConfig: GenConfig;
  setGenConfig: (c: GenConfig) => void;
  clipboardCountdown: number | null;
  copySecret: (value: string, label?: string) => Promise<void>;
  lastActivity: number;
  markActive: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const FALLBACK_SETTINGS: AppSettings = {
  theme: "system",
  maskByDefault: true,
  clipboardClearSeconds: 30,
  autoLockMinutes: 10,
  density: "comfortable",
  generator: {
    length: 20,
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
    eachSet: true,
    avoidSimilar: false,
    avoidShellUnsafe: false,
    noRepeat: false,
    noSequence: false,
    startLetter: false,
  },
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [theme, setThemeState] = useState<Theme>("system");
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [locked, setLocked] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [genConfig, setGenConfig] = useState<GenConfig>(defaultConfig());
  const [clipboardCountdown, setClipboardCountdown] = useState<number | null>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const clipboardTimer = useRef<number | null>(null);
  const queryClient = useQueryClient();

  const settings = session?.user.settings ?? FALLBACK_SETTINGS;

  /* ---------- theme ---------- */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  useEffect(() => {
    if (session) setThemeState(session.user.settings.theme);
  }, [session?.user.settings.theme]);

  /* ---------- auth ---------- */
  const applyAuth = useCallback(
    (token: string, user: PublicUser, vaultKey: CryptoKey, authHash: string) => {
      setAuthToken(token);
      setSession({ user, vaultKey, authHash });
      setSessionEnded(false);
      setLocked(false);
      setLastActivity(Date.now());
      setGenConfig((prev) => ({
        ...prev,
        random: { ...prev.random, ...user.settings.generator },
      }));
      queryClient.clear();
    },
    [queryClient]
  );

  const signup = useCallback(
    async (email: string, name: string, password: string) => {
      const vaultSalt = newVaultSalt();
      const authHash = await deriveAuthHash(password, email);
      const res = await apiRequest("POST", "/api/auth/signup", {
        email: email.toLowerCase(),
        name,
        authHash,
        vaultSalt,
      });
      const data = (await res.json()) as { token: string; user: PublicUser };
      const vaultKey = await deriveVaultKey(password, data.user.vaultSalt);
      applyAuth(data.token, data.user, vaultKey, authHash);
    },
    [applyAuth]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const authHash = await deriveAuthHash(password, email);
      const res = await apiRequest("POST", "/api/auth/login", {
        email: email.toLowerCase(),
        authHash,
      });
      const data = (await res.json()) as { token: string; user: PublicUser };
      const vaultKey = await deriveVaultKey(password, data.user.vaultSalt);
      applyAuth(data.token, data.user, vaultKey, authHash);
    },
    [applyAuth]
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      /* the session may already be gone; sign out locally regardless */
    }
    setAuthToken(null);
    setSession(null);
    setLocked(false);
    queryClient.clear();
  }, [queryClient]);

  const noteSessionEnded = useCallback(() => setSessionEnded(true), []);

  /* ---------- lock ---------- */
  const lock = useCallback(() => setLocked(true), []);
  const unlock = useCallback(
    async (password: string) => {
      if (!session) return false;
      const hash = await deriveAuthHash(password, session.user.email);
      if (hash !== session.authHash) return false;
      setLocked(false);
      setLastActivity(Date.now());
      return true;
    },
    [session]
  );

  const markActive = useCallback(() => setLastActivity(Date.now()), []);

  useEffect(() => {
    if (!session || locked || !settings.autoLockMinutes) return;
    const id = window.setInterval(() => {
      if (Date.now() - lastActivity > settings.autoLockMinutes * 60_000) setLocked(true);
    }, 5_000);
    return () => window.clearInterval(id);
  }, [session, locked, settings.autoLockMinutes, lastActivity]);

  /* ---------- settings / profile ---------- */
  const saveSettings = useCallback(
    async (next: AppSettings) => {
      const res = await apiRequest("PATCH", "/api/account/settings", next);
      const user = (await res.json()) as PublicUser;
      setSession((s) => (s ? { ...s, user } : s));
      setThemeState(user.settings.theme);
    },
    []
  );

  const updateProfile = useCallback(async (name: string, email: string) => {
    const res = await apiRequest("PATCH", "/api/account/profile", { name, email });
    const user = (await res.json()) as PublicUser;
    setSession((s) => (s ? { ...s, user } : s));
  }, []);

  /* ---------- master password rotation ---------- *
   * Every item is decrypted with the old key and re-encrypted with the new
   * one in the browser; the server only receives new ciphertext. */
  const changeMasterPassword = useCallback(
    async (current: string, next: string) => {
      if (!session) throw new Error("Not signed in");
      const currentHash = await deriveAuthHash(current, session.user.email);
      if (currentHash !== session.authHash) throw new Error("Current master password is incorrect");

      const items = (await (await apiRequest("GET", "/api/items")).json()) as Item[];
      const vaultSalt = newVaultSalt();
      const newKey = await deriveVaultKey(next, vaultSalt);
      const newAuthHash = await deriveAuthHash(next, session.user.email);

      const payload: { id: number; iv: string; ct: string }[] = [];
      for (const item of items) {
        const secret = await decryptJson<VaultSecret>(session.vaultKey, { iv: item.iv, ct: item.ct });
        const enc = await encryptJson(newKey, secret);
        payload.push({ id: item.id, iv: enc.iv, ct: enc.ct });
      }

      const res = await apiRequest("POST", "/api/account/rekey", {
        authHash: newAuthHash,
        vaultSalt,
        items: payload,
      });
      const user = (await res.json()) as PublicUser;
      setSession({ user, vaultKey: newKey, authHash: newAuthHash });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      return payload.length;
    },
    [session, queryClient]
  );

  const encryptSecret = useCallback(
    async (secret: VaultSecret) => {
      if (!session) throw new Error("Not signed in");
      return encryptJson(session.vaultKey, secret);
    },
    [session]
  );

  const logEvent = useCallback(
    (type: string, meta: Record<string, unknown> = {}) => {
      if (!session) return;
      void apiRequest("POST", "/api/events", { type, meta: JSON.stringify(meta) })
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/events"] }))
        .catch(() => undefined);
    },
    [session, queryClient]
  );

  /* ---------- clipboard with auto-clear ---------- */
  const copySecret = useCallback(
    async (value: string, _label?: string) => {
      void _label;
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand?.("copy");
        document.body.removeChild(ta);
      }
      const seconds = settings.clipboardClearSeconds;
      if (clipboardTimer.current) window.clearInterval(clipboardTimer.current);
      if (seconds > 0) {
        setClipboardCountdown(seconds);
        let left = seconds;
        clipboardTimer.current = window.setInterval(() => {
          left -= 1;
          if (left <= 0) {
            window.clearInterval(clipboardTimer.current!);
            clipboardTimer.current = null;
            setClipboardCountdown(null);
            navigator.clipboard?.writeText("").catch(() => undefined);
          } else {
            setClipboardCountdown(left);
          }
        }, 1000);
      }
    },
    [settings.clipboardClearSeconds]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      settings,
      theme,
      resolvedTheme,
      setTheme: (t: Theme) => {
        setThemeState(t);
        if (session) void saveSettings({ ...session.user.settings, theme: t });
      },
      locked,
      lock,
      unlock,
      signup,
      login,
      logout,
      sessionEnded,
      noteSessionEnded,
      saveSettings,
      updateProfile,
      changeMasterPassword,
      encryptSecret,
      logEvent,
      genConfig,
      setGenConfig,
      clipboardCountdown,
      copySecret,
      lastActivity,
      markActive,
    }),
    [
      session, settings, theme, resolvedTheme, locked, lock, unlock, signup, login, logout,
      sessionEnded, noteSessionEnded, saveSettings, updateProfile, changeMasterPassword,
      encryptSecret, logEvent, genConfig, clipboardCountdown, copySecret, lastActivity, markActive,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

/** Vault items, decrypted in the browser with the in-memory vault key. */
export function useVault() {
  const { session } = useApp();
  const query = useQuery<Item[]>({ queryKey: ["/api/items"], enabled: !!session });
  const [decrypted, setDecrypted] = useState<DecryptedItem[]>([]);
  const [decrypting, setDecrypting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!session || !query.data) {
        setDecrypted([]);
        return;
      }
      setDecrypting(true);
      const out: DecryptedItem[] = [];
      for (const item of query.data) {
        try {
          const secret = await decryptJson<VaultSecret>(session.vaultKey, {
            iv: item.iv,
            ct: item.ct,
          });
          out.push({ ...item, password: secret.password, notes: secret.notes ?? "" });
        } catch {
          out.push({ ...item, password: "", notes: "", decryptError: true });
        }
      }
      if (!cancelled) {
        setDecrypted(out);
        setDecrypting(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [session, query.data]);

  return {
    items: decrypted,
    isLoading: query.isLoading || decrypting,
    error: query.error,
    raw: query.data ?? [],
  };
}
