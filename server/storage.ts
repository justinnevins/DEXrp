import { 
  users,
  syncedWallets,
  syncedSettings,
  wallets, 
  transactions, 
  trustlines,
  oauthAccounts,
  magicLinks,
  type User,
  type UpsertUser,
  type SyncedWallet,
  type InsertSyncedWallet,
  type SyncedSettings,
  type InsertSyncedSettings,
  type Wallet, 
  type Transaction, 
  type Trustline, 
  type InsertWallet, 
  type InsertTransaction, 
  type InsertTrustline,
  type OAuthAccount,
  type InsertOAuthAccount,
  type MagicLink,
  type InsertMagicLink,
  type AuthProvider
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gt } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  getSyncedWallets(userId: string): Promise<SyncedWallet | undefined>;
  upsertSyncedWallets(userId: string, walletPayload: string, checksum: string, salt?: string, dataVersion?: number): Promise<SyncedWallet>;
  setDeletionTombstone(userId: string): Promise<SyncedWallet | undefined>;
  createSyncedWallet(syncedWallet: InsertSyncedWallet): Promise<SyncedWallet>;
  updateSyncedWallet(id: number, updates: Partial<SyncedWallet>): Promise<SyncedWallet | undefined>;
  deleteSyncedWallet(id: number): Promise<void>;
  deleteSyncedWalletByUserId(userId: string): Promise<void>;

  getSyncedSettings(userId: string): Promise<SyncedSettings | undefined>;
  upsertSyncedSettings(syncedSettings: InsertSyncedSettings): Promise<SyncedSettings>;

  getWallet(id: number): Promise<Wallet | undefined>;
  getWalletByAddress(address: string): Promise<Wallet | undefined>;
  getAllWallets(): Promise<Wallet[]>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  updateWallet(id: number, updates: Partial<Wallet>): Promise<Wallet | undefined>;
  
  getTransaction(id: number): Promise<Transaction | undefined>;
  getTransactionsByWallet(walletId: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, updates: Partial<Transaction>): Promise<Transaction | undefined>;
  
  getTrustline(id: number): Promise<Trustline | undefined>;
  getTrustlinesByWallet(walletId: number): Promise<Trustline[]>;
  createTrustline(trustline: InsertTrustline): Promise<Trustline>;
  updateTrustline(id: number, updates: Partial<Trustline>): Promise<Trustline | undefined>;
  
  clearAllData(): Promise<void>;

  // OAuth accounts
  getOAuthAccount(provider: AuthProvider, providerAccountId: string): Promise<OAuthAccount | undefined>;
  getOAuthAccountsByUserId(userId: string): Promise<OAuthAccount[]>;
  createOAuthAccount(account: InsertOAuthAccount): Promise<OAuthAccount>;
  updateOAuthAccount(id: number, updates: Partial<OAuthAccount>): Promise<OAuthAccount | undefined>;
  deleteOAuthAccount(id: number): Promise<void>;

  // Magic links
  createMagicLink(magicLink: InsertMagicLink): Promise<MagicLink>;
  getMagicLinkByToken(token: string): Promise<MagicLink | undefined>;
  markMagicLinkUsed(id: number): Promise<void>;
  cleanupExpiredMagicLinks(): Promise<void>;

  // Admin
  getAllUsers(): Promise<User[]>;
  deleteUser(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user || undefined;
  }


  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getSyncedWallets(userId: string): Promise<SyncedWallet | undefined> {
    const [record] = await db.select().from(syncedWallets).where(eq(syncedWallets.userId, userId));
    return record || undefined;
  }

  async upsertSyncedWallets(userId: string, walletPayload: string, checksum: string, salt?: string, dataVersion?: number): Promise<SyncedWallet> {
    const existing = await this.getSyncedWallets(userId);
    if (existing) {
      const updateData: any = { 
        walletPayload, 
        checksum, 
        lastSyncedAt: new Date(),
        deletedAt: null,
      };
      if (salt !== undefined) {
        updateData.salt = salt;
      }
      if (dataVersion !== undefined) {
        updateData.dataVersion = dataVersion;
      }
      const [updated] = await db.update(syncedWallets)
        .set(updateData)
        .where(eq(syncedWallets.userId, userId))
        .returning();
      return updated;
    }
    const [record] = await db.insert(syncedWallets).values({
      userId,
      walletPayload,
      checksum,
      salt: salt || null,
      dataVersion: dataVersion || 0,
      lastSyncedAt: new Date(),
    }).returning();
    return record;
  }

  async setDeletionTombstone(userId: string): Promise<SyncedWallet | undefined> {
    const existing = await this.getSyncedWallets(userId);
    if (!existing) {
      return undefined;
    }
    const newVersion = (existing.dataVersion || 0) + 1;
    const [updated] = await db.update(syncedWallets)
      .set({
        walletPayload: '',
        checksum: '',
        dataVersion: newVersion,
        deletedAt: new Date(),
        lastSyncedAt: new Date(),
      })
      .where(eq(syncedWallets.userId, userId))
      .returning();
    return updated;
  }

  async createSyncedWallet(insertSyncedWallet: InsertSyncedWallet): Promise<SyncedWallet> {
    const [syncedWallet] = await db.insert(syncedWallets).values(insertSyncedWallet).returning();
    return syncedWallet;
  }

  async updateSyncedWallet(id: number, updates: Partial<SyncedWallet>): Promise<SyncedWallet | undefined> {
    const [syncedWallet] = await db.update(syncedWallets).set(updates).where(eq(syncedWallets.id, id)).returning();
    return syncedWallet || undefined;
  }

  async deleteSyncedWallet(id: number): Promise<void> {
    await db.delete(syncedWallets).where(eq(syncedWallets.id, id));
  }

  async deleteSyncedWalletByUserId(userId: string): Promise<void> {
    await db.delete(syncedWallets).where(eq(syncedWallets.userId, userId));
  }

  async getSyncedSettings(userId: string): Promise<SyncedSettings | undefined> {
    const [settings] = await db.select().from(syncedSettings).where(eq(syncedSettings.userId, userId));
    return settings || undefined;
  }

  async upsertSyncedSettings(insertSyncedSettings: InsertSyncedSettings): Promise<SyncedSettings> {
    const existing = await this.getSyncedSettings(insertSyncedSettings.userId);
    if (existing) {
      const [updated] = await db.update(syncedSettings)
        .set({ ...insertSyncedSettings, lastSyncedAt: new Date() })
        .where(eq(syncedSettings.userId, insertSyncedSettings.userId))
        .returning();
      return updated;
    }
    const [settings] = await db.insert(syncedSettings).values(insertSyncedSettings).returning();
    return settings;
  }

  async getWallet(id: number): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id));
    return wallet || undefined;
  }

  async getWalletByAddress(address: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.address, address));
    return wallet || undefined;
  }

  async getAllWallets(): Promise<Wallet[]> {
    return await db.select().from(wallets);
  }

  async createWallet(insertWallet: InsertWallet): Promise<Wallet> {
    const [wallet] = await db.insert(wallets).values(insertWallet as any).returning();
    return wallet;
  }

  async updateWallet(id: number, updates: Partial<Wallet>): Promise<Wallet | undefined> {
    const [wallet] = await db.update(wallets).set(updates).where(eq(wallets.id, id)).returning();
    return wallet || undefined;
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction || undefined;
  }

  async getTransactionsByWallet(walletId: number): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.walletId, walletId));
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db.insert(transactions).values(insertTransaction).returning();
    return transaction;
  }

  async updateTransaction(id: number, updates: Partial<Transaction>): Promise<Transaction | undefined> {
    const [transaction] = await db.update(transactions).set(updates).where(eq(transactions.id, id)).returning();
    return transaction || undefined;
  }

  async getTrustline(id: number): Promise<Trustline | undefined> {
    const [trustline] = await db.select().from(trustlines).where(eq(trustlines.id, id));
    return trustline || undefined;
  }

  async getTrustlinesByWallet(walletId: number): Promise<Trustline[]> {
    return await db.select().from(trustlines).where(eq(trustlines.walletId, walletId));
  }

  async createTrustline(insertTrustline: InsertTrustline): Promise<Trustline> {
    const [trustline] = await db.insert(trustlines).values(insertTrustline).returning();
    return trustline;
  }

  async updateTrustline(id: number, updates: Partial<Trustline>): Promise<Trustline | undefined> {
    const [trustline] = await db.update(trustlines).set(updates).where(eq(trustlines.id, id)).returning();
    return trustline || undefined;
  }

  async clearAllData(): Promise<void> {
    // Only clear wallet-related data, preserve user accounts
    await db.delete(trustlines);
    await db.delete(transactions);
    await db.delete(wallets);
    await db.delete(syncedSettings);
    await db.delete(syncedWallets);
    // Note: oauthAccounts, magicLinks, and users are NOT deleted
    // Those are account data, not wallet data
  }

  // OAuth accounts
  async getOAuthAccount(provider: AuthProvider, providerAccountId: string): Promise<OAuthAccount | undefined> {
    const [account] = await db.select().from(oauthAccounts).where(
      and(
        eq(oauthAccounts.provider, provider),
        eq(oauthAccounts.providerAccountId, providerAccountId)
      )
    );
    return account || undefined;
  }

  async getOAuthAccountsByUserId(userId: string): Promise<OAuthAccount[]> {
    return await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId));
  }

  async createOAuthAccount(account: InsertOAuthAccount): Promise<OAuthAccount> {
    const [oauthAccount] = await db.insert(oauthAccounts).values(account).returning();
    return oauthAccount;
  }

  async updateOAuthAccount(id: number, updates: Partial<OAuthAccount>): Promise<OAuthAccount | undefined> {
    const [oauthAccount] = await db.update(oauthAccounts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(oauthAccounts.id, id))
      .returning();
    return oauthAccount || undefined;
  }

  async deleteOAuthAccount(id: number): Promise<void> {
    await db.delete(oauthAccounts).where(eq(oauthAccounts.id, id));
  }

  // Magic links
  async createMagicLink(magicLinkData: InsertMagicLink): Promise<MagicLink> {
    const [link] = await db.insert(magicLinks).values(magicLinkData).returning();
    return link;
  }

  async getMagicLinkByToken(token: string): Promise<MagicLink | undefined> {
    const [link] = await db.select().from(magicLinks).where(
      and(
        eq(magicLinks.token, token),
        eq(magicLinks.used, false),
        gt(magicLinks.expiresAt, new Date())
      )
    );
    return link || undefined;
  }

  async markMagicLinkUsed(id: number): Promise<void> {
    await db.update(magicLinks).set({ used: true }).where(eq(magicLinks.id, id));
  }

  async cleanupExpiredMagicLinks(): Promise<void> {
    const now = new Date();
    // Delete magic links where expiresAt is less than now (i.e., expired)
    const { lt } = await import("drizzle-orm");
    await db.delete(magicLinks).where(lt(magicLinks.expiresAt, now));
  }

  // Admin
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async deleteUser(userId: string): Promise<void> {
    // Related data is cascade-deleted via foreign key constraints
    await db.delete(users).where(eq(users.id, userId));
  }
}

export const storage = new DatabaseStorage();
