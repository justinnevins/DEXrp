import { sql } from 'drizzle-orm';
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export type XRPLNetwork = 'mainnet' | 'testnet';
export type WalletType = 'full' | 'watchOnly';

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  passwordHash: text("password_hash"),
  syncOptIn: boolean("sync_opt_in").notNull().default(false),
  syncEnabledAt: timestamp("sync_enabled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const syncedWallets = pgTable("synced_wallets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  walletPayload: text("wallet_payload").notNull(),
  checksum: text("checksum").notNull(),
  salt: text("salt"),
  dataVersion: integer("data_version").notNull().default(0),
  deletedAt: timestamp("deleted_at"),
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const syncedSettings = pgTable("synced_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  settingsPayload: text("settings_payload").notNull(),
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  syncedWallets: many(syncedWallets),
  syncedSettings: many(syncedSettings),
  oauthAccounts: many(oauthAccounts),
}));

export const syncedWalletsRelations = relations(syncedWallets, ({ one }) => ({
  user: one(users, {
    fields: [syncedWallets.userId],
    references: [users.id],
  }),
}));

export const syncedSettingsRelations = relations(syncedSettings, ({ one }) => ({
  user: one(users, {
    fields: [syncedSettings.userId],
    references: [users.id],
  }),
}));

export const oauthAccounts = pgTable("oauth_accounts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar("provider").notNull(),
  providerAccountId: varchar("provider_account_id").notNull(),
  email: varchar("email"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("oauth_provider_account_idx").on(table.provider, table.providerAccountId),
]);

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

export const magicLinks = pgTable("magic_links", {
  id: serial("id").primaryKey(),
  email: varchar("email").notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  name: text("name"),
  address: text("address").notNull(),
  publicKey: text("publicKey"),
  balance: text("balance").default("0"),
  reservedBalance: text("reservedBalance").default("20"),
  isConnected: boolean("isConnected").notNull().default(false),
  hardwareWalletType: text("hardwareWalletType"),
  walletType: text("walletType").$type<WalletType>().notNull().default("full"),
  network: text("network").$type<XRPLNetwork>().notNull().default("mainnet"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("walletId").notNull(),
  type: text("type").notNull(),
  amount: text("amount").notNull(),
  currency: text("currency").notNull().default("XRP"),
  fromAddress: text("fromAddress"),
  toAddress: text("toAddress"),
  destinationTag: text("destinationTag"),
  status: text("status").notNull().default("pending"),
  txHash: text("txHash"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const trustlines = pgTable("trustlines", {
  id: serial("id").primaryKey(),
  walletId: integer("walletId").notNull(),
  currency: text("currency").notNull(),
  issuer: text("issuer").notNull(),
  issuerName: text("issuerName").notNull(),
  balance: text("balance").notNull().default("0"),
  limit: text("limit").notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const insertSyncedWalletSchema = createInsertSchema(syncedWallets).omit({
  id: true,
  createdAt: true,
});

export const insertSyncedSettingsSchema = createInsertSchema(syncedSettings).omit({
  id: true,
  createdAt: true,
});

export const insertWalletSchema = createInsertSchema(wallets).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertTrustlineSchema = createInsertSchema(trustlines).omit({
  id: true,
  createdAt: true,
});

export type SyncedWallet = typeof syncedWallets.$inferSelect;
export type InsertSyncedWallet = z.infer<typeof insertSyncedWalletSchema>;
export type SyncedSettings = typeof syncedSettings.$inferSelect;
export type InsertSyncedSettings = z.infer<typeof insertSyncedSettingsSchema>;
export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Trustline = typeof trustlines.$inferSelect;
export type InsertTrustline = z.infer<typeof insertTrustlineSchema>;

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type InsertOAuthAccount = typeof oauthAccounts.$inferInsert;
export type MagicLink = typeof magicLinks.$inferSelect;
export type InsertMagicLink = typeof magicLinks.$inferInsert;
export type AuthProvider = 'google' | 'twitter' | 'email';
