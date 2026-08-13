import { users, sessions, items, events } from "@shared/schema";
import type {
  User,
  InsertUser,
  Item,
  InsertItem,
  Event,
  InsertEvent,
  AppSettings,
  PublicUser,
} from "@shared/schema";
import { settingsSchema } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc } from "drizzle-orm";
import crypto from "node:crypto";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

/* Tables are created here so the app boots on a clean checkout without
 * needing `drizzle-kit push`. */
sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  auth_salt TEXT NOT NULL,
  auth_hash TEXT NOT NULL,
  vault_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT 'general',
  mode TEXT NOT NULL DEFAULT 'random',
  length INTEGER NOT NULL DEFAULT 0,
  strength_bits INTEGER NOT NULL DEFAULT 0,
  iv TEXT NOT NULL,
  ct TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
`);

export const db = drizzle(sqlite);

export function parseSettings(raw: string): AppSettings {
  try {
    return settingsSchema.parse(JSON.parse(raw || "{}"));
  } catch {
    return settingsSchema.parse({});
  }
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    vaultSalt: u.vaultSalt,
    createdAt: u.createdAt,
    settings: parseSettings(u.settings),
  };
}

/* scrypt(authHash) — the client-derived authHash is treated as the
 * "password" here; we never see the master password itself. */
export function hashAuth(authHash: string, salt: string): string {
  return crypto.scryptSync(authHash, salt, 64).toString("hex");
}

export function verifyAuth(authHash: string, salt: string, stored: string): boolean {
  const candidate = Buffer.from(hashAuth(authHash, salt), "hex");
  const expected = Buffer.from(stored, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, patch: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;

  createSession(userId: number): Promise<string>;
  getSessionUser(token: string): Promise<User | undefined>;
  deleteSession(token: string): Promise<void>;

  listItems(userId: number): Promise<Item[]>;
  getItem(userId: number, id: number): Promise<Item | undefined>;
  createItem(userId: number, item: InsertItem, createdAt?: number): Promise<Item>;
  updateItem(userId: number, id: number, patch: Partial<InsertItem>): Promise<Item | undefined>;
  deleteItem(userId: number, id: number): Promise<void>;

  listEvents(userId: number, limit?: number): Promise<Event[]>;
  createEvent(userId: number, event: InsertEvent, createdAt?: number): Promise<Event>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db
      .insert(users)
      .values({ ...insertUser, email: insertUser.email.toLowerCase(), createdAt: Date.now() })
      .returning()
      .get();
  }

  async updateUser(id: number, patch: Partial<InsertUser>): Promise<User | undefined> {
    return db.update(users).set(patch).where(eq(users.id, id)).returning().get();
  }

  async deleteUser(id: number): Promise<void> {
    db.delete(items).where(eq(items.userId, id)).run();
    db.delete(events).where(eq(events.userId, id)).run();
    db.delete(sessions).where(eq(sessions.userId, id)).run();
    db.delete(users).where(eq(users.id, id)).run();
  }

  async createSession(userId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    db.insert(sessions).values({ token, userId, createdAt: Date.now() }).run();
    return token;
  }

  async getSessionUser(token: string): Promise<User | undefined> {
    const s = db.select().from(sessions).where(eq(sessions.token, token)).get();
    if (!s) return undefined;
    return this.getUser(s.userId);
  }

  async deleteSession(token: string): Promise<void> {
    db.delete(sessions).where(eq(sessions.token, token)).run();
  }

  async listItems(userId: number): Promise<Item[]> {
    return db.select().from(items).where(eq(items.userId, userId)).orderBy(desc(items.createdAt)).all();
  }

  async getItem(userId: number, id: number): Promise<Item | undefined> {
    return db.select().from(items).where(and(eq(items.userId, userId), eq(items.id, id))).get();
  }

  async createItem(userId: number, item: InsertItem, createdAt?: number): Promise<Item> {
    const now = createdAt ?? Date.now();
    return db
      .insert(items)
      .values({ ...item, userId, createdAt: now, updatedAt: now })
      .returning()
      .get();
  }

  async updateItem(userId: number, id: number, patch: Partial<InsertItem>): Promise<Item | undefined> {
    return db
      .update(items)
      .set({ ...patch, updatedAt: Date.now() })
      .where(and(eq(items.userId, userId), eq(items.id, id)))
      .returning()
      .get();
  }

  async deleteItem(userId: number, id: number): Promise<void> {
    db.delete(items).where(and(eq(items.userId, userId), eq(items.id, id))).run();
  }

  async listEvents(userId: number, limit = 400): Promise<Event[]> {
    return db
      .select()
      .from(events)
      .where(eq(events.userId, userId))
      .orderBy(desc(events.createdAt))
      .limit(limit)
      .all();
  }

  async createEvent(userId: number, event: InsertEvent, createdAt?: number): Promise<Event> {
    return db
      .insert(events)
      .values({ ...event, userId, createdAt: createdAt ?? Date.now() })
      .returning()
      .get();
  }
}

export const storage = new DatabaseStorage();
