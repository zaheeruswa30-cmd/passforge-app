import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * users — the server never sees the master password or the vault key.
 * authHash is the client-derived PBKDF2 hash; we store scrypt(authHash).
 * vaultSalt is public (not a secret) and is required by the client to
 * re-derive the AES-GCM vault key at login time.
 * ------------------------------------------------------------------ */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  authSalt: text("auth_salt").notNull(),
  authHash: text("auth_hash").notNull(),
  vaultSalt: text("vault_salt").notNull(),
  createdAt: integer("created_at").notNull(),
  settings: text("settings").notNull().default("{}"),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  label: text("label").notNull(),
  username: text("username").notNull().default(""),
  url: text("url").notNull().default(""),
  tag: text("tag").notNull().default("general"),
  mode: text("mode").notNull().default("random"),
  length: integer("length").notNull().default(0),
  strengthBits: integer("strength_bits").notNull().default(0),
  iv: text("iv").notNull(),
  ct: text("ct").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(),
  meta: text("meta").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
});

/* ---------------- insert schemas ---------------- */

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof items.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;
export type Session = typeof sessions.$inferSelect;

/* ---------------- API payload schemas ---------------- */

export const signupSchema = z.object({
  email: z.string().email().max(160),
  name: z.string().min(1).max(80),
  authHash: z.string().min(32).max(256),
  vaultSalt: z.string().min(8).max(256),
});

export const loginSchema = z.object({
  email: z.string().email().max(160),
  authHash: z.string().min(32).max(256),
});

export const updateItemSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  username: z.string().max(160).optional(),
  url: z.string().max(300).optional(),
  tag: z.string().max(40).optional(),
  mode: z.string().max(24).optional(),
  length: z.number().int().min(0).max(4096).optional(),
  strengthBits: z.number().int().min(0).max(100000).optional(),
  iv: z.string().max(128).optional(),
  ct: z.string().max(200000).optional(),
});

export const rekeySchema = z.object({
  authHash: z.string().min(32).max(256),
  vaultSalt: z.string().min(8).max(256),
  items: z.array(
    z.object({ id: z.number().int(), iv: z.string(), ct: z.string() })
  ),
});

export const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).default("system"),
  maskByDefault: z.boolean().default(true),
  clipboardClearSeconds: z.number().int().min(0).max(300).default(30),
  autoLockMinutes: z.number().int().min(0).max(240).default(10),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  generator: z
    .object({
      length: z.number().int().min(4).max(128).default(20),
      lower: z.boolean().default(true),
      upper: z.boolean().default(true),
      digits: z.boolean().default(true),
      symbols: z.boolean().default(true),
      eachSet: z.boolean().default(true),
      avoidSimilar: z.boolean().default(false),
      avoidShellUnsafe: z.boolean().default(false),
      noRepeat: z.boolean().default(false),
      noSequence: z.boolean().default(false),
      startLetter: z.boolean().default(false),
    })
    .default({
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
    }),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const profileSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().max(160),
});

export type PublicUser = {
  id: number;
  email: string;
  name: string;
  vaultSalt: string;
  createdAt: number;
  settings: AppSettings;
};
