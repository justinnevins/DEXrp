import { Purchases, LOG_LEVEL, type PurchasesPackage, type CustomerInfo } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';

const TEST_API_KEY = import.meta.env.VITE_REVENUECAT_TEST_API_KEY as string;
const IOS_API_KEY = import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string;
const ANDROID_API_KEY = import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY as string;

export const ENTITLEMENT_ID = import.meta.env.VITE_REVENUECAT_ENTITLEMENT_ID as string || 'DEXrp Pro';

function getApiKey(): string {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return IOS_API_KEY;
  if (platform === 'android') return ANDROID_API_KEY;
  return TEST_API_KEY;
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

let initialized = false;

export async function initializeRevenueCat(userId?: string): Promise<void> {
  if (!isNative()) return;
  if (initialized) return;

  const apiKey = getApiKey();
  if (!apiKey) throw new Error('RevenueCat API key not configured');

  await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
  await Purchases.configureWith({
    apiKey,
    appUserID: userId ?? null,
  });
  initialized = true;
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isNative()) return null;
  const { customerInfo } = await Purchases.getCustomerInfo();
  return customerInfo;
}

export async function getOfferings() {
  if (!isNative()) return null;
  const { offerings } = await Purchases.getOfferings();
  return offerings;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}

export function isPro(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false;
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}
