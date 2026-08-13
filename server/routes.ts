import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import crypto from "node:crypto";
import { z } from "zod";
import { storage, hashAuth, verifyAuth, toPublicUser, parseSettings } from "./storage";
import { seedDemoAccount } from "./seed";
import {
  signupSchema,
  loginSchema,
  insertItemSchema,
  insertEventSchema,
  updateItemSchema,
  rekeySchema,
  settingsSchema,
  profileSchema,
} from "@shared/schema";
import type { User } from "@shared/schema";

type AuthedRequest = Request & { user?: User; token?: string };

function bad(res: Response, message: string, code = 400) {
  return res.status(code).json({ message });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await seedDemoAccount();

  const requireAuth = async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return bad(res, "Not signed in", 401);
    const user = await storage.getSessionUser(token);
    if (!user) return bad(res, "Session expired", 401);
    req.user = user;
    req.token = token;
    next();
  };

  /* ---------------- auth ---------------- */

  app.post("/api/auth/signup", async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, "Invalid signup payload");
    const { email, name, authHash, vaultSalt } = parsed.data;

    if (await storage.getUserByEmail(email)) return bad(res, "That email already has a vault", 409);

    const authSalt = crypto.randomBytes(16).toString("hex");
    const user = await storage.createUser({
      email,
      name,
      authSalt,
      authHash: hashAuth(authHash, authSalt),
      vaultSalt,
      settings: JSON.stringify(settingsSchema.parse({})),
    });
    const token = await storage.createSession(user.id);
    await storage.createEvent(user.id, { type: "login", meta: JSON.stringify({ first: true }) });
    res.json({ token, user: toPublicUser(user) });
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, "Invalid login payload");
    const user = await storage.getUserByEmail(parsed.data.email);
    if (!user || !verifyAuth(parsed.data.authHash, user.authSalt, user.authHash)) {
      return bad(res, "Email or master password is incorrect", 401);
    }
    const token = await storage.createSession(user.id);
    await storage.createEvent(user.id, { type: "login", meta: "{}" });
    res.json({ token, user: toPublicUser(user) });
  });

  app.post("/api/auth/logout", requireAuth, async (req: AuthedRequest, res) => {
    if (req.token) await storage.deleteSession(req.token);
    res.json({ ok: true });
  });

  app.get("/api/me", requireAuth, async (req: AuthedRequest, res) => {
    res.json(toPublicUser(req.user!));
  });

  /* Public: the vault salt is not a secret, but the client needs it before
   * it can derive the vault key. Returned with the login response too. */
  app.get("/api/auth/salt", async (req, res) => {
    const email = String(req.query.email || "");
    const user = await storage.getUserByEmail(email);
    if (!user) return bad(res, "No vault for that email", 404);
    res.json({ vaultSalt: user.vaultSalt });
  });

  /* ---------------- items ---------------- */

  app.get("/api/items", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listItems(req.user!.id));
  });

  app.post("/api/items", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = insertItemSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, "Invalid item payload");
    const item = await storage.createItem(req.user!.id, parsed.data);
    await storage.createEvent(req.user!.id, {
      type: "saved",
      meta: JSON.stringify({ label: item.label, bits: item.strengthBits }),
    });
    res.json(item);
  });

  app.patch("/api/items/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return bad(res, "Invalid item id");
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, "Invalid item payload");
    const item = await storage.updateItem(req.user!.id, id, parsed.data);
    if (!item) return bad(res, "Item not found", 404);
    await storage.createEvent(req.user!.id, {
      type: "saved",
      meta: JSON.stringify({ label: item.label, bits: item.strengthBits, updated: true }),
    });
    res.json(item);
  });

  app.delete("/api/items/:id", requireAuth, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getItem(req.user!.id, id);
    if (!existing) return bad(res, "Item not found", 404);
    await storage.deleteItem(req.user!.id, id);
    await storage.createEvent(req.user!.id, {
      type: "deleted",
      meta: JSON.stringify({ label: existing.label }),
    });
    res.json({ ok: true });
  });

  /* ---------------- events ---------------- */

  app.get("/api/events", requireAuth, async (req: AuthedRequest, res) => {
    res.json(await storage.listEvents(req.user!.id));
  });

  app.post("/api/events", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = insertEventSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, "Invalid event payload");
    res.json(await storage.createEvent(req.user!.id, parsed.data));
  });

  /* ---------------- account ---------------- */

  app.patch("/api/account/profile", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, "Invalid profile payload");
    const other = await storage.getUserByEmail(parsed.data.email);
    if (other && other.id !== req.user!.id) return bad(res, "That email is already taken", 409);
    const user = await storage.updateUser(req.user!.id, {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
    } as Partial<User>);
    res.json(toPublicUser(user!));
  });

  app.patch("/api/account/settings", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, "Invalid settings payload");
    const user = await storage.updateUser(req.user!.id, {
      settings: JSON.stringify(parsed.data),
    } as Partial<User>);
    res.json(toPublicUser(user!));
  });

  /* Master-password change: client re-encrypts every item with the new
   * vault key and sends the new authHash + new vault salt in one atomic call. */
  app.post("/api/account/rekey", requireAuth, async (req: AuthedRequest, res) => {
    const parsed = rekeySchema.safeParse(req.body);
    if (!parsed.success) return bad(res, "Invalid rekey payload");
    const authSalt = crypto.randomBytes(16).toString("hex");
    const user = await storage.updateUser(req.user!.id, {
      authSalt,
      authHash: hashAuth(parsed.data.authHash, authSalt),
      vaultSalt: parsed.data.vaultSalt,
    } as Partial<User>);
    for (const it of parsed.data.items) {
      await storage.updateItem(req.user!.id, it.id, { iv: it.iv, ct: it.ct });
    }
    await storage.createEvent(req.user!.id, {
      type: "audit",
      meta: JSON.stringify({ action: "master-password-changed", items: parsed.data.items.length }),
    });
    res.json(toPublicUser(user!));
  });

  app.get("/api/account/export", requireAuth, async (req: AuthedRequest, res) => {
    const user = req.user!;
    res.json({
      exportedAt: new Date().toISOString(),
      account: {
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        settings: parseSettings(user.settings),
      },
      note: "Item payloads are AES-256-GCM ciphertext. Only your master password can decrypt them.",
      items: await storage.listItems(user.id),
      events: await storage.listEvents(user.id, 1000),
    });
  });

  app.delete("/api/account", requireAuth, async (req: AuthedRequest, res) => {
    await storage.deleteUser(req.user!.id);
    res.json({ ok: true });
  });

  /* fallthrough for unknown API routes */
  app.use("/api", (_req, res) => res.status(404).json({ message: "Unknown endpoint" }));

  void z;
  return httpServer;
}
