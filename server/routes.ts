import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { insertWalletSchema, insertTransactionSchema, insertTrustlineSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const { passwordHash, ...userWithoutHash } = req.user;
      res.json({
        ...userWithoutHash,
        hasPassword: !!passwordHash,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post('/api/logout', (req: any, res) => {
    req.session.destroy((err: any) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ message: 'Failed to logout' });
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  });

  const MAX_SYNC_PAYLOAD_SIZE = 1024 * 1024;
  const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/i;
  const BASE64_PATTERN = /^[A-Za-z0-9+/]+=*$/;

  const syncPushSchema = z.object({
    encryptedData: z.string()
      .min(1, "Encrypted data is required")
      .max(MAX_SYNC_PAYLOAD_SIZE, `Payload exceeds maximum size of ${MAX_SYNC_PAYLOAD_SIZE} bytes`),
    checksum: z.string()
      .regex(CHECKSUM_PATTERN, "Invalid checksum format (must be 64-character hex string)"),
    salt: z.string()
      .regex(BASE64_PATTERN, "Invalid salt format (must be base64)")
      .min(20, "Salt too short")
      .max(50, "Salt too long")
      .optional(),
    dataVersion: z.number().int().min(0).optional(),
  });

  app.get('/api/sync/status', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const syncedData = await storage.getSyncedWallets(user.id);
      
      res.json({
        hasData: !!syncedData && !syncedData.deletedAt,
        salt: syncedData?.salt || null,
        checksum: syncedData?.checksum || null,
        dataVersion: syncedData?.dataVersion || 0,
        deletedAt: syncedData?.deletedAt || null,
        lastSyncedAt: syncedData?.lastSyncedAt || null,
        canSync: true,
      });
    } catch (error) {
      console.error("Error getting sync status:", error);
      res.status(500).json({ message: "Failed to get sync status" });
    }
  });

  app.post('/api/sync/push', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const parsed = syncPushSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }

      const { encryptedData, checksum, salt, dataVersion } = parsed.data;

      const existing = await storage.getSyncedWallets(user.id);
      if (existing) {
        const serverVersion = existing.dataVersion || 0;
        const clientVersion = dataVersion ?? 0;
        
        if (existing.deletedAt && serverVersion > clientVersion) {
          return res.status(409).json({ 
            message: "Data was deleted. Please refresh to sync.",
            dataVersion: serverVersion,
            deletedAt: existing.deletedAt
          });
        }
      }

      const newVersion = (existing?.dataVersion || 0) + 1;
      const result = await storage.upsertSyncedWallets(user.id, encryptedData, checksum, salt, newVersion);
      res.json({ success: true, syncedAt: new Date().toISOString(), dataVersion: result.dataVersion });
    } catch (error) {
      console.error("Error pushing sync data:", error);
      res.status(500).json({ message: "Failed to push sync data" });
    }
  });

  app.get('/api/sync/pull', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const syncedData = await storage.getSyncedWallets(user.id);
      if (!syncedData) {
        return res.json({ encryptedData: null, checksum: null, salt: null, dataVersion: 0, deletedAt: null, syncedAt: null });
      }

      res.json({
        encryptedData: syncedData.deletedAt ? null : syncedData.walletPayload,
        checksum: syncedData.deletedAt ? null : syncedData.checksum,
        salt: syncedData.salt,
        dataVersion: syncedData.dataVersion || 0,
        deletedAt: syncedData.deletedAt,
        syncedAt: syncedData.lastSyncedAt,
      });
    } catch (error) {
      console.error("Error pulling sync data:", error);
      res.status(500).json({ message: "Failed to pull sync data" });
    }
  });

  app.get('/api/sync/verify', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const syncedData = await storage.getSyncedWallets(user.id);
      if (!syncedData) {
        return res.json({ encryptedData: null, checksum: null, salt: null, syncedAt: null });
      }

      res.json({
        encryptedData: syncedData.walletPayload,
        checksum: syncedData.checksum,
        salt: syncedData.salt,
        syncedAt: syncedData.lastSyncedAt,
      });
    } catch (error) {
      console.error("Error verifying sync data:", error);
      res.status(500).json({ message: "Failed to verify sync data" });
    }
  });

  app.post('/api/sync/reset', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      await storage.deleteSyncedWalletByUserId(user.id);
      await storage.updateUser(user.id, {
        syncOptIn: false,
        syncEnabledAt: null,
      });

      res.json({ success: true, message: "Cloud sync has been reset. You can now set up a new passphrase." });
    } catch (error) {
      console.error("Error resetting cloud sync:", error);
      res.status(500).json({ message: "Failed to reset cloud sync" });
    }
  });

  app.delete('/api/sync/data', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      await storage.deleteSyncedWalletByUserId(user.id);
      res.json({ success: true, message: "Cloud sync data deleted" });
    } catch (error) {
      console.error("Error deleting sync data:", error);
      res.status(500).json({ message: "Failed to delete sync data" });
    }
  });

  app.post('/api/sync/delete-all', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const result = await storage.setDeletionTombstone(user.id);
      if (!result) {
        return res.json({ success: true, dataVersion: 0, message: "No sync data to delete" });
      }

      res.json({ 
        success: true, 
        dataVersion: result.dataVersion,
        deletedAt: result.deletedAt,
        message: "Deletion tombstone set. All synced devices will clear their data." 
      });
    } catch (error) {
      console.error("Error setting deletion tombstone:", error);
      res.status(500).json({ message: "Failed to delete sync data" });
    }
  });

  app.post('/api/sync/opt-in', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const { optIn } = req.body;
      await storage.updateUser(user.id, {
        syncOptIn: optIn === true,
        syncEnabledAt: optIn === true ? new Date() : null,
      });
      res.json({ syncOptIn: optIn === true });
    } catch (error) {
      console.error("Error updating sync preference:", error);
      res.status(500).json({ message: "Failed to update sync preference" });
    }
  });

  app.get("/api/wallets", async (req, res) => {
    try {
      const wallets = await storage.getAllWallets();
      res.json(wallets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  app.get("/api/wallets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const wallet = await storage.getWallet(id);
      
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      res.json(wallet);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallet" });
    }
  });

  app.post("/api/wallets", async (req, res) => {
    try {
      const walletData = insertWalletSchema.parse(req.body);
      const wallet = await storage.createWallet(walletData);
      res.status(201).json(wallet);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid wallet data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create wallet" });
    }
  });

  app.patch("/api/wallets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const wallet = await storage.updateWallet(id, updates);
      
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      res.json(wallet);
    } catch (error) {
      res.status(500).json({ error: "Failed to update wallet" });
    }
  });

  app.delete("/api/wallets", async (req, res) => {
    try {
      await storage.clearAllData();
      res.json({ message: "All wallet data cleared" });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear wallet data" });
    }
  });

  app.get("/api/transactions/:walletId", async (req, res) => {
    try {
      const walletId = parseInt(req.params.walletId);
      const transactions = await storage.getTransactionsByWallet(walletId);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      const transactionData = insertTransactionSchema.parse(req.body);
      const transaction = await storage.createTransaction(transactionData);
      res.status(201).json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid transaction data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  app.patch("/api/transactions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const transaction = await storage.updateTransaction(id, updates);
      
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: "Failed to update transaction" });
    }
  });

  app.get("/api/trustlines/:walletId", async (req, res) => {
    try {
      const walletId = parseInt(req.params.walletId);
      const trustlines = await storage.getTrustlinesByWallet(walletId);
      res.json(trustlines);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trustlines" });
    }
  });

  app.post("/api/trustlines", async (req, res) => {
    try {
      const trustlineData = insertTrustlineSchema.parse(req.body);
      const trustline = await storage.createTrustline(trustlineData);
      res.status(201).json(trustline);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid trustline data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create trustline" });
    }
  });

  app.patch("/api/trustlines/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const trustline = await storage.updateTrustline(id, updates);
      
      if (!trustline) {
        return res.status(404).json({ error: "Trustline not found" });
      }
      
      res.json(trustline);
    } catch (error) {
      res.status(500).json({ error: "Failed to update trustline" });
    }
  });

  // Admin routes - protected by admin email check
  const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
  const ADMIN_EMAILS = adminEmailsEnv
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
  
  if (ADMIN_EMAILS.length === 0) {
    console.warn('[Admin] No ADMIN_EMAILS configured - admin panel will be inaccessible');
  } else {
    console.log(`[Admin] Admin access configured for: ${ADMIN_EMAILS.join(', ')}`);
  }
  
  const isAdmin = async (req: any, res: Response, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (ADMIN_EMAILS.length === 0) {
      return res.status(403).json({ message: "Admin access not configured" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return res.status(403).json({ message: "Forbidden - admin access required" });
    }
    req.user = user;
    next();
  };

  app.get("/api/admin/users", isAdmin, async (req: any, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      
      const enrichedUsers = await Promise.all(allUsers.map(async (user) => {
        const oauthAccounts = await storage.getOAuthAccountsByUserId(user.id);
        const syncedWallets = await storage.getSyncedWallets(user.id);
        const syncedSettings = await storage.getSyncedSettings(user.id);
        
        return {
          ...user,
          oauthAccounts: oauthAccounts.map(a => ({ provider: a.provider, email: a.email })),
          hasSyncedWallets: !!syncedWallets,
          hasSyncedSettings: !!syncedSettings,
        };
      }));
      
      res.json(enrichedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.delete("/api/admin/users/:userId", isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.deleteUser(userId);
      
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
